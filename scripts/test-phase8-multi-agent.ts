import { Client } from "pg";
import path from "path";
import dotenv from "dotenv";
import { startRelayServer, dispatchToAgent } from "../relay/server";
import { AgentConnector } from "../connector/agent-connector";
import { parseContentBlocks } from "../relay/content-parser";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DB_URL = process.env.DATABASE_URL!;
const TEST_PORT = 8094;

async function testPhase8() {
  console.log("=== Phase 8 Verification Test Suite (Multi-Agent Scaling & Inter-Agent Mentions) ===");
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  let passed = true;
  let relayWss: any = null;
  let connector1: AgentConnector | null = null;
  let connector2: AgentConnector | null = null;

  try {
    const orgAId = "00000000-0000-0000-0000-000000000001";
    const orgBId = "99999999-9999-9999-9999-999999999999";
    const agent1Id = "11111111-2222-3333-4444-555555555555"; // Zach Adams
    const agent2Id = "22222222-3333-4444-5555-666666666666"; // Sara Pate (Org A)
    const agent3Id = "33333333-4444-5555-6666-777777777777"; // Sara Pate (Org B)

    const slug1 = "zach_adams";
    const slug2 = "sara_pate";
    const channelId = "ch-phase8-multi-agent";

    // Clean up old records
    await db.query(`DELETE FROM messages WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM dispatch_jobs WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile IN ($1, $2)`, [slug1, slug2]);
    await db.query(`DELETE FROM agents WHERE id IN ($1, $2, $3)`, [agent1Id, agent2Id, agent3Id]);
    await db.query(`DELETE FROM organizations WHERE id = $1`, [orgBId]);

    // Setup Orgs & Agents
    await db.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Org B') ON CONFLICT DO NOTHING`, [orgBId]);

    await db.query(
      `INSERT INTO agents (id, name, role, org_id, status, last_sequence, primary_model)
       VALUES ($1, 'Zach Adams', 'Product Manager', $2, 'active', 0, 'gemini-3.6-flash-lite')`,
      [agent1Id, orgAId]
    );

    await db.query(
      `INSERT INTO agents (id, name, role, org_id, status, last_sequence, primary_model)
       VALUES ($1, 'Sara Pate', 'Designer', $2, 'active', 0, 'claude-3-5-sonnet')`,
      [agent2Id, orgAId]
    );

    await db.query(
      `INSERT INTO agents (id, name, role, org_id, status, last_sequence, primary_model)
       VALUES ($1, 'Sara Pate', 'Designer Org B', $2, 'active', 0, 'gpt-4o')`,
      [agent3Id, orgBId]
    );

    const token1Res = await db.query(`SELECT generate_agent_gateway_token($1) as raw_token`, [agent1Id]);
    const token1 = token1Res.rows[0].raw_token;

    const token2Res = await db.query(`SELECT generate_agent_gateway_token($1) as raw_token`, [agent2Id]);
    const token2 = token2Res.rows[0].raw_token;

    // Start Relay Server
    relayWss = startRelayServer(TEST_PORT);
    await new Promise((r) => setTimeout(r, 500));

    // ── Test 1: Concurrent Dual-Agent Online Presence ──────────────────────────
    console.log("\n[Test 1] Testing Concurrent Dual-Agent Online Presence...");

    connector1 = new AgentConnector({
      token: token1,
      relayUrl: `ws://127.0.0.1:${TEST_PORT}`,
      mockMode: true,
    });

    connector2 = new AgentConnector({
      token: token2,
      relayUrl: `ws://127.0.0.1:${TEST_PORT}`,
      mockMode: true,
    });

    connector1.start();
    connector2.start();

    // Wait 1.5 seconds for both agents to IDENTIFY and establish online presence
    await new Promise((r) => setTimeout(r, 1500));

    const worker1Check = await db.query(`SELECT status, session_id FROM agent_workers WHERE agent_profile = $1`, [slug1]);
    const worker2Check = await db.query(`SELECT status, session_id FROM agent_workers WHERE agent_profile = $1`, [slug2]);

    if (
      worker1Check.rows[0]?.status !== "online" ||
      worker2Check.rows[0]?.status !== "online" ||
      worker1Check.rows[0]?.session_id === worker2Check.rows[0]?.session_id
    ) {
      console.error("❌ Test 1 Failed: Both agents are not online with distinct session IDs!", worker1Check.rows, worker2Check.rows);
      passed = false;
    } else {
      console.log(`✓ Both Zach Adams (session: ${worker1Check.rows[0].session_id}) and Sara Pate (session: ${worker2Check.rows[0].session_id}) are online concurrently!`);
    }

    // ── Test 2: Independent Route Isolation (No Cross-Talk) ─────────────────────
    console.log("\n[Test 2] Testing Independent Route Isolation (No Cross-Talk)...");

    await dispatchToAgent(
      agent1Id,
      { user_text: "Zach, what is the product roadmap?", target_agent: "Zach Adams", profile_slug: slug1 },
      channelId
    );

    // Wait 3 seconds for WebSocket round-trip & DB persistence
    await new Promise((r) => setTimeout(r, 3000));

    const msg1Check = await db.query(
      `SELECT sender_name, text FROM messages WHERE channel_id = $1`,
      [channelId]
    );

    if (msg1Check.rows.length === 0 || !msg1Check.rows.some(r => r.sender_name === "Zach Adams")) {
      console.error("❌ Test 2 Failed: Zach Adams did not receive or reply to message 1!", msg1Check.rows);
      passed = false;
    } else {
      console.log(`✓ Message 1 routed strictly to Zach Adams (${msg1Check.rows[0].sender_name}): "${msg1Check.rows[0].text.slice(0, 80)}"`);
    }

    // ── Test 3: Inter-Agent Mention & Chaining in Same Org ──────────────────────
    console.log("\n[Test 3] Testing Inter-Agent Mention & Chaining in Same Org...");

    const chainPrompt = "Zach, please review product designs with @Sara_Pate.";
    console.log(`🚀 Dispatching message to Zach: "${chainPrompt}"`);

    const mockReplyWithMention = "I have reviewed the specs. @Sara_Pate please prepare the design mockups for the team.";

    await db.query(
      `INSERT INTO messages (channel_id, sender_name, sender_role, text, is_agent, org_id)
       VALUES ($1, 'CEO', 'Workspace CEO', $2, false, $3)`,
      [channelId, chainPrompt, orgAId]
    );

    const zachSession = Array.from((await import("../relay/server")).activeSessions.values()).find(s => s.agentId === agent1Id);

    if (zachSession) {
      const blocks = await parseContentBlocks(mockReplyWithMention, orgAId, db);
      const mentionBlock = blocks.find(b => b.type === "mention");

      if (!mentionBlock || mentionBlock.target_id !== agent2Id) {
        console.error(`❌ Test 3 Failed: Mention @Sara_Pate did not resolve to Sara Pate's agent ID ${agent2Id}!`, blocks);
        passed = false;
      } else {
        console.log(`✓ Mention @Sara_Pate resolved to Sara Pate's agent ID (${agent2Id}).`);
      }

      const mockWsMsg = {
        op: "DISPATCH",
        d: {
          reply_text: mockReplyWithMention,
          channel_id: channelId,
          sender_name: "Zach Adams",
          profile_slug: slug1,
          original_user_text: chainPrompt,
        },
      };

      zachSession.ws.emit("message", JSON.stringify(mockWsMsg));
      await new Promise((r) => setTimeout(r, 3000));

      const saraReplyCheck = await db.query(
        `SELECT sender_name, text FROM messages WHERE channel_id = $1 AND sender_name = 'Sara Pate'`,
        [channelId]
      );

      if (saraReplyCheck.rows.length === 0) {
        console.error("❌ Test 3 Failed: Inter-agent chaining failed! Sara Pate did not reply to mention!");
        passed = false;
      } else {
        console.log(`✓ Inter-agent chaining successful! Sara Pate replied automatically (${saraReplyCheck.rows[0].sender_name}): "${saraReplyCheck.rows[0].text.slice(0, 80)}"`);
      }
    } else {
      console.error("❌ Test 3 Failed: Zach Adams session not found in activeSessions!");
      passed = false;
    }

    // ── Test 4: Cross-Org Mention Boundary Enforcement ─────────────────────────
    console.log("\n[Test 4] Testing Cross-Org Mention Boundary Enforcement...");
    const crossOrgText = "Checking mention resolution for @Sara_Pate in Org B...";
    const blocksOrgB = await parseContentBlocks(crossOrgText, orgBId, db);
    const mentionOrgB = blocksOrgB.find(b => b.type === "mention");

    if (!mentionOrgB || mentionOrgB.target_id !== agent3Id) {
      console.error(`❌ Test 4 Failed: Org B mention did not resolve to Org B agent ${agent3Id}! Found:`, mentionOrgB);
      passed = false;
    } else {
      console.log(`✓ Cross-org boundary enforced! Mention in Org B resolved strictly to Org B agent UUID (${agent3Id}) and NOT Org A.`);
    }

    // Cleanup
    console.log("\n[Cleanup] Cleaning up test records...");
    await db.query(`DELETE FROM messages WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM dispatch_jobs WHERE channel_id = $1`, [channelId]);
    await db.query(`DELETE FROM agent_workers WHERE agent_profile IN ($1, $2)`, [slug1, slug2]);
    await db.query(`DELETE FROM agents WHERE id IN ($1, $2, $3)`, [agent1Id, agent2Id, agent3Id]);
    await db.query(`DELETE FROM organizations WHERE id = $1`, [orgBId]);

    if (passed) {
      console.log("\n==========================================");
      console.log("🎉 PHASE 8 TEST SUITE FULLY PASSED!");
      console.log("==========================================");
    } else {
      console.error("\n❌ PHASE 8 TEST SUITE FAILED.");
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Test error:", err);
    process.exit(1);
  } finally {
    if (connector1) connector1.stop();
    if (connector2) connector2.stop();
    if (relayWss) relayWss.close();
    await db.end();
  }
}

testPhase8();
