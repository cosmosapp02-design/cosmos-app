import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { supabase } from "@/app/lib/supabase";

const PROFILES_DIR = "/Users/cosmos/.hermes/profiles";

export async function GET(req: NextRequest) {
  try {
    const syncedAgents: any[] = [];
    const syncedChannels: any[] = [];

    // Scan /Users/cosmos/.hermes/profiles
    if (fs.existsSync(PROFILES_DIR)) {
      const items = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith(".")) {
          const profileName = item.name.toLowerCase();
          const profileDirPath = path.join(PROFILES_DIR, item.name);
          const soulFilePath = path.join(profileDirPath, "SOUL.md");

          let role = "Specialist Agent";
          let soulContent = `You are ${item.name}, a Hermes profile agent.`;

          if (fs.existsSync(soulFilePath)) {
            try {
              soulContent = fs.readFileSync(soulFilePath, "utf-8");
              const roleMatch = soulContent.match(/## Role\s*\n([^\n#]+)/i);
              if (roleMatch && roleMatch[1]) {
                role = roleMatch[1].trim();
              }
            } catch (e) {}
          }

          // Format agent object
          const formattedName = item.name
            .split(/[-_]/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");

          const agentData = {
            name: formattedName,
            role,
            purpose: soulContent,
            primary_model: "nvidia/nemotron-3-super-12",
            backup_model: "claude-3-5-sonnet",
            skills: ["TypeScript", "API Integration", "Hermes Profile"],
            avatar_color: "#1E1F24",
          };

          syncedAgents.push(agentData);

          // Dedicated channel data
          const channelData = {
            name: profileName,
            type: "group",
            topic: `Dedicated channel for ${formattedName} (${role}) — /p/${profileName}`,
            agents: [formattedName],
          };

          syncedChannels.push(channelData);
        }
      }
    }

    // Try syncing with Supabase if reachable
    try {
      for (const ag of syncedAgents) {
        const { data: existing } = await supabase
          .from("agents")
          .select("id")
          .ilike("name", ag.name);

        if (!existing || existing.length === 0) {
          await supabase.from("agents").insert([ag]);
        }
      }

      for (const ch of syncedChannels) {
        const { data: existingCh } = await supabase
          .from("channels")
          .select("id")
          .eq("name", ch.name);

        if (!existingCh || existingCh.length === 0) {
          await supabase.from("channels").insert([ch]);
        }
      }
    } catch (e) {
      console.warn("Supabase sync warning:", e);
    }

    return NextResponse.json({
      success: true,
      agents: syncedAgents,
      channels: syncedChannels,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
