-- Phase 7: Dynamic Multi-Model Logging Migration

-- 1. Ensure model column exists on agent_turn_log
ALTER TABLE agent_turn_log ADD COLUMN IF NOT EXISTS model text;

-- 2. Ensure model column exists on spend_ledger
ALTER TABLE spend_ledger ADD COLUMN IF NOT EXISTS model text;
