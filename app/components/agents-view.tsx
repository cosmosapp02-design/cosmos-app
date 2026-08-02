"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Check, Code2, Calendar, FileText, Megaphone, Triangle, Server, FlaskConical, Eye, GitMerge, Bot, UserPlus, Key, Cpu, Sparkles, RefreshCw, ShieldAlert, CheckCircle2, Terminal, MoreVertical, Edit3, Trash2,
} from "lucide-react";
import AgentAvatar from "./agent-avatar";
import { useToast } from "./toast";
import APIVaultModal from "./api-vault-modal";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

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

export default function AgentsView() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newSoul, setNewSoul] = useState("");
  const [newPrimaryModel, setNewPrimaryModel] = useState("gemini-3.6-flash-lite");
  const [newBackupModel, setNewBackupModel] = useState("claude-3-5-sonnet");

  // Live creation & edit/delete status
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [openMenuAgentId, setOpenMenuAgentId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creationStepText, setCreationStepText] = useState("");
  const [creationLogs, setCreationLogs] = useState<string[]>([]);

  const { user } = useAuth();
  const { addToast } = useToast();

  const fetchUserAgents = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Sync disk Hermes profiles with backend
      let syncAgents: any[] = [];
      try {
        const syncRes = await fetch("/api/v1/agents/sync");
        if (syncRes.ok) {
          const resJson = await syncRes.json();
          if (resJson.agents) syncAgents = resJson.agents;
        }
      } catch (e) {}

      // 2. Fetch DB agents
      let dbAgents: any[] = [];
      try {
        const { data } = await supabase.from("agents").select("*");
        if (data) dbAgents = data;
      } catch (e) {}

      // 3. Merge agents by normalized name
      const mergedMap = new Map<string, any>();

      for (const ag of syncAgents) {
        mergedMap.set(ag.name.toLowerCase(), ag);
      }

      for (const ag of dbAgents) {
        mergedMap.set(ag.name.toLowerCase(), ag);
      }

      const allAgentsList = Array.from(mergedMap.values());

      const mapped: Agent[] = allAgentsList.map((item: any, idx: number) => ({
        id: item.id || `ag-${idx}-${item.name}`,
        name: item.name,
        role: item.role || "AI Specialist",
        color: item.avatar_color || "#1E1F24",
        status: "online",
        avatar: item.name.charAt(0).toUpperCase(),
        description: item.purpose || `${item.role} AI employee.`,
        soul: item.purpose || `I am ${item.name}, operating as ${item.role}.`,
        primaryModel: item.primary_model || "nvidia/nemotron-3-super-12",
        backupModel: item.backup_model || "claude-3-5-sonnet",
        skills: Array.isArray(item.skills)
          ? item.skills.map((s: string) => ({ name: s, icon: "Code2", proficiency: 90 }))
          : [{ name: "Task Execution", icon: "Code2", proficiency: 90 }],
        stats: { tasksCompleted: 1, tokensSaved: "4k", uptime: "100%" },
      }));

      setAgents(mapped);
    } catch (err: any) {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserAgents();
  }, [fetchUserAgents]);

  const handleOpenEditModal = (agent: Agent) => {
    setEditingAgent(agent);
    setNewName(agent.name);
    setNewRole(agent.role);
    setNewDesc(agent.description);
    setNewSoul(agent.soul);
    setNewPrimaryModel(agent.primaryModel);
    setNewBackupModel(agent.backupModel);
    setCreateModalOpen(true);
    setOpenMenuAgentId(null);
  };

  const handleOpenCreateModal = () => {
    setEditingAgent(null);
    setNewName("");
    setNewRole("");
    setNewDesc("");
    setNewSoul("");
    setNewPrimaryModel("gemini-3.6-flash-lite");
    setNewBackupModel("claude-3-5-sonnet");
    setCreateModalOpen(true);
    setOpenMenuAgentId(null);
  };

  const handleDeleteAgent = async (agent: Agent) => {
    setOpenMenuAgentId(null);
    try {
      const res = await fetch("/api/v1/agents/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agent.name,
          profileName: agent.name.toLowerCase().replace(/\s+/g, "-"),
        }),
      });
      if (res.ok) {
        addToast(`Agent ${agent.name} fired from Hermes workforce.`, "success");
        fetchUserAgents();
      } else {
        const errJson = await res.json();
        addToast(errJson.error || "Failed to delete agent.", "danger");
      }
    } catch (e: any) {
      addToast(e.message || "Failed to delete agent.", "danger");
    }
  };

  const handleUpdateAgent = async () => {
    if (!newRole.trim()) return;

    setIsCreating(true);
    setCreationStepText(`Updating ${newName}'s SOUL.md configuration...`);

    try {
      const res = await fetch("/api/v1/agents/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          role: newRole,
          description: newDesc,
          soul: newSoul,
          primaryModel: newPrimaryModel,
          backupModel: newBackupModel,
          userId: user?.id,
        }),
      });

      if (res.ok) {
        addToast(`Agent ${newName} updated successfully!`, "success");
        setTimeout(() => {
          fetchUserAgents();
          setCreateModalOpen(false);
          setIsCreating(false);
          setEditingAgent(null);
          setNewName("");
          setNewRole("");
          setNewDesc("");
          setNewSoul("");
          setCreationStepText("");
        }, 800);
      } else {
        const errJson = await res.json();
        addToast(errJson.error || "Failed to update agent.", "danger");
        setIsCreating(false);
      }
    } catch (err: any) {
      addToast(err.message || "Failed to update agent.", "danger");
      setIsCreating(false);
    }
  };

  const handleCreateAgent = async () => {
    if (editingAgent) {
      return handleUpdateAgent();
    }
    if (!newName.trim() || !newRole.trim()) return;

    setIsCreating(true);
    setCreationStepText("Initializing Hermes agent pipeline...");
    setCreationLogs([]);

    try {
      const response = await fetch("/api/v1/agents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          role: newRole,
          description: newDesc,
          soul: newSoul,
          primaryModel: newPrimaryModel,
          backupModel: newBackupModel,
          userId: user?.id,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to connect to agent creation pipeline.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.substring(6));
              if (data.message) {
                setCreationStepText(data.message);
                setCreationLogs((prev) => [...prev, data.message]);
              }

              if (data.status === "completed") {
                if (user) {
                  // DB agent is registered server-side in /api/v1/agents/create route with org_id
                }

                addToast(`Agent ${newName} (${newRole}) hired! Profile created.`, "success");

                setTimeout(() => {
                  fetchUserAgents();
                  setCreateModalOpen(false);
                  setIsCreating(false);
                  setNewName("");
                  setNewRole("");
                  setNewDesc("");
                  setNewSoul("");
                  setCreationLogs([]);
                  setCreationStepText("");
                }, 1200);
              } else if (data.status === "error") {
                addToast(data.message, "danger");
                setIsCreating(false);
              }
            } catch (e) {}
          }
        }
      }
    } catch (err: any) {
      addToast(err.message || "Failed to create agent.", "danger");
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FAF8F5] text-[#1E1F24] select-none">
      {/* Top Header */}
      <div className="border-b border-[rgba(0,0,0,0.08)] px-6 py-4 bg-white flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-bold text-[#1E1F24]">AI Talent Directory</h1>
          <p className="text-[11px] text-[#878890]">
            Your private AI organization workforce (Synced with Supabase DB)
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
            onClick={handleOpenCreateModal}
            className="btn btn-primary btn-sm rounded-xl px-3.5 py-2 font-semibold shadow-sm"
          >
            <Plus size={14} />
            <span>Hire New Agent</span>
          </button>
        </div>
      </div>

      {/* Agents Card Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-xs text-[#878890]">
            Loading your organization agents...
          </div>
        ) : agents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#1E1F24] text-white flex items-center justify-center mx-auto shadow-sm">
              <Bot size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1E1F24]">Clean Slate Workspace</h3>
              <p className="text-xs text-[#72737A] mt-1 leading-relaxed">
                You have 0 agents in your company. Hire your first AI employee to start executing work!
              </p>
            </div>
            <button
              onClick={handleOpenCreateModal}
              className="btn btn-primary rounded-xl px-4 py-2 text-xs font-semibold"
            >
              <Plus size={14} />
              <span>Hire First AI Employee</span>
            </button>
          </div>
        ) : (
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
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuAgentId(openMenuAgentId === agent.id ? null : agent.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-black/5 text-[#72737A] transition-colors"
                          title="Agent Options"
                        >
                          <MoreVertical size={15} />
                        </button>

                        {openMenuAgentId === agent.id && (
                          <div className="absolute right-0 top-8 z-30 w-36 bg-white rounded-2xl border border-[rgba(0,0,0,0.12)] shadow-lg p-1 text-xs">
                            <button
                              onClick={() => handleOpenEditModal(agent)}
                              className="w-full px-3 py-1.5 rounded-xl flex items-center gap-2 hover:bg-black/5 text-[#1E1F24] font-medium text-left"
                            >
                              <Edit3 size={13} className="text-blue-600" />
                              <span>Edit Agent</span>
                            </button>
                            <button
                              onClick={() => handleDeleteAgent(agent)}
                              className="w-full px-3 py-1.5 rounded-xl flex items-center gap-2 hover:bg-red-50 text-red-600 font-medium text-left"
                            >
                              <Trash2 size={13} className="text-red-500" />
                              <span>Fire / Remove</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
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
                          {sk.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between text-[11px] text-[#878890]">
                  <span>100% Active</span>
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
        )}
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
                <h2 className="text-sm font-bold text-[#1E1F24]">
                  {editingAgent ? `Edit ${editingAgent.name}` : "Hire New AI Employee"}
                </h2>
                <button onClick={() => setCreateModalOpen(false)} className="btn-icon">
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">
                    NAME {editingAgent && "(READ-ONLY)"}
                  </label>
                  <input
                    type="text"
                    value={newName}
                    disabled={!!editingAgent}
                    onChange={(e) => setNewName(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                    placeholder="e.g. NovaCoder42"
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] text-xs outline-none focus:border-[#1E1F24] disabled:bg-black/5 disabled:text-[#878890] disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-[#878890] mt-1 font-medium">Letters and numbers only (no spaces or symbols)</p>
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
                <button
                  onClick={() => setCreateModalOpen(false)}
                  disabled={isCreating}
                  className="btn btn-secondary flex-1 justify-center disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAgent}
                  disabled={isCreating || !newName.trim() || !newRole.trim()}
                  className="btn btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {isCreating
                    ? (editingAgent ? "Saving..." : "Hiring Agent...")
                    : (editingAgent ? "Save Changes" : "Hire Agent")}
                </button>
              </div>

              {/* Live Progress Status Indicator */}
              {(isCreating || creationLogs.length > 0) && (
                <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.1)] space-y-2 mt-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#1E1F24]">
                    {isCreating ? (
                      <Sparkles size={14} className="animate-spin text-amber-500 shrink-0" />
                    ) : (
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    )}
                    <span className="truncate">{creationStepText}</span>
                  </div>

                  {creationLogs.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-white border border-[rgba(0,0,0,0.06)] font-mono text-[10.5px] text-[#52535A] space-y-1 max-h-28 overflow-y-auto">
                      {creationLogs.map((log, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 leading-snug">
                          <span className="w-1.2 h-1.2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="truncate">{log}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
