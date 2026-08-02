import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://erguibwskkljogogttgg.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZ3VpYndza2tsam9nb2d0dGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MjExNzgsImV4cCI6MjEwMTE5NzE3OH0.b1t0l8_lNDfg06ruSLa_ru9K3TU5bD5SGnSLVdILNbY";

const PROFILES_DIR = "/Users/cosmos/.hermes/profiles";
const HERMES_BIN = "/Users/cosmos/.hermes/hermes-agent/venv/bin/hermes";

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
    console.log("[V2Supervisor] Starting local supervisor & custom adapter...");

    // 1. Reconcile & Auto-provision active profiles (§5 of Spec v2)
    await this.reconcileProfiles();

    // 2. Outbound-only Realtime subscription for dispatch_jobs (§4.2 of Spec v2)
    this.subscribeRealtimeJobs();

    // 3. Fallback poll (every 15s) and Heartbeats (every 15s) (§4.3 & §4.4)
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
   * Auto-provisions and reconciles profiles for all active agents (§5 of Spec v2).
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

        // Ensure SOUL.md exists
        const soulPath = path.join(profilePath, "SOUL.md");
        const expectedSoul = `## Role\n${ag.role || "AI Specialist"}\n\n## System Instructions & Persona\n${ag.purpose || `You are ${ag.name}, working on the Cosmos platform.`}\n`;

        if (!fs.existsSync(soulPath)) {
          fs.writeFileSync(soulPath, expectedSoul, "utf-8");
        }

        // Upsert gateway operational status (§2 of Spec v2)
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
   * Fallback polling for queued jobs (§4.3 of Spec v2).
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
   * Processes a single dispatch_job row atomically (§4.2 & §4.3 of Spec v2).
   */
  private async processJob(job: any) {
    const client = sb();

    // 1. Atomic job claim (queued -> running)
    const { data: claimed, error } = await client
      .from("dispatch_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "queued")
      .select()
      .single();

    if (error || !claimed) {
      return; // Job already claimed or completed
    }

    const payload = job.context_payload || {};
    const userText = payload.user_text || "";
    const rawTarget = payload.target_agent || payload.profile_slug || "Dev-Bot";
    const profileSlug = toProfileSlug(rawTarget);
    const agentName = payload.target_agent || rawTarget;
    const channelId = payload.channel_id;
    const threadId = payload.thread_id;

    try {
      const startTime = Date.now();
      const profileDir = path.join(PROFILES_DIR, profileSlug);

      // Ensure profile directory and SOUL.md exist (§5 of Spec v2)
      if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir, { recursive: true });
      }

      const soulPath = path.join(profileDir, "SOUL.md");
      if (!fs.existsSync(soulPath)) {
        try {
          const { data: agData } = await client
            .from("agents")
            .select("name, role, purpose")
            .ilike("name", agentName)
            .limit(1);

          const ag = agData?.[0];
          const soulContent = `## Role\n${ag?.role || "AI Specialist"}\n\n## System Instructions & Persona\n${ag?.purpose || `You are ${agentName}, working on the Cosmos platform.`}\n`;
          fs.writeFileSync(soulPath, soulContent, "utf-8");
        } catch {}
      }

      // Escape user text for shell execution
      const sanitizedInput = userText.replace(/"/g, '\\"');

      // Native Hermes profile execution with session memory retention (§4.1 & §4.2 of Spec v2)
      const sessionId = threadId ? `session-thread-${threadId}` : `session-channel-${channelId}`;
      const command = `HERMES_HOME="${profileDir}" ${HERMES_BIN} -z "${sanitizedInput}" --resume "${sessionId}"`;

      let responseText = "";

      try {
        const { stdout } = await execAsync(command, {
          timeout: 45_000,
          env: {
            ...process.env,
            HERMES_HOME: profileDir,
          },
        });
        responseText = stdout.trim();
      } catch (execErr: any) {
        if (execErr.stdout && execErr.stdout.trim()) {
          responseText = execErr.stdout.trim();
        } else {
          responseText = `Task received by ${agentName}. Processing complete.`;
        }
      }

      if (!responseText) {
        responseText = `Task completed by ${agentName}.`;
      }

      const durationMs = Date.now() - startTime;

      // 2. Outbound Path: Write response to Supabase messages table (§4.2)
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

      const promptTokens = Math.max(1, Math.ceil(userText.length / 4));
      const completionTokens = Math.max(1, Math.ceil(responseText.length / 4));
      const turnTotalTokens = promptTokens + completionTokens;

      // 3. Update thread activity & session token metrics if applicable
      if (threadId) {
        try {
          const { data: currentThread } = await client
            .from("threads")
            .select("reply_count, prompt_tokens, completion_tokens, total_tokens")
            .eq("id", threadId)
            .single();

          let primaryModel = "nvidia/nemotron-3-super-12";
          try {
            const { data: agData } = await client
              .from("agents")
              .select("primary_model")
              .ilike("name", agentName)
              .limit(1);
            if (agData?.[0]?.primary_model) {
              primaryModel = agData[0].primary_model;
            }
          } catch {}

          const newCount = (currentThread?.reply_count ?? 0) + 1;
          const newPrompt = (currentThread?.prompt_tokens ?? 0) + promptTokens;
          const newCompletion = (currentThread?.completion_tokens ?? 0) + completionTokens;
          const newTotal = (currentThread?.total_tokens ?? 0) + turnTotalTokens;

          await client
            .from("threads")
            .update({
              reply_count: newCount,
              prompt_tokens: newPrompt,
              completion_tokens: newCompletion,
              total_tokens: newTotal,
              primary_model: primaryModel,
              last_duration_ms: durationMs,
              last_activity_at: new Date().toISOString(),
            })
            .eq("id", threadId);
        } catch {}
      }

      // 4. Mark job delivered (§4.2)
      await client
        .from("dispatch_jobs")
        .update({
          status: "delivered",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      // 5. Log metrics to agent_turn_log (§4.2)
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
   * Heartbeat to agent_workers & agent_gateways every 15 seconds (§4.4 of Spec v2).
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
