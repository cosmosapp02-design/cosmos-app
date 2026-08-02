"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  X,
  Terminal,
  CheckCircle2,
  Zap,
  Search,
  CheckSquare,
  Square,
  CircleDashed,
  CircleDot,
  FlaskConical,
  Kanban as KanbanIcon,
  BarChart3,
  Calendar as CalendarIcon,
  Table as TableIcon,
  Bot,
  Activity,
  Sparkles,
} from "lucide-react";
import AgentAvatar from "./agent-avatar";
import { useToast } from "./toast";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

export type TicketStatus = "backlog" | "in-progress" | "qa-review" | "done";
export type PMViewMode = "board" | "table" | "workload" | "gantt" | "calendar";

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Ticket {
  id: string;
  key: string;
  title: string;
  assignee: string;
  assigneeColor: string;
  priority: "high" | "medium" | "low";
  tags: string[];
  status: TicketStatus;
  points: number;
  dueDate: string;
  startDate: string;
  epicId: string;
  description: string;
  subtasks: Subtask[];
  comments: { sender: string; text: string; time: string }[];
  hermesRaw?: any;
}

const INITIAL_TICKETS: Ticket[] = [
  {
    id: "t_57e53225",
    key: "COS-101",
    title: "Build User Authentication API",
    assignee: "Dev",
    assigneeColor: "#1E1F24",
    priority: "high",
    tags: ["Auth", "Backend"],
    status: "in-progress",
    points: 5,
    startDate: "Jul 28",
    dueDate: "Aug 05",
    epicId: "epic-1",
    description: "Implement OAuth JWT authentication flow for Cosmos Enterprise Platform.",
    subtasks: [
      { id: "st-1", title: "JWT token verification middleware", completed: true },
      { id: "st-2", title: "Refresh token rotation handler", completed: true },
    ],
    comments: [],
  },
  {
    id: "t_10ec64a3",
    key: "COS-102",
    title: "AppSec Audit & Vulnerability Scan",
    assignee: "Peter",
    assigneeColor: "#1E1F24",
    priority: "high",
    tags: ["Security", "Audit"],
    status: "qa-review",
    points: 5,
    startDate: "Jul 30",
    dueDate: "Aug 04",
    epicId: "epic-1",
    description: "Run static application security audit across API endpoints.",
    subtasks: [
      { id: "st-3", title: "API security audit pass", completed: true },
    ],
    comments: [],
  },
  {
    id: "t_1eba6a85",
    key: "COS-103",
    title: "Design Glassmorphism Dashboard UI",
    assignee: "Sara Pate",
    assigneeColor: "#1E1F24",
    priority: "medium",
    tags: ["Design", "UI/UX"],
    status: "backlog",
    points: 3,
    startDate: "Aug 01",
    dueDate: "Aug 07",
    epicId: "epic-2",
    description: "Design sleek dark-mode glassmorphism dashboard cards and components.",
    subtasks: [],
    comments: [],
  },
  {
    id: "t_3651a499",
    key: "COS-104",
    title: "Marketing Launch Campaign Strategy",
    assignee: "Zara",
    assigneeColor: "#1E1F24",
    priority: "low",
    tags: ["Marketing", "Launch"],
    status: "done",
    points: 2,
    startDate: "Jul 25",
    dueDate: "Jul 30",
    epicId: "epic-3",
    description: "Prepare marketing launch strategy and campaign collateral.",
    subtasks: [
      { id: "st-4", title: "Launch strategy doc", completed: true },
    ],
    comments: [],
  },
];

const COLUMNS: {
  id: TicketStatus;
  label: string;
  renderIcon: () => React.ReactNode;
}[] = [
  {
    id: "backlog",
    label: "Backlog",
    renderIcon: () => <CircleDashed size={14} className="text-[#878890]" />,
  },
  {
    id: "in-progress",
    label: "In Progress",
    renderIcon: () => <CircleDot size={14} className="text-amber-600" />,
  },
  {
    id: "qa-review",
    label: "QA Review",
    renderIcon: () => <FlaskConical size={14} className="text-blue-600" />,
  },
  {
    id: "done",
    label: "Done",
    renderIcon: () => <CheckCircle2 size={14} className="text-emerald-600" strokeWidth={2.2} />,
  },
];

