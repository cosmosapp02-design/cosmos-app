import WebSocket from "ws";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

export interface AgentConnectorConfig {
  token: string;
  hermesProfilePath?: string;
  relayUrl?: string;
  mockMode?: boolean; // Used in test suites to simulate Hermes execution quickly
}

export class AgentConnector {
  private token: string;
  private profilePath: string;
  private relayUrl: string;
  private mockMode: boolean;
  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastSequence: number = 0;
  private sessionId: string | null = null;
  private isConnecting: boolean = false;
  private isStopped: boolean = false;

  constructor(config: AgentConnectorConfig) {
    this.token = config.token;
    this.profilePath = config.hermesProfilePath || path.join(process.env.HOME || "/Users/cosmos", ".hermes/profiles/default");
    this.relayUrl = config.relayUrl || "ws://127.0.0.1:8085";
    this.mockMode = config.mockMode || false;
  }

  public start() {
    this.isStopped = false;
    this.connect();
  }

  public stop() {
    this.isStopped = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    console.log("[Agent Connector] Stopped.");
  }

  private connect() {
    if (this.isConnecting || this.isStopped) return;
    this.isConnecting = true;

    console.log(`🔌 [Agent Connector] Connecting to Relay Server at ${this.relayUrl}...`);
    this.ws = new WebSocket(this.relayUrl);

    this.ws.on("open", () => {
      this.isConnecting = false;
      console.log("⚡ [Agent Connector] Outbound socket connected. Sending IDENTIFY / RESUME...");

      if (this.sessionId && this.lastSequence > 0) {
        this.ws?.send(
          JSON.stringify({
            op: "RESUME",
            d: {
              token: this.token,
              last_sequence: this.lastSequence,
            },
          })
        );
      } else {
        this.ws?.send(
          JSON.stringify({
            op: "IDENTIFY",
            d: {
              token: this.token,
            },
          })
        );
      }
    });

    this.ws.on("message", async (data: Buffer | string) => {
      try {
        const message = JSON.parse(data.toString());
        const { op, d, s } = message;

        if (s !== undefined && s > this.lastSequence) {
          this.lastSequence = s;
        }

        // 1. OP: READY
        if (op === "READY") {
          this.sessionId = d.session_id;
          const heartbeatInterval = d.heartbeat_interval || 15000;
          console.log(`✓ [Agent Connector] Identified successfully! Session ID: ${this.sessionId}, Profile: ${d.profile_slug}, Model: ${d.primary_model || 'default'}`);

          this.startHeartbeat(heartbeatInterval);
          return;
        }

        // 2. OP: RESUMED
        if (op === "RESUMED") {
          this.sessionId = d.session_id;
          console.log(`✓ [Agent Connector] Session resumed successfully! Session ID: ${this.sessionId}`);
          return;
        }

        // 3. OP: HEARTBEAT_ACK
        if (op === "HEARTBEAT_ACK") {
          return;
        }

        // 4. OP: DISPATCH (Execute Hermes CLI dynamically using payload.primary_model and return reply over socket)
        if (op === "DISPATCH") {
          const servingModel = d?.primary_model || "gemini-3.6-flash-lite";
          console.log(`📩 [Agent Connector] DISPATCH received (Seq #${s || this.lastSequence}) [Primary Model: ${servingModel}]:`, d);

          const responseText = await this.executeHermes(d, servingModel);
          console.log(`💬 [Agent Connector] Hermes response generated (${responseText.length} chars) using model [${servingModel}]. Sending reply DISPATCH...`);

          // Send reply back over socket with model metadata
          this.ws?.send(
            JSON.stringify({
              op: "DISPATCH",
              d: {
                reply_text: responseText,
                channel_id: d.channel_id,
                thread_id: d.thread_id || null,
                sender_name: d.target_agent || "Agent",
                profile_slug: d.profile_slug,
                original_user_text: d.user_text,
                session_id: this.sessionId,
                model: servingModel,
              },
              s: this.lastSequence,
            })
          );
          return;
        }

      } catch (err: any) {
        console.error("[Agent Connector] Error handling message:", err.message);
      }
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      this.isConnecting = false;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

      console.warn(`⚠️ [Agent Connector] Socket disconnected (Code: ${code}, Reason: ${reason.toString()}).`);

      if (code === 4001 || code === 4004) {
        console.error("❌ [Agent Connector] Fatal auth error / Session expired. Resetting session ID.");
        this.sessionId = null;
        this.lastSequence = 0;
      }

      if (!this.isStopped) {
        console.log("🔄 [Agent Connector] Retrying connection in 2 seconds...");
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    });

    this.ws.on("error", (err: Error) => {
      this.isConnecting = false;
      console.error("[Agent Connector] Socket error:", err.message);
    });
  }

  private startHeartbeat(intervalMs: number) {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: "HEARTBEAT" }));
      }
    }, intervalMs);
  }

  private async executeHermes(payload: any, modelName: string): Promise<string> {
    const userText = payload.user_text || payload.prompt || "Hello";

    if (this.mockMode) {
      return `[Mock Hermes Reply via ${modelName} for ${payload.target_agent || "Agent"}]: Processed query "${userText.slice(0, 100)}" cleanly.`;
    }

    const home = process.env.HOME || "/Users/cosmos";
    const venvBin = path.join(home, ".hermes/hermes-agent/venv/bin/hermes");
    const hermesBin = fs.existsSync(venvBin) ? venvBin : "hermes";

    const profileDir = this.profilePath;
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    const soulPath = path.join(profileDir, "SOUL.md");
    if (!fs.existsSync(soulPath)) {
      fs.writeFileSync(
        soulPath,
        `# SOUL.md — ${payload.target_agent || "Hermes Agent"}\n\n## System Instructions & Persona\nYou are ${payload.target_agent || "Hermes Agent"}, working on Cosmos Enterprise Platform.\n`
      );
    }

    const sanitizedInput = userText.replace(/"/g, '\\"');
    const sessionId = payload.thread_id ? `session-thread-${payload.thread_id}` : `session-channel-${payload.channel_id || "general"}`;
    const command = `HERMES_HOME="${profileDir}" ${hermesBin} -z "${sanitizedInput}" --resume "${sessionId}" --model "${modelName}"`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60_000,
        env: {
          ...process.env,
          HERMES_HOME: profileDir,
        },
      });

      const rawCombined = `${stdout || ""}\n${stderr || ""}`;
      const cleaned = rawCombined
        .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
        .replace(/^WARNING.*$/gm, "")
        .replace(/^◇ injected env.*$/gm, "")
        .trim();

      return cleaned || stdout.trim() || "Agent completed execution.";
    } catch (execErr: any) {
      const rawErr = `${execErr.stdout || ""}\n${execErr.stderr || ""}`;
      const cleaned = rawErr
        .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
        .replace(/^WARNING.*$/gm, "")
        .replace(/^◇ injected env.*$/gm, "")
        .trim();

      return cleaned || execErr.message || "No output returned from local Hermes.";
    }
  }
}

if (require.main === module) {
  const token = process.env.AGENT_GATEWAY_TOKEN;
  if (!token) {
    console.error("Please provide AGENT_GATEWAY_TOKEN in environment to run standalone connector.");
    process.exit(1);
  }

  const connector = new AgentConnector({
    token,
    hermesProfilePath: process.env.HERMES_PROFILE_PATH,
    relayUrl: process.env.RELAY_URL,
  });

  connector.start();
}
