# AI Org Chat — Discord-Style Gateway Migration — Master Plan

**Audience:** the developer LLM (Gemini) with Supabase project access.
**Do not skip phases.** Each phase has its own file with an explicit test. Move to the next file only after the test in the current one passes.

## Existing tables (do not recreate — extend only)
`channels`, `threads`, `messages`, `agents`, `agent_workers`, `agent_gateways`, `dispatch_jobs`, `agent_turn_log`, `spend_ledger`, `organizations`, `tasks`.

Table-to-role mapping for this migration:
- `agents` → identity + model config (already has primary/backup model fields — use them, don't hardcode model names anywhere in code)
- `agent_workers` → **live connection presence** (online/offline/busy) — this IS the "who's connected right now" registry, equivalent to Discord's gateway session table. Do not build a separate presence table.
- `agent_gateways` → lifecycle of the local gateway *process* (starting/running/stopped/crashed) — separate concern from `agent_workers` (a process can be "running" but its socket briefly "offline" mid-reconnect).
- `dispatch_jobs` → becomes the **audit + offline outbox**, not the delivery mechanism. Delivery happens over the live socket; `dispatch_jobs` rows exist so nothing is lost if the socket isn't there.

## Global architecture decision: mirror Discord's gateway protocol

Opcodes to implement in the relay:
- `IDENTIFY` — agent connects, sends `{token}`
- `HEARTBEAT` / `HEARTBEAT_ACK` — keep-alive; missed heartbeats = presumed dead connection
- `DISPATCH` — actual message payloads, each carrying an incrementing `sequence` number
- `RESUME` — agent reconnects with `{token, last_sequence}`; relay replays only what was missed
- `RECONNECT` — relay-initiated, tells agent to drop and reconnect (used for relay deploys/restarts)

## Global decision: multi-tenancy (CRITICAL — every phase depends on this)

Every table listed above must be scoped to an organization, and Row Level Security must guarantee one user/org can never read another's rows — including via the anon key from the web client. The relay and any backend job runner use the **service role key** (bypasses RLS) because they act as trusted infrastructure, not as a specific user; every query they run must include an explicit `org_id` filter in code, since RLS won't be there to save them.

## Global decision: message content is structured, not plain text

`messages` gets a `content_blocks` jsonb column. Raw agent output is parsed into blocks so the UI can render Discord-style: collapsible "thinking" sections, headings, code blocks, and resolved `@mentions` (only real org members get the highlighted mention treatment — an unmatched name stays plain text).

## File index
1. `01-phase0-schema-multitenancy.md`
2. `02-phase1-relay-skeleton.md`
3. `03-phase2-resume-support.md`
4. `04-phase3-agent-connector.md`
5. `05-phase4-content-parsing-mentions.md`
6. `06-phase5-backend-integration.md`
7. `07-phase6-offline-handling.md`
8. `08-phase7-multimodel-swap.md`
9. `09-phase8-second-agent.md`
10. `10-phase9-automation.md`