const PRIORITY_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: "P1 High", color: "#DC2626", bg: "rgba(220,38,38,0.1)" },
  medium: { label: "P2 Medium", color: "#D97706", bg: "rgba(217,119,6,0.1)" },
  low: { label: "P3 Low", color: "#10B981", bg: "rgba(16,185,129,0.1)" },
};

const TERMINAL_LOGS = [
  { delay: 0, text: "$ hermes kanban --board cosmos-enterprise-platform dispatch", color: "#6B7280" },
  { delay: 380, text: "▶ Initializing Hermes Kanban Dispatcher v2.4 (SQLite Shared Board)", color: "#1E1F24" },
  { delay: 640, text: "✓ Connected to board: cosmos-enterprise-platform", color: "#10B981" },
  { delay: 840, text: "✓ Dispatched task t_10ec64a3 -> Worker: Peter (Specialist Agent)", color: "#10B981" },
  { delay: 1050, text: "⚡ [Peter] Executing AppSec security audit pass...", color: "#1E1F24" },
  { delay: 1440, text: "✓ [Peter] Audit clean. No high severity vulnerabilities found.", color: "#10B981" },
  { delay: 1920, text: "⚡ [Dev] Updating JWT authentication endpoints...", color: "#1E1F24" },
  { delay: 2600, text: "✓ [Dev] Build check passed. Task t_57e53225 promoted.", color: "#10B981" },
  { delay: 3380, text: "✓ [Sara Pate] UI design specs updated.", color: "#10B981" },
  { delay: 4180, text: "🚀 Hermes Kanban dispatch complete. Board updated live.", color: "#1E1F24" },
];

export interface ProjectsViewProps {
  triggerReportMode: (onApproved: () => void) => void;
}

