import WebSocket from "ws";
import { Client } from "pg";
import path from "path";
import dotenv from "dotenv";
import { startRelayServer, activeSessions } from "../relay/server";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DB_URL = process.env.DATABASE_URL!;
const TEST_PORT = 8088;

async function testPhase1() {
  console.log("=== Phase 1 Verification Test Suite (Relay Skeleton) ===");
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  let passed = true;
  let relayWss: any = null;

  try {
    // 1. Setup Test Agent and Generate Valid Token
    console.log("\n[Setup] Preparing test agent and generating valid gateway token...");
    const defaultOrgId = "00000000-0000-0000-0000-000000000001";
    const testAgentId = "55555555-5555-5555-5555-555555555555";
    const profileSlug = "test_relay_agent";

    await db.query(`INSERT INTO agents (id, name, role, org_id, status) VALUES ($1, 'Test Relay Agent', 'Tester', $2, 'active') ON CONFLICT (id) DO UPDATE SET status = 'active'`, [testAgentId, defaultOrgId]);

    const tokenRes = await db.query(`SELECT generate_agent_gateway_token($1) as raw_token`, [testAgentId]);
    const validRawToken = tokenRes.rows[0].raw_token;
    console.log(`✓ Generated valid test token: gtw_*** (${validRawToken.slice(0, 10)}...)`);

    // Start Relay Server instance on TEST_PORT
    relayWss = startRelayServer(TEST_PORT);
    await new Promise((r) => setTimeout(r, 500)); // wait for server to listen

    // ── Test 1: Valid IDENTIFY Flow ──────────────────────────────────────────────
    console.log("\n[Test 1] Testing Valid IDENTIFY opcode...");
    const ws1 = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);

    const readyPromise = new Promise<any>((resolve, reject) => {
      ws1.on("open", () => {
        ws1.send(JSON.stringify({ op: "IDENTIFY", d: { token: validRawToken } }));
      });
      ws1.on("message", (msg) => {
        const payload = JSON.parse(msg.toString());
        if (payload.op === "READY") resolve(payload);
      });
      ws1.on("error", reject);
    });

    const readyPayload = await readyPromise;
    if (!readyPayload || readyPayload.op !== "READY" || !readyPayload.d?.session_id) {
      console.error("❌ Test 1 Failed: Expected READY opcode with session_id!");
      passed = false;
    } else {
      console.log(`✓ Received READY opcode cleanly with session_id: ${readyPayload.d.session_id}`);
    }

    // Verify agent_workers status in Supabase
    await new Promise((r) => setTimeout(r, 500));
    const presenceRes = await db.query(`SELECT status, session_id FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    if (presenceRes.rows.length === 0 || presenceRes.rows[0].status !== "online") {
      console.error(`❌ Test 1 Failed: agent_workers status is not 'online'! Found:`, presenceRes.rows);
      passed = false;
    } else {
      console.log(`✓ Verified agent_workers table updated to status='online' in Supabase!`);
    }

    // ── Test 2: Heartbeat & Timeout Reaper ───────────────────────────────────────
    console.log("\n[Test 2] Testing HEARTBEAT & Heartbeat Reaper Timeout...");
    
    // Send HEARTBEAT
    const ackPromise = new Promise<any>((resolve) => {
      ws1.on("message", (msg) => {
        const payload = JSON.parse(msg.toString());
        if (payload.op === "HEARTBEAT_ACK") resolve(payload);
      });
      ws1.send(JSON.stringify({ op: "HEARTBEAT" }));
    });

    const ackPayload = await ackPromise;
    if (!ackPayload || ackPayload.op !== "HEARTBEAT_ACK") {
      console.error("❌ Test 2 Failed: Expected HEARTBEAT_ACK response!");
      passed = false;
    } else {
      console.log("✓ Received HEARTBEAT_ACK cleanly!");
    }

    // Fast-forward session heartbeat timestamp to simulate timeout (> 30s elapsed)
    const session = activeSessions.get(testAgentId);
    if (session) {
      session.lastHeartbeatAt = Date.now() - 40000; // 40 seconds ago
    }

    // Wait for reaper interval to trigger (runs every 5s)
    const closePromise = new Promise<number>((resolve) => {
      ws1.on("close", (code) => resolve(code));
    });

    const closeCode = await closePromise;
    if (closeCode !== 4002) {
      console.error(`❌ Test 2 Failed: Expected close code 4002 (Heartbeat Timeout), got ${closeCode}`);
      passed = false;
    } else {
      console.log(`✓ Socket closed server-side with expected timeout code: ${closeCode}`);
    }

    // Verify status flipped to 'offline' in Supabase
    await new Promise((r) => setTimeout(r, 500));
    const offlineCheck = await db.query(`SELECT status FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    if (offlineCheck.rows[0]?.status !== "offline") {
      console.error(`❌ Test 2 Failed: agent_workers status did not flip to 'offline'! Found:`, offlineCheck.rows);
      passed = false;
    } else {
      console.log("✓ Verified agent_workers status flipped to 'offline' in Supabase after timeout!");
    }

    // ── Test 3: Invalid Token Rejection ──────────────────────────────────────────
    console.log("\n[Test 3] Testing Invalid / Garbage Token Rejection...");
    const ws2 = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);

    const invalidClosePromise = new Promise<number>((resolve) => {
      ws2.on("open", () => {
        ws2.send(JSON.stringify({ op: "IDENTIFY", d: { token: "gtw_invalid_garbage_token_12345" } }));
      });
      ws2.on("close", (code) => resolve(code));
    });

    const invalidCloseCode = await invalidClosePromise;
    if (invalidCloseCode !== 4001) {
      console.error(`❌ Test 3 Failed: Expected close code 4001 (Unauthorized), got ${invalidCloseCode}`);
      passed = false;
    } else {
      console.log(`✓ Invalid token connection rejected immediately with close code: ${invalidCloseCode}`);
    }

    // Ensure no agent_workers row created for garbage token
    const garbageCheck = await db.query(`SELECT * FROM agent_workers WHERE agent_profile = 'invalid_garbage'`);
    if (garbageCheck.rows.length > 0) {
      console.error("❌ Test 3 Failed: Invalid token created an agent_workers row!");
      passed = false;
    } else {
      console.log("✓ Verified NO agent_workers row created or modified for invalid token.");
    }

    // Cleanup
    console.log("\n[Cleanup] Cleaning up test agent...");
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE id = $1`, [testAgentId]);

    if (passed) {
      console.log("\n==========================================");
      console.log("🎉 PHASE 1 TEST SUITE FULLY PASSED!");
      console.log("==========================================");
    } else {
      console.error("\n❌ PHASE 1 TEST SUITE FAILED.");
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

testPhase1();
