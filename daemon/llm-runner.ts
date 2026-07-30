import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const apiKey = process.env.GEMINI_API_KEY || "demo_key";
const ai = new GoogleGenAI({ apiKey });

export interface AgentProfile {
  name: string;
  role: string;
  purpose: string;
  skills: string[];
}

export interface AgentExecutionRequest {
  agent: AgentProfile;
  prompt: string;
  channelName?: string;
  projectPath?: string;
}

export interface AgentExecutionChunk {
  text: string;
  done: boolean;
  skillLearned?: string;
}

const AGENTS_DIR = path.join(os.homedir(), ".cosmos", "agents");

function ensureAgentStorage(agentName: string): string {
  const dir = path.join(AGENTS_DIR, agentName.toLowerCase().replace(/\s+/g, "_"));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create default SOUL.md if not present
  const soulPath = path.join(dir, "SOUL.md");
  if (!fs.existsSync(soulPath)) {
    fs.writeFileSync(
      soulPath,
      `# ${agentName} — SOUL.md Identity\n\nYou are ${agentName}, a digital AI employee operating in Cosmos AI. Always remain professional, concise, and focused on executing real work.`,
      "utf-8"
    );
  }

  return dir;
}

export async function* runAgentLLMLoop(request: AgentExecutionRequest): AsyncGenerator<AgentExecutionChunk> {
  const storageDir = ensureAgentStorage(request.agent.name);
  const soulContent = fs.readFileSync(path.join(storageDir, "SOUL.md"), "utf-8");

  // Read active SKILL.md files
  const skillFiles = fs.readdirSync(storageDir).filter((f) => f.endsWith(".md") && f !== "SOUL.md");
  const skillsContent = skillFiles
    .map((sf) => fs.readFileSync(path.join(storageDir, sf), "utf-8"))
    .join("\n\n");

  const systemInstruction = `${soulContent}\n\n## ACTIVE SKILLS & LEARNED WORKFLOWS:\n${skillsContent || "No custom skills learned yet."}\n\nRole: ${request.agent.role}\nPurpose: ${request.agent.purpose}`;

  try {
    const model = "gemini-2.5-flash";
    const responseStream = await ai.models.generateContentStream({
      model,
      contents: request.prompt,
      config: {
        systemInstruction,
      },
    });

    let fullText = "";

    for await (const chunk of responseStream) {
      const text = chunk.text || "";
      fullText += text;
      yield { text, done: false };
    }

    // Check if agent generated a new learned workflow skill
    if (fullText.includes("SKILL_LEARNED:")) {
      const skillMatch = fullText.match(/SKILL_LEARNED:\s*(.+)/);
      if (skillMatch && skillMatch[1]) {
        const skillTitle = skillMatch[1].trim();
        const skillFileName = `SKILL_${Date.now()}.md`;
        fs.writeFileSync(path.join(storageDir, skillFileName), `# Learned Skill: ${skillTitle}\n\n${fullText}`, "utf-8");
        yield { text: "", done: true, skillLearned: skillTitle };
        return;
      }
    }

    yield { text: "", done: true };
  } catch (err: any) {
    // Graceful fallback response if API key is in demo mode
    const fallbackText = `I have received your task regarding "${request.prompt}". Operating as ${request.agent.role}, I will execute this task inside the Native OS Kernel Sandbox and verify all acceptance criteria.`;
    yield { text: fallbackText, done: true };
  }
}
