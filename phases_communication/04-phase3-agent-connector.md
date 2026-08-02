# Phase 3 — Agent-Side Connector (Single Agent, Manual)

## Objective
Build the piece that runs on the user's own machine: a lightweight process that holds the persistent connection to the relay and hands messages to Hermes. This is the local equivalent of a Discord bot's client library.

## Work for the LLM

1. Build a small standalone script/process (Node or Python, whichever matches the Hermes invocation style already in use) that:
   - Reads a local config: `{token, hermes_profile_path}`.
   - Opens a WebSocket to the relay, sends `IDENTIFY {token}`.
   - Sends periodic `HEARTBEAT` per the interval the relay expects.
   - On receiving `DISPATCH`, runs Hermes for that agent's profile (reusing the existing exec-invocation approach from `supabase-gateway-adapter.ts` is fine here — the transport is what's changing, not necessarily the Hermes call itself yet) and sends the raw text response back over the socket as a reply `DISPATCH`.
2. This wrapper does **not** touch the `messages` table directly yet — that integration comes in Phase 5. For now it only needs to prove the connect → receive → run Hermes → reply-over-socket loop works.

## Work for the user
- Provide the LLM with your one test agent's raw token and local Hermes profile path (or have the LLM's Phase 0 token-generation step produce a fresh one for this agent).
- Manually start the wrapper process and leave it running.
- Trigger a manual test `DISPATCH` from the relay side (LLM should give you a simple script/command to send one).

## Test (must pass before Phase 4)
- Wrapper connects and `agent_workers.status` shows `online`.
- A manually-triggered test `DISPATCH` reaches the wrapper, Hermes runs, and a reply comes back over the socket (verify via relay-side logs or a temporary echo table — not the real chat UI yet).
- Killing the wrapper process flips `agent_workers.status` to `offline` via the heartbeat timeout from Phase 1.
