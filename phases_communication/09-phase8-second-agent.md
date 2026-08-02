# Phase 8 — Second Agent (Prove It Scales)

## Objective
Confirm the architecture handles more than one agent per org without any code changes — only new data rows — and that mentions between agents resolve correctly.

## Work for the LLM

1. No new code expected this phase unless Phase 0–7 testing surfaced something hardcoded to a single agent (e.g. any assumption of "one wrapper, one socket" in the relay's in-memory registry — it should already be keyed by `agent_id`, confirm this).
2. If useful for later automation, this is a good point to also confirm what happens when two agents are mentioned in the same reply (multiple `mention` blocks) — no special handling should be needed if Phase 4's parser was built generically.

## Work for the user
- Have the LLM generate a token for a second agent (same org).
- Run a second instance of the Phase 3 wrapper, pointed at the second agent's profile/token, on the same machine (different local Hermes profile directory).
- Send a message that gets one agent to `@mention` the other.

## Test (must pass before Phase 9)
- Both agents show `online` independently in `agent_workers`, each with correct `agent_id`/`session_id`.
- Messages route to the correct agent — no cross-talk between the two.
- The mention resolves and highlights correctly since it matches a real org member; a message mentioning an agent from a *different* org (create one more temp agent under the Phase 0 test org) does **not** resolve or highlight.
