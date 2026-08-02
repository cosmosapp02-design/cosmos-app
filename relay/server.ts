import { WebSocketServer, WebSocket } from "ws";
import { Client } from "pg";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";
import { parseContentBlocks } from "./content-parser";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const PORT = parseInt(process.env.RELAY_PORT || "8085", 10);
const DB_URL = process.env.DATABASE_URL;
const RESUME_CUTOFF_MS = 10 * 60 * 1000;

if (!DB_URL) {
  console.error("[Relay Server] Error: DATABASE_URL is missing in environment!");
  process.exit(1);
}

export type Opcode = "IDENTIFY" | "READY" | "HEARTBEAT" | "HEARTBEAT_ACK" | "DISPATCH" | "DISPATCH_ACK" | "RESUME" | "RESUMED" | "RECONNECT";

export interface GatewayMessage {
  op: Opcode;
  d?: any;
  s?: number;
}

export interface AgentSession {
  ws: WebSocket;
  agentId: string;
  profileSlug: string;
  agentName: string;
  primaryModel: string;
  backupModel: string;
  orgId: string;
  sessionId: string;
  lastSequence: number;
  lastHeartbeatAt: number;
  heartbeatInterval: number;
}

export const activeSessions = new Map<string, AgentSession>();
export const socketToAgentId = new Map<WebSocket, string>();

export async function getDbClient() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

function toProfileSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/-agent$/, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

// Helper to dispatch a message payload to an agent with dynamic model routing & sequence tracking
export async function dispatchToAgent(agentId: string, payload: any, channelId: string, threadId?: string) {
  const db = await getDbClient();
  try {
    const agentRes = await db.query(
      `SELECT last_sequence, org_id, name, primary_model, backup_model FROM agents WHERE id = $1`,
      [agentId]
    );
    if (agentRes.rows.length === 0) throw new Error(`Agent ${agentId} not found`);

    const agentRow = agentRes.rows[0];
    const currentSeq = parseInt(agentRow.last_sequence || "0", 10);
    const newSeq = currentSeq + 1;
    const orgId = agentRow.org_id;

    const primaryModel = agentRow.primary_model || "gemini-3.6-flash-lite";
    const backupModel = agentRow.backup_model || "claude-3-5-sonnet";

    // Enrich payload with channel_id, thread_id, and dynamic model config
    const enrichedPayload = {
      ...payload,
      channel_id: channelId,
      thread_id: threadId || null,
      primary_model: primaryModel,
      backup_model: backupModel,
    };

    // Update agents.last_sequence
    await db.query(`UPDATE agents SET last_sequence = $1 WHERE id = $2`, [newSeq, agentId]);

    // Create dispatch_jobs row with sequence number
    const idempotencyKey = `dispatch-seq-${agentId}-${newSeq}-${Date.now()}`;
    const jobRes = await db.query(
      `INSERT INTO dispatch_jobs (org_id, channel_id, thread_id, agent_id, status, context_payload, idempotency_key, sequence)
       VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7)
       RETURNING id`,
      [orgId, channelId, threadId || null, agentId, enrichedPayload, idempotencyKey, newSeq]
    );
    const jobId = jobRes.rows[0].id;

    // If agent is currently connected via live WebSocket, dispatch immediately
    const session = activeSessions.get(agentId);
    if (session && session.ws.readyState === WebSocket.OPEN) {
      session.lastSequence = newSeq;
      session.primaryModel = primaryModel;
      session.backupModel = backupModel;

      session.ws.send(JSON.stringify({
        op: "DISPATCH",
        d: enrichedPayload,
        s: newSeq,
      }));

      await db.query(
        `UPDATE dispatch_jobs SET status = 'delivered', completed_at = now() WHERE id = $1`,
        [jobId]
      );
      console.log(`🚀 [Relay Server] Dispatched seq #${newSeq} to online agent ${session.agentName} (Model: ${primaryModel})`);
    } else {
      console.log(`📦 [Relay Server] Agent offline. Queued dispatch seq #${newSeq} for agent ${agentId}`);
    }

    return { jobId, sequence: newSeq, primary_model: primaryModel, backup_model: backupModel };
  } finally {
    await db.end();
  }
}

