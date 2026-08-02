import { Client } from "pg";
import path from "path";
import dotenv from "dotenv";
import { startRelayServer } from "../relay/server";
import { AgentConnector } from "../connector/agent-connector";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DB_URL = process.env.DATABASE_URL!;
const TEST_PORT = 8092;

async function testPhase6() {
  console.log("=== Phase 6 Verification Test Suite (True Offline Handling & Reconnect Catch-Up) ===");
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  let passed = true;
  let relayWss: any = null;
  let connector: AgentConnector | null = null;

  try {
    const defaultOrgId = "00000000-0000-0000-0000-000000000001";
    const testAgentId = "11111111-1111-1111-1111-111111111111";
    const profileSlug = "test_phase6_agent";
    const channelId = "ch-phase6-offline-test";

    // Clean up old test data
    await db.query(`DELETE FROM messages WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM dispatch_jobs WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE id = $1`, [testAgentId]);

    // Setup Agent & Worker in Offline Status
    await db.query(
      `INSERT INTO agents (id, name, role, org_id, status, last_sequence) VALUES ($1, 'Test Phase6 Agent', 'Tester', $2, 'active', 0)`,
      [testAgentId, defaultOrgId]
    );

    await db.query(
      `INSERT INTO agent_workers (agent_profile, status, session_id, last_seen_at, org_id) VALUES ($1, 'offline', 'offline-sess', now(), $2)`,
      [profileSlug, defaultOrgId]
    );

    const tokenRes = await db.query(`SELECT generate_agent_gateway_token($1) as raw_token`, [testAgentId]);
    const validToken = tokenRes.rows[0].raw_token;

    // ── Test 1: Message Queued while Agent Offline ───────────────────────────────
    console.log("\n[Test 1] Testing Message Dispatch to Offline Agent...");

    // Insert user message in DB
    await db.query(
      `INSERT INTO messages (channel_id, sender_name, sender_role, text, is_agent, org_id)
       VALUES ($1, 'CEO', 'Workspace CEO', 'Offline test message for catch-up delivery.', false, $2)`,
      [channelId, defaultOrgId]
    );

    // Queue job in dispatch_jobs (simulating /api/v1/dispatch when agent is offline)
    const context_payload = {
      user_text: "Offline test message for catch-up delivery.",
      sender_name: "CEO",
      sender_role: "Workspace CEO",
      channel_id: channelId,
      target_agent: "Test Phase6 Agent",
      profile_slug: profileSlug,
      org_id: defaultOrgId,
    };

    const idempotencyKey = `phase6-queued-${Date.now()}`;
    const queuedJobRes = await db.query(
      `INSERT INTO dispatch_jobs (org_id, channel_id, agent_id, status, context_payload, idempotency_key)
       VALUES ($1, $2, $3, 'queued', $4, $5)
       RETURNING id`,
      [defaultOrgId, channelId, testAgentId, context_payload, idempotencyKey]
    );
    const queuedJobId = queuedJobRes.rows[0].id;

    console.log(`✓ Offline job queued in dispatch_jobs (Job ID: ${queuedJobId}). Status: 'queued'.`);

    // Verify worker status is still offline
    const workerCheck1 = await db.query(`SELECT status FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    if (workerCheck1.rows[0]?.status !== "offline") {
      console.error(`❌ Test 1 Failed: agent_workers status is not 'offline'! Found:`, workerCheck1.rows);
      passed = false;
    } else {
      console.log("✓ Verified agent_workers status is 'offline' and job is safely queued!");
    }

    // ── Test 2: Reconnection Catch-Up Delivery ──────────────────────────────────
    console.log("\n[Test 2] Testing Automatic Catch-Up Delivery upon Agent Reconnection...");

    // Start Relay Server
    relayWss = startRelayServer(TEST_PORT);
    await new Promise((r) => setTimeout(r, 500));

    // Start Agent Connector (simulating agent machine starting & reconnecting)
    console.log("🚀 Agent machine starting... Connecting Agent Connector via IDENTIFY...");
    connector = new AgentConnector({
      token: validToken,
      relayUrl: `ws://127.0.0.1:${TEST_PORT}`,
      mockMode: true,
    });
    connector.start();

    // Wait 2 seconds for IDENTIFY, outbox drain, Hermes execution, and reply DB save
    await new Promise((r) => setTimeout(r, 2000));

    // Check agent_workers status flipped to 'online'
    const workerCheck2 = await db.query(`SELECT status FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    if (workerCheck2.rows[0]?.status !== "online") {
      console.error(`❌ Test 2 Failed: agent_workers status did not flip to 'online'!`);
      passed = false;
    } else {
      console.log("✓ agent_workers status flipped to 'online'!");
    }

    // Check queued dispatch job was delivered
    const jobCheck = await db.query(`SELECT status, sequence FROM dispatch_jobs WHERE id = $1`, [queuedJobId]);
    if (jobCheck.rows.length === 0 || jobCheck.rows[0].status !== "delivered") {
      console.error(`❌ Test 2 Failed: queued dispatch_job was NOT delivered upon reconnect! Status:`, jobCheck.rows);
      passed = false;
    } else {
      console.log(`✓ Queued dispatch job ${queuedJobId} was automatically delivered on reconnect! (Seq #${jobCheck.rows[0].sequence})`);
    }

    // Check agent reply landed in messages table with content_blocks
    const agentMsgCheck = await db.query(
      `SELECT text, content_blocks, is_agent FROM messages WHERE channel_id = $1 AND is_agent = true`,
      [channelId]
    );

    if (agentMsgCheck.rows.length === 0) {
      console.error("❌ Test 2 Failed: Agent reply did not land in messages table!");
      passed = false;
    } else {
      const msgRow = agentMsgCheck.rows[0];
      console.log("Agent Catch-Up Reply written to DB:", msgRow.text);
      console.log("✓ Test 2 Passed! Queued message delivered & agent reply written to DB automatically on reconnect!");
    }

    // Cleanup
    console.log("\n[Cleanup] Cleaning up test records...");
    await db.query(`DELETE FROM messages WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM dispatch_jobs WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE id = $1`, [testAgentId]);

    if (passed) {
      console.log("\n==========================================");
      console.log("🎉 PHASE 6 TEST SUITE FULLY PASSED!");
      console.log("==========================================");
    } else {
      console.error("\n❌ PHASE 6 TEST SUITE FAILED.");
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

testPhase6();
