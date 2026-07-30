"use client";

import { useState, useEffect } from "react";
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
  { id: "agents", label: "AI Agents", icon: Users },
  { id: "orgchart", label: "Org Hierarchy", icon: Network },
];

export default function Sidebar({
  activeView,
  setActiveView,
  collapsed,
  setCollapsed,
}: SidebarProps) {
  const [daemonOnline, setDaemonOnline] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: any = null;

    const connect = () => {
      try {
        ws = new WebSocket("ws://127.0.0.1:8080");
        ws.onopen = () => setDaemonOnline(true);
        ws.onclose = () => {
          setDaemonOnline(false);
          timer = setTimeout(connect, 3000);
        };
        ws.onerror = () => {
          setDaemonOnline(false);
        };
      } catch (e) {
        setDaemonOnline(false);
        timer = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (ws) ws.close();
      if (timer) clearTimeout(timer);
    };
  }, []);

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
      {/* Brand & New Command Button */}
      <div className="p-3.5 flex flex-col gap-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.svg"
                alt="Cosmos AI Logo"
                className="w-7 h-7 rounded-lg shadow-sm shrink-0 object-cover"
              />
              <div>
                <div className="t-small font-bold" style={{ color: "var(--text-primary)" }}>
                  Cosmos AI
                </div>
                <div className="t-micro" style={{ color: "var(--text-muted)" }}>
                  Enterprise Platform
                </div>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="btn-icon p-1 rounded-lg hover:bg-black/5"
            style={{ color: "var(--text-secondary)" }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {!collapsed && (
          <button
            onClick={() => setActiveView("dashboard")}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white border border-[rgba(0,0,0,0.1)] text-xs font-semibold text-[#1E1F24] hover:bg-[#FAF8F5] transition-all shadow-2xs"
          >
            <Plus size={14} />
            <span>Command</span>
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {!collapsed && (
          <div className="px-2 pt-1 pb-1.5 t-micro font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Workspace
          </div>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all text-xs font-medium ${
                isActive
                  ? "bg-white text-[#1E1F24] font-semibold shadow-2xs border border-[rgba(0,0,0,0.06)]"
                  : "text-[#72737A] hover:text-[#1E1F24] hover:bg-white/50"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={16} className={isActive ? "text-[#1E1F24]" : "text-[#72737A]"} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Footer Status & User Info */}
      <div className="p-3 shrink-0 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/60 border border-[rgba(0,0,0,0.06)]">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${daemonOnline ? "bg-emerald-500 shadow-sm" : "bg-amber-500"}`} />
            <div className="flex-1 min-w-0">
              <div className="t-small font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                {daemonOnline ? "Engine Online" : "Agents Offline"}
              </div>
              <div className="t-micro truncate" style={{ color: "var(--text-muted)" }}>
                {daemonOnline ? "ws://127.0.0.1:8080" : "Local engine offline"}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${daemonOnline ? "bg-emerald-500" : "bg-amber-500"}`}
              title={daemonOnline ? "Engine Online" : "Agents Offline"}
            />
          </div>
        )}
      </div>
    </motion.aside>
  );
}
