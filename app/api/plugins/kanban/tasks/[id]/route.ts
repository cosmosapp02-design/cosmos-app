import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);
const HERMES_BIN = "/Users/cosmos/.hermes/hermes-agent/venv/bin/hermes";
const BOARD_SLUG = "cosmos-enterprise-platform";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, assignee, priority, board = BOARD_SLUG } = body;

    if (!id) {
      return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
    }

    // Status mapping to Hermes CLI subcommands
    if (status) {
      const s = status.toLowerCase();
      let subCmd = "";
      if (s === "done" || s === "completed") {
        subCmd = `complete ${id}`;
      } else if (s === "qa-review" || s === "review") {
        subCmd = `block ${id}`;
      } else if (s === "in-progress" || s === "running" || s === "ready") {
        subCmd = `promote ${id}`;
      } else if (s === "backlog" || s === "todo") {
        subCmd = `unblock ${id}`;
      }

      if (subCmd) {
        try {
          await execPromise(`${HERMES_BIN} kanban --board ${board} ${subCmd}`);
        } catch (e: any) {
          console.warn(`[hermes kanban ${subCmd}] warning:`, e.message);
        }
      }
    }

    if (assignee) {
      const assigneeSlug = assignee.toLowerCase().replace(/\s+/g, "-");
      try {
        await execPromise(`${HERMES_BIN} kanban --board ${board} assign ${id} --assignee "${assigneeSlug}"`);
      } catch (e: any) {
        console.warn(`[hermes kanban assign] warning:`, e.message);
      }
    }

    // Update in Supabase DB if reachable
    try {
      const { supabase } = await import("@/app/lib/supabase");
      await supabase.from("kanban_tasks").update({ status, assignee }).eq("id", id);
    } catch (e) {}

    return NextResponse.json({
      success: true,
      id,
      status,
      message: `Task ${id} status updated to ${status} on board ${board}.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
