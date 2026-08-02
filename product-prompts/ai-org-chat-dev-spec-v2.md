# AI Organization Chat — Developer Build Spec (v2, Final Architecture)

**Audience:** Developer implementing this system.
**Status:** This supersedes the earlier port-based and one-shot-spawn designs. The local execution model below (persistent gateway + custom platform adapter) is the one to build. Read this whole document before starting — later sections correct assumptions made in earlier ones.

---

## 0. What changed and why (read this first)

Three local-execution models were considered during design. Only the third is being built:

1. ~~One shared Hermes gateway on a fixed port, routed by URL path per profile.~~ **Rejected** — profiles are isolated Hermes home directories; a shared gateway does not correctly scope `HERMES_HOME` per profile, so persona (`SOUL.md`) doesn't load correctly per agent. This was the bug that caused agents to identify as generic "Hermes Agent."
2. ~~One-shot process spawn per message (`hermes -z`).~~ **Rejected for chat** — works technically and avoids ports, but does not give real in-session conversational continuity. The product requirement is that agents feel like persistent employees (Discord/Telegram-like), not stateless one-off calls.
3. **Persistent per-agent gateway process, connected via a custom Supabase platform adapter, following the same integration pattern Hermes already uses for its Discord/Telegram/Slack adapters.** This is what's being built. It gives real session/memory continuity (the same subsystem that makes Discord integration feel persistent) without requiring any inbound network port on the user's machine.

The product owner has explicitly accepted that agent gateway processes run continuously (always-on), the same way a Discord bot process runs continuously. This is a deliberate, accepted tradeoff — do not "optimize" it back to spawn-per-message later without checking with the product owner first, since that would silently reintroduce the continuity problem this spec exists to fix.

---

## 1. Architecture Overview

```
┌────────────────────┐        ┌─────────────────────────────┐        ┌────────────────────────────────┐
│   Website (user)     │◀──────▶│   Supabase (cloud backend)    │◀──────▶│  Local App (user's machine)      │
│  Chat UI              │  REST/  │  - Postgres (source of truth)│  ws     │  - N persistent Hermes gateways  │
│                       │ Realtime│ - Realtime (pub/sub)         │ (out-   │    (one per agent profile)       │
└────────────────────┘  (ws)    │  - Edge Functions (dispatcher)│  bound  │  - Each gateway runs the custom  │
                                 │  - Auth, RLS                  │  only)  │    Supabase adapter               │
                                 └─────────────────────────────┘        └────────────────────────────────┘
```

- **Website** talks only to Supabase. Never talks to the local app directly.
- **Supabase** is the single source of truth and runs the dispatcher (decides who should respond, enforces every guardrail before any agent is invoked — unchanged from earlier design).
- **Local App** runs one persistent Hermes gateway process per agent the user has created. Each gateway process hosts a custom-built **Supabase adapter** that connects **outbound only** to Supabase Realtime — no listening ports, no inbound exposure, no port collisions to manage.

---

## 2. Database Schema (Supabase / Postgres)

This is largely unchanged from the earlier spec. Two additions for this version:

```sql
-- Agents: no local_port/webhook_route columns (that idea is dropped). 
-- hermes_profile_name is still the mapping key — it identifies which local profile/gateway handles this agent.
-- (agents table as previously defined, with hermes_profile_name column, is unchanged.)

-- Track live gateway processes (replaces any earlier "local_port" tracking)
create table agent_gateways (
  agent_id uuid primary key references agents(id) on delete cascade,
  org_id uuid not null references organizations(id),
  status text not null default 'stopped' check (status in ('starting','running','stopped','crashed')),
  last_heartbeat_at timestamptz,
  started_at timestamptz,
  last_error text
);
```

`agent_workers` (presence/heartbeat table from the earlier spec) still exists and still drives the online/offline indicator in the UI — `agent_gateways` is a slightly more detailed operational table for the local app's own process-management bookkeeping (crash detection, restart logic). Both can be kept; do not conflate them — `agent_workers.status` is what the frontend reads, `agent_gateways` is what the local supervisor reads.

