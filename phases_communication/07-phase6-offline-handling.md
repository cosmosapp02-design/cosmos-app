# Phase 6 — True Offline Handling

## Objective
Confirm messages sent while the agent's machine is off/wrapper is stopped are never lost — delivered automatically the moment the agent reconnects, using the same RESUME/queued mechanism built in Phase 2 and 5, not a new system.

## Work for the LLM

1. Confirm the Phase 5 "offline → `dispatch_jobs` queued" path and the Phase 2 RESUME replay path are actually connected: when the wrapper reconnects (fresh `IDENTIFY` or `RESUME`), the relay should check for any `dispatch_jobs` rows still `queued` for that agent and deliver them before/alongside normal RESUME replay.
2. Make sure the UI reflects a "pending" state on messages sent to an offline agent (read `dispatch_jobs.status` or a derived status on the `messages` row) so the user isn't left wondering if it worked.

## Work for the user
- Stop the Phase 3 wrapper (simulating the machine being off).
- Send a message to that agent from the web UI.
- Confirm the UI shows it as pending/undelivered.
- Restart the wrapper.

## Test (must pass before Phase 7)
- Message sent while offline shows a clear pending state in the UI.
- Within a few seconds of the wrapper reconnecting, the queued message is delivered, processed by Hermes, and the reply appears — without you resending anything.
- `agent_workers.status` correctly reflects offline → online through this whole cycle.
