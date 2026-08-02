import WebSocket from "ws";
import { Client } from "pg";
import path from "path";
import dotenv from "dotenv";
import { startRelayServer, dispatchToAgent, activeSessions } from "../relay/server";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DB_URL = process.env.DATABASE_URL!;
const TEST_PORT = 8089;

async function testPhase2() {
  console.log("=== Phase 2 Verification Test Suite (RESUME & Sequence Replay) ===");
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  let passed = true;
  let relayWss: any = null;

  try {
    // Setup Test Agent
    console.log("\n[Setup] Preparing test agent and generating gateway token...");
    const defaultOrgId = "00000000-0000-0000-0000-000000000001";
    const testAgentId = "66666666-6666-6666-6666-666666666666";
    const profileSlug = "test_resume_agent";

    // Clean up old jobs & agent
    await db.query(`DELETE FROM dispatch_jobs WHERE agent_id = $1`, [testAgentId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE id = $1`, [testAgentId]);

    await db.query(
      `INSERT INTO agents (id, name, role, org_id, status, last_sequence) VALUES ($1, 'Test Resume Agent', 'Tester', $2, 'active', 0)`,
      [testAgentId, defaultOrgId]
    );

    const tokenRes = await db.query(`SELECT generate_agent_gateway_token($1) as raw_token`, [testAgentId]);
    const validToken = tokenRes.rows[0].raw_token;
    console.log(`✓ Generated test token: gtw_*** (${validToken.slice(0, 10)}...)`);

    // Start Relay Server
    relayWss = startRelayServer(TEST_PORT);
    await new Promise((r) => setTimeout(r, 500));

    // ── Test 1: Mid-Stream Disconnect & Sequence Replay ──────────────────────────
    console.log("\n[Test 1] Testing Mid-Stream Disconnect & Sequence Replay...");

    // Dispatch message 1 before connect
    await dispatchToAgent(testAgentId, { user_text: "Message 1 (Sequence 1)" }, "channel-1");

    // Connect Client 1 with IDENTIFY
    const ws1 = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    const identifyPromise = new Promise<any>((resolve) => {
      ws1.on("open", () => ws1.send(JSON.stringify({ op: "IDENTIFY", d: { token: validToken } })));
      ws1.on("message", (msg) => {
        const payload = JSON.parse(msg.toString());
        if (payload.op === "READY") resolve(payload);
      });
    });

    const readyPayload = await identifyPromise;
    console.log(`✓ Client 1 Identified (Session ID: ${readyPayload.d.session_id}, Last Seq: ${readyPayload.d.last_sequence})`);

    // Drop Client 1 socket immediately (simulating network drop mid-stream)
    ws1.terminate();
    await new Promise((r) => setTimeout(r, 500));

    // Dispatch message 2 and 3 while client is disconnected
    console.log("📦 Dispatching Message 2 and Message 3 while client is disconnected...");
    await dispatchToAgent(testAgentId, { user_text: "Message 2 (Sequence 2)" }, "channel-1");
    await dispatchToAgent(testAgentId, { user_text: "Message 3 (Sequence 3)" }, "channel-1");

    // Reconnect Client 2 with RESUME specifying last_sequence: 1
    console.log("🔄 Client 2 reconnecting with RESUME opcode (last_sequence: 1)...");
    const ws2 = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    const replayedMessages: any[] = [];

    const resumePromise = new Promise<any>((resolve) => {
      ws2.on("open", () => {
        ws2.send(JSON.stringify({ op: "RESUME", d: { token: validToken, last_sequence: 1 } }));
      });
      ws2.on("message", (msg) => {
        const payload = JSON.parse(msg.toString());
        if (payload.op === "RESUMED") {
          console.log(`✓ Received RESUMED confirmation:`, payload.d);
        } else if (payload.op === "DISPATCH") {
          replayedMessages.push(payload);
          if (replayedMessages.length === 2) {
            resolve(replayedMessages);
          }
        }
      });
    });

    const replayed = await resumePromise;
    console.log("Replayed Dispatches received:", replayed);

    if (replayed.length !== 2) {
      console.error(`❌ Test 1 Failed: Expected 2 replayed messages, got ${replayed.length}`);
      passed = false;
    } else if (replayed[0].s !== 2 || replayed[1].s !== 3) {
      console.error(`❌ Test 1 Failed: Sequence order incorrect! Got seq ${replayed[0].s} and ${replayed[1].s}, expected 2 and 3.`);
      passed = false;
    } else {
      console.log(`✓ Test 1 Passed! Received exactly missed sequence #2 and #3 in order with zero duplicates!`);
    }

    ws2.terminate();
    await new Promise((r) => setTimeout(r, 500));

    // ── Test 2: Expired Session RESUME Rejection ────────────────────────────────
    console.log("\n[Test 2] Testing Expired / Stale Session RESUME Rejection...");
    const ws3 = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);

    const staleClosePromise = new Promise<number>((resolve) => {
      ws3.on("open", () => {
        ws3.send(JSON.stringify({ op: "RESUME", d: { token: validToken, last_sequence: 1, force_stale: true } }));
      });
      ws3.on("close", (code) => resolve(code));
    });

    const staleCloseCode = await staleClosePromise;
    if (staleCloseCode !== 4004) {
      console.error(`❌ Test 2 Failed: Expected close code 4004 (Session Invalidated), got ${staleCloseCode}`);
      passed = false;
    } else {
      console.log(`✓ Stale session RESUME rejected cleanly with close code: ${staleCloseCode}`);
    }

    // Cleanup
    console.log("\n[Cleanup] Cleaning up test records...");
    await db.query(`DELETE FROM dispatch_jobs WHERE agent_id = $1`, [testAgentId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE id = $1`, [testAgentId]);

    if (passed) {
      console.log("\n==========================================");
      console.log("🎉 PHASE 2 TEST SUITE FULLY PASSED!");
      console.log("==========================================");
    } else {
      console.error("\n❌ PHASE 2 TEST SUITE FAILED.");
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Test error:", err);
    process.exit(1);
  } finally {
    if (relayWss) relayWss.close();
    await db.end();
  }
}

testPhase2();
