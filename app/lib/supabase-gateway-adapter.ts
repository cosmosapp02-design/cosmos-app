import { createClient } from "@supabase/supabase-js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://erguibwskkljogogttgg.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZ3VpYndza2tsam9nb2d0dGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MjExNzgsImV4cCI6MjEwMTE5NzE3OH0.b1t0l8_lNDfg06ruSLa_ru9K3TU5bD5SGnSLVdILNbY";

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Immutable, Static Port Reservations (§4.1 & §4.2 of Spec v2)
export const AGENT_RESERVED_PORTS: Record<string, number> = {
  zach_adams: 8643,
  sara_pate: 8644,
  peter: 8645,
  zara: 8646,
};

function toProfileSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/-agent$/, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

function getHermesBin(): string {
  const home = process.env.HOME || "/Users/cosmos";
  const venvBin = path.join(home, ".hermes/hermes-agent/venv/bin/hermes");
  if (fs.existsSync(venvBin)) return venvBin;
  return "hermes";
}

/**
 * Discord-Style Custom Platform Adapter for Hermes Gateway
 * Forwards messages from Supabase to agent profile gateway and returns responses.
 */
export class SupabaseGatewayAdapter {
  private isProcessing = false;

  /**
   * Resolves the immutable gateway port reserved for an agent profile.
   * Throws if profile is unknown to prevent any identity confusion.
   */
  public getReservedPort(profileSlug: string): number {
    const slug = toProfileSlug(profileSlug);
    const port = AGENT_RESERVED_PORTS[slug];
    if (!port) {
      throw new Error(`[GatewayAdapter] Security lock: profile '${slug}' has no reserved port.`);
    }
    return port;
  }

  /**
   * Process a single queued dispatch job for Zach Adams / Agent Gateway
   */
  public async processJob(job: any): Promise<void> {
    const client = sb();
    const startTime = Date.now();

    const payload = job.context_payload || {};
    const userText = payload.user_text || "";
    const channelId = job.channel_id || payload.channel_id;
    const threadId = job.thread_id || payload.thread_id;
    const targetAgent = payload.target_agent || "Zach Adams";
    const profileSlug = toProfileSlug(payload.profile_slug || targetAgent);

    // Verify static port reservation — skip job if agent has no reserved port
    const port = AGENT_RESERVED_PORTS[profileSlug];
    if (!port) {
      console.warn(`[GatewayAdapter] Skipping job — no reserved port for profile '${profileSlug}'. Ignoring.`);
      await client.from("dispatch_jobs")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      return;
    }

    // Ensure profile directory and SOUL.md exist
    const home = process.env.HOME || "/Users/cosmos";
    const profileDir = path.join(home, ".hermes/profiles", profileSlug);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    const soulPath = path.join(profileDir, "SOUL.md");
    if (!fs.existsSync(soulPath)) {
      fs.writeFileSync(
        soulPath,
        `# SOUL.md — ${targetAgent}\n\n## System Instructions & Persona\nYou are ${targetAgent}, Product Manager at Cosmos Enterprise Platform. You lead product strategy, roadmap planning, and manage Peter and Dev. You report directly to the CEO.\n`
      );
    }

    // Mark job as started
    await client
      .from("dispatch_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", job.id);

    const HERMES_BIN = getHermesBin();
    const sanitizedInput = userText.replace(/"/g, '\\"');
    const sessionId = threadId ? `session-thread-${threadId}` : `session-channel-${channelId}`;
    const command = `HERMES_HOME="${profileDir}" ${HERMES_BIN} -z "${sanitizedInput}" --resume "${sessionId}"`;

    let responseText = "";

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60_000,
        env: {
          ...process.env,
          HERMES_HOME: profileDir,
        },
      });

      const rawCombined = `${stdout || ""}\n${stderr || ""}`;
      // Clean ANSI escape sequences
      const cleaned = rawCombined
        .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
        .replace(/^WARNING.*$/gm, "")
        .replace(/^◇ injected env.*$/gm, "")
        .trim();

