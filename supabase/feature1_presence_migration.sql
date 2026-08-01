-- Feature 1 Migration: Agent Presence Table
-- Paste into: https://supabase.com/dashboard/project/uaiwgcfmjwxphpjagkcz/sql

-- Agent workers presence/heartbeat table
CREATE TABLE IF NOT EXISTS agent_workers (
  agent_profile text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'offline',
  CONSTRAINT agent_workers_status_check CHECK (status IN ('online','offline','busy'))
);

-- Allow all authenticated users to read/write (single-org environment)
ALTER TABLE agent_workers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all reads" ON agent_workers;
DROP POLICY IF EXISTS "Allow all writes" ON agent_workers;
CREATE POLICY "Allow all reads" ON agent_workers FOR SELECT USING (true);
CREATE POLICY "Allow all writes" ON agent_workers FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for live presence updates
ALTER PUBLICATION supabase_realtime ADD TABLE agent_workers;

-- Also enable realtime for messages if not already
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Add missing columns to messages (no-op if they exist)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS is_agent boolean DEFAULT false;
