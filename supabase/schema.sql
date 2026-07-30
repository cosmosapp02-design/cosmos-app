-- Cosmos AI Platform Database Schema
-- Paste into Supabase SQL Editor (https://supabase.com/dashboard/project/uaiwgcfmjwxphpjagkcz/sql)

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Cosmos Enterprise Platform',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  purpose TEXT,
  skills JSONB DEFAULT '[]'::jsonb,
  avatar_color TEXT DEFAULT '#1E1F24',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_private BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_role TEXT DEFAULT 'Employee',
  text TEXT NOT NULL,
  is_agent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'backlog',
  priority TEXT DEFAULT 'medium',
  assignee TEXT DEFAULT 'Dev-Bot',
  points INT DEFAULT 3,
  due_date TEXT,
  subtasks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT,
  file_type TEXT,
  size_bytes INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial data
INSERT INTO organizations (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Cosmos Enterprise Platform') ON CONFLICT DO NOTHING;

INSERT INTO agents (org_id, name, role, purpose, skills) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Dev-Bot', 'Senior Full-Stack Coder', 'Build Next.js middleware & API integrations', '["TypeScript", "Next.js", "Docker"]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Alex', 'Product Manager', 'Draft PRDs & manage Agile sprint boards', '["Agile", "PRDs", "Roadmaps"]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'QA-Guard', 'QA Inspector', 'Run Playwright E2E suites & visual audits', '["Playwright", "Testing", "Security"]'::jsonb)
ON CONFLICT DO NOTHING;
