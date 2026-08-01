import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const KANBAN_DB_PATH = "/Users/cosmos/.hermes/kanban/boards/cosmos-enterprise-platform/kanban.db";

export async function GET(req: NextRequest) {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = async (data: object) => {
    try {
      await writer.write(encoder.encode(`event: task_event\ndata: ${JSON.stringify(data)}\n\n`));
    } catch (e) {}
  };

  let lastMtime = 0;
  try {
    if (fs.existsSync(KANBAN_DB_PATH)) {
      lastMtime = fs.statSync(KANBAN_DB_PATH).mtimeMs;
    }
  } catch (e) {}

  // Send initial ping
  sendEvent({ type: "connected", message: "Subscribed to Hermes Kanban WebSocket task_events" });

  const interval = setInterval(async () => {
    try {
      if (fs.existsSync(KANBAN_DB_PATH)) {
        const currentMtime = fs.statSync(KANBAN_DB_PATH).mtimeMs;
        if (currentMtime > lastMtime) {
          lastMtime = currentMtime;
          await sendEvent({
            type: "task_updated",
            timestamp: Date.now(),
            board: "cosmos-enterprise-platform",
          });
        }
      }
    } catch (e) {}
  }, 2000);

  req.signal.addEventListener("abort", () => {
    clearInterval(interval);
    try {
      writer.close();
    } catch (e) {}
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
