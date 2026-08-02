-- v2 Final Architecture Migration Script
-- Paste and run in Supabase SQL Editor: https://supabase.com/dashboard/project/uaiwgcfmjwxphpjagkcz/sql

-- 1. Agent Gateways Operational Table
CREATE TABLE IF NOT EXISTS agent_gateways (
  agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id),
  status text NOT NULL DEFAULT 'stopped' CHECK (status IN ('starting','running','stopped','crashed')),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);

-- 2. Dispatch Jobs Queue Table
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

-- 3. Agent Turn Log & Spend Ledger
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

-- 4. Indexing for High-Performance Realtime & Queue Polling
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_agent_status ON dispatch_jobs(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_idempotency ON dispatch_jobs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_agent_gateways_status ON agent_gateways(status);

-- 5. RLS Policies
ALTER TABLE agent_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turn_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE spend_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all reads on agent_gateways" ON agent_gateways;
DROP POLICY IF EXISTS "Allow all writes on agent_gateways" ON agent_gateways;
CREATE POLICY "Allow all reads on agent_gateways" ON agent_gateways FOR SELECT USING (true);
CREATE POLICY "Allow all writes on agent_gateways" ON agent_gateways FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all reads on dispatch_jobs" ON dispatch_jobs;
DROP POLICY IF EXISTS "Allow all writes on dispatch_jobs" ON dispatch_jobs;
CREATE POLICY "Allow all reads on dispatch_jobs" ON dispatch_jobs FOR SELECT USING (true);
CREATE POLICY "Allow all writes on dispatch_jobs" ON dispatch_jobs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all reads on agent_turn_log" ON agent_turn_log;
DROP POLICY IF EXISTS "Allow all writes on agent_turn_log" ON agent_turn_log;
CREATE POLICY "Allow all reads on agent_turn_log" ON agent_turn_log FOR SELECT USING (true);
CREATE POLICY "Allow all writes on agent_turn_log" ON agent_turn_log FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all reads on spend_ledger" ON spend_ledger;
DROP POLICY IF EXISTS "Allow all writes on spend_ledger" ON spend_ledger;
CREATE POLICY "Allow all reads on spend_ledger" ON spend_ledger FOR SELECT USING (true);
CREATE POLICY "Allow all writes on spend_ledger" ON spend_ledger FOR ALL USING (true) WITH CHECK (true);

-- 6. Enable Realtime Publications for Queue & Worker Status
ALTER PUBLICATION supabase_realtime ADD TABLE dispatch_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_gateways;
