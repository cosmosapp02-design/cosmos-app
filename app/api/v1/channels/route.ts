import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://erguibwskkljogogttgg.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZ3VpYndza2tsam9nb2d0dGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MjExNzgsImV4cCI6MjEwMTE5NzE3OH0.b1t0l8_lNDfg06ruSLa_ru9K3TU5bD5SGnSLVdILNbY";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
const DB_URL = process.env.DATABASE_URL!;
const FALLBACK_ORG_ID = "00000000-0000-0000-0000-000000000001";

function sbAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

async function resolveOrgId(userId: string | undefined): Promise<string> {
  if (!userId || !DB_URL) return FALLBACK_ORG_ID;
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  try {
    await db.connect();
    const res = await db.query(
      `SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return res.rows.length > 0 ? res.rows[0].org_id : FALLBACK_ORG_ID;
  } catch {
    return FALLBACK_ORG_ID;
  } finally {
    await db.end();
  }
}

/**
 * GET /api/v1/channels
 * Returns channels for the user's org (resolved from user_id query param).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id") || undefined;

  const orgId = await resolveOrgId(userId);

  const { data, error } = await sbAdmin()
    .from("channels")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ channels: [], error: error.message });
  }

  return NextResponse.json({ channels: data || [] });
}

/**
 * POST /api/v1/channels
 * Body: { name, type?, description?, agents?, org_id?, user_id? }
 * Creates a channel using service role to bypass RLS.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type = "group", description, agents, user_id, org_id: bodyOrgId } = body;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const org_id =
      bodyOrgId && bodyOrgId !== FALLBACK_ORG_ID
        ? bodyOrgId
        : await resolveOrgId(user_id);

    const { data, error } = await sbAdmin()
      .from("channels")
      .insert([{ name, type, description, agents, org_id }])
      .select()
      .single();

    if (error) {
      // Silently ignore duplicates
      if (error.code === "23505") {
        return NextResponse.json({ channel: null, duplicate: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ channel: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