All other tables (`channels`, `channel_members`, `messages`, `message_causality`, `conversation_threads`, `tasks`, `dispatch_jobs`, `agent_turn_log`, `spend_ledger`) are unchanged from the earlier spec — the dispatcher and guardrail logic (§3 below) still write to and read from these exactly as before.

---

## 3. Dispatcher (Supabase Edge Function) — unchanged

The dispatcher logic from the earlier spec is not affected by this change and should be implemented as previously specified:

- Resolves eligible responders from `@mentions` / manager-only defaults / broadcast permission checks.
- Enforces, in order, before any agent is invoked: agent `status = 'active'`, thread turn cap, thread token budget, agent daily/hourly rate limits, repetition/similarity check (embedding-based loop detection), org-wide concurrency cap.
- On pass, writes a `dispatch_jobs` row with a minimal `context_payload` and a unique `idempotency_key`.

This remains the **only** place that decides whether an agent gets invoked. The local gateway/adapter never makes this decision itself — it only reacts to `dispatch_jobs` rows that already passed every guardrail.

---

## 4. Local Runtime: Persistent Gateway + Custom Supabase Adapter

This is the section that replaces earlier local-runtime designs. Build it as follows.

### 4.1 One gateway process per agent

Each agent profile (its own Hermes home directory — `config.yaml`, `SOUL.md`, memories, sessions) runs its own long-running gateway process. Do not share one gateway across multiple agent profiles — that was the root cause of the earlier identity bug.

### 4.2 The Supabase adapter (build this — it does not exist in Hermes today)

Build a custom platform adapter following the same integration pattern as Hermes's existing Discord/Telegram/Slack adapters: an adapter catches an inbound message, normalizes it into Hermes's internal event format, and hands it to the gateway core; on response, the adapter sends the reply back out through the platform.

Concretely, for this adapter:

**Inbound path:**
1. Subscribe to Supabase Realtime for `dispatch_jobs` inserts where `agent_id` = this gateway's agent.
2. On a new row: mark it `status='running'`, `started_at=now()`.
3. Construct the session identity fields Hermes uses to resolve session context, mapped as follows:
   - `platform` → a new constant, e.g. `SUPABASE`
   - `chat_id` → the `channel_id` (or `thread_id` if the message belongs to a specific thread)
   - `user_id` → the sender's id (`sender_id` from the triggering message — could be a user or another agent)
   - `scope_id` → the `org_id`
