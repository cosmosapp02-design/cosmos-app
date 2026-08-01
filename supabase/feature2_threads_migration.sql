-- Feature 2 Migration: Discord-style Threads
-- Paste into: https://supabase.com/dashboard/project/uaiwgcfmjwxphpjagkcz/sql

-- Threads table
CREATE TABLE IF NOT EXISTS threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title text NOT NULL,
  reply_count int NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Link messages to threads
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES threads(id) ON DELETE CASCADE;

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_threads_channel_id ON threads(channel_id);
CREATE INDEX IF NOT EXISTS idx_threads_last_activity ON threads(channel_id, last_activity_at DESC);

-- RLS: allow all (single-org)
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all reads on threads" ON threads;
DROP POLICY IF EXISTS "Allow all writes on threads" ON threads;
CREATE POLICY "Allow all reads on threads" ON threads FOR SELECT USING (true);
CREATE POLICY "Allow all writes on threads" ON threads FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE threads;
