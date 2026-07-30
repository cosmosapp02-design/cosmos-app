"use client";

import { ViewType } from "../page";
import {
  MessageSquare,
  Users,
  Network,
  FolderKanban,
  Folder,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { motion } from "framer-motion";

interface SidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const navItems: { id: ViewType; label: string; icon: typeof MessageSquare }[] = [
  { id: "dashboard", label: "Workspace", icon: MessageSquare },
  { id: "projects", label: "Files", icon: Folder },
  { id: "kanban", label: "Project Management", icon: FolderKanban },
  { id: "agents", label: "AI Directory", icon: Users },
  { id: "orgchart", label: "Org Hierarchy", icon: Network },
];

export default function Sidebar({
  activeView,
  setActiveView,
  collapsed,
  setCollapsed,
}: SidebarProps) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="relative flex flex-col h-full shrink-0 select-none overflow-hidden"
      style={{
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Brand & New Thread Button */}
      <div className="p-3.5 flex flex-col gap-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#1E1F24] text-white flex items-center justify-center font-bold text-xs">
                C
              </div>
              <div>
                <div className="t-h2 leading-none" style={{ color: "var(--text-primary)" }}>Cosmos AI</div>
                <div className="t-micro text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>Enterprise Platform</div>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-[#1E1F24] text-white flex items-center justify-center font-bold text-xs mx-auto">
              C
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="btn-icon text-gray-400 hover:text-gray-700"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* "+ New Task" Button */}
        <button
          onClick={() => setActiveView("dashboard")}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white border border-[rgba(0,0,0,0.12)] hover:bg-[#FAF8F5] text-xs font-semibold text-[#1E1F24] shadow-sm transition-all"
        >
          <Plus size={14} className="text-[#1E1F24]" />
          {!collapsed && <span>New Task</span>}
        </button>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {!collapsed && (
          <div className="px-3 py-1.5 t-label" style={{ color: "var(--text-muted)" }}>
            WORKSPACE
          </div>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                isActive
                  ? "bg-[#E6E2D8] text-[#1E1F24] font-semibold"
                  : "text-[#52535A] hover:text-[#1E1F24] hover:bg-black/[0.04]"
              }`}
            >
              <Icon size={16} className={isActive ? "text-[#1E1F24]" : "text-[#72737A]"} />
              {!collapsed && <span className="t-small flex-1 truncate">{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Footer Status & User Info */}
      <div className="p-3 shrink-0 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/60 border border-[rgba(0,0,0,0.06)]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="t-small font-semibold truncate" style={{ color: "var(--text-primary)" }}>Engine Online</div>
              <div className="t-micro truncate" style={{ color: "var(--text-muted)" }}>3 AI Agents active</div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Engine Online" />
          </div>
        )}
      </div>
    </motion.aside>
  );
}
