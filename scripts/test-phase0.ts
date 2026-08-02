import { Client } from "pg";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const dbUrl = process.env.DATABASE_URL!;

async function testPhase0() {
  console.log("=== Phase 0 Verification Test Suite ===");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let passed = true;

  try {
    // 1. Audit Columns on All Required Tables (except organizations itself)
    console.log("\n[Test 1] Auditing org_id & new gateway columns across tables...");
    const tablesToAuditOrgId = [
      "org_members", "agents", "channels", "threads",
      "messages", "agent_workers", "agent_gateways", "dispatch_jobs",
      "agent_turn_log", "spend_ledger", "tasks"
    ];

    for (const tbl of tablesToAuditOrgId) {
      const res = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = 'org_id'`,
        [tbl]
      );
      if (res.rows.length === 0) {
        console.error(`❌ Table ${tbl} missing org_id column!`);
        passed = false;
      }
    }

    // Audit new columns on specific tables
    const agentCols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'agents'`);
    const agentColNames = agentCols.rows.map(r => r.column_name);
    if (!agentColNames.includes("gateway_token_hash")) {
      console.error("❌ agents missing gateway_token_hash");
      passed = false;
    }
    if (!agentColNames.includes("last_sequence")) {
      console.error("❌ agents missing last_sequence");
      passed = false;
    }

    const workerCols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_workers'`);
    const workerColNames = workerCols.rows.map(r => r.column_name);
    if (!workerColNames.includes("session_id")) {
      console.error("❌ agent_workers missing session_id");
      passed = false;
    }
    if (!workerColNames.includes("last_heartbeat_at")) {
      console.error("❌ agent_workers missing last_heartbeat_at");
      passed = false;
    }

    const msgCols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'messages'`);
    const msgColNames = msgCols.rows.map(r => r.column_name);
    if (!msgColNames.includes("content_blocks")) {
      console.error("❌ messages missing content_blocks");
      passed = false;
    }

    if (passed) console.log("✓ Column Audit Passed!");

    // 2. Test RLS Enablement on all 11 tables
    console.log("\n[Test 2] Checking RLS enablement on all tables...");
    const allTables = ["organizations", ...tablesToAuditOrgId];
    for (const tbl of allTables) {
      const rlsRes = await client.query(
        `SELECT relrowsecurity FROM pg_class WHERE relname = $1`,
        [tbl]
      );
      if (rlsRes.rows.length > 0 && !rlsRes.rows[0].relrowsecurity) {
        console.error(`❌ Table ${tbl} does not have RLS enabled!`);
        passed = false;
      }
    }
    if (passed) console.log("✓ RLS Enablement Audit Passed!");

    // 3. Test Multi-Tenant RLS Policy Isolation
    console.log("\n[Test 3] Testing Multi-Tenant Data Isolation with RLS...");
    const dummyOrgId = "99999999-9999-9999-9999-999999999999";
    const dummyUserId = "88888888-8888-8888-8888-888888888888";
    const primaryUserId = "11111111-1111-1111-1111-111111111111";
    const defaultOrgId = "00000000-0000-0000-0000-000000000001";
    const testChannelId = "22222222-2222-2222-2222-222222222222";

    // Clean up test channel & members first
    await client.query(`DELETE FROM channels WHERE id = $1`, [testChannelId]);
    await client.query(`DELETE FROM org_members WHERE user_id IN ($1, $2)`, [dummyUserId, primaryUserId]);
    await client.query(`DELETE FROM organizations WHERE id = $1`, [dummyOrgId]);

    // Setup orgs & members
    await client.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Dummy Test Org') ON CONFLICT DO NOTHING`, [dummyOrgId]);
    await client.query(`INSERT INTO org_members (user_id, org_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`, [dummyUserId, dummyOrgId]);
    await client.query(`INSERT INTO org_members (user_id, org_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`, [primaryUserId, defaultOrgId]);

    // Insert dummy channel in default org
    await client.query(`
      INSERT INTO channels (id, name, org_id) VALUES ($1, 'default-channel-test', $2) ON CONFLICT DO NOTHING
    `, [testChannelId, defaultOrgId]);

    // Test RLS as Dummy User inside transaction
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE authenticated`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${dummyUserId}', true)`);

    const dummyChannelRead = await client.query(`SELECT * FROM channels WHERE name = 'default-channel-test'`);
    if (dummyChannelRead.rows.length > 0) {
      console.error("❌ RLS Failure! Dummy user saw channels from default org!");
      passed = false;
    } else {
      console.log("✓ Dummy user saw 0 rows from primary org (RLS isolated!).");
    }
    await client.query("ROLLBACK");

    // Test RLS as Primary User inside transaction
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE authenticated`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${primaryUserId}', true)`);
    const primaryChannelRead = await client.query(`SELECT * FROM channels WHERE name = 'default-channel-test'`);
    if (primaryChannelRead.rows.length === 0) {
      console.error("❌ RLS Error! Primary user could not see their own org channel!");
      passed = false;
    } else {
      console.log("✓ Primary user successfully saw their own org channel.");
    }
    await client.query("ROLLBACK");

    // 4. Test Gateway Token Generation & Hashing
    console.log("\n[Test 4] Testing Gateway Token Generation function & SHA-256 Hashing...");
    const testAgentRes = await client.query(`SELECT id FROM agents LIMIT 1`);
    if (testAgentRes.rows.length === 0) {
      await client.query(`INSERT INTO agents (id, name, role, org_id) VALUES ('77777777-7777-7777-7777-777777777777', 'Test Agent', 'Tester', $1)`, [defaultOrgId]);
    }
    const targetAgentId = testAgentRes.rows[0]?.id || '77777777-7777-7777-7777-777777777777';

    const tokenRes = await client.query(`SELECT generate_agent_gateway_token($1) as raw_token`, [targetAgentId]);
    const rawToken = tokenRes.rows[0].raw_token;

    if (!rawToken || !rawToken.startsWith("gtw_")) {
      console.error("❌ Token generation failed or format incorrect!");
      passed = false;
    } else {
      console.log(`✓ Token generated cleanly: gtw_*** (length: ${rawToken.length})`);
    }

    // Check DB record for hash
    const agentCheck = await client.query(`SELECT gateway_token_hash FROM agents WHERE id = $1`, [targetAgentId]);
    const storedHash = agentCheck.rows[0].gateway_token_hash;
    const expectedHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    if (storedHash !== expectedHash) {
      console.error(`❌ Stored hash mismatch! Got ${storedHash}, expected ${expectedHash}`);
      passed = false;
    } else {
      console.log("✓ Stored hash in DB matches SHA-256 hash of raw token.");
    }

    // Ensure raw token is not stored plain text anywhere
    const plainCheck = await client.query(
      `SELECT * FROM agents WHERE gateway_token_hash = $1`,
      [rawToken]
    );
    if (plainCheck.rows.length > 0) {
      console.error("❌ CRITICAL SECURITY FAILURE: Raw token stored in plain text!");
      passed = false;
    } else {
      console.log("✓ Verified raw token is NOT stored in plain text anywhere in DB.");
    }

    // Clean up dummy test data
    console.log("\n[Cleanup] Cleaning up test records...");
    await client.query(`DELETE FROM channels WHERE id = $1`, [testChannelId]);
    await client.query(`DELETE FROM org_members WHERE user_id IN ($1, $2)`, [dummyUserId, primaryUserId]);
    await client.query(`DELETE FROM organizations WHERE id = $1`, [dummyOrgId]);

    if (passed) {
      console.log("\n==========================================");
      console.log("🎉 PHASE 0 TEST SUITE FULLY PASSED!");
      console.log("==========================================");
    } else {
      console.error("\n❌ PHASE 0 TEST SUITE FAILED.");
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Test error:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

testPhase0();
