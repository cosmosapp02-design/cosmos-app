-- Phase 2: Sequence Tracking for RESUME Support DDL Migration

-- 1. Add sequence column to dispatch_jobs if missing
ALTER TABLE dispatch_jobs ADD COLUMN IF NOT EXISTS sequence bigint;

-- 2. Add index for fast sequence replay lookup
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_agent_seq ON dispatch_jobs(agent_id, sequence ASC);

-- 3. Add sequence column to agents if missing (already added in Phase 0, safety check here)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_sequence bigint DEFAULT 0;
