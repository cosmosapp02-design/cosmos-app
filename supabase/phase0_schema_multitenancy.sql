-- Phase 0: Schema Foundation & Multi-Tenancy DDL Migration

-- 1. Ensure Extension for Cryptographic Functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Ensure Organizations Table Exists
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure default organization exists
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization')
ON CONFLICT (id) DO NOTHING;

-- 3. Ensure Org Members Table Exists
CREATE TABLE IF NOT EXISTS org_members (
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

-- 4. Add org_id to core tables if missing & backfill
ALTER TABLE agents ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE agents SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

ALTER TABLE channels ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE channels SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

ALTER TABLE threads ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE threads SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE messages SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

ALTER TABLE agent_workers ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE agent_workers SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

ALTER TABLE agent_gateways ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE agent_gateways SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

ALTER TABLE dispatch_jobs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE dispatch_jobs SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

ALTER TABLE agent_turn_log ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE agent_turn_log SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

ALTER TABLE spend_ledger ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE spend_ledger SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- Tasks table if exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
    UPDATE tasks SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
  END IF;
END $$;

-- 5. Add New Gateway Columns
-- agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS gateway_token_hash text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_sequence bigint DEFAULT 0;

-- agent_workers
ALTER TABLE agent_workers ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE agent_workers ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz DEFAULT now();

-- messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_blocks jsonb;

-- 6. Helper Security Definer Function to Avoid RLS Subquery Recursion
CREATE OR REPLACE FUNCTION get_user_org_ids(user_uuid uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT org_id FROM org_members WHERE user_id = user_uuid;
$$;

-- 7. Gateway Token Generation SQL Function
CREATE OR REPLACE FUNCTION generate_agent_gateway_token(target_agent_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  raw_token text;
  token_hash text;
BEGIN
  -- Generate 32-byte secure random token in hex (64 chars)
  raw_token := 'gtw_' || encode(gen_random_bytes(32), 'hex');
  -- SHA-256 digest
  token_hash := encode(digest(raw_token, 'sha256'), 'hex');
  
  -- Update agent record with token hash
  UPDATE agents
  SET gateway_token_hash = token_hash
  WHERE id = target_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent % not found', target_agent_id;
  END IF;

  RETURN raw_token;
END;
$$;

-- 8. Enable and FORCE RLS on All Tables & Configure Multi-Tenant Isolation Policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turn_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE spend_ledger ENABLE ROW LEVEL SECURITY;

ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE org_members FORCE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;
ALTER TABLE channels FORCE ROW LEVEL SECURITY;
ALTER TABLE threads FORCE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_workers FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_gateways FORCE ROW LEVEL SECURITY;
ALTER TABLE dispatch_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_turn_log FORCE ROW LEVEL SECURITY;
ALTER TABLE spend_ledger FORCE ROW LEVEL SECURITY;

-- Helper to purge all legacy policies and enforce clean org_isolation policies
DO $$
DECLARE
  pol RECORD;
  t text;
  tables text[] := ARRAY[
    'organizations', 'org_members', 'agents', 'channels', 'threads', 
    'messages', 'agent_workers', 'agent_gateways', 'dispatch_jobs', 
    'agent_turn_log', 'spend_ledger'
  ];
BEGIN
  -- Include tasks if exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
    tables := array_append(tables, 'tasks');
  END IF;

  -- Step A: Drop ALL existing policies on these tables
  FOR pol IN 
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = ANY(tables)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;

  -- Step B: Create strict org-isolated RLS policies using get_user_org_ids function
  FOREACH t IN ARRAY tables LOOP
    IF t = 'organizations' THEN
      EXECUTE format(
        'CREATE POLICY "org_isolation_select" ON %I FOR SELECT USING (id IN (SELECT get_user_org_ids(auth.uid())))', t
      );
      EXECUTE format(
        'CREATE POLICY "org_isolation_update" ON %I FOR UPDATE USING (id IN (SELECT get_user_org_ids(auth.uid())))', t
      );
    ELSIF t = 'org_members' THEN
      EXECUTE format(
        'CREATE POLICY "org_isolation_select" ON %I FOR SELECT USING (user_id = auth.uid() OR org_id IN (SELECT get_user_org_ids(auth.uid())))', t
      );
      EXECUTE format(
        'CREATE POLICY "org_isolation_insert" ON %I FOR INSERT WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())))', t
      );
    ELSIF t IN ('spend_ledger', 'agent_turn_log') THEN
      -- Standard users can read logs for their org, writes performed via service role
      EXECUTE format(
        'CREATE POLICY "org_isolation_select" ON %I FOR SELECT USING (org_id IN (SELECT get_user_org_ids(auth.uid())))', t
      );
    ELSE
      -- Full CRUD scoped to user's org membership
      EXECUTE format(
        'CREATE POLICY "org_isolation_select" ON %I FOR SELECT USING (org_id IN (SELECT get_user_org_ids(auth.uid())))', t
      );
      EXECUTE format(
        'CREATE POLICY "org_isolation_insert" ON %I FOR INSERT WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())))', t
      );
      EXECUTE format(
        'CREATE POLICY "org_isolation_update" ON %I FOR UPDATE USING (org_id IN (SELECT get_user_org_ids(auth.uid())))', t
      );
      EXECUTE format(
        'CREATE POLICY "org_isolation_delete" ON %I FOR DELETE USING (org_id IN (SELECT get_user_org_ids(auth.uid())))', t
      );
    END IF;
  END LOOP;
END $$;
