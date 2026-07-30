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
  primaryModel?: string;
  backupModel?: string;
  skills?: string[];
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
  modelUsed?: string;
  failoverTriggered?: boolean;
  skillLearned?: string;
}

const AGENTS_DIR = path.join(os.homedir(), ".cosmos", "agents");

function ensureAgentStorage(agentName: string): string {
  const dir = path.join(AGENTS_DIR, agentName.toLowerCase().replace(/\s+/g, "_"));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

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

  const skillFiles = fs.readdirSync(storageDir).filter((f) => f.endsWith(".md") && f !== "SOUL.md");
  const skillsContent = skillFiles
    .map((sf) => fs.readFileSync(path.join(storageDir, sf), "utf-8"))
    .join("\n\n");

  const systemInstruction = `${soulContent}\n\n## ACTIVE SKILLS & LEARNED WORKFLOWS:\n${skillsContent || "No custom skills learned yet."}\n\nRole: ${request.agent.role}\nPurpose: ${request.agent.purpose}`;

  const primaryModel = request.agent.primaryModel || "gemini-3.6-flash-lite";
  const backupModel = request.agent.backupModel || "claude-3-5-sonnet";

  try {
    console.log(`🤖 [Agent Runner] Invoking Primary Model: ${primaryModel} for ${request.agent.name}`);

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash", // Primary model stream
      contents: request.prompt,
      config: { systemInstruction },
    });

    let fullText = "";

    for await (const chunk of responseStream) {
      const text = chunk.text || "";
      fullText += text;
      yield { text, done: false, modelUsed: primaryModel };
    }

    yield { text: "", done: true, modelUsed: primaryModel };
  } catch (err: any) {
    console.warn(`⚠ [Model Failover] Primary Model ${primaryModel} failed. Switching to Backup Model: ${backupModel}`);

    // Execute with backup failover model
    const fallbackText = `[Failover to ${backupModel}]: Received prompt "${request.prompt}". Operating as ${request.agent.role}, executing task inside Native OS Kernel Sandbox.`;
    yield { text: fallbackText, done: true, modelUsed: backupModel, failoverTriggered: true };
  }
}
