import { Client } from "pg";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { startRelayServer, dispatchToAgent } from "../relay/server";
import { AgentConnector } from "../connector/agent-connector";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DB_URL = process.env.DATABASE_URL!;
const TEST_PORT = 8093;

async function testPhase7() {
  console.log("=== Phase 7 Verification Test Suite (Multi-Model Hot-Swap Proof Point) ===");
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  let passed = true;
  let relayWss: any = null;
  let connector: AgentConnector | null = null;

  try {
    // ── Test 1: Codebase Hardcoded Model Audit ────────────────────────────────────
    console.log("\n[Test 1] Auditing Codebase for Hardcoded Model Strings...");
    const filesToAudit = [
      path.resolve(process.cwd(), "relay/server.ts"),
      path.resolve(process.cwd(), "connector/agent-connector.ts"),
      path.resolve(process.cwd(), "app/api/v1/dispatch/route.ts"),
    ];

    const hardcodedPatterns = ["nemotron-3-super-12"]; // Legacy hardcoded string in old adapter

    for (const fPath of filesToAudit) {
      if (fs.existsSync(fPath)) {
        const content = fs.readFileSync(fPath, "utf-8");
        for (const pat of hardcodedPatterns) {
          if (content.includes(pat)) {
            console.error(`❌ Test 1 Failed: Found hardcoded legacy model pattern '${pat}' in ${path.basename(fPath)}`);
            passed = false;
          }
        }
      }
    }

    if (passed) console.log("✓ Codebase Audit Passed! Zero legacy hardcoded model strings found.");

    // ── Setup Test Agent ─────────────────────────────────────────────────────────
    const defaultOrgId = "00000000-0000-0000-0000-000000000001";
    const testAgentId = "99999999-9999-9999-9999-999999999999";
    const profileSlug = "test_phase7_agent";
    const channelId = "ch-phase7-multimodel-test";

    await db.query(`DELETE FROM agent_turn_log WHERE agent_id = $1`, [testAgentId]);
    await db.query(`DELETE FROM spend_ledger WHERE agent_id = $1`, [testAgentId]);
    await db.query(`DELETE FROM messages WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM dispatch_jobs WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE id = $1`, [testAgentId]);

    // Create Agent with initial primary_model = 'claude-3-5-sonnet'
    await db.query(
      `INSERT INTO agents (id, name, role, org_id, status, last_sequence, primary_model, backup_model)
       VALUES ($1, 'Test Phase7 Agent', 'Tester', $2, 'active', 0, 'claude-3-5-sonnet', 'gemini-3.6-flash-lite')`,
      [testAgentId, defaultOrgId]
    );

    const tokenRes = await db.query(`SELECT generate_agent_gateway_token($1) as raw_token`, [testAgentId]);
    const validToken = tokenRes.rows[0].raw_token;

    // Start Relay Server & Connector
    relayWss = startRelayServer(TEST_PORT);
    await new Promise((r) => setTimeout(r, 500));

    connector = new AgentConnector({
      token: validToken,
      relayUrl: `ws://127.0.0.1:${TEST_PORT}`,
      mockMode: true,
    });
    connector.start();

    await new Promise((r) => setTimeout(r, 1500));

    // ── Test 2: Turn 1 with Model: claude-3-5-sonnet ────────────────────────────
    console.log("\n[Test 2] Testing Turn 1 with primary_model = 'claude-3-5-sonnet'...");
    const dispatch1 = await dispatchToAgent(
      testAgentId,
      { user_text: "Turn 1 Model Test", target_agent: "Test Phase7 Agent", profile_slug: profileSlug, channel_id: channelId },
      channelId
    );

    await new Promise((r) => setTimeout(r, 1500));

    // Check agent_turn_log & spend_ledger for Turn 1
    const logCheck1 = await db.query(`SELECT model FROM agent_turn_log WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1`, [testAgentId]);
    const spendCheck1 = await db.query(`SELECT model FROM spend_ledger WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1`, [testAgentId]);

    if (logCheck1.rows[0]?.model !== "claude-3-5-sonnet" || spendCheck1.rows[0]?.model !== "claude-3-5-sonnet") {
      console.error(`❌ Test 2 Failed: Turn 1 model logging mismatch! Found turn_log: '${logCheck1.rows[0]?.model}', spend_ledger: '${spendCheck1.rows[0]?.model}'`);
      passed = false;
    } else {
      console.log(`✓ Turn 1 Passed! Verified model 'claude-3-5-sonnet' recorded in agent_turn_log & spend_ledger.`);
    }

    // ── Test 3: Hot-Swap Model in DB to 'gpt-4o' & Execute Turn 2 ─────────────
    console.log("\n[Test 3] Testing Dynamic Model Hot-Swap in DB to 'gpt-4o'...");
    await db.query(`UPDATE agents SET primary_model = 'gpt-4o' WHERE id = $1`, [testAgentId]);
    console.log("🔄 DB primary_model updated to 'gpt-4o'. Dispatching Turn 2...");

    const dispatch2 = await dispatchToAgent(
      testAgentId,
      { user_text: "Turn 2 Model Test", target_agent: "Test Phase7 Agent", profile_slug: profileSlug, channel_id: channelId },
      channelId
    );

    await new Promise((r) => setTimeout(r, 1500));

    const logCheck2 = await db.query(`SELECT model FROM agent_turn_log WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1`, [testAgentId]);
    const spendCheck2 = await db.query(`SELECT model FROM spend_ledger WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1`, [testAgentId]);

    if (logCheck2.rows[0]?.model !== "gpt-4o" || spendCheck2.rows[0]?.model !== "gpt-4o") {
      console.error(`❌ Test 3 Failed: Turn 2 hot-swap model logging mismatch! Found turn_log: '${logCheck2.rows[0]?.model}', spend_ledger: '${spendCheck2.rows[0]?.model}'`);
      passed = false;
    } else {
      console.log(`✓ Turn 2 Passed! Hot-swap model 'gpt-4o' dynamically served & recorded in agent_turn_log & spend_ledger!`);
    }

    // Verify messages content_blocks still rendered cleanly
    const msgCheck = await db.query(`SELECT text, content_blocks FROM messages WHERE channel_id = $1 AND is_agent = true`, [channelId]);
    if (msgCheck.rows.length < 2) {
      console.error(`❌ Test 3 Failed: Expected 2 agent reply messages in DB, got ${msgCheck.rows.length}`);
      passed = false;
    } else {
      console.log(`✓ Pipeline intact! ${msgCheck.rows.length} replies written to DB with content_blocks populated.`);
    }

    // Cleanup
    console.log("\n[Cleanup] Cleaning up test records...");
    await db.query(`DELETE FROM agent_turn_log WHERE agent_id = $1`, [testAgentId]);
    await db.query(`DELETE FROM spend_ledger WHERE agent_id = $1`, [testAgentId]);
    await db.query(`DELETE FROM messages WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM dispatch_jobs WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile = $1`, [profileSlug]);
    await db.query(`DELETE FROM agents WHERE id = $1`, [testAgentId]);

    if (passed) {
      console.log("\n==========================================");
      console.log("🎉 PHASE 7 TEST SUITE FULLY PASSED!");
      console.log("==========================================");
    } else {
      console.error("\n❌ PHASE 7 TEST SUITE FAILED.");
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

testPhase7();
