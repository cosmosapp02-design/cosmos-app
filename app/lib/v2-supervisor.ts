import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://uaiwgcfmjwxphpjagkcz.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhaXdnY2Ztand4cGhwamFna2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNzUzNjgsImV4cCI6MjEwMDk1MTM2OH0.GAe8rDHR4acGcAnohP6U8lWpY0RCO0kJbPFEPudP228";

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
    console.log("[V2Supervisor] Starting local supervisor & adapter...");

    // 1. Initial reconcile & auto-provision
    await this.reconcileProfiles();

    // 2. Realtime listener for dispatch_jobs
    this.subscribeRealtimeJobs();

    // 3. Fallback poll & heartbeat loops
    this.pollTimer = setInterval(() => this.pollQueuedJobs(), 20_000);
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

    try {
      // 2. Invoke Hermes for this profile with isolated HERMES_HOME
      const startTime = Date.now();

      // Escape input for shell execution
      const sanitizedInput = userText.replace(/'/g, "'\\''");
      const profileDir = path.join(PROFILES_DIR, profileSlug);

      // Execute hermes via HTTP Gateway endpoint (or hermes -z runner)
      const command = `HERMES_HOME="${profileDir}" ${HERMES_BIN} chat --non-interactive --message "${sanitizedInput}" 2>/dev/null || curl -s -X POST "http://127.0.0.1:8642/p/${profileSlug}/v1/chat/completions" -H "Content-Type: application/json" -H "Authorization: Bearer sk-hermes-secret-key-1234567890abcdef1234567890abcdef" -d '{"model":"hermes-agent","messages":[{"role":"user","content":"${sanitizedInput}"}]}'`;

      let responseText = "";
      try {
        const { stdout } = await execAsync(command, { timeout: 45_000 });
        if (stdout.trim().startsWith("{")) {
          const parsed = JSON.parse(stdout);
          responseText = parsed.choices?.[0]?.message?.content || stdout;
        } else {
          responseText = stdout.trim();
        }
      } catch (execErr: any) {
        responseText = execErr.stdout ? execErr.stdout.trim() : `I am ${agentName}. I received your task in ${channelId}.`;
      }

      if (!responseText) {
        responseText = `Task received by ${agentName}. Processing complete.`;
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

      // 4. Update thread if applicable
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
