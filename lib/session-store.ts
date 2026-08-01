import fs from "fs";
import path from "path";

const SESSION_FILE_PATH = path.join(process.cwd(), ".sessions.json");

interface SessionMap {
  [channelName: string]: string;
}

function loadSessions(): SessionMap {
  try {
    if (fs.existsSync(SESSION_FILE_PATH)) {
      const data = fs.readFileSync(SESSION_FILE_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error reading .sessions.json:", e);
  }
  return {};
}

function saveSessions(sessions: SessionMap): void {
  try {
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(sessions, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing .sessions.json:", e);
  }
}

export function getOrCreateSessionId(channelName: string): string {
  const sessions = loadSessions();
  const cleanName = (channelName || "general").toLowerCase().trim();

  if (!sessions[cleanName]) {
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    sessions[cleanName] = `session-${cleanName}-${randomSuffix}`;
    saveSessions(sessions);
  }

  return sessions[cleanName];
}
