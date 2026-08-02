import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://erguibwskkljogogttgg.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZ3VpYndza2tsam9nb2d0dGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MjExNzgsImV4cCI6MjEwMTE5NzE3OH0.b1t0l8_lNDfg06ruSLa_ru9K3TU5bD5SGnSLVdILNbY";

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function toProfileSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/-agent$/, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

/**
 * POST /api/v1/dispatch
 * Receives user chat input, resolves agent target, enforces guardrails,
 * and enqueues a dispatch_jobs row in Supabase for the local supervisor.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      channel_id,
      thread_id,
      user_text,
      sender_name = "CEO",
      sender_role = "Workspace CEO",
    } = body;

    if (!channel_id || !user_text) {
      return NextResponse.json(
        { error: "channel_id and user_text are required" },
        { status: 400 }
      );
    }

    const client = sb();

    // 1. Resolve channel to get name/agent target
    let channelName = "general";
    let targetAgentName = "Dev-Bot";

    try {
      const { data: chanData } = await client
        .from("channels")
        .select("name, agents")
        .eq("id", channel_id)
        .single();

      if (chanData) {
        channelName = chanData.name || "general";
        if (chanData.agents && chanData.agents.length > 0) {
          targetAgentName = chanData.agents[0];
        } else if (
          channelName !== "general" &&
          channelName !== "sprint-planning"
        ) {
          targetAgentName = channelName;
        }
      }
    } catch {}

    const profileSlug = toProfileSlug(targetAgentName || channelName);

    // 2. Resolve target agent row from DB
    let agentId: string | null = null;
    try {
      const { data: agentData } = await client
        .from("agents")
        .select("id, status")
        .ilike("name", targetAgentName)
        .limit(1);

      if (agentData && agentData.length > 0) {
        agentId = agentData[0].id;
        if (agentData[0].status === "inactive" || agentData[0].status === "paused") {
          return NextResponse.json(
            { error: `Agent ${targetAgentName} is currently ${agentData[0].status}` },
            { status: 422 }
          );
        }
      }
    } catch {}

    // 3. Create idempotency key & context payload
    const rawKey = `${channel_id}-${thread_id || "main"}-${Date.now()}-${Math.random()}`;
    const idempotency_key = `dispatch-${crypto.createHash("md5").update(rawKey).digest("hex")}`;

    const context_payload = {
      user_text,
      sender_name,
      sender_role,
      channel_id,
      thread_id: thread_id || null,
      target_agent: targetAgentName,
      profile_slug: profileSlug,
      dispatched_at: new Date().toISOString(),
    };

    // 4. Write dispatch_job row
    const { data: job, error } = await client
      .from("dispatch_jobs")
      .insert([
        {
          channel_id,
          thread_id: thread_id || null,
          agent_id: agentId,
          status: "queued",
          context_payload,
          idempotency_key,
          timeout_seconds: 60,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      job_id: job.id,
      status: "queued",
      idempotency_key,
      target_agent: targetAgentName,
      profile_slug: profileSlug,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/v1/dispatch?job_id=...
 * Checks status of a dispatch job.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("job_id");

  if (!jobId) {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }

  const { data, error } = await sb()
    .from("dispatch_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ job: data });
}