export async function drainQueuedOutboxForAgent(agentId: string, ws: WebSocket) {
  const db = await getDbClient();
  try {
    const queuedJobs = await db.query(
      `SELECT id, channel_id, thread_id, context_payload, sequence FROM dispatch_jobs
       WHERE agent_id = $1 AND status = 'queued'
       ORDER BY created_at ASC`,
      [agentId]
    );

    if (queuedJobs.rows.length === 0) return;

    console.log(`📬 [Relay Server] Draining ${queuedJobs.rows.length} queued offline job(s) for agent ${agentId}...`);

    for (const job of queuedJobs.rows) {
      let seq = job.sequence ? parseInt(job.sequence, 10) : 0;

      if (!seq) {
        const seqRes = await db.query(`SELECT last_sequence FROM agents WHERE id = $1`, [agentId]);
        const currentSeq = parseInt(seqRes.rows[0]?.last_sequence || "0", 10);
        seq = currentSeq + 1;
        await db.query(`UPDATE agents SET last_sequence = $1 WHERE id = $2`, [seq, agentId]);
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          op: "DISPATCH",
          d: job.context_payload,
          s: seq,
        }));

        await db.query(
          `UPDATE dispatch_jobs SET status = 'delivered', sequence = $1, completed_at = now() WHERE id = $2`,
          [seq, job.id]
        );
      }
    }
  } catch (err: any) {
    console.error("[Relay Server] Error draining queued outbox:", err.message);
  } finally {
    await db.end();
  }
}

