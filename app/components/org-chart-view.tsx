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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, UserPlus, Crown, Bot } from "lucide-react";
import AgentAvatar from "./agent-avatar";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

type AgentNodeData = {
  name: string;
  role: string;
  color: string;
  isRoot?: boolean;
} & Record<string, unknown>;

function AgentNode({ data }: { data: any }) {
  const d = data as AgentNodeData;
  return (
    <div
      className="rounded-2xl bg-white p-3.5 border border-[rgba(0,0,0,0.12)] shadow-sm min-w-[180px]"
      style={{ borderTop: `3px solid ${d.color}` }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#1E1F24] !w-2 !h-2" />
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
      <Handle type="source" position={Position.Bottom} className="!bg-[#1E1F24] !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode };

export default function OrgChartView() {
  const { user, orgName } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrgStructure = useCallback(async () => {
    setLoading(true);
    try {
      if (!user) return;

      const { data: dbAgents } = await supabase
        .from("agents")
        .select("*")
        .eq("user_id", user.id);

      const ceoNode: Node = {
        id: "ceo",
        type: "agentNode",
        position: { x: 280, y: 40 },
        data: {
          name: orgName ? `${orgName} (CEO)` : `${user.email} (CEO)`,
          role: "Chief Executive Officer",
          color: "#1E1F24",
          isRoot: true,
        } as AgentNodeData,
      };

      if (dbAgents && dbAgents.length > 0) {
        const generatedNodes: Node[] = [ceoNode];
        const generatedEdges: Edge[] = [];

        dbAgents.forEach((agent: any, index: number) => {
          const nodeId = agent.id || `agent-${index}`;
          const xPos = 100 + (index % 3) * 220;
          const yPos = 200 + Math.floor(index / 3) * 160;

          generatedNodes.push({
            id: nodeId,
            type: "agentNode",
            position: { x: xPos, y: yPos },
            data: {
              name: agent.name,
              role: agent.role,
              color: agent.avatar_color || "#1E1F24",
            } as AgentNodeData,
          });

          generatedEdges.push({
            id: `edge-ceo-${nodeId}`,
            source: "ceo",
            target: nodeId,
            type: "smoothstep",
            animated: true,
            style: { stroke: "#1E1F24" },
          });
        });

        setNodes(generatedNodes);
        setEdges(generatedEdges);
      } else {
        setNodes([ceoNode]);
        setEdges([]);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, [user, orgName, setNodes, setEdges]);

  useEffect(() => {
    fetchOrgStructure();
  }, [fetchOrgStructure]);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "#1E1F24" } }, eds)),
    [setEdges]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FAF8F5] text-[#1E1F24] select-none">
      {/* Header */}
      <div className="border-b border-[rgba(0,0,0,0.08)] px-6 py-4 bg-white flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-bold text-[#1E1F24]">Organization Hierarchy</h1>
          <p className="text-[11px] text-[#878890]">
            Live command reporting structure synced with your AI workforce
          </p>
        </div>
      </div>

      {/* Canvas */}
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
            fitView
            className="bg-[#FAF8F5]"
          >
            <Controls className="!bg-white !border-[rgba(0,0,0,0.08)] !rounded-xl !shadow-xs" />
            <Background color="#878890" variant={BackgroundVariant.Dots} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
