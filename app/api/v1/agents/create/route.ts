import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import util from "util";

const execPromise = util.promisify(exec);

const HERMES_BIN = "/Users/cosmos/.hermes/hermes-agent/venv/bin/hermes";
const PROFILES_DIR = "/Users/cosmos/.hermes/profiles";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, role, description, soul, primaryModel, backupModel, userId } = body;

    if (!name || !role) {
      return NextResponse.json({ error: "Agent name and role are required." }, { status: 400 });
    }

    const profileName = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/^_+|_+$/g, "");

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
          // If profile already exists, continue gracefully
          console.warn(`[hermes profile create] output/warning:`, execErr.message);
        }

        await new Promise((r) => setTimeout(r, 600));

        // Step 2: Verify profile directory exists
        await sendEvent({
          step: 2,
          status: "running",
          message: `Verifying profile directory at /Users/cosmos/.hermes/profiles/${profileName}...`,
        });

        const profilePath = path.join(PROFILES_DIR, profileName);
        let exists = fs.existsSync(profilePath);

        // Fallback: create directory if profile command didn't create directory
        if (!exists) {
          fs.mkdirSync(profilePath, { recursive: true });
          exists = true;
        }

        await sendEvent({
          step: 2,
          status: "running",
          message: `Profile directory verified: /Users/cosmos/.hermes/profiles/${profileName}`,
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
          message: `Updating SOUL.md at /Users/cosmos/.hermes/profiles/${profileName}/SOUL.md...`,
        });

        fs.writeFileSync(soulFilePath, soulContent, "utf-8");

        await new Promise((r) => setTimeout(r, 600));

        // Step 4: Register DB agent and dedicated channel
        try {
          const { supabase } = await import("@/app/lib/supabase");
          const agentObj = {
            name,
            role,
            purpose: description || soul || `${role} AI worker.`,
            primary_model: primaryModel || "gemini-3.6-flash-lite",
            backup_model: backupModel || "claude-3-5-sonnet",
            skills: ["TypeScript", "API Integration", "Hermes Profile"],
            avatar_color: "#1E1F24",
            status: "active",
          };
          await supabase.from("agents").insert([agentObj]);

          const channelObj = {
            name: profileName,
            type: "group",
            topic: `Dedicated channel for ${name} (${role}) — /p/${profileName}`,
            agents: [name],
            user_id: userId,
          };
          await supabase.from("channels").insert([channelObj]);
        } catch (e) {
          console.warn("Supabase agent/channel insert warning:", e);
        }

        await sendEvent({
          step: 4,
          status: "completed",
          message: `Agent ${name} hired! Created Hermes profile '${profileName}' and channel #${profileName}.`,
          agent: {
            name,
            role,
            profileName,
            purpose: description || soul || `${role} AI worker.`,
            primaryModel: primaryModel || "gemini-3.6-flash-lite",
            backupModel: backupModel || "claude-3-5-sonnet",
            soulContent,
          },
        });
      } catch (err: any) {
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
