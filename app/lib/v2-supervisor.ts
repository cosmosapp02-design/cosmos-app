import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://erguibwskkljogogttgg.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZ3VpYndza2tsam9nb2d0dGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MjExNzgsImV4cCI6MjEwMTE5NzE3OH0.b1t0l8_lNDfg06ruSLa_ru9K3TU5bD5SGnSLVdILNbY";

const PROFILES_DIR = "/Users/cosmos/.hermes/profiles";

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

export class V2Supervisor {
  private isRunning = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[V2Supervisor] Starting local supervisor & adapter...");

    // 1. Initial reconcile & auto-provision
    await this.reconcileProfiles();

    // 2. Realtime listener for dispatch_jobs
    this.subscribeRealtimeJobs();

    // 3. Fallback poll & heartbeat loops
    this.pollTimer = setInterval(() => this.pollQueuedJobs(), 15_000);
    this.heartbeatTimer = setInterval(() => this.sendHeartbeats(), 15_000);

    // Initial heartbeat
    await this.sendHeartbeats();
  }

  stop() {
    this.isRunning = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    console.log("[V2Supervisor] Supervisor stopped.");
  }

  /**
   * Auto-provisions and reconciles profiles for all active agents.
   */
  private async reconcileProfiles() {
    try {
      const client = sb();
      const { data: agents } = await client.from("agents").select("*");
      if (!agents) return;

      for (const ag of agents) {
        const slug = toProfileSlug(ag.name);
        const profilePath = path.join(PROFILES_DIR, slug);

        // Ensure directory exists
        if (!fs.existsSync(profilePath)) {
          fs.mkdirSync(profilePath, { recursive: true });
        }

        // Ensure SOUL.md exists and matches
        const soulPath = path.join(profilePath, "SOUL.md");
        const expectedSoul = `## Role\n${ag.role || "AI Specialist"}\n\n## System Instructions & Persona\n${ag.purpose || `You are ${ag.name}, working on the Cosmos platform.`}\n`;

        if (!fs.existsSync(soulPath)) {
          fs.writeFileSync(soulPath, expectedSoul, "utf-8");
        }

        // Register in agent_gateways
        try {
          await client.from("agent_gateways").upsert([
            {
              agent_id: ag.id,
              status: "running",
              last_heartbeat_at: new Date().toISOString(),
              started_at: new Date().toISOString(),
            },
          ]);
        } catch {}
      }
    } catch (err: any) {
      console.warn("[V2Supervisor] Reconcile warning:", err.message);
    }
  }

  /**
   * Subscribes to Supabase Realtime for dispatch_jobs queued.
   */
  private subscribeRealtimeJobs() {
    const client = sb();
    client
      .channel("v2-dispatch-jobs")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dispatch_jobs",
          filter: "status=eq.queued",
        },
        (payload: any) => {
          if (payload.new) {
            this.processJob(payload.new);
          }
        }
      )
      .subscribe();
  }

  /**
   * Resilience fallback polling for queued jobs.
   */
  private async pollQueuedJobs() {
    try {
      const client = sb();
      const { data: jobs } = await client
        .from("dispatch_jobs")
        .select("*")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(10);

      if (jobs && jobs.length > 0) {
        for (const job of jobs) {
          await this.processJob(job);
        }
      }
    } catch {}
  }

  /**
   * Processes a single dispatch_jobs row atomically.
   */
  private async processJob(job: any) {
    const client = sb();

    // 1. Atomic job claim (status queued -> running)
    const { data: claimed, error } = await client
      .from("dispatch_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "queued")
      .select()
      .single();

    if (error || !claimed) {
      // Job was already claimed by another worker or completed
      return;
    }

    const payload = job.context_payload || {};
    const userText = payload.user_text || "";
    const profileSlug = payload.profile_slug || "dev_bot";
    const channelId = payload.channel_id;
    const threadId = payload.thread_id;
    const agentName = payload.target_agent || "Dev-Bot";
    const isSystemChannel = profileSlug === "general" || profileSlug === "sprint_planning";

    try {
      const startTime = Date.now();
      const profileDir = path.join(PROFILES_DIR, profileSlug);

      // Read SOUL.md persona file for this profile
      let soulContent = `You are ${agentName}, working as an AI worker in this organization.`;
      const soulPath = path.join(profileDir, "SOUL.md");
      if (fs.existsSync(soulPath)) {
        try {
          soulContent = fs.readFileSync(soulPath, "utf-8");
        } catch {}
      }

      // Target Hermes gateway HTTP completion endpoint
      const targetUrl = isSystemChannel
        ? "http://127.0.0.1:8642/v1/chat/completions"
        : `http://127.0.0.1:8642/p/${profileSlug}/v1/chat/completions`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-hermes-secret-key-1234567890abcdef1234567890abcdef",
      };

      if (threadId) {
        headers["X-Hermes-Session-Id"] = `session-thread-${threadId}`;
      }

      const messages = [
        { role: "system", content: soulContent },
        { role: "user", content: `/new\n${userText}` },
      ];

      let responseText = "";

      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: "hermes-agent",
            messages,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          responseText = data.choices?.[0]?.message?.content || "";
        }
      } catch (e: any) {
        console.warn("[V2Supervisor] Gateway fetch warning:", e.message);
      }

      if (!responseText) {
        responseText = `Hi! I am ${agentName}. I received your message: "${userText}"`;
      }

      const durationMs = Date.now() - startTime;

      // 3. Write response message to Supabase messages table
      await client.from("messages").insert([
        {
          channel_id: channelId,
          thread_id: threadId,
          sender_name: agentName,
          sender_role: `${agentName} Agent`,
          text: responseText,
          is_agent: true,
        },
      ]);

      // 4. Update thread reply count & activity if applicable
      if (threadId) {
        try {
          const { data: currentThread } = await client
            .from("threads")
            .select("reply_count")
            .eq("id", threadId)
            .single();

          const newCount = (currentThread?.reply_count ?? 0) + 1;
          await client
            .from("threads")
            .update({
              reply_count: newCount,
              last_activity_at: new Date().toISOString(),
            })
            .eq("id", threadId);
        } catch {}
      }

      // 5. Mark job delivered
      await client
        .from("dispatch_jobs")
        .update({
          status: "delivered",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      // 6. Log metrics
      try {
        await client.from("agent_turn_log").insert([
          {
            job_id: job.id,
            agent_id: job.agent_id,
            prompt_tokens: Math.ceil(userText.length / 4),
            completion_tokens: Math.ceil(responseText.length / 4),
            total_tokens: Math.ceil((userText.length + responseText.length) / 4),
            duration_ms: durationMs,
          },
        ]);
      } catch {}
    } catch (err: any) {
      await client
        .from("dispatch_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }

  /**
   * Heartbeat to agent_workers & agent_gateways every 15 seconds.
   */
  private async sendHeartbeats() {
    try {
      const client = sb();
      const profiles = ["peter", "sara_pate", "zach_adams", "zara", "dev_bot"];

      await Promise.allSettled(
        profiles.map((profile) =>
          client.from("agent_workers").upsert([
            {
              agent_profile: profile,
              status: "online",
              last_seen_at: new Date().toISOString(),
            },
          ])
        )
      );
    } catch {}
  }
}

// Global singleton instance
export const supervisor = new V2Supervisor();
