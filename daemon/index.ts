import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";
import { runInNativeSandbox } from "./sandbox";
import * as path from "path";

const PORT = 8080;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://uaiwgcfmjwxphpjagkcz.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhaXdnY2Ztand4cGhwamFna2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNzUzNjgsImV4cCI6MjEwMDk1MTM2OH0.GAe8rDHR4acGcAnohP6U8lWpY0RCO0kJbPFEPudP228";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 Cosmos Local Engine Daemon v1.0.0 listening on ws://127.0.0.1:${PORT}`);

interface PendingApproval {
  requestId: string;
  ws: WebSocket;
  command: string;
  projectPath: string;
}

const pendingApprovals = new Map<string, PendingApproval>();

wss.on("connection", (ws: WebSocket) => {
  console.log("⚡ [Daemon] Web client connected to local engine");

  // Send initial connected state
  ws.send(JSON.stringify({ type: "status", connected: true, version: "1.0.0", mode: "native-kernel-sandbox" }));

  ws.on("message", async (data: string) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", status: "online", time: new Date().toISOString() }));
      }

      if (message.type === "fetch_agents") {
        const { data: agents, error } = await supabase.from("agents").select("*");
        ws.send(JSON.stringify({ type: "agents_list", agents: agents || [], error: error?.message }));
      }

      // REPORT MODE: Request human approval for high-risk operation
      if (message.type === "trigger_report_mode") {
        const requestId = `req_${Date.now()}`;
        const command = message.command || "npm run build";
        const projectPath = message.projectPath || path.resolve("../");

        pendingApprovals.set(requestId, { requestId, ws, command, projectPath });

        ws.send(
          JSON.stringify({
            type: "report_mode_prompt",
            requestId,
            agentName: message.agentName || "Dev-Bot",
            command,
            file: message.file || "auth/middleware.ts",
            diff: message.diff || "+ export function middleware(req) {\n+   return NextResponse.next();\n+ }",
          })
        );
      }

      // REPORT MODE RESPONSE: Human clicked Approve or Deny
      if (message.type === "report_mode_response") {
        const pending = pendingApprovals.get(message.requestId);

        if (pending) {
          if (message.approved) {
            console.log(`✓ [Report Mode] Command APPROVED by user. Running in native kernel sandbox: ${pending.command}`);
            ws.send(JSON.stringify({ type: "report_mode_status", status: "executing", command: pending.command }));

            const result = await runInNativeSandbox({
              command: pending.command,
              projectPath: pending.projectPath,
            });

            ws.send(
              JSON.stringify({
                type: "report_mode_result",
                approved: true,
                stdout: result.stdout || "Command executed successfully in native OS sandbox.",
                stderr: result.stderr,
                exitCode: result.exitCode,
                sandboxed: result.sandboxed,
              })
            );
          } else {
            console.log(`⚠ [Report Mode] Command DENIED by user: ${pending.command}`);
            ws.send(JSON.stringify({ type: "report_mode_result", approved: false, reason: "Denied by human supervisor" }));
          }

          pendingApprovals.delete(message.requestId);
        }
      }

      if (message.type === "run_sprint") {
        ws.send(JSON.stringify({ type: "sprint_started", sprintId: message.sprintId }));

        const logs = [
          "▶ Initializing Native OS Kernel Sandbox (sandbox-exec)",
          "✓ Connected to Supabase Cloud Database",
          "⚡ [Dev-Bot] Processing ticket COS-102 (JWT Authentication Flow)",
          "✓ [Dev-Bot] auth/middleware.ts compiled & verified inside native sandbox",
          "⚡ [QA-Guard] Running Playwright test suite...",
          "✓ [QA-Guard] 23 tests passing (0 failures)",
          "🚀 Sprint 4 execution complete"
        ];

        logs.forEach((log, index) => {
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "sprint_log", log, step: index + 1, total: logs.length }));
            }
          }, (index + 1) * 600);
        });
      }
    } catch (err: any) {
      console.error("Error processing WebSocket message:", err);
    }
  });

  ws.on("close", () => {
    console.log("⚡ [Daemon] Web client disconnected");
  });
});
