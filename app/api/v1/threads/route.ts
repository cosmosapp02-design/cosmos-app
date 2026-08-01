import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://uaiwgcfmjwxphpjagkcz.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhaXdnY2Ztand4cGhwamFna2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNzUzNjgsImV4cCI6MjEwMDk1MTM2OH0.GAe8rDHR4acGcAnohP6U8lWpY0RCO0kJbPFEPudP228";

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * GET /api/v1/threads?channel_id=...
 * Returns all threads for a channel, newest activity first.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channel_id");

  if (!channelId) {
    return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
  }

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
  const { channel_id, title } = body;

  if (!channel_id || !title) {
    return NextResponse.json(
      { error: "channel_id and title are required" },
      { status: 400 }
    );
  }

  const safeTitle = title.slice(0, 200);

  const { data, error } = await sb()
    .from("threads")
    .insert([{ channel_id, title: safeTitle }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  // Fetch current reply_count then increment
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