4. Pass the job's `context_payload` (the minimal context the dispatcher already assembled) into the gateway core the same way any other adapter passes in a normalized inbound event.
5. Enforce `dispatch_jobs.timeout_seconds` locally — if the gateway core doesn't respond in time, mark the job `failed`, retry per `max_attempts` with backoff, then permanently fail and let the dispatcher's existing escalation path handle notifying the user (this logic already exists server-side from the earlier spec; the adapter just needs to correctly mark job status so it's visible).

**Outbound path:**
1. Capture the gateway's final response the same way the existing adapters capture theirs for their respective platforms (hook into the equivalent completion event for this integration — verify the exact hook/callback name against the current Hermes source, since it may differ from the generic `session:stop` hook referenced earlier; check the Discord/Telegram adapter source for the exact pattern they use).
2. Write the response as a new row in `messages` (`sender_type='agent'`, correct `channel_id`, `thread_root_id` if applicable).
3. Update `agent_turn_log` and `spend_ledger` with token/cost data from the run.
4. Mark the `dispatch_jobs` row `status='delivered'`, `completed_at=now()`.

**Tool approvals:** Hermes already has an approval flow for destructive tool calls, and the Discord adapter renders these as interactive buttons in-platform. Build the equivalent for this adapter: when a tool call requires approval, write a `messages` row with `status='pending_approval'` instead of auto-executing, and surface it in the UI per §6 below with Approve/Deny actions. Do not auto-approve anything server-side — approval must come from an explicit user action.

### 4.3 Idempotency and crash recovery

- Before processing a `dispatch_jobs` row, check its `idempotency_key` against a local processed-jobs record (or rely on the row's `status` field — only process rows still `status='queued'`, and use a DB-level conditional update, e.g. `update ... where status='queued'`, to claim a job, so a race between the Realtime event and a fallback poll can't double-process the same job).
- On gateway process start (including restart after a crash), reconcile: query any `dispatch_jobs` for this agent still `status='running'` from before the crash — these were orphaned mid-processing. Mark them `failed` and let them retry through the normal retry path, don't silently drop them.
- Fallback polling: in addition to the Realtime subscription, poll `dispatch_jobs` for this agent every 20–30 seconds as a resilience layer in case the websocket connection drops. This was already specified earlier and still applies.

### 4.4 Heartbeat

Every 15 seconds, each gateway process upserts:
- `agent_workers.last_seen_at = now()`, `status='online'`
- `agent_gateways.last_heartbeat_at = now()`, `status='running'`

On graceful shutdown, set both to `offline`/`stopped` immediately. Server-side (or in a scheduled check), treat any agent whose `last_seen_at` is older than ~45 seconds as offline even without a graceful shutdown, to handle crashes/network loss — this was already specified earlier and still applies unchanged.

---

## 5. Automatic Agent Provisioning (new — this is the "plug and play" requirement)

When a user creates a new agent in the app, the following must happen automatically, with no manual steps from the user:

1. **Website** → insert a new row in `agents` (name, role, system prompt, etc.) via Supabase, with `status='active'`.
2. **Local App** (already running, subscribed to Realtime for `agents` inserts scoped to this org) detects the new agent row.
3. **Local App** creates a new Hermes profile directory for this agent: generates `SOUL.md` from the agent's stored `system_prompt`/persona fields, sets up `config.yaml` pointing at the shared model/API provider configuration (do not require the user to configure API keys per agent — one org-level provider configuration, reused across all profiles, unless the product owner decides otherwise).
4. **Local App** starts the persistent gateway process for this new profile, with the Supabase adapter attached and subscribed to this agent's `dispatch_jobs`.
5. **Local App** writes an initial `agent_gateways` row (`status='starting'` → `'running'`) and begins heartbeating to `agent_workers`.
6. Once `agent_workers.status='online'` for this agent, the frontend's presence indicator (§6) reflects it automatically — the user sees the new agent go from "provisioning" to "online" with no action required on their part.

**On local app startup** (user reopens the app after it was closed): reconcile against Supabase — for every `agents` row belonging to this org with `status='active'`, ensure a gateway process is running for it; start any that aren't. This is what makes the system self-healing across restarts without the user re-doing setup.

**On agent deletion/archival:** stop the corresponding gateway process, set `agent_gateways.status='stopped'`, and stop heartbeating for it.

This provisioning logic lives entirely in the local app (a background supervisor component) — the website never talks to the local app directly, it only writes to Supabase and observes the results, consistent with the rest of the architecture.

---

## 6. Frontend (Website) — unchanged from earlier spec, restated for completeness

Visual direction: professional, commercial-chat-software aesthetic (Slack/Linear/Discord-grade), not a generic chatbot skin.

Required elements (unchanged, still all mandatory):
- Sidebar: Teams (grouped), Direct Messages, Escalations (visually distinct).
- Message list: sender avatar + name + role badge, timestamp, consecutive-message grouping.
- Threads open in a side panel, not inline.
- Tool calls rendered as distinct, visually separate blocks — never raw tags shown to the user.
- Typing indicator driven by real `dispatch_jobs.status='running'` state, not simulated.
- **Agent presence indicator** (green/gray dot, reflecting `agent_workers.status`) — this matters even more now that agents are always-on background processes; if one crashes, the user needs to see that immediately, not wonder why it's silent.
- Pending-approval messages with Approve/Deny actions.
- Escalated-thread banners with the reason (turn limit / budget / explicit @mention of user).
- System messages visually distinct (muted, centered, no avatar).
- Live token/cost meter per channel and per agent.
- Global controls: pause/resume per agent, one global kill switch.
- `@mention` autocomplete restricted to current channel's members.
- Default landing view: user's DMs + escalations, not the full agent-only team channel firehose.

---

## 7. Division of Work

### What the product owner needs to do
1. Provision/confirm the Supabase project, RLS policies, and Realtime enabled on `agents`, `dispatch_jobs`, and `messages`.
2. Decide the concrete numbers: per-plan agent limits, `max_daily_tokens`, `max_msgs_per_hour`, thread `max_turns`, `token_budget`, org-wide concurrency cap, local concurrent-gateway resource ceiling (how many always-on agents a given machine should reasonably run — needs real load-testing, not a guess).
3. Decide and provision the shared model/inference provider behind Hermes (Nous Portal, OpenRouter, own endpoint) and its billing.
4. Decide the escalation notification channel (email/push/SMS) and provider.
5. Review and sign off on the required UI states in §6 before frontend work starts.
6. Confirm the org-level API key/provider config approach in §5 step 3 (one shared key for all profiles) is acceptable, versus requiring per-agent configuration — this affects the provisioning automation.

### What the developer needs to build
1. Schema additions (§2) — `agent_gateways` table (can be done by the developer directly against the project, reviewed by the product owner).
2. Dispatcher Edge Function (§3) — if not already built from the earlier spec, build now; if already built, no changes needed.
3. The custom Supabase platform adapter (§4.2) — **this is the core new engineering work**. Reference the existing Discord/Telegram/Slack adapter implementations in the Hermes Agent source as the pattern to follow; verify the exact hook/callback names and session-context API against the current source rather than assuming they match names used earlier in this design process.
4. Local gateway process supervisor (§4.1, §4.4, §5) — spawns/monitors/restarts gateway processes per agent, handles the auto-provisioning flow on agent creation, and reconciles running gateways against Supabase on app startup.
5. Idempotency and crash-recovery handling (§4.3).
6. Frontend chat UI (§6), including every required state — these are correctness requirements given agents are real background processes that can crash or go offline, not optional polish.
7. Admin/usage dashboard for the token/cost meters.

---

## 8. Non-Negotiable Correctness Rules (unchanged, restated)

1. No agent is ever invoked without passing through the server-side dispatcher guardrail chain. No local-only shortcut paths.
2. Every `dispatch_jobs` row is processed at most once — idempotency is enforced by claiming the row via a conditional status update, not by trusting a single delivery mechanism.
3. Every thread has a hard turn cap and token budget; hitting either always escalates to the user, never silently continues or silently dies.
4. Destructive/high-stakes tool calls always require explicit human approval via the UI, regardless of agent confidence.
5. Content from one agent to another is treated as untrusted input by the receiving agent's tool-permission logic, never as an implicit command.
6. The UI must always accurately reflect whether an agent's gateway process is actually running — never let the user be left wondering why nothing is happening.

---

## 9. Explicitly Unverified — check before building, do not assume

- The exact hook/callback name and payload shape for capturing a completed response from the gateway core (referred to loosely as `session:stop` earlier in this design process) — confirm against current Hermes source before implementing §4.2 outbound path.
- Whether there is a documented, stable public interface for building a third-party platform adapter, versus needing to follow the pattern of the existing adapters without an official extension API. If no stable interface exists, flag this as an ongoing maintenance risk (Hermes updates could change adapter internals) and design the adapter code to be easy to update, not deeply coupled to internal details that might shift.
- Exact resource (CPU/RAM) cost of running many persistent gateway processes concurrently on typical user hardware — needed to set the local concurrency/agent-count ceiling in §7 item 2. Load-test before shipping a number.

---

*End of spec.*
