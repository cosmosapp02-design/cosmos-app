"use client";

import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import AgentAvatar from "./agent-avatar";
import { useToast } from "./toast";

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
}

const INITIAL_TICKETS: Ticket[] = [
  {
    id: "T-001",
    key: "COS-101",
    title: "Design landing page hero section",
    assignee: "Alex",
    assigneeColor: "#1E1F24",
    priority: "medium",
    tags: ["Design", "PRD"],
    status: "done",
    points: 3,
    startDate: "Jul 25",
    dueDate: "Jul 28",
    epicId: "epic-2",
    description: "Create wireframes and finalize copy for the hero section",
    subtasks: [
      { id: "st-1", title: "Figma wireframe layout", completed: true },
      { id: "st-2", title: "Copywriting review", completed: true },
    ],
    comments: [
      { sender: "Alex", text: "Wireframes approved by design team.", time: "Yesterday" },
    ],
  },
  {
    id: "T-002",
    key: "COS-102",
    title: "Implement JWT authentication flow",
    assignee: "Dev-Bot",
    assigneeColor: "#1E1F24",
    priority: "high",
    tags: ["Auth", "Backend", "TypeScript"],
    status: "in-progress",
    points: 5,
    startDate: "Jul 28",
    dueDate: "Aug 02",
    epicId: "epic-1",
    description: "Build JWT middleware with refresh token rotation in Next.js App Router",
    subtasks: [
      { id: "st-3", title: "JWT token verification middleware", completed: true },
      { id: "st-4", title: "Refresh token rotation handler", completed: true },
      { id: "st-5", title: "RBAC permission checks", completed: false },
    ],
    comments: [
      { sender: "Dev-Bot", text: "JWT middleware created in auth/middleware.ts. PR #142 submitted.", time: "9:05 AM" },
    ],
  },
  {
    id: "T-003",
    key: "COS-103",
    title: "Write E2E tests for auth flow",
    assignee: "QA-Guard",
    assigneeColor: "#1E1F24",
    priority: "high",
    tags: ["Testing", "Playwright"],
    status: "in-progress",
    points: 3,
    startDate: "Jul 30",
    dueDate: "Aug 04",
    epicId: "epic-1",
    description: "Comprehensive Playwright test suite for login, signup, and token expiration",
    subtasks: [
      { id: "st-6", title: "Login & Signup flow spec", completed: true },
      { id: "st-7", title: "Session revocation test", completed: true },
      { id: "st-8", title: "Safari cross-browser verification", completed: false },
    ],
    comments: [
      { sender: "QA-Guard", text: "23 Playwright tests passing on Chrome & Firefox.", time: "9:07 AM" },
    ],
  },
  {
    id: "T-004",
    key: "COS-104",
    title: "Deploy staging environment to Vercel",
    assignee: "Dev-Bot",
    assigneeColor: "#1E1F24",
    priority: "medium",
    tags: ["DevOps", "Vercel"],
    status: "backlog",
    points: 2,
    startDate: "Aug 03",
    dueDate: "Aug 07",
    epicId: "epic-3",
    description: "Configure production environment variables and deploy preview staging link",
    subtasks: [
      { id: "st-9", title: "Environment secret injection", completed: false },
      { id: "st-10", title: "Vercel deployment trigger", completed: false },
    ],
    comments: [],
  },
  {
    id: "T-005",
    key: "COS-105",
    title: "Sprint 4 Product Requirement Doc",
    assignee: "Alex",
    assigneeColor: "#1E1F24",
    priority: "low",
    tags: ["Planning", "PRD"],
    status: "qa-review",
    points: 1,
    startDate: "Jul 26",
    dueDate: "Jul 31",
    epicId: "epic-2",
    description: "Finalize requirements for token savings dashboard and onboarding wizard",
    subtasks: [
      { id: "st-11", title: "Draft PRD v1.2", completed: true },
      { id: "st-12", title: "Stakeholder approval", completed: true },
    ],
    comments: [
      { sender: "Alex", text: "PRD v1.2 is ready for QA review.", time: "8:30 AM" },
    ],
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
  { delay: 0, text: "$ cosmos run-sprint --sprint=4 --agents=dev-bot,qa-guard", color: "#6B7280" },
  { delay: 380, text: "▶ Initializing Sprint Runner v2.1.0 (Linear Engine)", color: "#1E1F24" },
  { delay: 640, text: "✓ Connected to Dev-Bot (Senior Coder)", color: "#10B981" },
  { delay: 840, text: "✓ Connected to QA-Guard (Inspector)", color: "#10B981" },
  { delay: 1050, text: "⚡ [Dev-Bot] Analyzing codebase AST... (saved 68% tokens)", color: "#1E1F24" },
  { delay: 1440, text: "⚡ [Dev-Bot] Writing JWT middleware implementation...", color: "#1E1F24" },
  { delay: 1920, text: "✓ [Dev-Bot] auth/middleware.ts created (247 lines)", color: "#10B981" },
  { delay: 2180, text: "⚡ [Dev-Bot] Running: npm install jsonwebtoken", color: "#1E1F24" },
  { delay: 2600, text: "✓ [Dev-Bot] Dependencies installed. Build check passed.", color: "#10B981" },
  { delay: 2900, text: "⚡ [QA-Guard] Starting Playwright test suite...", color: "#2563EB" },
  { delay: 3380, text: "✓ [QA-Guard] 23 tests passed · 0 failed · Coverage: 94%", color: "#10B981" },
  { delay: 3720, text: "⚠ [Dev-Bot] wants to run: npm publish → Approval required", color: "#D97706" },
  { delay: 4180, text: "✓ Approval received. COS-102 → DONE.", color: "#10B981" },
  { delay: 4520, text: "✓ COS-103 → DONE.", color: "#10B981" },
  { delay: 4880, text: "🚀 Sprint 4 complete. 2 issues resolved. Velocity: +12%", color: "#1E1F24" },
];

interface ProjectsViewProps {
  triggerReportMode: (onApprove: () => void) => void;
}

export default function ProjectsView({ triggerReportMode }: ProjectsViewProps) {
  const [tickets, setTickets] = useState<Ticket[]>(INITIAL_TICKETS);
  const [viewMode, setViewMode] = useState<PMViewMode>("board");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalDone, setTerminalDone] = useState(false);
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  const [sprintRunning, setSprintRunning] = useState(false);
  const [reportTriggered, setReportTriggered] = useState(false);
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAssignee, setNewAssignee] = useState("Dev-Bot");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");

  const terminalRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { addToast } = useToast();

  const runSprint = () => {
    if (sprintRunning) return;
    setSprintRunning(true);
    setTerminalOpen(true);
    setTerminalDone(false);
    setVisibleLines([]);
    setReportTriggered(false);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    TERMINAL_LOGS.forEach((line, idx) => {
      const t = setTimeout(() => {
        setVisibleLines((prev) => [...prev, idx]);
        if (idx === 11 && !reportTriggered) {
          setReportTriggered(true);
          setTimeout(() => {
            triggerReportMode(() => {
              setTickets((prev) =>
                prev.map((tk) =>
                  tk.key === "COS-102" || tk.key === "COS-103"
                    ? { ...tk, status: "done" as TicketStatus }
                    : tk
                )
              );
              addToast("Sprint 4 completed! Issues COS-102 and COS-103 resolved.", "success");
            });
          }, 600);
        }
        if (idx === TERMINAL_LOGS.length - 1) {
          setTerminalDone(true);
          setSprintRunning(false);
        }
      }, line.delay);
      timersRef.current.push(t);
    });
  };

  const handleToggleSubtask = (ticketId: string, subtaskId: string) => {
    setTickets((prev) =>
      prev.map((tk) => {
        if (tk.id !== ticketId) return tk;
        const updatedSubs = tk.subtasks.map((st) =>
          st.id === subtaskId ? { ...st, completed: !st.completed } : st
        );
        return { ...tk, subtasks: updatedSubs };
      })
    );

    if (selectedTicket && selectedTicket.id === ticketId) {
      setSelectedTicket((prev) =>
        prev
          ? {
              ...prev,
              subtasks: prev.subtasks.map((st) =>
                st.id === subtaskId ? { ...st, completed: !st.completed } : st
              ),
            }
          : null
      );
    }
  };

  const handleCreateIssue = () => {
    if (!newTitle.trim()) return;
    const keyNum = tickets.length + 101;
    const created: Ticket = {
      id: `T-${Date.now()}`,
      key: `COS-${keyNum}`,
      title: newTitle,
      assignee: newAssignee,
      assigneeColor: "#1E1F24",
      priority: newPriority,
      tags: ["Feature"],
      status: "backlog",
      points: 3,
      startDate: "Aug 01",
      dueDate: "Aug 05",
      epicId: "epic-1",
      description: newDesc || "New issue task.",
      subtasks: [
        { id: `st-${Date.now()}-1`, title: "Implementation plan", completed: false },
        { id: `st-${Date.now()}-2`, title: "Code & QA verification", completed: false },
      ],
      comments: [],
    };

    setTickets((prev) => [...prev, created]);
    setNewTicketModalOpen(false);
    setNewTitle("");
    setNewDesc("");
    addToast(`Issue ${created.key} created!`, "success");
  };

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.key.toLowerCase().includes(search.toLowerCase());
    const matchesAssignee = assigneeFilter === "all" || t.assignee === assigneeFilter;
    const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
    return matchesSearch && matchesAssignee && matchesPriority;
  });

  const getColumnTickets = (colId: TicketStatus) =>
    filteredTickets.filter((t) => t.status === colId);

  // Agent Workload Calculations
  const agentWorkload = [
    {
      name: "Dev-Bot",
      role: "Senior Full-Stack Coder",
      assignedPoints: tickets.filter((t) => t.assignee === "Dev-Bot").reduce((s, t) => s + t.points, 0),
      completedPoints: tickets.filter((t) => t.assignee === "Dev-Bot" && t.status === "done").reduce((s, t) => s + t.points, 0),
      totalIssues: tickets.filter((t) => t.assignee === "Dev-Bot").length,
      capacityStatus: "Optimal Capacity (50%)",
      color: "#1E1F24",
    },
    {
      name: "Alex",
      role: "Product Manager",
      assignedPoints: tickets.filter((t) => t.assignee === "Alex").reduce((s, t) => s + t.points, 0),
      completedPoints: tickets.filter((t) => t.assignee === "Alex" && t.status === "done").reduce((s, t) => s + t.points, 0),
      totalIssues: tickets.filter((t) => t.assignee === "Alex").length,
      capacityStatus: "Balanced Capacity (29%)",
      color: "#D97706",
    },
    {
      name: "QA-Guard",
      role: "QA Inspector",
      assignedPoints: tickets.filter((t) => t.assignee === "QA-Guard").reduce((s, t) => s + t.points, 0),
      completedPoints: tickets.filter((t) => t.assignee === "QA-Guard" && t.status === "done").reduce((s, t) => s + t.points, 0),
      totalIssues: tickets.filter((t) => t.assignee === "QA-Guard").length,
      capacityStatus: "Available Capacity (21%)",
      color: "#2563EB",
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FAF8F5] text-[#1E1F24] select-none">
      {/* ── 1. Enterprise Linear Header & View Switcher ── */}
      <div className="border-b border-[rgba(0,0,0,0.08)] px-6 py-3 bg-white shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1E1F24] text-white flex items-center justify-center font-bold text-xs">
              K
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-[#1E1F24]">Sprint 4 · Auth & Security Pass</h1>
                <span className="px-2 py-0.5 rounded-full bg-[#EFECE6] text-[#1E1F24] text-[10px] font-mono font-bold">
                  14 pts
                </span>
              </div>
              <p className="text-[11px] text-[#878890]">
                Cosmos Enterprise Platform · {tickets.length} Issues · 3 Active AI Agents
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setNewTicketModalOpen(true)}
              className="btn btn-secondary btn-sm rounded-xl"
            >
              <Plus size={13} /> New Issue
            </button>
            <button
              onClick={runSprint}
              disabled={sprintRunning}
              className="btn btn-primary btn-sm rounded-xl px-4 py-2 font-semibold shadow-sm"
            >
              {sprintRunning ? (
                <span>Executing...</span>
              ) : (
                <>
                  <Zap size={14} />
                  <span>Run Sprint</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── View Switcher Tabs ── */}
        <div className="flex items-center justify-between pt-1 border-t border-[rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-1 bg-[#FAF8F5] p-1 rounded-xl border border-[rgba(0,0,0,0.08)]">
            <button
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "board"
                  ? "bg-white text-[#1E1F24] shadow-2xs"
                  : "text-[#72737A] hover:text-[#1E1F24]"
              }`}
            >
              <KanbanIcon size={13} />
              <span>Board</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "table"
                  ? "bg-white text-[#1E1F24] shadow-2xs"
                  : "text-[#72737A] hover:text-[#1E1F24]"
              }`}
            >
              <TableIcon size={13} />
              <span>Table / List</span>
            </button>
            <button
              onClick={() => setViewMode("workload")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "workload"
                  ? "bg-white text-[#1E1F24] shadow-2xs"
                  : "text-[#72737A] hover:text-[#1E1F24]"
              }`}
            >
              <Bot size={13} />
              <span>Agent Workload</span>
            </button>
            <button
              onClick={() => setViewMode("gantt")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "gantt"
                  ? "bg-white text-[#1E1F24] shadow-2xs"
                  : "text-[#72737A] hover:text-[#1E1F24]"
              }`}
            >
              <BarChart3 size={13} />
              <span>Timeline / Gantt</span>
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "calendar"
                  ? "bg-white text-[#1E1F24] shadow-2xs"
                  : "text-[#72737A] hover:text-[#1E1F24]"
              }`}
            >
              <CalendarIcon size={13} />
              <span>Calendar</span>
            </button>
          </div>
        </div>

        {/* ── Multi-Filter Controls Bar SPECIFICALLY FOR BOARD VIEW ── */}
        {viewMode === "board" && (
          <div className="flex items-center justify-between pt-2 border-t border-[rgba(0,0,0,0.06)] text-xs text-[#52535A]">
            <div className="flex items-center gap-3">
              {/* Type Search Bar */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] w-56">
                <Search size={13} className="text-[#878890]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by COS-key or title..."
                  className="bg-transparent outline-none w-full text-xs text-[#1E1F24] placeholder-[#878890]"
                />
              </div>

              {/* Filter Based on Agents */}
              <div className="flex items-center gap-1 bg-[#FAF8F5] p-1 rounded-xl border border-[rgba(0,0,0,0.08)]">
                <span className="text-[10px] font-bold text-[#878890] px-1.5">AGENT:</span>
                {["all", "Alex", "Dev-Bot", "QA-Guard"].map((a) => (
                  <button
                    key={a}
                    onClick={() => setAssigneeFilter(a)}
                    className={`px-2 py-0.5 rounded-lg text-xs transition-all ${
                      assigneeFilter === a
                        ? "bg-white text-[#1E1F24] font-semibold shadow-2xs"
                        : "text-[#72737A] hover:text-[#1E1F24]"
                    }`}
                  >
                    {a === "all" ? "All" : a}
                  </button>
                ))}
              </div>

              {/* Filter Based on Priority */}
              <div className="flex items-center gap-1 bg-[#FAF8F5] p-1 rounded-xl border border-[rgba(0,0,0,0.08)]">
                <span className="text-[10px] font-bold text-[#878890] px-1.5">PRIORITY:</span>
                {["all", "high", "medium", "low"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriorityFilter(p)}
                    className={`px-2 py-0.5 rounded-lg text-xs uppercase font-mono transition-all ${
                      priorityFilter === p
                        ? "bg-white text-[#1E1F24] font-bold shadow-2xs"
                        : "text-[#72737A] hover:text-[#1E1F24]"
                    }`}
                  >
                    {p === "all" ? "All" : p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#878890]">
              <span>Showing {filteredTickets.length} of {tickets.length} issues</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. View Mode Content Panes ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* VIEW 1: BOARD (KANBAN) */}
        {viewMode === "board" && (
          <div className="flex-1 overflow-x-auto p-6">
            <div className="flex gap-4 h-full" style={{ minWidth: 920 }}>
              {COLUMNS.map((col) => {
                const colTickets = getColumnTickets(col.id);
                const colPoints = colTickets.reduce((sum, t) => sum + t.points, 0);

                return (
                  <div key={col.id} className="flex flex-col" style={{ width: 250, flexShrink: 0 }}>
                    <div className="flex items-center justify-between px-1 pb-2 mb-3 border-b border-[rgba(0,0,0,0.08)]">
                      <div className="flex items-center gap-2">
                        {col.renderIcon()}
                        <span className="text-xs font-bold text-[#1E1F24]">{col.label}</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-[#EFECE6] text-[10px] font-mono font-bold text-[#52535A]">
                          {colTickets.length}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[#878890]">{colPoints} pts</span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2.5 pb-4">
                      <AnimatePresence>
                        {colTickets.map((ticket) => {
                          const completedSubtasks = ticket.subtasks.filter((st) => st.completed).length;
                          const prio = PRIORITY_BADGES[ticket.priority];

                          return (
                            <motion.div
                              key={ticket.id}
                              layout
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.96 }}
                              onClick={() => setSelectedTicket(ticket)}
                              className="card-interactive bg-white p-3.5 cursor-pointer relative flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[11px] font-mono font-bold text-[#1E1F24]">{ticket.key}</span>
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

        {/* VIEW 2: TABLE / LIST VIEW */}
        {viewMode === "table" && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF8F5] border-b border-[rgba(0,0,0,0.08)] text-[10px] uppercase font-bold text-[#878890]">
                  <tr>
                    <th className="px-4 py-3">Key</th>
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
                  {tickets.map((t) => {
                    const completedSubs = t.subtasks.filter((st) => st.completed).length;
                    const prio = PRIORITY_BADGES[t.priority];
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTicket(t)}
                        className="hover:bg-[#FAF8F5] cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-[#1E1F24]">{t.key}</td>
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

        {/* VIEW 3: AGENT WORKLOAD VIEW */}
        {viewMode === "workload" && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="t-h2 text-[#1E1F24]">AI Workforce Workload & Story Point Allocation</h2>
                <p className="t-micro text-[#878890]">Real-time capacity tracking across active AI agents</p>
              </div>
              <div className="t-micro font-bold text-emerald-700 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                Total Allocated: 14 pts (100% capacity)
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {agentWorkload.map((agent) => (
                <div key={agent.name} className="card bg-white p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <AgentAvatar name={agent.name} size={40} />
                    <div>
                      <div className="t-h2 text-[#1E1F24]">{agent.name}</div>
                      <div className="t-micro text-[#72737A]">{agent.role}</div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-[rgba(0,0,0,0.06)]">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#878890]">Assigned Points:</span>
                      <span className="font-mono font-bold text-[#1E1F24]">{agent.assignedPoints} pts</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#878890]">Completed Points:</span>
                      <span className="font-mono font-bold text-emerald-600">{agent.completedPoints} pts</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#878890]">Issues Assigned:</span>
                      <span className="font-mono font-bold text-[#1E1F24]">{agent.totalIssues} issues</span>
                    </div>

                    <div className="pt-2">
                      <div className="flex justify-between text-[10px] text-[#878890] font-bold uppercase mb-1">
                        <span>Workload Allocation</span>
                        <span>{agent.capacityStatus}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#EFECE6] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#1E1F24]"
                          style={{ width: `${(agent.assignedPoints / 14) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: TIMELINE / GANTT VIEW */}
        {viewMode === "gantt" && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white overflow-hidden shadow-xs">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] bg-[#FAF8F5] flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-[#1E1F24]">Sprint 4 Gantt Schedule & Dependencies</h3>
                  <p className="text-[10px] text-[#878890]">Jul 25 – Aug 08 · Visual task timelines & critical paths</p>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {tickets.map((t) => {
                  const getStatusBg = (st: TicketStatus) => {
                    if (st === "done") return "bg-emerald-500";
                    if (st === "in-progress") return "bg-amber-500";
                    if (st === "qa-review") return "bg-blue-500";
                    return "bg-gray-400";
                  };

                  return (
                    <div key={t.id} className="flex items-center gap-4 text-xs">
                      <div className="w-48 shrink-0 flex items-center gap-2">
                        <span className="font-mono font-bold text-[#1E1F24]">{t.key}</span>
                        <span className="truncate text-[#52535A]">{t.title}</span>
                      </div>

                      <div className="flex-1 bg-[#FAF8F5] h-8 rounded-xl border border-[rgba(0,0,0,0.06)] relative flex items-center px-2">
                        <div
                          className={`h-5 rounded-lg text-[10px] font-bold text-white flex items-center justify-between px-2 shadow-2xs ${getStatusBg(t.status)}`}
                          style={{
                            width: `${t.points * 18}%`,
                            marginLeft: t.key === "COS-101" ? "0%" : t.key === "COS-102" ? "20%" : t.key === "COS-103" ? "35%" : "55%",
                          }}
                        >
                          <span>{t.startDate} - {t.dueDate}</span>
                          <AgentAvatar name={t.assignee} size={16} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 5: CALENDAR VIEW */}
        {viewMode === "calendar" && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white overflow-hidden shadow-xs">
              <div className="p-4 bg-[#FAF8F5] border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                <h3 className="t-h2 text-[#1E1F24]">Sprint 4 Issue Calendar</h3>
              </div>
              <div className="grid grid-cols-7 border-b border-[rgba(0,0,0,0.08)] text-[10px] font-bold text-[#878890] uppercase text-center py-2">
                <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
              </div>
              <div className="grid grid-cols-7 divide-x divide-y divide-[rgba(0,0,0,0.06)] min-h-[360px] text-xs">
                {[...Array(14)].map((_, idx) => {
                  const dayNum = 25 + idx;
                  const dateStr = dayNum > 31 ? `Aug 0${dayNum - 31}` : `Jul ${dayNum}`;
                  const dayTickets = tickets.filter((t) => t.dueDate.includes(dateStr) || t.startDate.includes(dateStr));
                  return (
                    <div key={idx} className="p-2 min-h-[80px] bg-white">
                      <div className="text-[10px] font-mono text-[#878890] mb-1">{dateStr}</div>
                      <div className="space-y-1">
                        {dayTickets.map((t) => (
                          <div key={t.id} onClick={() => setSelectedTicket(t)} className="p-1 rounded bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] text-[10px] font-semibold text-[#1E1F24] truncate cursor-pointer hover:border-[#1E1F24]">
                            {t.key}: {t.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
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
                  <span className="text-xs font-mono font-semibold">Sprint Execution CLI</span>
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

      {/* Ticket Detail Modal */}
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
              className="w-full max-w-2xl bg-white border border-[rgba(0,0,0,0.12)] rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-13 px-6 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between bg-[#FAF8F5] shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-[#1E1F24] bg-white px-2 py-0.5 rounded border border-[rgba(0,0,0,0.1)]">
                    {selectedTicket.key}
                  </span>
                </div>
                <button onClick={() => setSelectedTicket(null)} className="btn-icon ml-2"><X size={16} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <h2 className="text-base font-bold text-[#1E1F24] mb-2">{selectedTicket.title}</h2>
                <p className="text-xs text-[#52535A] leading-relaxed">{selectedTicket.description}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
