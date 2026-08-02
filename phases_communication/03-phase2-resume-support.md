# Phase 2 — RESUME Support

## Objective
Add Discord's most valuable trick: an agent that briefly drops connection doesn't need a separate "offline queue" system — it just reconnects and asks "what did I miss since sequence N," and the relay replays exactly that.

## Work for the LLM

1. Every `DISPATCH` the relay sends to an agent gets an incrementing `sequence` number, scoped per-agent. Store the last dispatched sequence on `agents.last_sequence` as each one goes out.
2. On agent reconnect, it may send `RESUME {token, last_sequence}` instead of `IDENTIFY`. Relay:
   - Validates token as before.
   - Looks at `dispatch_jobs` for that agent where the job's sequence > the agent's reported `last_sequence` and status is not yet `delivered`.
   - Replays those, in order, over the new socket.
   - If the session is too old to resume (define a cutoff, e.g. gap > 10 minutes), reject the RESUME and require a fresh `IDENTIFY` instead — mirrors Discord's own session-expiry behavior.
3. Use `dispatch_jobs` as the durable log backing this — don't build a second event log table. Each dispatched message should have a corresponding `dispatch_jobs` row with its sequence number recorded.

## Work for the user
- No new manual setup this phase — you're testing against the same relay + token from Phase 1.
- You'll need a way to simulate a network drop without killing the whole test client process (e.g. toggle wifi, or use a proxy you can pause).

## Test (must pass before Phase 3)
- With the relay sending a few stub `DISPATCH` messages to the connected test client, drop the network mid-stream (not the process) so a message or two doesn't arrive.
- Reconnect with `RESUME` and the last sequence number the client actually received.
- Confirm the client receives exactly the missed messages, in order, with no duplicates and nothing skipped.
- Confirm a `RESUME` sent with a stale/expired session is rejected and forces a fresh `IDENTIFY`.
