import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";
import { runInNativeSandbox } from "./sandbox";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PORT = 8080;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://uaiwgcfmjwxphpjagkcz.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhaXdnY2Ztand4cGhwamFna2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNzUzNjgsImV4cCI6MjEwMDk1MTM2OH0.GAe8rDHR4acGcAnohP6U8lWpY0RCO0kJbPFEPudP228";

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const CONFIG_DIR = path.join(os.homedir(), ".cosmos");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

interface DaemonConfig {
  paired: boolean;
  userId?: string;
  email?: string;
  orgName?: string;
  pairingCode?: string;
}

function loadConfig(): DaemonConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {}
  return { paired: false };
}

function saveConfig(config: DaemonConfig) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save config:", e);
  }
}

let config = loadConfig();

// METHOD 1 DEVICE PAIRING: If unpaired, generate code and open browser
if (!config.paired) {
  const pairingCode = `cosmos_pair_${Math.random().toString(36).substring(2, 8)}`;
  config.pairingCode = pairingCode;
  const pairingUrl = `http://localhost:3000/pair?code=${pairingCode}`;

  console.log(`🔑 Device Unpaired. Opening browser for user setup: ${pairingUrl}`);

  const isMac = process.platform === "darwin";
  const openCmd = isMac ? `open "${pairingUrl}"` : `start "${pairingUrl}"`;
  
  exec(openCmd, (err) => {
    if (err) console.error("Could not auto-open browser:", err.message);
  });
}

const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 Cosmos Local Engine Daemon v1.0.0 listening on ws://127.0.0.1:${PORT}`);

wss.on("connection", (ws: WebSocket) => {
  console.log("⚡ [Daemon] Client connected");

  ws.send(
    JSON.stringify({
      type: "status",
      connected: true,
      paired: config.paired,
      user: config.email || null,
      mode: "native-kernel-sandbox",
    })
  );

  ws.on("message", async (data: string) => {
    try {
      const message = JSON.parse(data.toString());

      // DEVICE PAIRING HANDSHAKE
      if (message.type === "approve_pairing") {
        if (message.code === config.pairingCode || !config.pairingCode) {
          config = {
            paired: true,
            userId: message.userId,
            email: message.email,
            orgName: message.orgName,
          };
          saveConfig(config);

          console.log(`✓ Device Paired Successfully with User: ${message.email}`);
          ws.send(JSON.stringify({ type: "pairing_complete", success: true }));
        }
      }

      if (message.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", status: "online", paired: config.paired, time: new Date().toISOString() }));
      }
    } catch (err: any) {
      console.error("Error processing WebSocket message:", err);
    }
  });

  ws.on("close", () => {
    console.log("⚡ [Daemon] Client disconnected");
  });
});
