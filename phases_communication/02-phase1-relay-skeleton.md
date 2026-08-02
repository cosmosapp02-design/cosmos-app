# Phase 1 — Relay Skeleton (IDENTIFY / HEARTBEAT / DISPATCH)

## Objective
Stand up a standalone WebSocket relay server (separate process from Supabase — this replaces the exec-per-message model). Agents will connect **outward** to this, like a Discord bot connecting to Discord's gateway.

## Work for the LLM

1. Build a small Node/TS WebSocket server (deployable anywhere — Render/Fly/a VPS; not a Supabase Edge Function, since it needs a long-lived persistent connection).
2. Server holds the **service role key** (env var, never exposed to clients) since it needs to read/write across orgs as trusted infra.
3. Implement opcodes:
   - `IDENTIFY {token}` on connect: hash the token, look up `agents` by `gateway_token_hash`. If found and `agents.status = active`, upsert `agent_workers` row: `status='online'`, `session_id=<new uuid>`, `connected_at=now()`, `org_id=<agent's org>`. If not found, close the socket immediately — no DB writes.
   - `HEARTBEAT`: on receipt, update `agent_workers.last_heartbeat_at`. Server-side, run an interval that checks all "online" workers — if `last_heartbeat_at` is older than 2x the expected interval, flip `agent_workers.status='offline'` and close that socket.
   - `HEARTBEAT_ACK`: relay sends this back to confirm receipt (mirrors Discord's pattern; keeps agent-side logic simple).
   - `DISPATCH`: stub only for this phase — accept a payload and log it, no real message routing yet.
4. Keep the in-memory socket registry (agent_id → live socket object) in the relay process itself — this is what makes routing possible without polling Supabase.

## Work for the user
- Deploy the relay per the LLM's instructions (env vars: Supabase URL, service role key, expected heartbeat interval).
- Get one real token from Phase 0 (the raw token you were shown once when it was generated).
- Use a raw WebSocket test client (e.g. `websocat` or `wscat`) to manually connect and send an `IDENTIFY` payload with that token.

## Test (must pass before Phase 2)
- Valid token → `agent_workers.status` flips to `online` in Supabase within a second or two.
- Stop sending `HEARTBEAT` from the test client → `agent_workers.status` flips to `offline` within the timeout window, and the relay closes the socket server-side.
- Reconnect with an invalid/garbage token → connection is rejected, **no** `agent_workers` row is created or modified.
