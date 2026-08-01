import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://uaiwgcfmjwxphpjagkcz.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhaXdnY2Ztand4cGhwamFna2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNzUzNjgsImV4cCI6MjEwMDk1MTM2OH0.GAe8rDHR4acGcAnohP6U8lWpY0RCO0kJbPFEPudP228";

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Deterministically maps any channel string (e.g. "ch-general", "sprint-planning")
 * to a valid, consistent UUID string if it's not already a UUID.
 */
function toUuid(input: string): string {
  if (UUID_REGEX.test(input)) {
    return input;
  }
  const norm = input.toLowerCase().trim();
  const hash = crypto.createHash("md5").update(norm).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Ensures the channel row exists in Supabase `channels` table
 * to satisfy foreign key constraints.
 */
async function ensureChannelRow(rawChannelId: string, channelIdUuid: string) {
  const client = sb();
  const normName = rawChannelId.replace(/^ch-/, "").trim().toLowerCase() || "general";
  try {
    await client.from("channels").upsert(
      [
        {
          id: channelIdUuid,
          name: normName,
          type: "group",
          description: `Auto-created channel #${normName}`,
        },
      ],
      { onConflict: "id" }
    );
  } catch {}
}

/**
 * GET /api/v1/threads?channel_id=...
 * Returns all threads for a channel, newest activity first.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawChannelId = searchParams.get("channel_id");

  if (!rawChannelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

  const channelId = toUuid(rawChannelId);

  const { data, error } = await sb()
    .from("threads")
    .select("id, channel_id, title, reply_count, last_activity_at, created_at")
    .eq("channel_id", channelId)
    .order("last_activity_at", { ascending: false });

  if (error) {
    return NextResponse.json({ threads: [], error: error.message });
  }

  return NextResponse.json({ threads: data || [] });
}

/**
 * POST /api/v1/threads
 * Body: { channel_id, title }
 * Creates a new thread row. Returns the new thread.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { channel_id: rawChannelId, title } = body;

  if (!rawChannelId || !title) {
    return NextResponse.json(
      { error: "channel_id and title are required" },
      { status: 400 }
    );
  }

  const channelId = toUuid(rawChannelId);
  const safeTitle = title.slice(0, 200);

  // Attempt to ensure channel row exists in DB
  await ensureChannelRow(rawChannelId, channelId);

  const { data, error } = await sb()
    .from("threads")
    .insert([{ channel_id: channelId, title: safeTitle }])
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message, channel_id: channelId },
      { status: 500 }
    );
  }

  return NextResponse.json({ thread: data });
}

/**
 * PATCH /api/v1/threads?thread_id=...
 * Body: { increment_reply?: true, last_activity_at?: string }
 * Increments reply_count and updates last_activity_at.
 */
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("thread_id");

  if (!threadId) {
    return NextResponse.json({ error: "thread_id is required" }, { status: 400 });
  }

  const { data: current } = await sb()
    .from("threads")
    .select("reply_count")
    .eq("id", threadId)
    .single();

  const newCount = (current?.reply_count ?? 0) + 1;

  const { data, error } = await sb()
    .from("threads")
    .update({
      reply_count: newCount,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ thread: data });
}
