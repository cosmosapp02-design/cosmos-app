"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Check, Code2, Calendar, FileText, Megaphone, Triangle, Server, FlaskConical, Eye, GitMerge, Bot, UserPlus, Key, Cpu, Sparkles, RefreshCw, ShieldAlert,
} from "lucide-react";
import AgentAvatar from "./agent-avatar";
import { useToast } from "./toast";
import APIVaultModal from "./api-vault-modal";

export interface Agent {
  id: string;
  name: string;
  role: string;
  color: string;
  status: "online" | "busy" | "offline";
  avatar: string;
  description: string;
  soul: string;
  primaryModel: string;
  backupModel: string;
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
    primaryModel: "gpt-4o-2024-11-20",
    backupModel: "claude-3-5-sonnet",
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
    primaryModel: "gemini-3.6-flash-lite",
    backupModel: "claude-3-5-sonnet",
    description: "Writes full-stack code, executes refactors, and builds Next.js/TypeScript modules.",
    soul: "I am Dev-Bot, a senior software architect specializing in TypeScript, Next.js, and clean code. I write modular, well-tested code and strictly follow design systems.",
    skills: [
      { name: "TypeScript / React", icon: "Code2", proficiency: 98 },
      { name: "AST Indexing", icon: "GitMerge", proficiency: 92 },
      { name: "API Design", icon: "Server", proficiency: 90 },
    ],
    currentTask: "Implementing JWT authentication middleware",
    stats: { tasksCompleted: 112, tokensSaved: "389k", uptime: "99.9%" },
  },
  {
    id: "3",
    name: "QA-Guard",
    role: "QA Inspector",
    color: "#1E1F24",
    status: "online",
    avatar: "Q",
    primaryModel: "gemini-2.5-flash",
    backupModel: "gpt-4o-mini",
    description: "Runs Playwright E2E test suites, audits visual regressions, and verifies acceptance criteria.",
    soul: "I am QA-Guard, a relentless quality assurance engineer. I write automated Playwright test suites, inspect edge cases, and catch regressions before code hits production.",
    skills: [
      { name: "Playwright E2E", icon: "FlaskConical", proficiency: 96 },
      { name: "Visual Testing", icon: "Eye", proficiency: 91 },
      { name: "Security Audit", icon: "Server", proficiency: 87 },
    ],
    currentTask: "Auditing authentication flow Playwright specs",
    stats: { tasksCompleted: 83, tokensSaved: "210k", uptime: "99.7%" },
  },
];

