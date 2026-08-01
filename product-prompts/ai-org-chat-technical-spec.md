# AI Organization Chat — Technical Build Spec

**Audience:** Developer (human or LLM) implementing this system.
**Purpose:** Full technical design for the multi-agent org chat feature — backend, dispatcher, local agent runtime, and frontend.

---

## 0. Product Summary

The user is the CEO of an AI Organization. They create AI employees ("agents"), organize them into teams and hierarchies (managers → reports), and everyone communicates in a Slack/Teams-style chat product. Agents are powered by **Hermes (Nous Research)**, packaged and distributed **locally with the app** — meaning Hermes itself runs on the end user's machine, not on our servers. The chat backend is **Supabase** (Postgres + Realtime + Edge Functions), and the user accesses the org chat from a website, from anywhere, at any time.

### Known architectural constraint (do not hide this from the user or “fix” it silently)

Because Hermes runs locally on the end user's machine (not our cloud), **agents can only respond while the user's local app is running and connected to the internet.** If the local app is closed, the machine is asleep, or the network drops, agents will not respond — messages will queue and be delivered once the local app reconnects. This is a structural property of the local-distribution model, not a bug to "fix" with more retries. The UI **must** clearly reflect agent online/offline status (see §6) so the user always understands why an agent isn't answering. Do not build anything that implies agents are always live cloud services — they are not, in this architecture.

---

## 1. High-Level Architecture

```
┌────────────────────┐        ┌─────────────────────────────┐        ┌───────────────────────────┐
│   Website (user)    │◀──────▶│   Supabase (cloud backend)    │◀──────▶│  Local App (user's machine) │
│  React/Next chat UI │  REST/  │  - Postgres (source of truth) │  ws /   │  - Packaged Hermes gateway   │
│                      │  Realtime│ - Realtime (pub/sub)         │  poll   │  - Local Bridge process      │
└────────────────────┘  (ws)    │  - Edge Functions (dispatcher)│        │  - One Hermes profile/agent  │
                                 │  - Auth, RLS                  │        └───────────────────────────┘
                                 └─────────────────────────────┘
```

- **Website** — where the user sees/sends messages. Talks only to Supabase. Never talks to the local app directly.
- **Supabase** — single source of truth for all messages, channels, agents, tasks, budgets. Runs the **dispatcher** (an Edge Function) that decides who should respond to what, and enforces every guardrail *before* any agent is invoked.
- **Local App** — what we distribute to the user. Contains a packaged Hermes Agent gateway (one process, multiple **profiles**, one profile per AI employee) plus a small **Bridge** process we build that connects Hermes to Supabase.

The local app connects **outbound only** to Supabase (via Realtime websocket + REST). No inbound ports, no port forwarding, no tunnels required on the user's machine.

---

## 2. Data Model (Supabase / Postgres)

Run these as migrations. Enable RLS on every table; policies described inline.

