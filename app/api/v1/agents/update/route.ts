import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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

    const profilePath = path.join(PROFILES_DIR, profileName);

    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
    }

    const soulFilePath = path.join(profilePath, "SOUL.md");
    const soulContent = `## Role
${role}

## System Instructions & Persona
${soul || description || `You are ${name}, working as ${role} on the Cosmos AI platform.`}
`;

    fs.writeFileSync(soulFilePath, soulContent, "utf-8");

    // Update in Supabase if reachable
    try {
      const { supabase } = await import("@/app/lib/supabase");
      await supabase
        .from("agents")
        .update({
          role,
          purpose: description || soul || `${role} AI worker.`,
          primary_model: primaryModel || "nvidia/nemotron-3-super-12",
          backup_model: backupModel || "claude-3-5-sonnet",
        })
        .ilike("name", name);
    } catch (e) {
      console.warn("Supabase agent update warning:", e);
    }

    return NextResponse.json({
      success: true,
      message: `Agent ${name} updated successfully!`,
      profileName,
      soulContent,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