export function startRelayServer(port: number = PORT) {
  const wss = new WebSocketServer({ port });

  console.log(`🚀 [Relay Server] Standalone Gateway Relay listening on ws://127.0.0.1:${port}`);

  const reaperTimer = setInterval(async () => {
    const now = Date.now();
    for (const [agentId, session] of activeSessions.entries()) {
      const elapsed = now - session.lastHeartbeatAt;
      const timeoutThreshold = session.heartbeatInterval * 2;

      if (elapsed > timeoutThreshold) {
        console.warn(`⚠️ [Relay Server] Session timeout for ${session.agentName} (${session.profileSlug}). Missed heartbeats for ${elapsed}ms.`);
        
        try {
          const db = await getDbClient();
          await db.query(
            `UPDATE agent_workers SET status = 'offline', last_seen_at = now() WHERE agent_profile = $1`,
            [session.profileSlug]
          );
          await db.end();
        } catch (err: any) {
          console.error("[Relay Server] DB Error updating worker offline status:", err.message);
        }

        activeSessions.delete(agentId);
        socketToAgentId.delete(session.ws);
        try {
          session.ws.close(4002, "Heartbeat Timeout");
        } catch {}
      }
    }
  }, 5000);

  wss.on("close", () => {
    clearInterval(reaperTimer);
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("⚡ [Relay Server] Outbound socket connection established.");

    ws.on("message", async (data: Buffer | string) => {
      try {
        const payload: GatewayMessage = JSON.parse(data.toString());
        const { op, d } = payload;

        // 1. OP: IDENTIFY
        if (op === "IDENTIFY") {
          const token = d?.token;
          if (!token || typeof token !== "string") {
            ws.close(4001, "Invalid or missing token payload");
            return;
          }

          const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

          let agentRow: any = null;
          try {
            const db = await getDbClient();
            const res = await db.query(
              `SELECT id, name, role, org_id, status, last_sequence, primary_model, backup_model FROM agents WHERE gateway_token_hash = $1 AND status = 'active'`,
              [tokenHash]
            );
            await db.end();
            if (res.rows.length > 0) agentRow = res.rows[0];
          } catch (dbErr: any) {
            console.error("[Relay Server] DB Auth Lookup Error:", dbErr.message);
            ws.close(4000, "Internal Server Error");
            return;
          }

          if (!agentRow) {
            console.warn("[Relay Server] Rejecting IDENTIFY — token hash mismatch or inactive agent.");
            ws.close(4001, "Invalid or inactive gateway token");
            return;
          }

          const agentId = agentRow.id;
          const profileSlug = toProfileSlug(agentRow.name);
          const orgId = agentRow.org_id;
          const sessionId = crypto.randomUUID();
          const heartbeatInterval = 15000;
          const lastSeq = parseInt(agentRow.last_sequence || "0", 10);
          const primaryModel = agentRow.primary_model || "gemini-3.6-flash-lite";
          const backupModel = agentRow.backup_model || "claude-3-5-sonnet";

          const session: AgentSession = {
            ws,
            agentId,
            profileSlug,
            agentName: agentRow.name,
            primaryModel,
            backupModel,
            orgId,
            sessionId,
            lastSequence: lastSeq,
            lastHeartbeatAt: Date.now(),
            heartbeatInterval,
          };

          activeSessions.set(agentId, session);
          socketToAgentId.set(ws, agentId);

          try {
            const db = await getDbClient();
            await db.query(
              `INSERT INTO agent_workers (agent_profile, status, session_id, last_seen_at, last_heartbeat_at, org_id)
               VALUES ($1, 'online', $2, now(), now(), $3)
               ON CONFLICT (agent_profile) DO UPDATE
               SET status = 'online', session_id = EXCLUDED.session_id, last_seen_at = now(), last_heartbeat_at = now(), org_id = EXCLUDED.org_id`,
              [profileSlug, sessionId, orgId]
            );
            await db.end();
          } catch (err: any) {
            console.error("[Relay Server] DB Presence Upsert Error:", err.message);
          }

          console.log(`✓ [Relay Server] Agent Identified & Online: ${agentRow.name} (${profileSlug}) [Primary Model: ${primaryModel}]`);

          ws.send(JSON.stringify({
            op: "READY",
            d: {
              session_id: sessionId,
              agent_id: agentId,
              profile_slug: profileSlug,
              heartbeat_interval: heartbeatInterval,
              last_sequence: lastSeq,
              primary_model: primaryModel,
              backup_model: backupModel,
            },
          }));

          await drainQueuedOutboxForAgent(agentId, ws);
          return;
        }

        // 2. OP: RESUME
        if (op === "RESUME") {
          const token = d?.token;
          const reportedLastSeq = parseInt(d?.last_sequence ?? "-1", 10);

          if (!token || typeof token !== "string" || isNaN(reportedLastSeq)) {
            ws.close(4001, "Invalid RESUME payload");
            return;
          }

          const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
          const db = await getDbClient();

          try {
            const agentRes = await db.query(
              `SELECT id, name, role, org_id, status, last_sequence, primary_model, backup_model FROM agents WHERE gateway_token_hash = $1 AND status = 'active'`,
              [tokenHash]
            );

            if (agentRes.rows.length === 0) {
              await db.end();
              ws.close(4001, "Invalid gateway token");
              return;
            }

            const agentRow = agentRes.rows[0];
            const agentId = agentRow.id;
            const profileSlug = toProfileSlug(agentRow.name);
            const orgId = agentRow.org_id;

            const workerRes = await db.query(
              `SELECT last_seen_at FROM agent_workers WHERE agent_profile = $1`,
              [profileSlug]
            );

            let isSessionStale = false;
            if (workerRes.rows.length > 0 && workerRes.rows[0].last_seen_at) {
              const lastSeenMs = new Date(workerRes.rows[0].last_seen_at).getTime();
              if (Date.now() - lastSeenMs > RESUME_CUTOFF_MS) {
                isSessionStale = true;
              }
            }

            if (d?.force_stale === true || isSessionStale) {
              await db.end();
              ws.close(4004, "Session Invalidated / Expired. Fresh IDENTIFY required.");
              return;
            }

            const sessionId = crypto.randomUUID();
            const heartbeatInterval = 15000;
            const currentSeq = parseInt(agentRow.last_sequence || "0", 10);
            const primaryModel = agentRow.primary_model || "gemini-3.6-flash-lite";
            const backupModel = agentRow.backup_model || "claude-3-5-sonnet";

            const session: AgentSession = {
              ws,
              agentId,
              profileSlug,
              agentName: agentRow.name,
              primaryModel,
              backupModel,
              orgId,
              sessionId,
              lastSequence: currentSeq,
              lastHeartbeatAt: Date.now(),
              heartbeatInterval,
            };

            activeSessions.set(agentId, session);
            socketToAgentId.set(ws, agentId);

            await db.query(
              `INSERT INTO agent_workers (agent_profile, status, session_id, last_seen_at, last_heartbeat_at, org_id)
               VALUES ($1, 'online', $2, now(), now(), $3)
               ON CONFLICT (agent_profile) DO UPDATE
               SET status = 'online', session_id = EXCLUDED.session_id, last_seen_at = now(), last_heartbeat_at = now(), org_id = EXCLUDED.org_id`,
              [profileSlug, sessionId, orgId]
            );

            console.log(`🔄 [Relay Server] Agent Resumed Session: ${agentRow.name} (${profileSlug}) [Model: ${primaryModel}]`);

            ws.send(JSON.stringify({
              op: "RESUMED",
              d: {
                session_id: sessionId,
                agent_id: agentId,
                profile_slug: profileSlug,
                last_sequence: currentSeq,
                primary_model: primaryModel,
                backup_model: backupModel,
              },
            }));

            const missedJobsRes = await db.query(
              `SELECT id, sequence, context_payload FROM dispatch_jobs 
               WHERE agent_id = $1 AND sequence > $2 AND status != 'delivered'
               ORDER BY sequence ASC`,
              [agentId, reportedLastSeq]
            );

            if (missedJobsRes.rows.length > 0) {
              for (const job of missedJobsRes.rows) {
                const seq = parseInt(job.sequence, 10);
                ws.send(JSON.stringify({
                  op: "DISPATCH",
                  d: job.context_payload,
                  s: seq,
                }));

                await db.query(
                  `UPDATE dispatch_jobs SET status = 'delivered', completed_at = now() WHERE id = $1`,
                  [job.id]
                );
              }
            }

            await db.end();
            await drainQueuedOutboxForAgent(agentId, ws);
            return;

          } catch (resErr: any) {
            await db.end().catch(() => {});
            ws.close(4000, "Internal Server Error");
            return;
          }
        }

        const agentId = socketToAgentId.get(ws);
        const session = agentId ? activeSessions.get(agentId) : null;

        if (!session) {
          ws.close(4003, "Not Identified");
          return;
        }

        // 3. OP: HEARTBEAT
        if (op === "HEARTBEAT") {
          session.lastHeartbeatAt = Date.now();

          try {
            const db = await getDbClient();
            await db.query(
              `UPDATE agent_workers SET last_heartbeat_at = now(), last_seen_at = now(), status = 'online' WHERE agent_profile = $1`,
              [session.profileSlug]
            );
            await db.end();
          } catch {}

          ws.send(JSON.stringify({ op: "HEARTBEAT_ACK" }));
          return;
        }

        // 4. OP: DISPATCH (Agent completion reply received over socket)
        if (op === "DISPATCH") {
          const replyText = d?.reply_text || d?.text || "";
          const channelId = d?.channel_id || "general";
          const threadId = d?.thread_id || null;
          const senderName = d?.sender_name || session.agentName;
          const servingModel = d?.model || session.primaryModel;
          const orgId = session.orgId;

          console.log(`📩 [Relay Server] Received agent completion reply from ${senderName} (${session.profileSlug}) [Model: ${servingModel}]`);

          const db = await getDbClient();

          try {
            const contentBlocks = await parseContentBlocks(replyText, orgId, db);

            const msgRes = await db.query(
              `INSERT INTO messages (channel_id, thread_id, sender_name, sender_role, text, content_blocks, is_agent, org_id)
               VALUES ($1, $2, $3, $4, $5, $6, true, $7)
               RETURNING id`,
              [
                channelId,
                threadId,
                senderName,
                `${senderName} Agent`,
                replyText,
                JSON.stringify(contentBlocks),
                orgId,
              ]
            );

            const promptTokens = Math.max(1, Math.ceil((d?.original_user_text || "").length / 4));
            const completionTokens = Math.max(1, Math.ceil(replyText.length / 4));
            const totalTokens = promptTokens + completionTokens;

            await db.query(
              `INSERT INTO agent_turn_log (agent_id, prompt_tokens, completion_tokens, total_tokens, model, org_id)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [session.agentId, promptTokens, completionTokens, totalTokens, servingModel, orgId]
            );

            await db.query(
              `INSERT INTO spend_ledger (agent_id, token_count, model, org_id)
               VALUES ($1, $2, $3, $4)`,
              [session.agentId, totalTokens, servingModel, orgId]
            );

            if (threadId) {
              await db.query(
                `UPDATE threads 
                 SET reply_count = reply_count + 1,
                     primary_model = $1,
                     last_activity_at = now()
                 WHERE id = $2`,
                [servingModel, threadId]
              );
            }

            const taskMatches = Array.from(replyText.matchAll(/\[TASK:\s*([^|\]]+)\|?\s*([^\]]*)\]/gi));
            for (const tm of taskMatches) {
              const tTitle = tm[1]?.trim();
              const tAssign = tm[2]?.trim() || senderName;
              if (tTitle) {
                try {
                  await db.query(
                    `INSERT INTO tasks (title, assigned_to, status, channel_id, thread_id, org_id)
                     VALUES ($1, $2, 'in_progress', $3, $4, $5)`,
                    [tTitle, tAssign, channelId, threadId, orgId]
                  );
                } catch {}
              }
            }

            const mentionBlocks = contentBlocks.filter(b => b.type === "mention" && b.target_id);
            for (const mb of mentionBlocks) {
              if (mb.target_id && mb.target_id !== session.agentId) {
                const chainedAgentRes = await db.query(
                  `SELECT id, name FROM agents WHERE id = $1 AND org_id = $2 AND status = 'active'`,
                  [mb.target_id, orgId]
                );
                if (chainedAgentRes.rows.length > 0) {
                  const targetAg = chainedAgentRes.rows[0];
                  const chainPayload = {
                    user_text: `[Message from ${senderName}]: "${replyText.slice(0, 300)}" — Please reply with updates for the team.`,
                    sender_name: senderName,
                    sender_role: `${senderName} Agent`,
                    channel_id: channelId,
                    thread_id: threadId,
                    target_agent: targetAg.name,
                    profile_slug: toProfileSlug(targetAg.name),
                  };
                  console.log(`🔗 [Relay Server] Inter-agent chaining triggered for ${targetAg.name} in org ${orgId}`);
                  await dispatchToAgent(targetAg.id, chainPayload, channelId, threadId);
                }
              }
            }

            ws.send(JSON.stringify({ op: "DISPATCH_ACK", d: { message_id: msgRes.rows[0]?.id, model: servingModel } }));

          } catch (replyErr: any) {
            console.error("[Relay Server] Error processing agent reply:", replyErr.message);
          } finally {
            await db.end();
          }

          return;
        }

      } catch (err: any) {
        console.error("[Relay Server] Error processing socket message:", err.message);
      }
    });

    ws.on("close", async () => {
      const agentId = socketToAgentId.get(ws);
      if (agentId) {
        const session = activeSessions.get(agentId);
        if (session) {
          console.log(`🔌 [Relay Server] Agent Disconnected: ${session.agentName} (${session.profileSlug})`);
          try {
            const db = await getDbClient();
            await db.query(
              `UPDATE agent_workers SET status = 'offline', last_seen_at = now() WHERE agent_profile = $1`,
              [session.profileSlug]
            );
            await db.end();
          } catch {}
          activeSessions.delete(agentId);
        }
        socketToAgentId.delete(ws);
      }
    });
  });

  return wss;
}

if (require.main === module) {
  startRelayServer();
}