```sql
-- ============ Orgs & Identity ============
create table organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  name text not null,
  plan text not null default 'free',        -- drives agent_limit
  agent_limit int not null default 5,       -- enforced at agent-creation time
  created_at timestamptz not null default now()
);

create table agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  role_title text,
  system_prompt text not null,
  hermes_profile_name text not null,        -- maps to a local Hermes profile
  manager_agent_id uuid references agents(id),
  status text not null default 'active' check (status in ('active','paused','archived')),
  max_daily_tokens int not null default 200000,
  max_msgs_per_hour int not null default 30,
  allowed_tools text[] not null default '{}',  -- explicit tool allowlist, enforced server-side AND locally
  created_at timestamptz not null default now()
);

-- ============ Channels ============
create table channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in ('team','dm','manager_report','broadcast','user_dm','escalation')),
  name text,
  team_id uuid,
  created_by uuid,
  is_agent_only boolean not null default false,
  created_at timestamptz not null default now()
);

create table channel_members (
  channel_id uuid not null references channels(id) on delete cascade,
  member_type text not null check (member_type in ('agent','user')),
  member_id uuid not null,
  role text not null default 'member' check (role in ('owner','member','observer')),
  primary key (channel_id, member_type, member_id)
);

-- ============ Messages ============
create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  sender_type text not null check (sender_type in ('agent','user','system')),
  sender_id uuid,
  content text not null,
  mentions uuid[] not null default '{}',
  reply_to_id uuid references messages(id),
  thread_root_id uuid references messages(id),
  status text not null default 'sent' check (status in ('sent','pending_approval','blocked','failed')),
  token_count int,
  model_used text,
  created_at timestamptz not null default now()
);

create table message_causality (
  message_id uuid primary key references messages(id) on delete cascade,
  triggered_by_message_id uuid references messages(id),
  depth int not null default 0
);

-- ============ Threads & Budgets ============
create table conversation_threads (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  root_message_id uuid references messages(id),
  turn_count int not null default 0,
  max_turns int not null default 10,           -- hard cap, see dispatcher rules
  token_budget int not null default 20000,
  tokens_used int not null default 0,
  status text not null default 'active' check (status in ('active','resolved','escalated','killed')),
  last_activity_at timestamptz not null default now()
);

-- ============ Tasks (definition-of-done anchor) ============
create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  thread_id uuid references conversation_threads(id),
  assigned_to_agent_id uuid references agents(id),
  created_by_agent_id uuid references agents(id),
  title text not null,
  acceptance_criteria text,
  status text not null default 'open' check (status in ('open','in_progress','done','blocked')),
  created_at timestamptz not null default now()
);

-- ============ Dispatch Queue (dispatcher -> local bridge) ============
create table dispatch_jobs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  thread_id uuid references conversation_threads(id),
  channel_id uuid not null references channels(id),
  trigger_message_id uuid not null references messages(id),
  context_payload jsonb not null,       -- pre-assembled minimal context; bridge does NOT query full history
  status text not null default 'queued' check (status in ('queued','running','delivered','failed','skipped')),
  idempotency_key text not null unique,
  attempt_count int not null default 0,
  max_attempts int not null default 3,
  timeout_seconds int not null default 120,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- ============ Audit & Cost Tracking ============
create table agent_turn_log (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id),
  thread_id uuid references conversation_threads(id),
  dispatch_job_id uuid references dispatch_jobs(id),
  action text not null,                 -- 'reply', 'tool_call', 'escalate', etc.
  tokens_used int,
  created_at timestamptz not null default now()
);

create table spend_ledger (
  org_id uuid not null references organizations(id),
  agent_id uuid references agents(id),
  date date not null,
  tokens_used bigint not null default 0,
  cost_usd numeric(10,4) not null default 0,
  primary key (org_id, agent_id, date)
);

-- ============ Agent Presence / Health ============
create table agent_workers (
  agent_id uuid primary key references agents(id) on delete cascade,
  org_id uuid not null references organizations(id),
  last_seen_at timestamptz not null default now(),
  status text not null default 'offline' check (status in ('online','offline','busy'))
);
```

### RLS notes
- `agents`, `channels`, `messages`, etc. — scoped to `org_id` matching the authenticated user's org via a join, standard Supabase pattern.
- `dispatch_jobs` — the local bridge authenticates as a **service-scoped key per org** (not per agent, simpler to manage) but the bridge should only ever query jobs `where agent_id in (this org's agents)`. Do not give the local bridge the Supabase service_role key — use a scoped anon/authenticated key with RLS restricting it to its own org's rows only. This is the actual security boundary preventing one user's local app from ever touching another user's data.

---

## 3. Dispatcher (Supabase Edge Function)

This is the brain. It runs on **every new message insert** (via a Postgres trigger → Edge Function, or a `pg_net`/webhook call). It is the **only** thing allowed to decide "should an agent be invoked," and it runs entirely server-side so it cannot be bypassed by a compromised or misbehaving local agent.

On every new message, in order:

1. **Resolve eligible responders**
   - Explicit `@mentions` → those agents.
   - Unaddressed message in a `team` channel → the team's manager agent only (not the whole team).
   - `@channel`/`@team` broadcast → only allowed if sender has `role = 'owner'` on that channel (manager-only broadcast permission).
   - `@user`/`@ceo` mention → do **not** create a dispatch_job; instead upsert an `escalation` channel entry and flag for notification (push/email — implement in Phase 2).

2. **Guardrail checks (hard stops — reject/skip if any fail, do not invoke the agent):**
   - Target agent `status = 'active'` (not paused/archived).
   - `conversation_threads.turn_count < max_turns` — if at cap, set thread `status = 'escalated'`, post a `system` message ("Thread auto-paused after N turns — needs your input"), and stop. Do not create a dispatch_job.
   - `conversation_threads.tokens_used < token_budget` — same escalation behavior if exceeded.
   - Agent's daily token usage (`spend_ledger`) `< max_daily_tokens` and hourly message count `< max_msgs_per_hour` — else skip and log, optionally notify user agent is throttled.
   - **Repetition check**: embed the new message and compare cosine similarity against the last 3 messages in the thread from the same sender pair. Above threshold (e.g. 0.92) → kill the thread instead of dispatching (classic "agreement loop" catch). Use a cheap embedding call for this, not a full LLM judgment call.
   - Org-wide concurrency cap: count `dispatch_jobs where status='running' and org_id = X` — if at cap (configurable, e.g. 10 concurrent), queue with backoff rather than firing immediately.

