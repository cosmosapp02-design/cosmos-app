import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);
const HERMES_BIN = "/Users/cosmos/.hermes/hermes-agent/venv/bin/hermes";
const BOARD_SLUG = "cosmos-enterprise-platform";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const board = searchParams.get("board") || BOARD_SLUG;

    if (!id) {
      return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
    }

    let runsOutput = "";
    try {
      const cmd = `${HERMES_BIN} kanban --board ${board} runs ${id}`;
      const { stdout } = await execPromise(cmd);
      runsOutput = stdout;
    } catch (e: any) {
      console.warn(`[hermes kanban runs ${id}] warning:`, e.message);
    }

    const runs: any[] = [];
    if (runsOutput.trim()) {
      const lines = runsOutput.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
      lines.forEach((line, idx) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const runNumber = parts[0] || `${idx + 1}`;
          const outcome = parts[1] || "completed";
          const workerRaw = parts[2] || "Dev-Bot";
          const elapsed = parts[3] || "45s";
          const dateStr = parts.slice(4).join(" ") || "Just now";

          const workerFormatted = workerRaw
            .split(/[-_]/)
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");

          runs.push({
            runNumber,
            worker: workerFormatted,
            outcome: outcome.replace(/[()]/g, ""),
            duration: elapsed,
            timestamp: dateStr,
            summary: `Run ${runNumber}: Worker ${workerFormatted} executed task with outcome ${outcome}.`,
          });
        }
      });
    }

    // Fallback run if none returned yet
    if (runs.length === 0) {
      runs.push({
        runNumber: "1",
        worker: "Dev-Bot",
        outcome: "queued",
        duration: "0s",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        summary: `Task ${id} queued for Hermes agent dispatcher execution.`,
      });
    }

    return NextResponse.json({
      success: true,
      taskId: id,
      runs,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
