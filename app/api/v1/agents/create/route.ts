import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import util from "util";
import { Client } from "pg";
import { AgentConnector } from "../../../../../connector/agent-connector";
import { createClient } from "@supabase/supabase-js";

const execPromise = util.promisify(exec);

const HERMES_BIN = "/Users/cosmos/.hermes/hermes-agent/venv/bin/hermes";
const PROFILES_DIR = "/Users/cosmos/.hermes/profiles";
const FALLBACK_ORG_ID = "00000000-0000-0000-0000-000000000001";
const DB_URL = process.env.DATABASE_URL!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://erguibwskkljogogttgg.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const runningConnectors = new Map<string, AgentConnector>();

function getCleanProfileName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ""); // Single source of truth: strict alphanumeric only
}

/**
 * Resolves the org_id for the authenticated user.
 * - Reads the Supabase auth token from the Authorization header.
 * - Looks up the user's org membership in org_members.
 * - If no membership exists yet (new user), creates an org and adds them as owner.
 * Returns the resolved org_id.
 */
async function resolveUserOrgId(req: NextRequest, userId: string): Promise<string> {
  if (!userId) return FALLBACK_ORG_ID;

  const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    // Look up existing org membership
    const memberRes = await db.query(
      `SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (memberRes.rows.length > 0) {
      return memberRes.rows[0].org_id;
    }

    // No org exists yet — create one and register the user as owner
    const orgRes = await db.query(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
      [`Cosmos Workspace (${userId.slice(0, 8)})`]
    );
    const newOrgId = orgRes.rows[0].id;

    await db.query(
      `INSERT INTO org_members (user_id, org_id, role) VALUES ($1, $2, 'owner')`,
      [userId, newOrgId]
    );

    console.log(`✓ [Hire] Created new org ${newOrgId} for user ${userId}`);
    return newOrgId;
  } finally {
    await db.end();
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, role, description, soul, primaryModel, backupModel, userId } = body;

    if (!name || !role) {
      return NextResponse.json({ error: "Agent name and role are required." }, { status: 400 });
    }

    const profileName = getCleanProfileName(name);

    if (!profileName) {
      return NextResponse.json({ error: "Agent name must contain at least one letter or number." }, { status: 400 });
    }

    // Resolve the user's actual org_id before opening the stream
    const orgId = await resolveUserOrgId(req, userId || "");

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    const sendEvent = async (data: object) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    // Execute background steps asynchronously
    (async () => {
      try {
        // Step 1: Execute hermes profile create
        await sendEvent({
          step: 1,
          status: "running",
          message: `Executing: hermes profile create ${profileName} --clone`,
        });

        const cmd = `${HERMES_BIN} profile create ${profileName} --clone`;
        try {
          const { stdout, stderr } = await execPromise(cmd);
          console.log(`[hermes profile create] stdout:`, stdout);
          if (stderr) console.warn(`[hermes profile create] stderr:`, stderr);
        } catch (execErr: any) {
          console.warn(`[hermes profile create] output/warning:`, execErr.message);
        }

        await new Promise((r) => setTimeout(r, 600));

        // Step 2: Verify profile directory exists
        await sendEvent({
          step: 2,
          status: "running",
          message: `Verifying profile directory at ${PROFILES_DIR}/${profileName}...`,
        });

        const profilePath = path.join(PROFILES_DIR, profileName);
        if (!fs.existsSync(profilePath)) {
          fs.mkdirSync(profilePath, { recursive: true });
        }

        await sendEvent({
          step: 2,
          status: "running",
          message: `Profile directory verified: ${PROFILES_DIR}/${profileName}`,
        });

        await new Promise((r) => setTimeout(r, 600));

        // Step 3: Write SOUL.md configuration
        const soulFilePath = path.join(profilePath, "SOUL.md");
        const soulContent = `## Role
${role}

## System Instructions & Persona
${soul || description || `You are ${name}, working as ${role} on the Cosmos AI platform.`}
`;

        await sendEvent({
          step: 3,
          status: "running",
          message: `Updating SOUL.md at ${profilePath}/SOUL.md...`,
        });

        fs.writeFileSync(soulFilePath, soulContent, "utf-8");

        await new Promise((r) => setTimeout(r, 600));

        // Step 4: Register DB agent under user's org, generate gateway token, and write local config
        await sendEvent({
          step: 4,
          status: "running",
          message: `Registering agent in database under your workspace (org: ${orgId.slice(0, 8)}...) & generating gateway token...`,
        });

        let rawGatewayToken = "";
        let newAgentId = "";

        const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
        await db.connect();

        try {
          // Insert Agent Row scoped to user's actual org_id
          const agentIns = await db.query(
            `INSERT INTO agents (name, role, purpose, primary_model, backup_model, skills, avatar_color, status, org_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
             RETURNING id`,
            [
              name,
              role,
              description || soul || `${role} AI worker.`,
              primaryModel || "gemini-3.6-flash-lite",
              backupModel || "claude-3-5-sonnet",
              ["TypeScript", "API Integration", "Hermes Profile"],
              "#1E1F24",
              orgId,
            ]
          );

          newAgentId = agentIns.rows[0].id;

          // Generate Gateway Token via SQL Function
          const tokenRes = await db.query(`SELECT generate_agent_gateway_token($1) as raw_token`, [newAgentId]);
          rawGatewayToken = tokenRes.rows[0].raw_token;

          // Insert Dedicated Channel scoped to same org
          await db.query(
            `INSERT INTO channels (name, type, topic, agents, org_id)
             VALUES ($1, 'group', $2, $3, $4)`,
            [
              profileName,
              `Dedicated channel for ${name} (${role}) — /p/${profileName}`,
              [name],
              orgId,
            ]
          );

          // Insert initial agent_workers row in 'offline' state scoped to same org
          await db.query(
            `INSERT INTO agent_workers (agent_profile, status, session_id, last_seen_at, org_id)
             VALUES ($1, 'offline', $2, now(), $3)
             ON CONFLICT (agent_profile) DO UPDATE
             SET status = 'offline', last_seen_at = now(), org_id = EXCLUDED.org_id`,
            [profileName, `init-${newAgentId}`, orgId]
          );

          // Write raw token directly to local Hermes profile config file
          const tokenEnvPath = path.join(profilePath, "token.env");
          fs.writeFileSync(tokenEnvPath, `GATEWAY_TOKEN=${rawGatewayToken}\n`, "utf-8");
          console.log(`✓ [Hire Automation] Raw gateway token automatically written to ${tokenEnvPath}`);

          // Auto-start AgentConnector background process for this hired agent
          if (runningConnectors.has(profileName)) {
            try {
              runningConnectors.get(profileName)?.stop();
            } catch {}
          }

          const relayPort = parseInt(process.env.RELAY_PORT || "8085", 10);
          const connector = new AgentConnector({
            token: rawGatewayToken,
            hermesProfilePath: profilePath,
            relayUrl: `ws://127.0.0.1:${relayPort}`,
            mockMode: process.env.NODE_ENV === "test" || process.env.USE_MOCK_HERMES === "true",
          });

          connector.start();
          runningConnectors.set(profileName, connector);
          console.log(`🚀 [Hire Automation] Auto-started Gateway Relay Connector for ${name} (${profileName}) in org ${orgId}`);

        } finally {
          await db.end();
        }

        await new Promise((r) => setTimeout(r, 600));

        await sendEvent({
          step: 4,
          status: "completed",
          message: `Agent ${name} hired! Created Hermes profile '${profileName}', token config written, and connected over Gateway Relay.`,
          agent: {
            id: newAgentId,
            name,
            role,
            profileName,
            purpose: description || soul || `${role} AI worker.`,
            primaryModel: primaryModel || "gemini-3.6-flash-lite",
            backupModel: backupModel || "claude-3-5-sonnet",
            soulContent,
            status: "online",
            org_id: orgId,
          },
        });
      } catch (err: any) {
        console.error("Error in Hire pipeline:", err);
        await sendEvent({
          step: 0,
          status: "error",
          message: err.message || "Failed to create Hermes agent profile.",
        });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
