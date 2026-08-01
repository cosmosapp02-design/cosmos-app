"use client";

import { useCallback, useState, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  Connection,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, UserPlus, Crown, Bot, Sparkles, Trash2, ArrowUpRight, CheckCircle2 } from "lucide-react";
import AgentAvatar from "./agent-avatar";
import { useToast } from "./toast";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

type AgentNodeData = {
  id: string;
  name: string;
  role: string;
  color: string;
  isRoot?: boolean;
  onRemoveNode?: (id: string) => void;
} & Record<string, unknown>;

function AgentNode({ data }: { data: any }) {
  const d = data as AgentNodeData;
  return (
    <div
      className="rounded-2xl bg-white p-3.5 border border-[rgba(0,0,0,0.12)] shadow-sm min-w-[190px] relative group"
      style={{ borderTop: `3px solid ${d.color}` }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#1E1F24] !w-2.5 !h-2.5" />
      
      {!d.isRoot && d.onRemoveNode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            d.onRemoveNode!(d.id);
          }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-[rgba(0,0,0,0.15)] text-[#72737A] hover:text-red-600 hover:bg-red-50 hover:border-red-200 flex items-center justify-center shadow-2xs transition-colors"
          title="Remove Node"
        >
          <X size={11} />
        </button>
      )}

      <div className="flex items-center gap-2.5">
        {d.isRoot ? (
          <div className="w-8 h-8 rounded-full bg-[#1E1F24] text-amber-400 flex items-center justify-center font-bold text-xs shadow-sm">
            <Crown size={15} />
          </div>
        ) : (
          <AgentAvatar name={d.name} size={32} />
        )}
        <div>
          <div className="text-xs font-bold text-[#1E1F24]">{d.name}</div>
          <div className="text-[10px] text-[#72737A] font-medium">{d.role}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[#1E1F24] !w-2.5 !h-2.5" />
    </div>
  );
}

function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onDeleteEdge = (data as any)?.onDeleteEdge;

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ ...style, stroke: "#1E1F24", strokeWidth: 2 }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          <button
            className="w-5 h-5 rounded-full bg-white border border-[rgba(0,0,0,0.15)] text-[#72737A] hover:text-red-600 hover:border-red-300 hover:bg-red-50 flex items-center justify-center shadow-2xs transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              if (onDeleteEdge) {
                onDeleteEdge(id);
              }
            }}
            title="Delete Link Line"
          >
            <X size={10} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { deletableEdge: DeletableEdge };

