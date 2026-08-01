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
    const { name, profileName: pName } = body;

    const rawName = (pName || name || "").trim();
    if (!rawName) {
      return NextResponse.json({ error: "Profile name is required." }, { status: 400 });
    }

    const normalizedTarget = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Discover exact profile folder on disk
    let candidateProfiles: string[] = [
      rawName,
      rawName.toLowerCase().replace(/\s+/g, "-"),
      rawName.toLowerCase().replace(/\s+/g, "_"),
    ];

    if (fs.existsSync(PROFILES_DIR)) {
      const items = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith(".")) {
          const itemNormalized = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (itemNormalized === normalizedTarget || item.name.toLowerCase() === rawName.toLowerCase()) {
            if (!candidateProfiles.includes(item.name)) {
              candidateProfiles.unshift(item.name);
            }
          }
        }
      }
    }

    // Step 1: Run hermes profile delete -y for candidates
    for (const p of candidateProfiles) {
      try {
        const cmd = `${HERMES_BIN} profile delete -y ${p}`;
        await execPromise(cmd);
      } catch (e: any) {
        console.warn(`[hermes profile delete ${p}] warning:`, e.message);
      }

      // Remove directory if still present
      const profilePath = path.join(PROFILES_DIR, p);
      if (fs.existsSync(profilePath)) {
        try {
          fs.rmSync(profilePath, { recursive: true, force: true });
        } catch (e) {}
      }
    }

    // Step 2: Remove from Supabase agents and channels tables
    try {
      const { supabase } = await import("@/app/lib/supabase");

      // Delete agent records
      await supabase.from("agents").delete().ilike("name", `%${rawName}%`);
      await supabase.from("agents").delete().ilike("name", `%${normalizedTarget}%`);

      // Update channel records to mark as deactivated former employee (preserve chat history)
      for (const p of candidateProfiles) {
        await supabase.from("channels").update({
          is_deactivated: true,
          topic: "Former employee (No longer with organization)",
        }).ilike("name", p);
      }
    } catch (e) {
      console.warn("Supabase deletion warning:", e);
    }

    return NextResponse.json({
      success: true,
      message: `Profile '${rawName}' deleted successfully from Hermes CLI and workspace.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
