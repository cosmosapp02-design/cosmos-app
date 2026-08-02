import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import crypto from "crypto";
import { dispatchToAgent } from "../../../../relay/server";

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

/** Anon client — for reading public/authenticated context in requests */
function sb() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/** Service role client — for trusted server-side DB writes that bypass RLS */
function sbAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/**
 * Resolves the org_id for a given userId via direct Postgres query.
 * Falls back to FALLBACK_ORG_ID if userId is empty or has no membership.
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

function toProfileSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/-agent$/, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

const AGENT_REGISTRY = [
  { name: "Zach Adams", slug: "zach_adams", patterns: ["@Zach_Adams", "@Zach", "@ZachAdams", "@zach_adams"] },
  { name: "Sara Pate", slug: "sara_pate", patterns: ["@Sara_Pate", "@Sara", "@SaraPate", "@sara_pate"] },
  { name: "Peter", slug: "peter", patterns: ["@Peter", "@peter"] },
  { name: "Zara", slug: "zara", patterns: ["@Zara", "@zara"] },
];

function parseMentionedAgents(text: string): { name: string; slug: string; index: number }[] {
  const found: { name: string; slug: string; index: number }[] = [];
  const seen = new Set<string>();

  for (const ag of AGENT_REGISTRY) {
    for (const pattern of ag.patterns) {
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        if (!seen.has(ag.slug)) {
          seen.add(ag.slug);
          found.push({ name: ag.name, slug: ag.slug, index: m.index });
        }
      }
    }
  }

  found.sort((a, b) => a.index - b.index);
  return found;
}

/**
 * POST /api/v1/dispatch
 * Gateway Protocol Dispatch Route:
 * 1. Saves user message to `messages` with `org_id`.
 * 2. Checks `agent_workers` for online status in `org_id`.
 * 3. Pushes directly to Gateway Relay if online, or queues in `dispatch_jobs` if offline.
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
      user_id,
    } = body;

    // Resolve org_id from the authenticated user's membership (server-side, trusted)
    const org_id = body.org_id && body.org_id !== FALLBACK_ORG_ID
      ? body.org_id
      : await resolveOrgId(user_id);

    if (!channel_id || !user_text) {
      return NextResponse.json(
        { error: "channel_id and user_text are required" },
        { status: 400 }
      );
    }

    const client = sb();

    // 1. Resolve Target Agent Name & Profile Slug
    let targetAgentName = body.target_agent || body.target_agent_name || "";
    if (!targetAgentName) {
      const mentions = parseMentionedAgents(user_text);
      if (mentions.length > 0) {
        targetAgentName = mentions[0].name;
      }
    }

    if (!targetAgentName) {
      try {
        const { data: chanData } = await client
          .from("channels")
          .select("name, agents, topic")
          .eq("id", channel_id)
          .single();

        if (chanData && chanData.agents && chanData.agents.length > 0) {
          targetAgentName = chanData.agents[0];
        }
      } catch {}
    }

    if (!targetAgentName) {
      targetAgentName = "Dev-Bot";
    }

    const profileSlug = toProfileSlug(targetAgentName);

    // 2. Resolve Agent Row from DB
    let agentId: string | null = null;
    try {
      const { data: agentData } = await client
        .from("agents")
        .select("id, status, org_id")
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

    // 3. Save User Message to `messages` table with org_id (service role bypasses RLS for server writes)
    const adminClient = sbAdmin();
    try {
      const { error: msgErr } = await adminClient.from("messages").insert([
        {
          channel_id,
          thread_id: thread_id || null,
          sender_name,
          sender_role,
          text: user_text,
          is_agent: false,
          org_id,
        },
      ]);
      if (msgErr) console.warn("[Dispatch Route] Warning saving user message:", msgErr.message);
    } catch (msgErr: any) {
      console.warn("[Dispatch Route] Warning saving user message:", msgErr.message);
    }

    // 4. Check Presence (`agent_workers` table)
    let isOnline = false;
    try {
      const { data: workerData } = await client
        .from("agent_workers")
        .select("status")
        .eq("agent_profile", profileSlug)
        .single();

      if (workerData && workerData.status === "online") {
        isOnline = true;
      }
    } catch {}

    const context_payload = {
      user_text,
      sender_name,
      sender_role,
      channel_id,
      thread_id: thread_id || null,
      target_agent: targetAgentName,
      profile_slug: profileSlug,
      org_id,
      dispatched_at: new Date().toISOString(),
    };

    // 5. Route Message over Gateway Relay or Queue Offline
    if (isOnline && agentId) {
      try {
        const dispatchRes = await dispatchToAgent(agentId, context_payload, channel_id, thread_id);
        return NextResponse.json({
          success: true,
          status: "delivered",
          job_id: dispatchRes.jobId,
          sequence: dispatchRes.sequence,
          target_agent: targetAgentName,
          profile_slug: profileSlug,
        });
      } catch (relayErr: any) {
        console.warn("[Dispatch Route] Relay dispatch fallback to queue:", relayErr.message);
      }
    }

    // Fallback or Offline Queueing
    const rawKey = `${channel_id}-${thread_id || "main"}-${Date.now()}-${Math.random()}`;
    const idempotency_key = `dispatch-${crypto.createHash("md5").update(rawKey).digest("hex")}`;

    const { data: job, error } = await adminClient
      .from("dispatch_jobs")
      .insert([
        {
          channel_id,
          thread_id: thread_id || null,
          agent_id: agentId,
          org_id,
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