3. **If all checks pass:** assemble a **minimal context payload** (task object if any, last N messages of the thread — not the whole channel history, agent's role/system prompt reference), write a `dispatch_jobs` row with a unique `idempotency_key` (hash of `trigger_message_id + agent_id`), and increment `conversation_threads.turn_count`.

4. Realtime automatically notifies the subscribed local bridge of the new `dispatch_jobs` row (no extra work needed beyond the insert).

**Everything above lives on the server and must not be duplicated as "trust the local agent to behave" logic.** The local bridge is a dumb executor only.

---

## 4. Local App: Packaged Hermes + Bridge

### 4.1 Hermes packaging
- Bundle the Hermes Agent gateway into the installer/distribution.
- One gateway process per installation, **one Hermes profile per AI employee** the user creates (profiles give isolated memory/config per agent — do not share memory across agents, that breaks the "separate employees" illusion and leaks context between them).
- Use Hermes's **generic webhook adapter** as the internal entry point for triggering a profile's agent run. Configure with `deliver_only: false` for actual response generation, `deliver_only: true` only for pure notifications that don't need reasoning.
- Use Hermes's **hooks system**:
  - `session:stop` hook → capture final response text, hand off to the Bridge for write-back to Supabase.
  - `pre_tool_call` hook → enforce the agent's `allowed_tools` allowlist locally as a second guardrail layer (defense in depth on top of the server-side allowlist check before job creation).
- Use Hermes's built-in **approval system** for any destructive/high-stakes tool call (spend money, delete data, send external email, deploy code) — require explicit user approval regardless of which agent requests it.
- Use Hermes's **cron scheduler** as a fallback poller (e.g. every 20–30s, query `dispatch_jobs where status='queued' and agent_id in (...)`) in case the Realtime websocket connection drops. This is a resilience layer, not the primary path.

### 4.2 Bridge process (build this — it does not exist in Hermes today)
Responsibilities:
1. On app start, authenticate to Supabase with the org-scoped key, subscribe via Realtime to `dispatch_jobs` inserts where `agent_id in (this org's active agents)`.
2. On new job: check `idempotency_key` hasn't already been processed locally; if fresh, mark job `status='running'`, `started_at=now()`, POST the `context_payload` to the appropriate local Hermes webhook route for that agent's profile.
3. Enforce `timeout_seconds` client-side — if Hermes doesn't finish in time, mark the job `failed`, increment `attempt_count`, retry with backoff up to `max_attempts`, then mark permanently failed and post a `system` escalation message so the user isn't left hanging silently.
4. On Hermes completion (via the `session:stop` hook payload), write the response as a new row in `messages` (`sender_type='agent'`), update `agent_turn_log`, update `spend_ledger`, mark `dispatch_jobs.status='delivered'`.
5. **Heartbeat**: every 15s, upsert `agent_workers.last_seen_at = now(), status='online'` for every active agent on this machine. On graceful app shutdown, set `status='offline'` immediately. Server-side, treat any agent whose `last_seen_at` is older than ~45s as offline even without a graceful shutdown (crash/network-loss case) — compute this in a view or on read, don't rely solely on the offline write.

### 4.3 Concurrency & resource limits (local)
- Cap concurrent Hermes runs per machine (configurable, start conservative — e.g. 3–5 concurrent profile runs) to avoid resource exhaustion on the user's hardware regardless of how many agents they've created. Jobs beyond the cap simply wait in the `queued` state; this is fine, it's already async.
- **This number is not verified against real benchmarks — load-test actual Hermes memory/CPU usage per concurrent profile run on target hardware before finalizing.**

---

## 5. Frontend (Website)

### 5.1 Visual direction
Professional, commercial-chat-software aesthetic — think Slack/Linear/Notion, not a generic AI chatbot skin. Concretely:
- Clean sidebar: Teams (grouped), Direct Messages, Escalations (visually distinct — this is the "needs you" inbox).
- Message list: sender avatar + name + role badge (e.g. "Marketing Lead"), timestamp, compact grouping of consecutive messages from the same sender like Slack.
- Threads open in a **side panel**, not inline — keeps the main channel scannable, matches Slack/Teams convention users already know.
- Monospace/code-styled rendering for tool calls and structured output, visually distinct from normal chat bubbles (like Slack app "actions" or GitHub bot comments) — never render raw `<tool_call>` tags to the user.
- Typing indicator ("Marketing Lead is composing…") driven by real dispatch state (`dispatch_jobs.status='running'`), not fake/simulated.

### 5.2 Required UI states (do not skip any of these)
- **Agent presence indicator** — green/gray dot per agent reflecting `agent_workers.status`, visible in sidebar and on every message from that agent. This is the single most important UI element given the local-runtime constraint — the user must always be able to tell "is my team actually online right now."
- **Pending approval** — visually distinct message/banner style, with Approve/Deny buttons, for any `messages.status='pending_approval'`.
- **Escalated thread** — banner at top of thread: "This conversation needs your input" with the reason (turn limit hit / budget hit / explicit @mention of user).
- **System messages** (auto-pause, thread killed, budget hit) — visually distinct from agent/user messages (e.g. centered, muted gray, no avatar) — same convention Slack/Discord use for system events.
- **Live cost/token meter** — per channel and per agent, small unobtrusive counter, with a link to a fuller usage dashboard.
- **Global controls** — pause/resume per agent, and one global kill switch, reachable from the main nav, not buried in settings.

### 5.3 Interaction rules
- `@mention` autocomplete restricted to members of the current channel only.
- User is never shown a raw agent-to-agent team channel unless they explicitly open it — default landing view is their DMs + escalations, matching "you don't need to read every channel" from a real workplace.

---

## 6. Division of Work

### What the product owner (you) needs to do
1. **Provision the Supabase project** — create it, enable RLS, enable Realtime on `dispatch_jobs` and `messages`.
2. **Run the schema migrations in §2** (or have the developer/LLM run them against your project — either is fine, but you need to own the Supabase project itself and its credentials).
3. **Decide and set the concrete numbers**: `agent_limit` per plan tier, `max_daily_tokens` defaults, `max_msgs_per_hour` defaults, thread `max_turns`, `token_budget` defaults, org-wide concurrency cap, local concurrent-run cap. These are business/product decisions, not engineering ones — the developer/LLM should not silently pick these.
4. **Decide your model/inference provider behind Hermes** (Nous Portal, OpenRouter, your own endpoint, etc.) and provision API keys/billing for it, since Hermes is model-agnostic and doesn't ship with inference included.
5. **Load-test** actual local resource usage (CPU/RAM per concurrent Hermes profile run) on representative target hardware, and set the local concurrency cap based on real numbers, not the placeholder in §4.3.
6. **Define your escalation notification channel** (email/push/SMS) for when an agent needs the user — this spec assumes it exists but doesn't build it; decide the provider (e.g. Resend, Twilio) and account for it.
7. **Review and sign off on the UI states in §5.2** — these are non-negotiable given the architecture (especially agent presence), so confirm you're happy with how they're presented before dev starts.

### What the developer/LLM needs to build
1. Supabase schema (§2) — can also be done by the LLM if given project credentials, but should be reviewed by you before running against production.
2. Dispatcher Edge Function (§3) — the full guardrail chain, in order, with no shortcuts.
3. `dispatch_jobs` idempotency, timeout, and retry handling (§4.2, item 3).
4. The Bridge process (§4.2) — this does not exist in Hermes and must be custom-built. Needs: Supabase Realtime subscription, Hermes webhook-adapter integration, hook handlers, heartbeat loop, write-back logic.
5. Hermes packaging into the installer, with one profile per agent, webhook adapter + cron scheduler + hooks + approval system all configured per §4.1.
6. Frontend chat UI per §5, including all required states in §5.2 — these are correctness requirements for this product, not nice-to-haves, given agents can genuinely go offline.
7. Repetition/similarity check (§3, step 2) — needs an embedding call integrated into the dispatcher.
8. Basic admin/usage dashboard for the token/cost meters described in §5.2.

---

## 7. Non-Negotiable Correctness Rules (summary — do not deviate)

1. No agent is ever dispatched without passing through the server-side dispatcher guardrail chain (§3). No exceptions, no local-only "quick response" paths.
2. Every dispatch is idempotent — duplicate triggers must never cause duplicate agent replies.
3. Every thread has a hard turn cap and token budget; hitting either **always** escalates to the user rather than silently continuing or silently dying.
4. Agent tool permissions are enforced twice: server-side allowlist before job creation, and locally via `pre_tool_call` hook. Neither layer trusts the other alone.
5. Destructive/high-stakes tool calls always require explicit human approval, regardless of agent confidence or task framing.
6. The UI must always make agent online/offline status visible and accurate — never let the user be left wondering why nothing is happening.
7. Content from one agent to another is treated as untrusted input by the receiving agent's tool-permission logic — never as an implicit command.

---

*End of spec.*