      responseText = cleaned || stdout.trim();
    } catch (execErr: any) {
      const rawErr = `${execErr.stdout || ""}\n${execErr.stderr || ""}`;
      const cleaned = rawErr
        .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
        .replace(/^WARNING.*$/gm, "")
        .replace(/^◇ injected env.*$/gm, "")
        .trim();

      responseText = cleaned || execErr.message || "No output returned from agent.";
    }

    if (!responseText) {
      responseText = "Agent completed execution.";
    }

    const durationMs = Date.now() - startTime;

    // 1. Write response to Supabase messages table
    await client.from("messages").insert([
      {
        channel_id: channelId,
        thread_id: threadId,
        sender_name: targetAgent,
        sender_role: `${targetAgent} Agent`,
        text: responseText,
        is_agent: true,
      },
    ]);

    const promptTokens = Math.max(1, Math.ceil(userText.length / 4));
    const completionTokens = Math.max(1, Math.ceil(responseText.length / 4));
    const turnTotalTokens = promptTokens + completionTokens;

    // 2. Update thread metrics
    if (threadId) {
      try {
        const { data: currentThread } = await client
          .from("threads")
          .select("reply_count, prompt_tokens, completion_tokens, total_tokens")
          .eq("id", threadId)
          .single();

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
            primary_model: "nvidia/nemotron-3-super-12",
            last_duration_ms: durationMs,
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", threadId);
      } catch {}
    }

    // 3. Mark job delivered
    await client
      .from("dispatch_jobs")
      .update({
        status: "delivered",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    // 4. Log metrics
    try {
      await client.from("agent_turn_log").insert([
        {
          job_id: job.id,
          agent_id: job.agent_id,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: turnTotalTokens,
          duration_ms: durationMs,
        },
      ]);
    } catch {}

    // 5. Inter-agent chaining — queue jobs for any agents explicitly @mentioned in response
    try {
      // A. Parse [TASK: Title | Agent] blocks for Kanban cards
      const taskMatches = Array.from(responseText.matchAll(/\[TASK:\s*([^|\]]+)\|?\s*([^\]]*)\]/gi));
      for (const tm of taskMatches) {
        const tTitle = tm[1]?.trim();
        const tAssign = tm[2]?.trim() || targetAgent;
        if (tTitle) {
          try {
            await client.from("tasks").insert([{
              title: tTitle,
              assigned_to: tAssign,
              status: "in_progress",
              channel_id: channelId,
              thread_id: threadId || null,
            }]);
          } catch {}
        }
      }

      // B. Queue follow-up jobs for explicitly @mentioned agents in the response
      // Safety cap: max 10 agent replies per thread
      let turnCount = 1;
      if (threadId) {
        const { data: tRow } = await client.from("threads").select("reply_count").eq("id", threadId).single();
        turnCount = tRow?.reply_count ?? 1;
      }

      if (turnCount < 10) {
        const CHAIN_AGENTS = [
          { name: "Zach Adams", slug: "zach_adams", patterns: ["@Zach_Adams", "@Zach"] },
          { name: "Sara Pate", slug: "sara_pate", patterns: ["@Sara_Pate", "@Sara"] },
          { name: "Peter", slug: "peter", patterns: ["@Peter"] },
          { name: "Zara", slug: "zara", patterns: ["@Zara"] },
        ];

        const toChain: { name: string; slug: string }[] = [];
        const seen = new Set<string>();

        for (const ag of CHAIN_AGENTS) {
          // Skip self — don't chain back to the agent that just replied
          if (ag.slug === profileSlug) continue;
          for (const pattern of ag.patterns) {
            if (responseText.includes(pattern) && !seen.has(ag.slug)) {
              seen.add(ag.slug);
              toChain.push({ name: ag.name, slug: ag.slug });
            }
          }
        }

        // Insert one queued dispatch job per mentioned agent
        for (const ag of toChain) {
          const chainKey = `chain-${ag.slug}-${threadId || channelId}-${Date.now()}-${Math.random()}`;
          try {
            await client.from("dispatch_jobs").insert([{
              channel_id: channelId,
              thread_id: threadId || null,
              status: "queued",
              context_payload: {
                user_text: `[Message from ${targetAgent}]: "${responseText.slice(0, 400)}" — Please reply with your status and relevant updates for the team.`,
                sender_name: targetAgent,
                sender_role: `${targetAgent} Agent`,
                channel_id: channelId,
                thread_id: threadId || null,
                target_agent: ag.name,
                profile_slug: ag.slug,
                dispatched_at: new Date().toISOString(),
              },
              idempotency_key: chainKey,
              timeout_seconds: 60,
            }]);
          } catch {}
        }
      }
    } catch (chainErr: any) {
      console.warn("[GatewayAdapter] Chaining warning:", chainErr.message);
    }
  }
}

export const gatewayAdapter = new SupabaseGatewayAdapter();