export default function AgentsView() {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newSoul, setNewSoul] = useState("");
  const [newPrimaryModel, setNewPrimaryModel] = useState("gemini-3.6-flash-lite");
  const [newBackupModel, setNewBackupModel] = useState("claude-3-5-sonnet");

  const { addToast } = useToast();

  const handleUpdateModels = (agentId: string, primary: string, backup: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, primaryModel: primary, backupModel: backup } : a))
    );
  };

  const handleCreateAgent = () => {
    if (!newName.trim() || !newRole.trim()) return;

    const created: Agent = {
      id: `${Date.now()}`,
      name: newName,
      role: newRole,
      color: "#1E1F24",
      status: "online",
      avatar: newName.charAt(0).toUpperCase(),
      description: newDesc || `${newRole} AI worker.`,
      soul: newSoul || `I am ${newName}, a ${newRole}.`,
      primaryModel: newPrimaryModel || "gemini-3.6-flash-lite",
      backupModel: newBackupModel || "claude-3-5-sonnet",
      skills: [
        { name: "Task Execution", icon: "Code2", proficiency: 85 },
        { name: "PRD Analysis", icon: "FileText", proficiency: 80 },
      ],
      stats: { tasksCompleted: 0, tokensSaved: "0k", uptime: "100%" },
    };

    setAgents((prev) => [...prev, created]);
    setCreateModalOpen(false);
    setNewName("");
    setNewRole("");
    setNewDesc("");
    setNewSoul("");
    addToast(`Agent ${created.name} (${created.role}) hired!`, "success");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FAF8F5] text-[#1E1F24] select-none">
      {/* Top Header */}
      <div className="border-b border-[rgba(0,0,0,0.08)] px-6 py-4 bg-white flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-bold text-[#1E1F24]">AI Talent Directory</h1>
          <p className="text-[11px] text-[#878890]">
            Freeform model inputs, backup failover models, and BYOK Enterprise API Vault
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setVaultModalOpen(true)}
            className="btn btn-secondary btn-sm rounded-xl font-semibold"
          >
            <Key size={13} />
            <span>API Vault (BYOK)</span>
          </button>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="btn btn-primary btn-sm rounded-xl px-3.5 py-2 font-semibold shadow-sm"
          >
            <Plus size={14} />
            <span>Hire New Agent</span>
          </button>
        </div>
      </div>

      {/* Agents Card Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent) => (
            <motion.div
              key={agent.id}
              layout
              className="card bg-white p-5 space-y-4 relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <AgentAvatar name={agent.name} size={40} />
                    <div>
                      <h3 className="text-sm font-bold text-[#1E1F24]">{agent.name}</h3>
                      <p className="text-[11px] text-[#72737A] font-medium">{agent.role}</p>
                    </div>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                </div>

                <p className="text-xs text-[#52535A] leading-relaxed mb-4">
                  {agent.description}
                </p>

                {/* Freeform Primary & Backup Model Inputs */}
                <div className="p-3 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] space-y-2 mb-4">
                  <div>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-[#1E1F24] uppercase mb-0.5">
                      <Cpu size={11} className="text-emerald-600" />
                      <span>PRIMARY MODEL</span>
                    </div>
                    <input
                      type="text"
                      value={agent.primaryModel}
                      onChange={(e) => handleUpdateModels(agent.id, e.target.value, agent.backupModel)}
                      placeholder="e.g. gemini-3.6-flash-lite"
                      className="w-full px-2.5 py-1 rounded-lg bg-white border border-[rgba(0,0,0,0.12)] font-mono text-xs text-[#1E1F24] outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-[#72737A] uppercase mb-0.5">
                      <RefreshCw size={11} className="text-amber-600" />
                      <span>BACKUP FAILOVER MODEL</span>
                    </div>
                    <input
                      type="text"
                      value={agent.backupModel}
                      onChange={(e) => handleUpdateModels(agent.id, agent.primaryModel, e.target.value)}
                      placeholder="e.g. claude-3-5-sonnet"
                      className="w-full px-2.5 py-1 rounded-lg bg-white border border-[rgba(0,0,0,0.12)] font-mono text-xs text-[#52535A] outline-none"
                    />
                  </div>
                </div>

                {/* Skills */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-[#878890] uppercase tracking-wider">
                    Learned Workflows & Skills
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.skills.map((sk) => (
                      <span key={sk.name} className="px-2 py-0.5 rounded-lg bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] text-[10.5px] font-medium text-[#1E1F24]">
                        {sk.name} ({sk.proficiency}%)
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between text-[11px] text-[#878890]">
                <span>{agent.stats.tasksCompleted} Tasks Done</span>
                <button
                  onClick={() => setSelectedAgent(agent)}
                  className="text-xs font-semibold text-[#1E1F24] hover:underline"
                >
                  View SOUL.md Excerpt ➔
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* API Vault Modal */}
      <APIVaultModal isOpen={vaultModalOpen} onClose={() => setVaultModalOpen(false)} />

      {/* Hire Agent Modal */}
      <AnimatePresence>
        {createModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setCreateModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white border border-[rgba(0,0,0,0.12)] rounded-3xl p-6 shadow-xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(0,0,0,0.08)]">
                <h2 className="text-sm font-bold text-[#1E1F24]">Hire New AI Employee</h2>
                <button onClick={() => setCreateModalOpen(false)} className="btn-icon">
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">NAME</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Nova-Coder"
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] text-xs outline-none focus:border-[#1E1F24]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">ROLE</label>
                  <input
                    type="text"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    placeholder="e.g. DevOps Engineer"
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] text-xs outline-none focus:border-[#1E1F24]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">PRIMARY MODEL (ANY STRING)</label>
                  <input
                    type="text"
                    value={newPrimaryModel}
                    onChange={(e) => setNewPrimaryModel(e.target.value)}
                    placeholder="e.g. gemini-3.6-flash-lite or deepseek-r1"
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] text-xs font-mono outline-none focus:border-[#1E1F24]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">BACKUP FAILOVER MODEL</label>
                  <input
                    type="text"
                    value={newBackupModel}
                    onChange={(e) => setNewBackupModel(e.target.value)}
                    placeholder="e.g. claude-3-5-sonnet"
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] text-xs font-mono outline-none focus:border-[#1E1F24]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">SOUL.MD IDENTITY</label>
                  <textarea
                    rows={3}
                    value={newSoul}
                    onChange={(e) => setNewSoul(e.target.value)}
                    placeholder="Describe identity, system prompts, and behavior rules..."
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] text-xs outline-none focus:border-[#1E1F24]"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setCreateModalOpen(false)} className="btn btn-secondary flex-1 justify-center">
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

      {/* View SOUL.md Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedAgent(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-white border border-[rgba(0,0,0,0.12)] rounded-3xl p-6 shadow-xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(0,0,0,0.08)]">
                <div className="flex items-center gap-2.5">
                  <AgentAvatar name={selectedAgent.name} size={28} />
                  <div>
                    <h2 className="text-sm font-bold text-[#1E1F24]">{selectedAgent.name} — SOUL.md</h2>
                    <p className="text-[11px] text-[#72737A]">{selectedAgent.role}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedAgent(null)} className="btn-icon">
                  <X size={15} />
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] font-mono text-xs text-[#1E1F24] leading-relaxed whitespace-pre-wrap">
                {selectedAgent.soul}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
