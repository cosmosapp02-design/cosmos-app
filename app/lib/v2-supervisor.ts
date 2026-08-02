import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

import { gatewayAdapter } from "./supabase-gateway-adapter";

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

    try {
      await gatewayAdapter.processJob(claimed);
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
