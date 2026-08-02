import { Client } from "pg";
import path from "path";
import dotenv from "dotenv";
import { startRelayServer, dispatchToAgent, socketToAgentId, activeSessions } from "../relay/server";
import { AgentConnector } from "../connector/agent-connector";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DB_URL = process.env.DATABASE_URL!;
const TEST_PORT = 8090;

async function testPhase3() {
  console.log("=== Phase 3 Verification Test Suite (Agent Connector & Hermes Loop) ===");
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  let passed = true;
  let relayWss: any = null;
  let connector: AgentConnector | null = null;

  try {
    // Setup Test Agent
    console.log("\n[Setup] Preparing test agent and generating gateway token...");
    const defaultOrgId = "00000000-0000-0000-0000-000000000001";
    const testAgentId = "44444444-4444-4444-4444-444444444444";
    const profileSlug = "test_connector_agent";

    // Clean up old records
    await db.query(`DELETE FROM dispatch_jobs WHERE agent_id = $1`, [testAgentId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE id = $1`, [testAgentId]);

    await db.query(
      `INSERT INTO agents (id, name, role, org_id, status, last_sequence) VALUES ($1, 'Test Connector Agent', 'Tester', $2, 'active', 0)`,
      [testAgentId, defaultOrgId]
    );

    const tokenRes = await db.query(`SELECT generate_agent_gateway_token($1) as raw_token`, [testAgentId]);
    const validToken = tokenRes.rows[0].raw_token;
    console.log(`✓ Generated test token: gtw_*** (${validToken.slice(0, 10)}...)`);

    // Start Relay Server
    relayWss = startRelayServer(TEST_PORT);
    await new Promise((r) => setTimeout(r, 500));

    // ── Test 1: Connector Startup & Identification ──────────────────────────────
    console.log("\n[Test 1] Testing Agent Connector Startup & Identification...");
    connector = new AgentConnector({
      token: validToken,
      relayUrl: `ws://127.0.0.1:${TEST_PORT}`,
      mockMode: true,
    });

    connector.start();

    // Wait 1.5 seconds for socket connection & READY response
    await new Promise((r) => setTimeout(r, 1500));

    const workerRes = await db.query(`SELECT status, session_id FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    if (workerRes.rows.length === 0 || workerRes.rows[0].status !== "online") {
      console.error(`❌ Test 1 Failed: agent_workers status is not 'online'! Found:`, workerRes.rows);
      passed = false;
    } else {
      console.log(`✓ Agent Connector successfully connected and set agent_workers status='online' (Session: ${workerRes.rows[0].session_id})`);
    }

    // ── Test 2: DISPATCH -> Local Hermes Execution -> Socket Reply Loop ─────────
    console.log("\n[Test 2] Testing DISPATCH -> Hermes Execution -> Reply Over Socket Loop...");

    // Send a DISPATCH from Relay to Agent Connector
    console.log("🚀 Relay sending DISPATCH payload to connected Agent Connector...");
    const dispatchRes = await dispatchToAgent(
      testAgentId,
      { user_text: "What is the status of Phase 3 build?", target_agent: "Test Connector Agent", profile_slug: profileSlug },
      "ch-phase3-test"
    );

    console.log(`✓ Dispatch seq #${dispatchRes.sequence} sent. Waiting for Connector reply...`);

    // Wait for Hermes execution and reply over socket
    await new Promise((r) => setTimeout(r, 1500));

    // Verify dispatch job was delivered
    const jobCheck = await db.query(`SELECT status FROM dispatch_jobs WHERE id = $1`, [dispatchRes.jobId]);
    if (jobCheck.rows.length === 0 || jobCheck.rows[0].status !== "delivered") {
      console.error(`❌ Test 2 Failed: dispatch_job status is not 'delivered'! Found:`, jobCheck.rows);
      passed = false;
    } else {
      console.log(`✓ Test 2 Passed! Verified DISPATCH was delivered and replied over socket cleanly!`);
    }

    // ── Test 3: Connector Stopping & Presence Offline Cleanup ───────────────────
    console.log("\n[Test 3] Testing Connector Stopping & Presence Cleanup...");
    connector.stop();
    connector = null;

    // Wait 1 second for socket disconnect event processing
    await new Promise((r) => setTimeout(r, 1000));

    const offlineCheck = await db.query(`SELECT status FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    if (offlineCheck.rows.length === 0 || offlineCheck.rows[0].status !== "offline") {
      console.error(`❌ Test 3 Failed: agent_workers status did not flip to 'offline'! Found:`, offlineCheck.rows);
      passed = false;
    } else {
      console.log("✓ Test 3 Passed! Verified agent_workers status flipped to 'offline' on disconnect!");
    }

    // Cleanup
    console.log("\n[Cleanup] Cleaning up test records...");
    await db.query(`DELETE FROM dispatch_jobs WHERE agent_id = $1`, [testAgentId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE id = $1`, [testAgentId]);

    if (passed) {
      console.log("\n==========================================");
      console.log("🎉 PHASE 3 TEST SUITE FULLY PASSED!");
      console.log("==========================================");
    } else {
      console.error("\n❌ PHASE 3 TEST SUITE FAILED.");
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Test error:", err);
    process.exit(1);
  } finally {
    if (connector) (connector as AgentConnector).stop();
    if (relayWss) relayWss.close();
    await db.end();
  }
}

testPhase3();
