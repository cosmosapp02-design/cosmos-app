import { Client } from "pg";
import path from "path";
import dotenv from "dotenv";
import { startRelayServer, dispatchToAgent } from "../relay/server";
import { AgentConnector } from "../connector/agent-connector";
import { parseContentBlocks } from "../relay/content-parser";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DB_URL = process.env.DATABASE_URL!;
const TEST_PORT = 8091;

async function testPhase5() {
  console.log("=== Phase 5 Verification Test Suite (Backend & DB Integration) ===");
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  let passed = true;
  let relayWss: any = null;
  let connector: AgentConnector | null = null;

  try {
    const defaultOrgId = "00000000-0000-0000-0000-000000000001";
    const testAgentId = "22222222-2222-2222-2222-222222222222";
    const profileSlug = "test_phase5_agent";
    const channelId = "ch-phase5-integration";

    // Clean up old test data
    await db.query(`DELETE FROM messages WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM dispatch_jobs WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE id = $1`, [testAgentId]);

    // Insert Agent
    await db.query(
      `INSERT INTO agents (id, name, role, org_id, status, last_sequence) VALUES ($1, 'Test Phase5 Agent', 'Tester', $2, 'active', 0)`,
      [testAgentId, defaultOrgId]
    );

    const tokenRes = await db.query(`SELECT generate_agent_gateway_token($1) as raw_token`, [testAgentId]);
    const validToken = tokenRes.rows[0].raw_token;

    // Start Relay Server
    relayWss = startRelayServer(TEST_PORT);
    await new Promise((r) => setTimeout(r, 500));

    // Start Agent Connector
    connector = new AgentConnector({
      token: validToken,
      relayUrl: `ws://127.0.0.1:${TEST_PORT}`,
      mockMode: true,
    });
    connector.start();

    // Wait for connector online presence
    await new Promise((r) => setTimeout(r, 1500));

    // ── Test 1: End-to-End Dispatch & DB Message Save ───────────────────────────
    console.log("\n[Test 1] Testing End-to-End Dispatch & Message DB Persistence with content_blocks...");

    // Insert user message
    const userMsgRes = await db.query(
      `INSERT INTO messages (channel_id, sender_name, sender_role, text, is_agent, org_id)
       VALUES ($1, 'CEO', 'Workspace CEO', 'Hey @Test Phase5 Agent, please provide status.', false, $2)
       RETURNING id`,
      [channelId, defaultOrgId]
    );

    // Dispatch via Relay Server directly
    const userPayload = {
      user_text: "Hey @Test Phase5 Agent, please provide status.",
      sender_name: "CEO",
      sender_role: "Workspace CEO",
      channel_id: channelId,
      target_agent: "Test Phase5 Agent",
      profile_slug: profileSlug,
      org_id: defaultOrgId,
    };

    const dispatchRes = await dispatchToAgent(testAgentId, userPayload, channelId);
    console.log(`✓ Message dispatched over Gateway socket (Seq #${dispatchRes.sequence}).`);

    // Wait for connector to process & reply to land in DB
    await new Promise((r) => setTimeout(r, 1500));

    // Verify agent response written to messages table
    const agentMsgRes = await db.query(
      `SELECT text, content_blocks, is_agent, org_id FROM messages WHERE channel_id = $1 AND is_agent = true`,
      [channelId]
    );

    if (agentMsgRes.rows.length === 0) {
      console.error("❌ Test 1 Failed: No agent reply written to messages table!");
      passed = false;
    } else {
      const msgRow = agentMsgRes.rows[0];
      const blocks = typeof msgRow.content_blocks === "string" ? JSON.parse(msgRow.content_blocks) : msgRow.content_blocks;

      console.log("Agent Message written to DB:", msgRow.text);
      console.log("Content Blocks stored in DB:", JSON.stringify(blocks, null, 2));

      if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
        console.error("❌ Test 1 Failed: content_blocks was NOT stored/populated properly!");
        passed = false;
      } else {
        console.log("✓ Test 1 Passed! Agent reply written to DB with content_blocks populated!");
      }
    }

    // Verify dispatch job was delivered (not stuck in queued/running)
    const jobCheck = await db.query(`SELECT status FROM dispatch_jobs WHERE id = $1`, [dispatchRes.jobId]);
    if (jobCheck.rows.length === 0 || jobCheck.rows[0].status !== "delivered") {
      console.error(`❌ Test 1 Failed: dispatch_job status is stuck in ${jobCheck.rows[0]?.status}`);
      passed = false;
    } else {
      console.log("✓ Verified dispatch_jobs row is marked 'delivered' (0 stuck jobs!).");
    }

    // ── Test 2: Exec Path Retirement Verification ─────────────────────────────
    console.log("\n[Test 2] Verifying Legacy Exec Path Retirement...");
    const adapterFile = path.resolve(process.cwd(), "app/lib/supabase-gateway-adapter.ts");
    const adapterCode = require("fs").readFileSync(adapterFile, "utf-8");

    if (adapterCode.includes('child_process') || adapterCode.includes('execAsync')) {
      console.error("❌ Test 2 Failed: Legacy child_process / execAsync still imported in supabase-gateway-adapter.ts!");
      passed = false;
    } else {
      console.log("✓ Test 2 Passed! Verified child_process & execAsync completely removed from Gateway Adapter!");
    }

    // ── Test 3: Cross-Org Query Isolation ──────────────────────────────────────
    console.log("\n[Test 3] Testing Cross-Org Query Isolation under new path...");
    const dummyOrgId = "88888888-8888-8888-8888-888888888888";
    const dummyUserId = "77777777-7777-7777-7777-777777777777";

    await db.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Org B Test') ON CONFLICT DO NOTHING`, [dummyOrgId]);
    await db.query(`INSERT INTO org_members (user_id, org_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`, [dummyUserId, dummyOrgId]);

    // Query messages as Org B user
    await db.query("BEGIN");
    await db.query(`SET LOCAL ROLE authenticated`);
    await db.query(`SELECT set_config('request.jwt.claim.sub', '${dummyUserId}', true)`);

    const orgBMessages = await db.query(`SELECT * FROM messages WHERE channel_id = $1`, [channelId]);
    await db.query("ROLLBACK");

    if (orgBMessages.rows.length > 0) {
      console.error("❌ Test 3 Failed: Org B user retrieved messages from default org!");
      passed = false;
    } else {
      console.log("✓ Test 3 Passed! Org B user returned 0 rows from Org A messages!");
    }

    // Cleanup
    console.log("\n[Cleanup] Cleaning up test records...");
    await db.query(`DELETE FROM messages WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM dispatch_jobs WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE id = $1`, [testAgentId]);
    await db.query(`DELETE FROM org_members WHERE user_id = $1`, [dummyUserId]);
    await db.query(`DELETE FROM organizations WHERE id = $1`, [dummyOrgId]);

    if (passed) {
      console.log("\n==========================================");
      console.log("🎉 PHASE 5 TEST SUITE FULLY PASSED!");
      console.log("==========================================");
    } else {
      console.error("\n❌ PHASE 5 TEST SUITE FAILED.");
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

testPhase5();
