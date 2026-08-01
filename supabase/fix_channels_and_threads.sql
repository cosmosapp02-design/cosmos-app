-- Fix Channels RLS and Threads Column Types
-- Paste into: https://supabase.com/dashboard/project/uaiwgcfmjwxphpjagkcz/sql

-- 1. Ensure channels table allows all reads/writes
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all reads on channels" ON channels;
DROP POLICY IF EXISTS "Allow all writes on channels" ON channels;
CREATE POLICY "Allow all reads on channels" ON channels FOR SELECT USING (true);
CREATE POLICY "Allow all writes on channels" ON channels FOR ALL USING (true) WITH CHECK (true);

-- 2. Allow channel_id to store string keys or UUIDs without type errors
ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_channel_id_fkey;
ALTER TABLE threads ALTER COLUMN channel_id TYPE text;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_channel_id_fkey;
ALTER TABLE messages ALTER COLUMN channel_id TYPE text;
