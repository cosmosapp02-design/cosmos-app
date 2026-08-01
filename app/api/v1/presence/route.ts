import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://uaiwgcfmjwxphpjagkcz.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhaXdnY2Ztand4cGhwamFna2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNzUzNjgsImV4cCI6MjEwMDk1MTM2OH0.GAe8rDHR4acGcAnohP6U8lWpY0RCO0kJbPFEPudP228";

/** Threshold (seconds) after which an agent is considered offline even if status='online' */
const OFFLINE_THRESHOLD_SECONDS = 45;

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * GET /api/v1/presence
 * Returns all agent presence records. Any agent last_seen_at > 45s ago
 * is treated as offline regardless of stored status.
 */
export async function GET() {
  const sb = makeClient();

  try {
    const { data, error } = await sb
      .from("agent_workers")
      .select("agent_profile, last_seen_at, status")
      .order("agent_profile");

    if (error) {
      // Table might not exist yet — return empty list gracefully
      return NextResponse.json({ workers: [], tableReady: false });
    }

    const now = Date.now();
    const workers = (data || []).map((row: any) => {
      const lastSeen = new Date(row.last_seen_at).getTime();
      const secondsAgo = (now - lastSeen) / 1000;
      const effectiveStatus =
        secondsAgo > OFFLINE_THRESHOLD_SECONDS ? "offline" : row.status;
      return {
        agent_profile: row.agent_profile,
        status: effectiveStatus,
        last_seen_at: row.last_seen_at,
        seconds_ago: Math.round(secondsAgo),
      };
    });

    return NextResponse.json({ workers, tableReady: true });
  } catch (err: any) {
    return NextResponse.json({ workers: [], tableReady: false, error: err.message });
  }
}

/**
 * POST /api/v1/presence
 * Body: { profile: string, status: 'online' | 'offline' | 'busy' }
 * Upserts the heartbeat row for a given Hermes profile.
 */
export async function POST(req: NextRequest) {
  const sb = makeClient();

  try {
    const body = await req.json();
    const { profile, status = "online" } = body;

    if (!profile) {
      return NextResponse.json({ error: "profile is required" }, { status: 400 });
    }

    const validStatuses = ["online", "offline", "busy"];
    const safeStatus = validStatuses.includes(status) ? status : "online";

    const { error } = await sb.from("agent_workers").upsert(
      {
        agent_profile: profile,
        status: safeStatus,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "agent_profile" }
    );

    if (error) {
      // Table doesn't exist yet — silently succeed so app doesn't break
      return NextResponse.json({
        ok: false,
        tableReady: false,
        message: "agent_workers table not yet created — run the Feature 1 migration",
      });
    }

    return NextResponse.json({ ok: true, profile, status: safeStatus });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
