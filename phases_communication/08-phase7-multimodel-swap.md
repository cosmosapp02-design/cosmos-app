# Phase 7 — Multi-Model Proof Point

## Objective
Prove the system was built model-agnostic from the start: switching an agent's model is a data change, not a code change.

## Work for the LLM

1. Confirm the Phase 3 wrapper reads the model to use for Hermes strictly from `agents.primary_model` (and `backup_model` if the primary fails/errors) — audit the wrapper code to make sure no model name is hardcoded anywhere (this was a bug in the old adapter, which hardcoded `nvidia/nemotron-3-super-12` directly).
2. `agent_turn_log` and `spend_ledger` should record whichever model actually served the turn, not a fixed string.

## Work for the user
- In the `agents` table, change your one test agent's `primary_model` field to a different provider/model that Hermes supports.
- Restart the wrapper (or confirm it hot-reloads config, per whatever the LLM built).

## Test (must pass before Phase 8)
- After the change, the agent's replies are clearly coming from the new model (check response style, or Hermes' own logs confirming the model in use).
- `agent_turn_log`/`spend_ledger` rows for this turn reflect the new model, not the old one.
- Nothing else in the pipeline (parsing, mentions, delivery) broke from the swap.
