"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Check, Code2, Calendar, FileText, Megaphone, Triangle, Server, FlaskConical, Eye, GitMerge, Bot, UserPlus,
} from "lucide-react";
import AgentAvatar from "./agent-avatar";
import { useToast } from "./toast";

export interface Agent {
  id: string;
  name: string;
  role: string;
  color: string;
  status: "online" | "busy" | "offline";
  avatar: string;
  description: string;
  soul: string;
  skills: { name: string; icon: string; proficiency: number }[];
  currentTask?: string;
  stats: { tasksCompleted: number; tokensSaved: string; uptime: string };
}

const initialAgents: Agent[] = [
  {
    id: "1",
    name: "Alex",
    role: "Product Manager",
    color: "#1E1F24",
    status: "online",
    avatar: "A",
    description: "Orchestrates sprint goals, writes PRDs, and prioritizes user features.",
    soul: "I am Alex, a strategic product manager who transforms vague ideas into actionable roadmaps. I think in user stories, prioritize ruthlessly, and always keep the north star metric in focus.",
    skills: [
      { name: "PRD Generation", icon: "FileText", proficiency: 94 },
      { name: "Sprint Planning", icon: "Calendar", proficiency: 88 },
      { name: "User Research", icon: "Eye", proficiency: 82 },
    ],
    currentTask: "Writing Sprint 4 PRD & Auth spec",
    stats: { tasksCompleted: 47, tokensSaved: "142k", uptime: "99.8%" },
  },
  {
    id: "2",
    name: "Dev-Bot",
    role: "Senior Coder",
    color: "#1E1F24",
    status: "busy",
    avatar: "D",
    description: "Writes full-stack code, executes refactors, and builds Next.js/TypeScript modules.",
    soul: "I am Dev-Bot, a battle-tested senior engineer who writes clean, typed, and tested code. I prefer TypeScript, obsess over performance, and refactor whenever I spot code smells.",
    skills: [
      { name: "TypeScript / React", icon: "Code2", proficiency: 98 },
      { name: "Next.js App Router", icon: "Triangle", proficiency: 95 },
      { name: "API Integration", icon: "Server", proficiency: 91 },
    ],
    currentTask: "Implementing JWT middleware for Auth flow",
    stats: { tasksCompleted: 128, tokensSaved: "480k", uptime: "99.9%" },
  },
  {
    id: "3",
    name: "QA-Guard",
    role: "QA Inspector",
    color: "#1E1F24",
    status: "online",
    avatar: "Q",
    description: "Executes test suites, validates UI responsive breakpoints, and checks edge cases.",
    soul: "I am QA-Guard, a meticulous quality assurance specialist. I catch bugs before users do, write comprehensive test suites, and treat every edge case as a potential disaster waiting to happen.",
    skills: [
      { name: "Playwright E2E", icon: "FlaskConical", proficiency: 96 },
      { name: "Visual Regression", icon: "Eye", proficiency: 89 },
      { name: "CI Pipeline Integration", icon: "GitMerge", proficiency: 85 },
    ],
    currentTask: "Running E2E tests on Auth flow",
    stats: { tasksCompleted: 92, tokensSaved: "210k", uptime: "99.7%" },
  },
];

export default function AgentsView() {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: "", role: "", description: "" });
  const { addToast } = useToast();

  const handleCreateAgent = () => {
    if (!newAgent.name || !newAgent.role) return;
    const created: Agent = {
      id: Date.now().toString(),
      name: newAgent.name,
      role: newAgent.role,
      color: "#1E1F24",
      status: "online",
      avatar: newAgent.name[0].toUpperCase(),
      description: newAgent.description || "Specialized AI worker.",
      soul: `I am ${newAgent.name}, dedicated to executing ${newAgent.role} tasks with high precision.`,
      skills: [
        { name: "Task Automation", icon: "Bot", proficiency: 90 },
        { name: "Code Review", icon: "Code2", proficiency: 85 },
      ],
      stats: { tasksCompleted: 0, tokensSaved: "0k", uptime: "100%" },
    };

    setAgents((prev) => [...prev, created]);
    setModalOpen(false);
    setNewAgent({ name: "", role: "", description: "" });
    addToast(`Agent ${created.name} (${created.role}) hired!`, "success");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FAF8F5]">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 shrink-0 bg-white"
        style={{ height: 56, borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <h1 className="t-h2 text-[#1E1F24]">AI Agent Directory</h1>
          <p className="t-micro text-[#878890]">
            {agents.length} Agents Configured · {agents.filter((a) => a.status === "online").length} Online
          </p>
        </div>
        <button
          id="add-agent-btn"
          onClick={() => setModalOpen(true)}
          className="btn btn-primary btn-sm"
        >
          <UserPlus size={14} /> Hire Agent
        </button>
      </div>

      {/* Main Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl">
          {agents.map((agent) => (
            <motion.div
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className="card-interactive bg-white p-5 cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <AgentAvatar name={agent.name} size={40} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="t-h2 text-[#1E1F24]">{agent.name}</h2>
                      <span className={`w-2 h-2 rounded-full ${agent.status === "online" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    </div>
                    <p className="t-micro text-[#72737A]">{agent.role}</p>
                  </div>
                </div>

                <p className="t-small text-[#52535A] mb-4 line-clamp-2 leading-snug">{agent.description}</p>

                {/* SKILLS */}
                <div className="space-y-2 mb-4">
                  {agent.skills.map((skill) => (
                    <div key={skill.name}>
                      <div className="flex justify-between t-micro text-[#72737A] mb-1">
                        <span>{skill.name}</span>
                        <span className="font-semibold text-[#1E1F24]">{skill.proficiency}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#EFECE6] overflow-hidden">
                        <div className="h-full bg-[#1E1F24] rounded-full" style={{ width: `${skill.proficiency}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between t-micro text-[#878890]">
                <span>{agent.stats.tasksCompleted} Tasks Completed</span>
                <span>{agent.stats.tokensSaved} Saved</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Hire Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white border border-[rgba(0,0,0,0.12)] rounded-2xl p-6 shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(0,0,0,0.08)]">
                <h2 className="t-h2 text-[#1E1F24]">Hire New AI Agent</h2>
                <button onClick={() => setModalOpen(false)} className="btn-icon">
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="t-label text-[#72737A] block mb-1">AGENT NAME</label>
                  <input
                    type="text"
                    value={newAgent.name}
                    onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                    placeholder="e.g. Content-Bot"
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] t-small outline-none focus:border-[#1E1F24]"
                  />
                </div>
                <div>
                  <label className="t-label text-[#72737A] block mb-1">ROLE & TITLE</label>
                  <input
                    type="text"
                    value={newAgent.role}
                    onChange={(e) => setNewAgent({ ...newAgent, role: e.target.value })}
                    placeholder="e.g. Lead Copywriter"
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] t-small outline-none focus:border-[#1E1F24]"
                  />
                </div>
                <div>
                  <label className="t-label text-[#72737A] block mb-1">DESCRIPTION</label>
                  <textarea
                    rows={3}
                    value={newAgent.description}
                    onChange={(e) => setNewAgent({ ...newAgent, description: e.target.value })}
                    placeholder="Describe the agent's specialization..."
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] t-small outline-none focus:border-[#1E1F24]"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setModalOpen(false)} className="btn btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button onClick={handleCreateAgent} className="btn btn-primary flex-1 justify-center">
                  Hire Agent
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
