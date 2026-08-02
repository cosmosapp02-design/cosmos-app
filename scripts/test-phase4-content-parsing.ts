import { Client } from "pg";
import path from "path";
import dotenv from "dotenv";
import { parseContentBlocks } from "../relay/content-parser";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DB_URL = process.env.DATABASE_URL!;

async function testPhase4() {
  console.log("=== Phase 4 Verification Test Suite (Rich Content & Mention Parsing) ===");
  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  let passed = true;

  try {
    const orgAId = "00000000-0000-0000-0000-000000000001";
    const orgBId = "99999999-9999-9999-9999-999999999999";
    const zaraAgentAId = "33333333-3333-3333-3333-333333333333";
    const zaraAgentBId = "44444444-4444-4444-4444-444444444444";

    // Setup Orgs & Agents for Mention Resolution Testing
    await db.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Org B') ON CONFLICT DO NOTHING`, [orgBId]);
    await db.query(
      `INSERT INTO agents (id, name, role, org_id, status) VALUES ($1, 'Zara', 'Marketing Specialist', $2, 'active') ON CONFLICT (id) DO NOTHING`,
      [zaraAgentAId, orgAId]
    );
    await db.query(
      `INSERT INTO agents (id, name, role, org_id, status) VALUES ($1, 'Zara', 'Marketing Specialist Org B', $2, 'active') ON CONFLICT (id) DO NOTHING`,
      [zaraAgentBId, orgBId]
    );

    // ── Test 1: Rich Block Extraction ──────────────────────────────────────────
    console.log("\n[Test 1] Testing Rich Block Extraction (thinking, heading, code, body)...");
    const sampleRawText = `
<think>
Evaluating architectural constraints and gateway sockets.
</think>

## System Architecture

Here is the setup script for the relay:

\`\`\`typescript
const server = startRelayServer(8085);
console.log("Relay started");
\`\`\`
`;

    const blocks1 = await parseContentBlocks(sampleRawText, orgAId, db);
    console.log("Parsed Blocks Output 1:", JSON.stringify(blocks1, null, 2));

    const thinkingBlock = blocks1.find(b => b.type === "thinking");
    const headingBlock = blocks1.find(b => b.type === "heading");
    const codeBlock = blocks1.find(b => b.type === "code");
    const bodyBlock = blocks1.find(b => b.type === "body");

    if (!thinkingBlock || !thinkingBlock.text?.includes("Evaluating architectural constraints")) {
      console.error("❌ Test 1 Failed: Thinking block not extracted!");
      passed = false;
    } else {
      console.log("✓ Thinking block extracted cleanly.");
    }

    if (!headingBlock || headingBlock.level !== 2 || headingBlock.text !== "System Architecture") {
      console.error("❌ Test 1 Failed: Heading block level/text incorrect!");
      passed = false;
    } else {
      console.log("✓ Heading block level 2 extracted cleanly.");
    }

    if (!codeBlock || codeBlock.lang !== "typescript" || !codeBlock.text?.includes("startRelayServer")) {
      console.error("❌ Test 1 Failed: Code block language or text incorrect!");
      passed = false;
    } else {
      console.log("✓ Code block (lang: typescript) extracted cleanly.");
    }

    if (!bodyBlock) {
      console.error("❌ Test 1 Failed: Body block text missing!");
      passed = false;
    } else {
      console.log("✓ Body block extracted cleanly.");
    }

    // ── Test 2: Org-Scoped Mention Resolution ──────────────────────────────────
    console.log("\n[Test 2] Testing Org-Scoped Mention Resolution...");
    const sampleMentionText = `Hey @Zara, please review the proposal. CC @FakeAgentNameDoesNotExist for awareness.`;

    const blocks2 = await parseContentBlocks(sampleMentionText, orgAId, db);
    console.log("Parsed Blocks Output 2:", JSON.stringify(blocks2, null, 2));

    const mentionBlock = blocks2.find(b => b.type === "mention");
    const fakeMentionInBlocks = blocks2.find(b => b.type === "mention" && b.raw === "@FakeAgentNameDoesNotExist");

    if (!mentionBlock || mentionBlock.target_id !== zaraAgentAId || mentionBlock.raw !== "@Zara") {
      console.error(`❌ Test 2 Failed: @Zara failed to resolve to Org A's agent ID ${zaraAgentAId}! Found:`, mentionBlock);
      passed = false;
    } else {
      console.log(`✓ @Zara resolved cleanly to Org A agent UUID (${zaraAgentAId}).`);
    }

    if (fakeMentionInBlocks) {
      console.error("❌ Test 2 Failed: Made-up name @FakeAgentNameDoesNotExist was incorrectly treated as a mention!");
      passed = false;
    } else {
      console.log("✓ Made-up name @FakeAgentNameDoesNotExist was kept as plain body text!");
    }

    // Test cross-org isolation
    const blocksOrgB = await parseContentBlocks(sampleMentionText, orgBId, db);
    const mentionBlockOrgB = blocksOrgB.find(b => b.type === "mention");
    if (!mentionBlockOrgB || mentionBlockOrgB.target_id !== zaraAgentBId) {
      console.error(`❌ Test 2 Failed: Cross-org isolation error! Org B query did not resolve to Org B's agent ID ${zaraAgentBId}`);
      passed = false;
    } else {
      console.log("✓ Cross-org isolation verified: Org B query resolved to Org B agent UUID.");
    }

    // Cleanup
    console.log("\n[Cleanup] Cleaning up test records...");
    await db.query(`DELETE FROM agents WHERE id IN ($1, $2)`, [zaraAgentAId, zaraAgentBId]);
    await db.query(`DELETE FROM organizations WHERE id = $1`, [orgBId]);

    if (passed) {
      console.log("\n==========================================");
      console.log("🎉 PHASE 4 TEST SUITE FULLY PASSED!");
      console.log("==========================================");
    } else {
      console.error("\n❌ PHASE 4 TEST SUITE FAILED.");
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Test error:", err);
    process.exit(1);
  } finally {
    await db.end();
  }
}

testPhase4();
