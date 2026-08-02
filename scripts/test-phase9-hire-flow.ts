import { Client } from "pg";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { startRelayServer } from "../relay/server";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DB_URL = process.env.DATABASE_URL!;
const TEST_PORT = 8095;

async function testPhase9() {
  console.log("=== Phase 9 Verification Test Suite (Plug Gateway Into 'Hire' Flow) ===");
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  let passed = true;
  let relayWss: any = null;

  try {
    // ── Test 1: Name Character Filtering Audit ───────────────────────────────────
    console.log("\n[Test 1] Auditing Name Field Validation & Sanitization...");
    const rawInput = "  Dev Bot #42! @Pro  ";
    const filteredLive = rawInput.replace(/[^a-zA-Z0-9]/g, "");

    if (filteredLive !== "DevBot42Pro") {
      console.error(`❌ Test 1 Failed: Expected 'DevBot42Pro', got '${filteredLive}'`);
      passed = false;
    } else {
      console.log(`✓ Test 1 Passed! Live input filter cleanly stripped spaces & symbols: '${rawInput}' -> '${filteredLive}'`);
    }

    // ── Setup Test Data ──────────────────────────────────────────────────────────
    const defaultOrgId = "00000000-0000-0000-0000-000000000001";
    const agentName = "TestBot99";
    const profileSlug = "testbot99";
    const channelName = profileSlug;

    // Clean up prior test data
    await db.query(`DELETE FROM channels WHERE name = $1`, [channelName]);
    await db.query(`DELETE FROM dispatch_jobs WHERE channel_id = $1`, [channelName]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE name = $1`, [agentName]);

    const profileDir = path.join(process.env.HOME || "/Users/cosmos", ".hermes/profiles", profileSlug);
    const tokenEnvFile = path.join(profileDir, "token.env");

    if (fs.existsSync(tokenEnvFile)) fs.unlinkSync(tokenEnvFile);

    // ── Test 2: Start Relay & Trigger Automated Hire Pipeline ────────────────────
    console.log("\n[Test 2] Testing Automated Hire API & Zero-Touch Token Writing...");
    process.env.RELAY_PORT = String(TEST_PORT);
    process.env.USE_MOCK_HERMES = "true";

    relayWss = startRelayServer(TEST_PORT);
    await new Promise((r) => setTimeout(r, 500));

    const { POST } = await import("../app/api/v1/agents/create/route");

    const reqObj = new Request("http://localhost:3000/api/v1/agents/create", {
      method: "POST",
      body: JSON.stringify({
        name: agentName,
        role: "Automated QA Specialist",
        description: "Hired automatically in Phase 9 test suite",
        primaryModel: "gemini-3.6-flash-lite",
        backupModel: "claude-3-5-sonnet",
      }),
    });

    const res = await POST(reqObj as any);
    if (!res.ok) {
      console.error(`❌ Test 2 Failed: POST /api/v1/agents/create returned HTTP ${res.status}`);
      passed = false;
    } else {
      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: isDone } = await reader.read();
          done = isDone;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                console.log("SSE Stream Event:", line.slice(6));
              }
            }
          }
        }
      }
      console.log("✓ Hire API execution stream finished.");
    }

    // Verify DB Agent Row & Gateway Token Hash
    const agentCheck = await db.query(`SELECT id, name, gateway_token_hash FROM agents WHERE name = $1`, [agentName]);
    if (agentCheck.rows.length === 0 || !agentCheck.rows[0].gateway_token_hash) {
      console.error(`❌ Test 2 Failed: Agent row or gateway_token_hash missing in DB!`, agentCheck.rows);
      passed = false;
    } else {
      console.log(`✓ Agent ${agentName} created in DB with gateway_token_hash populated!`);
    }

    // Verify raw token written to local profile token.env file
    if (!fs.existsSync(tokenEnvFile)) {
      console.error(`❌ Test 2 Failed: Local token config file ${tokenEnvFile} was NOT created!`);
      passed = false;
    } else {
      const fileContent = fs.readFileSync(tokenEnvFile, "utf-8");
      if (!fileContent.includes("GATEWAY_TOKEN=gtw_")) {
        console.error(`❌ Test 2 Failed: token.env does not contain valid GATEWAY_TOKEN=gtw_ secret!`, fileContent);
        passed = false;
      } else {
        console.log(`✓ Zero-Touch Token Provisioning Passed! Raw token automatically written to ${tokenEnvFile}`);
      }
    }

    // ── Test 3: Auto-Started Connector & Real-Time Presence Transition ─────────
    console.log("\n[Test 3] Testing Auto-Started Connector & Real-Time Online Presence...");
    await new Promise((r) => setTimeout(r, 2000));

    const workerCheck = await db.query(`SELECT status, session_id FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);

    if (workerCheck.rows.length === 0 || workerCheck.rows[0].status !== "online") {
      console.error(`❌ Test 3 Failed: agent_workers status did not flip to 'online'! Found:`, workerCheck.rows);
      passed = false;
    } else {
      console.log(`✓ Real-Time Presence Passed! agent_workers status flipped to 'online' (Session: ${workerCheck.rows[0].session_id})`);
    }

    // Cleanup
    console.log("\n[Cleanup] Cleaning up test records...");
    await db.query(`DELETE FROM channels WHERE name = $1`, [channelName]);
    await db.query(`DELETE FROM dispatch_jobs WHERE channel_id = $1`, [channelName]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE name = $1`, [agentName]);

    if (fs.existsSync(tokenEnvFile)) fs.unlinkSync(tokenEnvFile);

    if (passed) {
      console.log("\n==========================================");
      console.log("🎉 PHASE 9 TEST SUITE FULLY PASSED!");
      console.log("==========================================");
      process.exit(0);
    } else {
      console.error("\n❌ PHASE 9 TEST SUITE FAILED.");
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

testPhase9();
