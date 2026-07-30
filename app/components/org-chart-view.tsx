"use client";

import { useCallback, useState } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, UserPlus, Crown, Megaphone, LineChart, Database } from "lucide-react";
import AgentAvatar from "./agent-avatar";

type AgentNodeData = {
  name: string;
  role: string;
  color: string;
  isRoot?: boolean;
} & Record<string, unknown>;

const initialNodes: Node[] = [
  {
    id: "ceo", type: "agentNode", position: { x: 280, y: 40 },
    data: { name: "You (CEO)", role: "Chief Executive Officer", color: "#1E1F24", isRoot: true } as AgentNodeData,
  },
  {
    id: "alex", type: "agentNode", position: { x: 280, y: 200 },
    data: { name: "Alex", role: "Product Manager", color: "#1E1F24" } as AgentNodeData,
  },
  {
    id: "devbot", type: "agentNode", position: { x: 80, y: 370 },
    data: { name: "Dev-Bot", role: "Senior Coder", color: "#1E1F24" } as AgentNodeData,
  },
  {
    id: "qaguard", type: "agentNode", position: { x: 480, y: 370 },
    data: { name: "QA-Guard", role: "QA Inspector", color: "#1E1F24" } as AgentNodeData,
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "ceo", target: "alex", type: "smoothstep", animated: true, style: { stroke: "#1E1F24" } },
  { id: "e2-3", source: "alex", target: "devbot", type: "smoothstep", animated: true, style: { stroke: "#1E1F24" } },
  { id: "e2-4", source: "alex", target: "qaguard", type: "smoothstep", animated: true, style: { stroke: "#1E1F24" } },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AgentNode({ data }: { data: any }) {
  const d = data as AgentNodeData;
  return (
    <div
      className="rounded-2xl bg-white p-3.5 border border-[rgba(0,0,0,0.12)] shadow-sm min-w-[180px]"
    >
      {!d.isRoot && <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />}
      <div className="flex items-center gap-3">
        <AgentAvatar name={d.name.replace("You (", "").replace(")", "")} size={36} />
        <div className="min-w-0">
          <div className="t-small font-semibold text-[#1E1F24] truncate">{d.name}</div>
          <div className="t-micro text-[#72737A] truncate mt-0.5">{d.role}</div>
          {d.isRoot && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-[#EFECE6] text-[9px] font-bold text-[#1E1F24]">
              <Crown size={9} /> Human
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: any = { agentNode: AgentNode };

const availableAgents = [
  { id: "mktbot",  name: "Mkt-Bot",  role: "Marketing Agent",  color: "#1E1F24", Icon: Megaphone },
  { id: "bizdev",  name: "Biz-Dev",  role: "Business Dev",     color: "#1E1F24", Icon: LineChart },
  { id: "databot", name: "Data-Bot", role: "Data Analyst",     color: "#1E1F24", Icon: Database },
];

export default function OrgChartView() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [showAddPanel, setShowAddPanel] = useState(false);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: "smoothstep", animated: true, style: { stroke: "#1E1F24" } }, eds)),
    [setEdges]
  );

  const addAgent = (agent: typeof availableAgents[0]) => {
    if (nodes.find((n) => n.id === agent.id)) return;
    const newNode: Node = {
      id: agent.id,
      type: "agentNode",
      position: { x: 60 + Math.random() * 480, y: 380 + Math.random() * 80 },
      data: { name: agent.name, role: agent.role, color: agent.color } as AgentNodeData,
    };
    setNodes((ns) => [...ns, newNode]);
    setShowAddPanel(false);
  };

  return (
    <div className="h-full flex flex-col bg-[#FAF8F5]">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-6 shrink-0 bg-white"
        style={{ height: 56, borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <h1 className="t-h2 text-[#1E1F24]">Command Hierarchy Canvas</h1>
          <p className="t-micro text-[#878890]">
            {nodes.length} nodes · Drag to rearrange · Connect handles to define reporting lines
          </p>
        </div>
        <button
          onClick={() => setShowAddPanel(true)}
          className="btn btn-primary btn-sm"
        >
          <UserPlus size={14} /> Add Agent
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.35 }}
          colorMode="light"
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgba(0,0,0,0.06)" />
          <Controls position="bottom-left" className="!bg-white !border-[rgba(0,0,0,0.1)] !rounded-xl" />
        </ReactFlow>
      </div>

      {/* Add Agent Panel */}
      <AnimatePresence>
        {showAddPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAddPanel(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white border border-[rgba(0,0,0,0.12)] rounded-2xl p-6 shadow-xl space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(0,0,0,0.08)]">
                <h2 className="t-h2 text-[#1E1F24]">Add Agent to Canvas</h2>
                <button className="btn-icon" onClick={() => setShowAddPanel(false)}><X size={15} /></button>
              </div>
              <div className="space-y-2 pt-1">
                {availableAgents.map((agent) => {
                  const alreadyAdded = nodes.find((n) => n.id === agent.id);
                  return (
                    <button
                      key={agent.id}
                      onClick={() => !alreadyAdded && addAgent(agent)}
                      disabled={Boolean(alreadyAdded)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-[rgba(0,0,0,0.08)] hover:bg-[#FAF8F5] transition-all text-left disabled:opacity-50"
                    >
                      <AgentAvatar name={agent.name} size={36} />
                      <div className="flex-1">
                        <div className="t-small font-semibold text-[#1E1F24]">{agent.name}</div>
                        <div className="t-micro text-[#878890]">{agent.role}</div>
                      </div>
                      {alreadyAdded ? (
                        <span className="badge badge-neutral">Added</span>
                      ) : (
                        <Plus size={15} className="text-[#1E1F24]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
