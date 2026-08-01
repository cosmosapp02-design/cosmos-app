import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);
const HERMES_BIN = "/Users/cosmos/.hermes/hermes-agent/venv/bin/hermes";
const PRIMARY_BOARD = "cosmos-enterprise-platform";

export async function GET(req: NextRequest) {
  try {
    // 1. Discover all boards
    const boards = [PRIMARY_BOARD, "default"];
    try {
      const { stdout: boardsStdout } = await execPromise(`${HERMES_BIN} kanban boards list`);
      const lines = boardsStdout.split("\n");
      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2 && !line.includes("SLUG") && !line.includes("Current")) {
          const slug = parts[0].replace("●", "").trim();
          if (slug && !boards.includes(slug)) {
            boards.push(slug);
          }
        }
      });
    } catch (e) {}

    // 2. Fetch tasks from all discovered Hermes kanban boards
    const allHermesTasks: any[] = [];

    for (const boardSlug of boards) {
      try {
        const cmd = `${HERMES_BIN} kanban --board ${boardSlug} list --json`;
        const { stdout } = await execPromise(cmd);
        if (stdout.trim()) {
          const parsed = JSON.parse(stdout);
          if (Array.isArray(parsed)) {
            allHermesTasks.push(...parsed);
          }
        }
      } catch (e: any) {
        console.warn(`Hermes kanban list for board '${boardSlug}' warning:`, e.message);
      }
    }

    // 3. Try fetching Supabase backup tasks
    let dbTasks: any[] = [];
    try {
      const { supabase } = await import("@/app/lib/supabase");
      const { data } = await supabase.from("kanban_tasks").select("*");
      if (data) dbTasks = data;
    } catch (e) {}

    // 4. Merge tasks into unified array
    const taskMap = new Map<string, any>();
    let kanbanIndex = 1;

    allHermesTasks.forEach((ht: any) => {
      // Map Hermes status to board column status: backlog | in-progress | qa-review | done
      let status: "backlog" | "in-progress" | "qa-review" | "done" = "backlog";
      const s = (ht.status || "").toLowerCase();
      if (s === "done" || s === "completed" || s === "archived") {
        status = "done";
      } else if (s === "review" || s === "review-required" || s === "qa" || s === "blocked") {
        status = "qa-review";
      } else if (s === "running" || s === "ready" || s === "in_progress" || s === "in-progress") {
        status = "in-progress";
      } else {
        status = "backlog";
      }

      // Map priority
      let priority: "high" | "medium" | "low" = "medium";
      const p = ht.priority || 50;
      if (p >= 80) priority = "high";
      else if (p < 40) priority = "low";

      const assigneeRaw = ht.assignee || "Dev-Bot";
      const assigneeFormatted = assigneeRaw
        .split(/[-_]/)
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      // Derive key
      let taskKey = `KAN-00${kanbanIndex++}`;
      if (ht.id.startsWith("KAN-")) {
        taskKey = ht.id;
      } else if (ht.id === "t_9f13db97") {
        taskKey = "KAN-001";
      }

      taskMap.set(ht.id, {
        id: ht.id,
        key: taskKey,
        title: ht.title,
        assignee: assigneeFormatted,
        assigneeColor: "#1E1F24",
        priority,
        tags: ht.skills && ht.skills.length > 0 ? ht.skills : ["Hermes", "Kanban"],
        status,
        points: Math.max(1, Math.round((ht.priority || 50) / 20)),
        dueDate: ht.started_at ? new Date(ht.started_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Aug 05",
        startDate: new Date(ht.created_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        epicId: "epic-1",
        description: ht.body || ht.title,
        subtasks: [
          { id: `st-${ht.id}-1`, title: "Hermes CLI Worker dispatch", completed: status === "done" },
          { id: `st-${ht.id}-2`, title: "Code review & PR verification", completed: status === "done" || status === "qa-review" },
        ],
        comments: ht.result ? [{ sender: assigneeFormatted, text: ht.result, time: "Recently" }] : [],
        hermesRaw: ht,
      });
    });

    dbTasks.forEach((dt: any) => {
      if (!taskMap.has(dt.id)) {
        taskMap.set(dt.id, dt);
      }
    });

    return NextResponse.json({
      success: true,
      tasks: Array.from(taskMap.values()),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, assignee, priority, points, board = PRIMARY_BOARD } = body;

    if (!title) {
      return NextResponse.json({ error: "Task title is required." }, { status: 400 });
    }

    const assigneeSlug = (assignee || "dev").toLowerCase().replace(/\s+/g, "-");
    const priorityVal = priority === "high" ? 90 : priority === "low" ? 20 : 50;

    // Create via hermes kanban create
    let createdTaskId = `t_${Date.now().toString(36)}`;
    try {
      const cmd = `${HERMES_BIN} kanban --board ${board} create "${title.replace(/"/g, '\\"')}" --assignee "${assigneeSlug}" --priority ${priorityVal} --body "${(description || title).replace(/"/g, '\\"')}" --json`;
      const { stdout } = await execPromise(cmd);
      if (stdout.trim()) {
        const parsed = JSON.parse(stdout);
        if (parsed && parsed.id) createdTaskId = parsed.id;
      }
    } catch (e: any) {
      console.warn("Hermes kanban create warning:", e.message);
    }

    // Insert to Supabase DB
    try {
      const { supabase } = await import("@/app/lib/supabase");
      await supabase.from("kanban_tasks").insert([{
        id: createdTaskId,
        title,
        description: description || title,
        assignee: assignee || "Dev-Bot",
        priority: priority || "medium",
        status: "backlog",
        points: points || 3,
      }]);
    } catch (e) {}

    return NextResponse.json({
      success: true,
      taskId: createdTaskId,
      message: `Task ${createdTaskId} created on Hermes board ${board}.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