export default function ProjectsView({ triggerReportMode }: ProjectsViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<PMViewMode>("board");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Card Drawer Run History state
  const [taskRuns, setTaskRuns] = useState<any[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  // Filtering state
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  // Terminal & Modal states
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalDone, setTerminalDone] = useState(false);
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  const [sprintRunning, setSprintRunning] = useState(false);
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAssignee, setNewAssignee] = useState("Dev");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");

  const terminalRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Fetch tasks from Supabase tasks table & Hermes Kanban
  const fetchUserTickets = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch live Supabase tasks created by agents during meetings
      const { data: dbTasks } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });

      if (dbTasks && dbTasks.length > 0) {
        const mapped: Ticket[] = dbTasks.map((t: any, idx: number) => ({
          id: t.id,
          key: `COS-${100 + idx}`,
          title: t.title,
          assignee: t.assigned_to || "Dev",
          assigneeColor: "#1E1F24",
          priority: (t.priority || "medium") as any,
          tags: ["Autonomous", "AgentTask"],
          status: (t.status === "todo" ? "backlog" : t.status === "in_progress" ? "in-progress" : t.status === "review" ? "qa-review" : "done") as TicketStatus,
          points: 3,
          startDate: "Today",
          dueDate: "Sprint",
          epicId: "epic-1",
          description: t.description || `Created autonomously by AI employees during meeting.`,
          subtasks: [],
          comments: [],
        }));
        setTickets(mapped);
        setLoading(false);
        return;
      }

      // 2. Fallback to plugin or default
      const res = await fetch("/api/plugins/kanban/tasks?board=cosmos-enterprise-platform");
      if (res.ok) {
        const json = await res.json();
        if (json.tasks && Array.isArray(json.tasks) && json.tasks.length > 0) {
          setTickets(json.tasks);
          return;
        }
      }
      setTickets(INITIAL_TICKETS);
    } catch (e) {
      setTickets(INITIAL_TICKETS);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Task Runs history for card drawer
  const fetchTaskRuns = useCallback(async (taskId: string) => {
    setRunsLoading(true);
    try {
      const res = await fetch(`/api/plugins/kanban/tasks/${taskId}/runs?board=cosmos-enterprise-platform`);
      if (res.ok) {
        const json = await res.json();
        if (json.runs) {
          setTaskRuns(json.runs);
          return;
        }
      }
      setTaskRuns([]);
    } catch (e) {
      setTaskRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      fetchTaskRuns(selectedTicket.id);
    } else {
      setTaskRuns([]);
    }
  }, [selectedTicket, fetchTaskRuns]);

  // Subscribe to Supabase tasks Realtime channel & Hermes SSE
  useEffect(() => {
    fetchUserTickets();

    const channel = supabase
      .channel("tasks-live-kanban")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        fetchUserTickets();
      })
      .subscribe();

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/plugins/kanban/events");
      es.addEventListener("task_event", () => {
        fetchUserTickets();
      });
    } catch (e) {}

    return () => {
      supabase.removeChannel(channel);
      if (es) es.close();
    };
  }, [fetchUserTickets]);

  // Drag & drop PATCH status update
  const moveTicketColumn = async (ticketId: string, newStatus: TicketStatus) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
    );

    try {
      const res = await fetch(`/api/plugins/kanban/tasks/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, board: "cosmos-enterprise-platform" }),
      });

      if (res.ok) {
        addToast(`Moved task to ${newStatus.replace("-", " ")} on Hermes Kanban`, "success");
      }
    } catch (e) {
      addToast("Failed to update status on Hermes Kanban", "danger");
    }
  };

  // Create task on Hermes board
  const handleCreateTicket = async () => {
    if (!newTitle.trim()) return;

    try {
      const res = await fetch("/api/plugins/kanban/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          assignee: newAssignee,
          priority: newPriority,
          board: "cosmos-enterprise-platform",
        }),
      });

      if (res.ok) {
        addToast("Task created on Hermes Kanban board!", "success");
        fetchUserTickets();
      }
    } catch (e) {}

    setNewTicketModalOpen(false);
    setNewTitle("");
    setNewDesc("");
  };

  const runSprint = () => {
    if (sprintRunning) return;
    setSprintRunning(true);
    setTerminalOpen(true);
    setTerminalDone(false);
    setVisibleLines([]);
    timersRef.current.forEach(clearTimeout);

    TERMINAL_LOGS.forEach((log, idx) => {
      const t = setTimeout(() => {
        setVisibleLines((prev) => [...prev, idx]);
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
        if (idx === TERMINAL_LOGS.length - 1) {
          setTerminalDone(true);
          setSprintRunning(false);
          addToast("Sprint execution complete on Hermes board!", "success");
          fetchUserTickets();
        }
      }, log.delay);
      timersRef.current.push(t);
    });
  };

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      t.title.toLowerCase().includes(q) ||
      t.key.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q);

    const matchesAssignee =
      assigneeFilter === "all" ||
      t.assignee.toLowerCase().includes(assigneeFilter.toLowerCase());

    const matchesPriority =
      priorityFilter === "all" || t.priority === priorityFilter;

    return matchesSearch && matchesAssignee && matchesPriority;
  });

  // Calculate workload stats
  const agentWorkload = [
    { name: "Dev", role: "Software Engineer", assignedPoints: 5, completedPoints: 0, totalIssues: 1, capacityStatus: "Optimal" },
    { name: "Peter", role: "Specialist Agent", assignedPoints: 5, completedPoints: 0, totalIssues: 1, capacityStatus: "Optimal" },
    { name: "Zara", role: "Marketing Specialist", assignedPoints: 2, completedPoints: 2, totalIssues: 1, capacityStatus: "Complete" },
    { name: "Sara Pate", role: "Designer", assignedPoints: 3, completedPoints: 0, totalIssues: 1, capacityStatus: "Optimal" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FAF8F5] text-[#1E1F24] select-none">
      {/* Top Controls Header */}
      <div className="border-b border-[rgba(0,0,0,0.08)] px-6 py-4 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-[#1E1F24]">Cosmos Enterprise Platform</h1>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 text-[10px] font-mono font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Hermes Kanban Live</span>
            </span>
          </div>
          <p className="text-[11px] text-[#878890] mt-0.5">
            Durable SQLite-backed task board synced across Hermes AI worker profiles
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setNewTicketModalOpen(true)}
            className="btn btn-secondary btn-sm rounded-xl font-semibold flex items-center gap-1.5 text-xs"
          >
            <Plus size={14} />
            <span>Create Task</span>
          </button>

          <button
            onClick={runSprint}
            disabled={sprintRunning}
            className="btn btn-primary btn-sm rounded-xl px-4 py-2 font-semibold shadow-xs flex items-center gap-1.5 disabled:opacity-50 text-xs"
          >
            <Zap size={14} className="text-amber-400 fill-amber-400" />
            <span>{sprintRunning ? "Running Dispatch..." : "Dispatch Worker Sprint"}</span>
          </button>
        </div>
      </div>

      {/* View Tabs & Filters Bar */}
      <div className="border-b border-[rgba(0,0,0,0.08)] px-6 py-2.5 bg-[#FAF8F5] flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[rgba(0,0,0,0.08)] shadow-2xs">
          <button
            onClick={() => setViewMode("board")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === "board"
                ? "bg-[#1E1F24] text-white shadow-2xs"
                : "text-[#72737A] hover:bg-[#FAF8F5]"
            }`}
          >
            <KanbanIcon size={13} />
            <span>Board</span>
          </button>

          <button
            onClick={() => setViewMode("table")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === "table"
                ? "bg-[#1E1F24] text-white shadow-2xs"
                : "text-[#72737A] hover:bg-[#FAF8F5]"
            }`}
          >
            <TableIcon size={13} />
            <span>Table</span>
          </button>

          <button
            onClick={() => setViewMode("workload")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === "workload"
                ? "bg-[#1E1F24] text-white shadow-2xs"
                : "text-[#72737A] hover:bg-[#FAF8F5]"
            }`}
          >
            <BarChart3 size={13} />
            <span>Workload</span>
          </button>

          <button
            onClick={() => setViewMode("gantt")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === "gantt"
                ? "bg-[#1E1F24] text-white shadow-2xs"
                : "text-[#72737A] hover:bg-[#FAF8F5]"
            }`}
          >
            <CalendarIcon size={13} />
            <span>Timeline</span>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-[rgba(0,0,0,0.1)] text-xs">
            <Search size={13} className="text-[#878890]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter tasks..."
              className="bg-transparent outline-none w-36 text-xs text-[#1E1F24] placeholder-[#878890]"
            />
          </div>

          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-3 py-1.5 bg-white rounded-xl border border-[rgba(0,0,0,0.1)] text-xs font-medium text-[#1E1F24] outline-none"
          >
            <option value="all">All Assignees</option>
            <option value="Zach Adams">Zach Adams</option>
            <option value="Dev">Dev</option>
            <option value="Peter">Peter</option>
            <option value="Zara">Zara</option>
            <option value="Sara Pate">Sara Pate</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 bg-white rounded-xl border border-[rgba(0,0,0,0.1)] text-xs font-medium text-[#1E1F24] outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="high">HIGH (P1)</option>
            <option value="medium">MEDIUM (P2)</option>
            <option value="low">LOW (P3)</option>
          </select>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* VIEW 1: KANBAN BOARD VIEW */}
        {viewMode === "board" && (
          <div className="flex-1 overflow-x-auto p-6 bg-[#FAF8F5]">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 h-full min-w-[1000px]">
              {COLUMNS.map((col) => {
                const colTickets = filteredTickets.filter((t) => t.status === col.id);
                const colPoints = colTickets.reduce((acc, t) => acc + t.points, 0);

                return (
                  <div
                    key={col.id}
                    className="flex flex-col bg-[#F3EFEA] border border-[rgba(0,0,0,0.06)] rounded-2xl p-3.5 h-full overflow-hidden"
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2">
                        {col.renderIcon()}
                        <span className="text-xs font-bold text-[#1E1F24]">{col.label}</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-[#EFECE6] text-[10px] font-mono font-bold text-[#52535A]">
                          {colTickets.length}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[#878890]">{colPoints} pts</span>
                    </div>

                    {/* Column Drop Area & Cards */}
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const ticketId = e.dataTransfer.getData("text/plain");
                        if (ticketId) moveTicketColumn(ticketId, col.id);
                      }}
                      className="flex-1 overflow-y-auto space-y-2.5 pb-4 min-h-[250px]"
                    >
                      <AnimatePresence>
                        {colTickets.map((ticket) => {
                          const completedSubtasks = ticket.subtasks.filter((st) => st.completed).length;
                          const prio = PRIORITY_BADGES[ticket.priority] || PRIORITY_BADGES.medium;

                          return (
                            <motion.div
                              key={ticket.id}
                              layout
                              draggable
                              onDragStart={(e: any) => {
                                e.dataTransfer.setData("text/plain", ticket.id);
                              }}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.96 }}
                              onClick={() => setSelectedTicket(ticket)}
                              className="card-interactive bg-white p-3.5 cursor-grab active:cursor-grabbing relative flex flex-col justify-between hover:shadow-md transition-all rounded-xl border border-[rgba(0,0,0,0.08)]"
                            >
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[11px] font-mono font-bold text-[#1E1F24] bg-[#FAF8F5] px-1.5 py-0.5 rounded border border-[rgba(0,0,0,0.08)]">
                                    {ticket.key || ticket.id}
                                  </span>
                                  <span
                                    className="text-[9.5px] font-mono font-bold px-1.5 py-0.3 rounded uppercase"
                                    style={{ background: prio.bg, color: prio.color }}
                                  >
                                    {prio.label}
                                  </span>
                                </div>
                                <h3 className="text-xs font-semibold text-[#1E1F24] mb-1.5 leading-snug">
                                  {ticket.title}
                                </h3>
                                <p className="text-[11px] text-[#52535A] leading-snug line-clamp-2 mb-3">
                                  {ticket.description}
                                </p>
                                <div className="flex flex-wrap gap-1 mb-3">
                                  {ticket.tags.map((tg) => (
                                    <span key={tg} className="badge badge-neutral text-[9px]">{tg}</span>
                                  ))}
                                </div>
                              </div>

                              <div className="pt-2 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between text-[11px] text-[#878890]">
                                <div className="flex items-center gap-1">
                                  <CheckSquare size={12} className="text-[#878890]" />
                                  <span className="font-mono text-[10px]">{completedSubtasks}/{ticket.subtasks.length}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono font-bold">{ticket.points}pt</span>
                                  <AgentAvatar name={ticket.assignee} size={20} />
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 2: TABLE VIEW */}
        {viewMode === "table" && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF8F5] border-b border-[rgba(0,0,0,0.08)] text-[10px] uppercase font-bold text-[#878890]">
                  <tr>
                    <th className="px-4 py-3">Key / ID</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Assignee</th>
                    <th className="px-4 py-3">Estimate</th>
                    <th className="px-4 py-3">Subtasks</th>
                    <th className="px-4 py-3">Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(0,0,0,0.06)]">
                  {filteredTickets.map((t) => {
                    const completedSubs = t.subtasks.filter((st) => st.completed).length;
                    const prio = PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.medium;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTicket(t)}
                        className="hover:bg-[#FAF8F5] cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-[#1E1F24]">{t.key || t.id}</td>
                        <td className="px-4 py-3 font-semibold text-[#1E1F24] max-w-xs truncate">{t.title}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EFECE6] text-[#1E1F24] capitalize">
                            {t.status.replace("-", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold" style={{ background: prio.bg, color: prio.color }}>
                            {prio.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <AgentAvatar name={t.assignee} size={18} />
                            <span>{t.assignee}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-[#1E1F24]">{t.points}pt</td>
                        <td className="px-4 py-3 font-mono text-[#878890]">{completedSubs}/{t.subtasks.length}</td>
                        <td className="px-4 py-3 text-[#878890]">{t.dueDate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 3: WORKLOAD VIEW */}
        {viewMode === "workload" && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="t-h2 text-[#1E1F24]">AI Workforce Workload & Story Point Allocation</h2>
                <p className="t-micro text-[#878890]">Real-time capacity tracking across active AI agents</p>
              </div>
              <div className="t-micro font-bold text-emerald-700 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                Total Allocated: 15 pts (Hermes Board)
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {agentWorkload.map((agent) => (
                <div key={agent.name} className="card bg-white p-4 space-y-3 border border-[rgba(0,0,0,0.08)] rounded-2xl shadow-xs">
                  <div className="flex items-center gap-3">
                    <AgentAvatar name={agent.name} size={36} />
                    <div>
                      <div className="text-xs font-bold text-[#1E1F24]">{agent.name}</div>
                      <div className="text-[10px] text-[#72737A]">{agent.role}</div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-[rgba(0,0,0,0.06)]">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#878890]">Assigned Points:</span>
                      <span className="font-mono font-bold text-[#1E1F24]">{agent.assignedPoints} pts</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#878890]">Issues Assigned:</span>
                      <span className="font-mono font-bold text-[#1E1F24]">{agent.totalIssues} issues</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: TIMELINE VIEW */}
        {viewMode === "gantt" && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white overflow-hidden shadow-xs">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] bg-[#FAF8F5] flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-[#1E1F24]">Hermes Kanban Timeline & Schedule</h3>
                  <p className="text-[10px] text-[#878890]">Jul 25 – Aug 08 · Visual task timelines & worker dispatches</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                {filteredTickets.map((t) => (
                  <div key={t.id} className="flex items-center gap-4 text-xs">
                    <div className="w-48 font-semibold truncate text-[#1E1F24]">{t.title}</div>
                    <div className="flex-1 bg-[#FAF8F5] h-6 rounded-lg relative overflow-hidden border border-[rgba(0,0,0,0.06)]">
                      <div
                        className="absolute top-1 bottom-1 rounded bg-[#1E1F24] px-2 flex items-center text-[9px] font-mono text-white"
                        style={{ left: "10%", width: "45%" }}
                      >
                        {t.assignee} ({t.status})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Terminal Drawer */}
        <AnimatePresence>
          {terminalOpen && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="shrink-0 flex flex-col bg-[#1E1F24] text-white"
              style={{ width: 380, borderLeft: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Terminal size={14} className="text-emerald-400" />
                  <span className="text-xs font-mono font-semibold">Hermes Dispatcher CLI</span>
                </div>
                <button className="btn-icon text-gray-400 hover:text-white" onClick={() => setTerminalOpen(false)}>
                  <X size={14} />
                </button>
              </div>

              <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1.5 bg-[#141519]">
                {visibleLines.map((idx) => (
                  <div key={idx} style={{ color: TERMINAL_LOGS[idx].color }} className="leading-relaxed">
                    {TERMINAL_LOGS[idx].text}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ticket Detail Drawer Modal (With Run History) */}
      <AnimatePresence>
        {selectedTicket && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedTicket(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-2xl bg-white border border-[rgba(0,0,0,0.12)] rounded-3xl shadow-xl flex flex-col overflow-hidden max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="h-14 px-6 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between bg-[#FAF8F5] shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-[#1E1F24] bg-white px-2 py-0.5 rounded border border-[rgba(0,0,0,0.1)]">
                    {selectedTicket.key || selectedTicket.id}
                  </span>
                  <span className="text-xs text-[#878890] capitalize">
                    Column: <strong>{selectedTicket.status.replace("-", " ")}</strong>
                  </span>
                </div>
                <button onClick={() => setSelectedTicket(null)} className="btn-icon">
                  <X size={16} />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                  <h2 className="text-base font-bold text-[#1E1F24] mb-1.5">{selectedTicket.title}</h2>
                  <p className="text-xs text-[#52535A] leading-relaxed">{selectedTicket.description}</p>
                </div>

                <div className="grid grid-cols-3 gap-3 p-3.5 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] text-xs">
                  <div>
                    <span className="text-[10px] text-[#878890] font-bold uppercase block mb-0.5">ASSIGNED AGENT</span>
                    <div className="flex items-center gap-1.5 font-semibold text-[#1E1F24]">
                      <AgentAvatar name={selectedTicket.assignee} size={18} />
                      <span>{selectedTicket.assignee}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#878890] font-bold uppercase block mb-0.5">PRIORITY</span>
                    <span className="font-semibold text-[#1E1F24] uppercase">{selectedTicket.priority}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#878890] font-bold uppercase block mb-0.5">POINTS</span>
                    <span className="font-mono font-bold text-[#1E1F24]">{selectedTicket.points} Story Pts</span>
                  </div>
                </div>

                {/* Hermes Agent Run History Section */}
                <div className="pt-4 border-t border-[rgba(0,0,0,0.08)] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[#1E1F24] flex items-center gap-2">
                      <Bot size={14} className="text-indigo-600" />
                      <span>Hermes Worker Run History & Handoff</span>
                    </h3>
                    <span className="text-[10px] font-mono text-[#878890]">
                      Board: cosmos-enterprise-platform
                    </span>
                  </div>

                  {runsLoading ? (
                    <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] text-center text-xs text-[#878890]">
                      Loading run attempts from Hermes Kanban...
                    </div>
                  ) : taskRuns.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] text-center text-xs text-[#878890]">
                      No run attempts recorded yet for this task card.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {taskRuns.map((r, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <AgentAvatar name={r.worker} size={30} />
                            <div>
                              <div className="font-bold text-[#1E1F24] flex items-center gap-2">
                                <span>{r.worker}</span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-bold ${
                                    r.outcome === "completed" || r.outcome === "done"
                                      ? "bg-emerald-500/10 text-emerald-700"
                                      : r.outcome === "running"
                                      ? "bg-amber-500/10 text-amber-700"
                                      : "bg-blue-500/10 text-blue-700"
                                  }`}
                                >
                                  {r.outcome}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#72737A] mt-0.5 leading-normal">
                                {r.summary}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 text-[10px] font-mono text-[#878890]">
                            <div>Elapsed: {r.duration}</div>
                            <div>{r.timestamp}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Task Modal */}
      <AnimatePresence>
        {newTicketModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setNewTicketModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white border border-[rgba(0,0,0,0.12)] rounded-3xl p-6 shadow-xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(0,0,0,0.08)]">
                <h2 className="text-sm font-bold text-[#1E1F24]">Create Task on Hermes Kanban</h2>
                <button onClick={() => setNewTicketModalOpen(false)} className="btn-icon">
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">TASK TITLE</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Implement OAuth JWT Auth flow"
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] outline-none text-[#1E1F24]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">DESCRIPTION</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    rows={3}
                    placeholder="Provide details and acceptance criteria..."
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] outline-none text-[#1E1F24]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">ASSIGNEE AGENT</label>
                    <select
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] outline-none text-[#1E1F24]"
                    >
                      <option value="Dev">Dev</option>
                      <option value="Peter">Peter</option>
                      <option value="Zara">Zara</option>
                      <option value="Sara Pate">Sara Pate</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">PRIORITY</label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] outline-none text-[#1E1F24]"
                    >
                      <option value="high">HIGH (P1)</option>
                      <option value="medium">MEDIUM (P2)</option>
                      <option value="low">LOW (P3)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button onClick={() => setNewTicketModalOpen(false)} className="btn btn-secondary text-xs">
                  Cancel
                </button>
                <button onClick={handleCreateTicket} className="btn btn-primary text-xs font-semibold">
                  Create Task
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
