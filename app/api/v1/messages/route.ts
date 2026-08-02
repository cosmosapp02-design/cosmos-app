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

/** Service role client — trusted server writes that bypass RLS */
function sbAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/**
 * Resolves the org_id for a given userId via direct Postgres query.
 */
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
 * POST /api/v1/messages
 * Body: { channel_id, thread_id?, sender_name, sender_role, text, is_agent?, user_id?, org_id? }
 *
 * Server-side message insert using service role to bypass RLS.
 * org_id is resolved from user_id if not explicitly provided.
 * Returns: { id, channel_id, thread_id, org_id, created_at }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      channel_id,
      thread_id,
      sender_name,
      sender_role,
      text,
      is_agent = false,
      user_id,
      org_id: bodyOrgId,
    } = body;

    if (!channel_id || !text) {
      return NextResponse.json(
        { error: "channel_id and text are required" },
        { status: 400 }
      );
    }

    // Resolve org_id: prefer explicit value, then look up by user
    const org_id =
      bodyOrgId && bodyOrgId !== FALLBACK_ORG_ID
        ? bodyOrgId
        : await resolveOrgId(user_id);

    const { data, error } = await sbAdmin()
      .from("messages")
      .insert([
        {
          channel_id,
          thread_id: thread_id || null,
          sender_name,
          sender_role,
          text,
          is_agent,
          org_id,
        },
      ])
      .select("id, channel_id, thread_id, org_id, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/v1/messages?channel_id=...&thread_id=...&limit=50
 * Returns messages for a channel/thread. Uses service role so server-side reads work.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channel_id = searchParams.get("channel_id");
  const thread_id = searchParams.get("thread_id");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  if (!channel_id) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  let query = sbAdmin()
    .from("messages")
    .select("*")
    .eq("channel_id", channel_id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (thread_id) {
    query = query.eq("thread_id", thread_id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ messages: [], error: error.message });
  }

  return NextResponse.json({ messages: data || [] });
}
