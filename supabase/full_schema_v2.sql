-- Master Schema (v2 Complete) for New Supabase Project
-- Paste and run in Supabase SQL Editor: https://supabase.com/dashboard/project/erguibwskkljogogttgg/sql/new

-- 1. Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Agents Table
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  role text NOT NULL,
  purpose text,
  primary_model text DEFAULT 'gemini-3.6-flash-lite',
  backup_model text DEFAULT 'claude-3-5-sonnet',
  skills text[] DEFAULT '{}',
  avatar_color text DEFAULT '#1E1F24',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Channels Table
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'group',
  description text,
  topic text,
  agents text[] DEFAULT '{}',
  is_deactivated boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Threads Table
CREATE TABLE IF NOT EXISTS threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL,
  title text NOT NULL,
  reply_count int NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL,
  thread_id uuid REFERENCES threads(id) ON DELETE CASCADE,
  user_id uuid,
  sender_name text NOT NULL,
  sender_role text NOT NULL DEFAULT 'Workspace CEO',
  text text NOT NULL,
  is_agent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Agent Workers Table (Presence & Heartbeats)
CREATE TABLE IF NOT EXISTS agent_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_profile text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy')),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Agent Gateways Operational Table
CREATE TABLE IF NOT EXISTS agent_gateways (
  agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id),
  status text NOT NULL DEFAULT 'stopped' CHECK (status IN ('starting','running','stopped','crashed')),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);

-- 8. Dispatch Jobs Queue Table
CREATE TABLE IF NOT EXISTS dispatch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id),
  channel_id text NOT NULL,
  thread_id uuid REFERENCES threads(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','delivered','failed')),
  context_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE NOT NULL,
  timeout_seconds int NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- 9. Agent Turn Log & Spend Ledger
CREATE TABLE IF NOT EXISTS agent_turn_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  prompt_tokens int DEFAULT 0,
  completion_tokens int DEFAULT 0,
  total_tokens int DEFAULT 0,
  duration_ms int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spend_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  cost_usd numeric(10,6) DEFAULT 0.0,
  token_count int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Indexes for Fast Performance
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_threads_channel_id ON threads(channel_id);
CREATE INDEX IF NOT EXISTS idx_threads_last_activity ON threads(channel_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_workers_profile ON agent_workers(agent_profile);
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_agent_status ON dispatch_jobs(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_idempotency ON dispatch_jobs(idempotency_key);

-- 11. Enable Row Level Security (RLS) & Add Public Access Policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turn_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE spend_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all reads on organizations" ON organizations FOR SELECT USING (true);
CREATE POLICY "Allow all writes on organizations" ON organizations FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all reads on agents" ON agents FOR SELECT USING (true);
CREATE POLICY "Allow all writes on agents" ON agents FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all reads on channels" ON channels FOR SELECT USING (true);
CREATE POLICY "Allow all writes on channels" ON channels FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all reads on threads" ON threads FOR SELECT USING (true);
CREATE POLICY "Allow all writes on threads" ON threads FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all reads on messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Allow all writes on messages" ON messages FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all reads on agent_workers" ON agent_workers FOR SELECT USING (true);
CREATE POLICY "Allow all writes on agent_workers" ON agent_workers FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all reads on agent_gateways" ON agent_gateways FOR SELECT USING (true);
CREATE POLICY "Allow all writes on agent_gateways" ON agent_gateways FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all reads on dispatch_jobs" ON dispatch_jobs FOR SELECT USING (true);
CREATE POLICY "Allow all writes on dispatch_jobs" ON dispatch_jobs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all reads on agent_turn_log" ON agent_turn_log FOR SELECT USING (true);
CREATE POLICY "Allow all writes on agent_turn_log" ON agent_turn_log FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all reads on spend_ledger" ON spend_ledger FOR SELECT USING (true);
CREATE POLICY "Allow all writes on spend_ledger" ON spend_ledger FOR ALL USING (true) WITH CHECK (true);

-- 12. Realtime Publications
ALTER PUBLICATION supabase_realtime ADD TABLE channels;
ALTER PUBLICATION supabase_realtime ADD TABLE threads;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_workers;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_gateways;
ALTER PUBLICATION supabase_realtime ADD TABLE dispatch_jobs;
