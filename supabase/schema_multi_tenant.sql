-- Cosmos AI Multi-Tenant & RLS Database Schema
-- Paste into Supabase SQL Editor (https://supabase.com/dashboard/project/uaiwgcfmjwxphpjagkcz/sql)

-- 1. Enable RLS on all tables
ALTER TABLE IF EXISTS organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_files ENABLE ROW LEVEL SECURITY;

-- 2. Add owner_id / user_id column to tables if not present
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE project_files ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Row-Level Security (RLS) Isolation Policies
-- Organizations
DROP POLICY IF EXISTS "Users can access their own organization" ON organizations;
CREATE POLICY "Users can access their own organization" ON organizations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Agents
DROP POLICY IF EXISTS "Users can access their own agents" ON agents;
CREATE POLICY "Users can access their own agents" ON agents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Channels
DROP POLICY IF EXISTS "Users can access their own channels" ON channels;
CREATE POLICY "Users can access their own channels" ON channels
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Messages
DROP POLICY IF EXISTS "Users can access their own messages" ON messages;
CREATE POLICY "Users can access their own messages" ON messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tickets
DROP POLICY IF EXISTS "Users can access their own tickets" ON tickets;
CREATE POLICY "Users can access their own tickets" ON tickets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Project Files
DROP POLICY IF EXISTS "Users can access their own project files" ON project_files;
CREATE POLICY "Users can access their own project files" ON project_files
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