export default function OrgChartView() {
  const { user, orgName } = useAuth();
  const { addToast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Unassigned employees picker state
  const [availableAgents, setAvailableAgents] = useState<any[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Remove node modal state
  const [removeNodeTarget, setRemoveNodeTarget] = useState<Node | null>(null);

  // Remove handler passed into node data
  const handleRequestRemoveNode = useCallback((nodeId: string) => {
    setNodes((currentNodes) => {
      const target = currentNodes.find((n) => n.id === nodeId);
      if (target) {
        setRemoveNodeTarget(target);
      }
      return currentNodes;
    });
  }, [setNodes]);

  // Edge delete handler
  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    addToast("Link line deleted.", "info");
  }, [setEdges, addToast]);

  const fetchOrgStructure = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch synced agents from backend
      let syncedList: any[] = [];
      try {
        const syncRes = await fetch("/api/v1/agents/sync");
        if (syncRes.ok) {
          const sJson = await syncRes.json();
          if (sJson.agents) syncedList = sJson.agents;
        }
      } catch (e) {}

      let dbAgents: any[] = [];
      try {
        const { data } = await supabase.from("agents").select("*");
        if (data) dbAgents = data;
      } catch (e) {}

      // Combine agents
      const agentMap = new Map<string, any>();
      syncedList.forEach((a) => agentMap.set(a.name.toLowerCase(), a));
      dbAgents.forEach((a) => agentMap.set(a.name.toLowerCase(), a));
      const allAgents = Array.from(agentMap.values());
      setAvailableAgents(allAgents);

      // Check if a saved org structure exists in DB / .org_structure.json
      let savedOrg: any = null;
      try {
        const saveRes = await fetch("/api/v1/org/save");
        if (saveRes.ok) {
          savedOrg = await saveRes.json();
        }
      } catch (e) {}

      // CEO root node definition
      const ceoNode: Node = {
        id: "ceo",
        type: "agentNode",
        position: { x: 300, y: 40 },
        data: {
          id: "ceo",
          name: orgName ? `${orgName} (CEO)` : (user?.email ? `${user.email} (CEO)` : "User (CEO)"),
          role: "Chief Executive Officer / Organization Lead",
          color: "#1E1F24",
          isRoot: true,
        } as AgentNodeData,
      };

      if (savedOrg && savedOrg.nodes && Array.isArray(savedOrg.nodes) && savedOrg.nodes.length > 0) {
        let reboundNodes = savedOrg.nodes.map((n: Node) => ({
          ...n,
          data: {
            ...n.data,
            onRemoveNode: handleRequestRemoveNode,
          },
        }));

        // Guarantee CEO node is always present at top
        const hasCeo = reboundNodes.some((n: Node) => n.id === "ceo" || (n.data as any)?.isRoot);
        if (!hasCeo) {
          reboundNodes = [ceoNode, ...reboundNodes];
        }

        const reboundEdges = (savedOrg.edges || []).map((e: Edge) => ({
          ...e,
          type: "deletableEdge",
          data: { onDeleteEdge: handleDeleteEdge },
        }));

        setNodes(reboundNodes);
        setEdges(reboundEdges);
        return;
      }

      const initialNodes: Node[] = [ceoNode];
      const initialEdges: Edge[] = [];

      allAgents.forEach((agent: any, index: number) => {
        const nodeId = `node-${agent.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
        const xPos = 80 + (index % 4) * 230;
        const yPos = 200 + Math.floor(index / 4) * 170;

        initialNodes.push({
          id: nodeId,
          type: "agentNode",
          position: { x: xPos, y: yPos },
          data: {
            id: nodeId,
            name: agent.name,
            role: agent.role,
            color: agent.avatar_color || "#1E1F24",
            onRemoveNode: handleRequestRemoveNode,
          } as AgentNodeData,
        });

        initialEdges.push({
          id: `edge-ceo-${nodeId}`,
          source: "ceo",
          target: nodeId,
          type: "deletableEdge",
          animated: true,
          data: { onDeleteEdge: handleDeleteEdge },
        });
      });

      setNodes(initialNodes);
      setEdges(initialEdges);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, [orgName, setNodes, setEdges, handleRequestRemoveNode, handleDeleteEdge]);

  useEffect(() => {
    fetchOrgStructure();
  }, [fetchOrgStructure]);

  // Connect new edges
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "deletableEdge",
            animated: true,
            data: { onDeleteEdge: handleDeleteEdge },
          },
          eds
        )
      ),
    [setEdges, handleDeleteEdge]
  );

  // Unassigned employees for picker
  const unassignedAgents = availableAgents.filter((agent) => {
    const normName = agent.name.toLowerCase();
    return !nodes.some(
      (n) => (n.data as AgentNodeData)?.name?.toLowerCase() === normName
    );
  });

  // Add Employee handler
  const handleAddEmployeeToChart = (agent: any) => {
    const nodeId = `node-${agent.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const newIndex = nodes.length;
    const xPos = 120 + (newIndex % 4) * 230;
    const yPos = 220 + Math.floor(newIndex / 4) * 160;

    const newNode: Node = {
      id: nodeId,
      type: "agentNode",
      position: { x: xPos, y: yPos },
      data: {
        id: nodeId,
        name: agent.name,
        role: agent.role,
        color: agent.avatar_color || "#1E1F24",
        onRemoveNode: handleRequestRemoveNode,
      } as AgentNodeData,
    };

    // Auto edge from CEO
    const newEdge: Edge = {
      id: `edge-ceo-${nodeId}`,
      source: "ceo",
      target: nodeId,
      type: "deletableEdge",
      animated: true,
      data: { onDeleteEdge: handleDeleteEdge },
    };

    setNodes((prev) => [...prev, newNode]);
    setEdges((prev) => [...prev, newEdge]);
    setAddModalOpen(false);
    addToast(`Added ${agent.name} to Organization Chart!`, "success");
  };

  // Node Removal Option A: Subtree deletion (Employee + reports under them)
  const handleRemoveSubtree = () => {
    if (!removeNodeTarget) return;
    const targetId = removeNodeTarget.id;

    // Find all downstream children recursively
    const nodesToRemove = new Set<string>([targetId]);
    const queue = [targetId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      edges.forEach((e) => {
        if (e.source === current && !nodesToRemove.has(e.target)) {
          nodesToRemove.add(e.target);
          queue.push(e.target);
        }
      });
    }

    setNodes((prev) => prev.filter((n) => !nodesToRemove.has(n.id)));
    setEdges((prev) =>
      prev.filter((e) => !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target))
    );

    addToast(`Removed ${(removeNodeTarget.data as any).name} and downstream reports.`, "info");
    setRemoveNodeTarget(null);
  };

  // Node Removal Option B: Single Node deletion (Shift reports up to manager)
  const handleRemoveSingleNode = () => {
    if (!removeNodeTarget) return;
    const targetId = removeNodeTarget.id;

    // Incoming parents and outgoing children
    const parentSources = edges.filter((e) => e.target === targetId).map((e) => e.source);
    const childTargets = edges.filter((e) => e.source === targetId).map((e) => e.target);

    // Create direct edges from parent to children
    const newReconnectedEdges: Edge[] = [];
    parentSources.forEach((pSource) => {
      childTargets.forEach((cTarget) => {
        newReconnectedEdges.push({
          id: `edge-${pSource}-${cTarget}`,
          source: pSource,
          target: cTarget,
          type: "deletableEdge",
          animated: true,
          data: { onDeleteEdge: handleDeleteEdge },
        });
      });
    });

    setNodes((prev) => prev.filter((n) => n.id !== targetId));
    setEdges((prev) => {
      const filtered = prev.filter((e) => e.source !== targetId && e.target !== targetId);
      return [...filtered, ...newReconnectedEdges];
    });

    addToast(
      `Removed ${(removeNodeTarget.data as any).name}. Reports shifted up to manager.`,
      "info"
    );
    setRemoveNodeTarget(null);
  };

  // Save Org Structure to /Users/cosmos/AGENTS.md
  const handleSaveOrgStructure = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/v1/org/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });

      if (res.ok) {
        addToast("Org hierarchy structure saved to /Users/cosmos/AGENTS.md!", "success");
      } else {
        const errJson = await res.json();
        addToast(errJson.error || "Failed to save hierarchy.", "danger");
      }
    } catch (e: any) {
      addToast(e.message || "Failed to save hierarchy.", "danger");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FAF8F5] text-[#1E1F24] select-none">
      {/* Header Bar */}
      <div className="border-b border-[rgba(0,0,0,0.08)] px-6 py-4 bg-white flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-bold text-[#1E1F24]">Organization Hierarchy</h1>
          <p className="text-[11px] text-[#878890]">
            Live command reporting structure synced with /Users/cosmos/AGENTS.md
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddModalOpen(true)}
            className="btn btn-secondary btn-sm rounded-xl font-semibold flex items-center gap-1.5"
          >
            <Plus size={14} />
            <span>Add Employee</span>
          </button>
          <button
            onClick={handleSaveOrgStructure}
            disabled={isSaving}
            className="btn btn-primary btn-sm rounded-xl px-4 py-2 font-semibold shadow-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles size={13} className="text-amber-400 animate-pulse" />
            <span>{isSaving ? "Saving..." : "Update Org Structure"}</span>
          </button>
        </div>
      </div>

      {/* ReactFlow Canvas */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-xs text-[#878890]">
            Loading organization hierarchy...
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            className="bg-[#FAF8F5]"
          >
            <Controls className="!bg-white !border-[rgba(0,0,0,0.08)] !rounded-xl !shadow-xs" />
            <Background color="#878890" variant={BackgroundVariant.Dots} />
          </ReactFlow>
        )}
      </div>

      {/* Add Employee Modal */}
      <AnimatePresence>
        {addModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setAddModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white border border-[rgba(0,0,0,0.12)] rounded-3xl p-6 shadow-xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(0,0,0,0.08)]">
                <div className="flex items-center gap-2">
                  <UserPlus size={16} className="text-[#1E1F24]" />
                  <h2 className="text-sm font-bold text-[#1E1F24]">Add Employee to Flowchart</h2>
                </div>
                <button onClick={() => setAddModalOpen(false)} className="btn-icon">
                  <X size={15} />
                </button>
              </div>

              <p className="text-xs text-[#72737A]">
                Select an unassigned AI worker to place into the organization chart:
              </p>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {unassignedAgents.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] text-center text-xs text-[#878890]">
                    All hired AI employees are currently assigned in the Organization Chart!
                  </div>
                ) : (
                  unassignedAgents.map((agent) => (
                    <div
                      key={agent.name}
                      onClick={() => handleAddEmployeeToChart(agent)}
                      className="p-3 rounded-2xl bg-white border border-[rgba(0,0,0,0.1)] hover:border-[#1E1F24] hover:bg-[#FAF8F5] transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <AgentAvatar name={agent.name} size={34} />
                        <div>
                          <div className="text-xs font-bold text-[#1E1F24]">{agent.name}</div>
                          <div className="text-[11px] text-[#72737A]">{agent.role}</div>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-[#1E1F24] group-hover:translate-x-0.5 transition-transform">
                        Add +
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button onClick={() => setAddModalOpen(false)} className="btn btn-secondary text-xs">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Remove Node Modal (2 Options) */}
      <AnimatePresence>
        {removeNodeTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setRemoveNodeTarget(null)}
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
                  Remove {(removeNodeTarget.data as any).name}?
                </h2>
                <button onClick={() => setRemoveNodeTarget(null)} className="btn-icon">
                  <X size={15} />
                </button>
              </div>

              <p className="text-xs text-[#72737A] leading-relaxed">
                Choose how to update the hierarchy tree when removing this employee node:
              </p>

              <div className="space-y-2.5">
                <button
                  onClick={handleRemoveSingleNode}
                  className="w-full p-3.5 rounded-2xl border border-[rgba(0,0,0,0.12)] hover:border-[#1E1F24] hover:bg-[#FAF8F5] text-left transition-all group"
                >
                  <div className="text-xs font-bold text-[#1E1F24] flex items-center justify-between">
                    <span>1. Remove this employee only</span>
                    <span className="text-[11px] text-blue-600 font-semibold group-hover:underline">Select ➔</span>
                  </div>
                  <div className="text-[11px] text-[#72737A] mt-0.5 leading-normal">
                    Removes employee node. Direct reports will shift up and connect directly to their manager.
                  </div>
                </button>

                <button
                  onClick={handleRemoveSubtree}
                  className="w-full p-3.5 rounded-2xl border border-red-200 hover:border-red-400 hover:bg-red-50 text-left transition-all group"
                >
                  <div className="text-xs font-bold text-red-600 flex items-center justify-between">
                    <span>2. Remove employee & all reports under them</span>
                    <span className="text-[11px] text-red-600 font-semibold group-hover:underline">Select ➔</span>
                  </div>
                  <div className="text-[11px] text-red-700/80 mt-0.5 leading-normal">
                    Deletes employee node and all downstream reported sub-trees from the flowchart.
                  </div>
                </button>
              </div>

              <div className="pt-2 flex justify-end">
                <button onClick={() => setRemoveNodeTarget(null)} className="btn btn-secondary text-xs">
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
