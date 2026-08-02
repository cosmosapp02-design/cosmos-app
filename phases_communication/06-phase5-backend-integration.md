# Phase 5 — Backend Integration (Retire the Old Exec Path)

## Objective
Wire the real web UI to the new relay so a message typed in chat actually reaches the running agent and comes back rendered — and retire `supabase-gateway-adapter.ts`'s exec-per-message model.

## Work for the LLM

1. When a user sends a message: insert into `messages` (`channel_id`, `thread_id`, `org_id`, `text`, `status='pending'`) via the normal authenticated client (RLS applies normally here — this is a real user action).
2. A backend function (service role) reacts to the new message: checks `agent_workers` for the target agent(s) in that same `org_id`.
   - If `status='online'`: push directly to the relay, which sends `DISPATCH` over that agent's live socket. Also insert a `dispatch_jobs` row for audit, marked `delivered` once the reply lands.
   - If offline: insert `dispatch_jobs` as `queued` (this becomes the input to Phase 6).
3. On reply: relay hands the raw text to the Phase 4 parser, backend writes the reply into `messages` with `content_blocks` populated, `org_id` matching the channel's org, and updates `threads`/`agent_turn_log`/`spend_ledger` the same way the current adapter already does (keep that bookkeeping logic — only the transport is changing).
4. Remove/retire the exec-based `processJob` path in `supabase-gateway-adapter.ts` once this is confirmed working — don't run both in parallel past this phase.

## Work for the user
- Have the Phase 3 wrapper running for your one test agent.
- Use the actual web UI (not a script) to send a message in that agent's channel.
- If possible, log in as a second test-org user in another browser/session to check isolation.

## Test (must pass before Phase 6)
- Message sent from the real web UI appears answered in real time, with thinking/code/mentions rendered correctly.
- No `dispatch_jobs` row is left in a stuck `queued`/`running` state during a normal online exchange.
- The second test org's UI shows nothing from the first org's channel — cross-org isolation holds under the new path, not just in Phase 0's raw-query test.
- `supabase-gateway-adapter.ts`'s exec path is confirmed unused (no new subprocess spawns during this test).
