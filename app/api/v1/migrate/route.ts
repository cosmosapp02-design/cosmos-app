import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/v1/migrate
 * Runs Feature 1 DDL migration via Supabase Management API.
 * Requires: Authorization: Bearer <supabase-access-token>
 * Or set SUPABASE_ACCESS_TOKEN env variable.
 *
 * Get your access token from: https://supabase.com/dashboard/account/tokens
 */

const PROJECT_REF = "uaiwgcfmjwxphpjagkcz";
const MGMT_API_BASE = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

const MIGRATION_SQL = `
-- Feature 1: Agent Presence Table
CREATE TABLE IF NOT EXISTS agent_workers (
  agent_profile text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'offline',
  CONSTRAINT agent_workers_status_check CHECK (status IN ('online','offline','busy'))
);

ALTER TABLE agent_workers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_workers' AND policyname = 'Allow all reads') THEN
    CREATE POLICY "Allow all reads" ON agent_workers FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agent_workers' AND policyname = 'Allow all writes') THEN
    CREATE POLICY "Allow all writes" ON agent_workers FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Add missing columns to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_agent boolean DEFAULT false;

SELECT 'migration complete' as status;
`;

export async function POST(req: NextRequest) {
  // Support token from Authorization header or env
  const authHeader = req.headers.get("Authorization") || "";
  const token =
    authHeader.replace("Bearer ", "").trim() ||
    process.env.SUPABASE_ACCESS_TOKEN ||
    "";

  if (!token) {
    return NextResponse.json(
      {
        error: "Access token required",
        instructions:
          "Get your personal access token from https://supabase.com/dashboard/account/tokens and pass it as: Authorization: Bearer <token>",
        sql_to_run_manually: MIGRATION_SQL.trim(),
      },
      { status: 401 }
    );
  }

  try {
    const res = await fetch(MGMT_API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    });

    const result = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: "Migration failed", details: result, sql: MIGRATION_SQL.trim() },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err.message,
        sql_to_run_manually: MIGRATION_SQL.trim(),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Migration route ready",
    sql_to_run_manually: MIGRATION_SQL.trim(),
    instructions: [
      "Option A: Go to https://supabase.com/dashboard/project/uaiwgcfmjwxphpjagkcz/sql/new and paste the sql_to_run_manually",
      "Option B: Get personal access token from https://supabase.com/dashboard/account/tokens and POST to this route with Authorization: Bearer <token>",
    ],
  });
}
