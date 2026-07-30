"use client";

import { useState, useEffect } from "react";
import Sidebar from "./components/sidebar";
import DashboardView from "./components/dashboard-view";
import AgentsView from "./components/agents-view";
import OrgChartView from "./components/org-chart-view";
import ProjectsView from "./components/projects-view";
import ProjectsMemoryView from "./components/projects-memory-view";
import ReportModeModal from "./components/report-mode-modal";
import AuthOnboardingModal from "./components/auth-onboarding-modal";
import { ToastProvider } from "./components/toast";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { AnimatePresence } from "framer-motion";
import { UserCheck, LogOut, Key } from "lucide-react";

export type ViewType = "dashboard" | "projects" | "kanban" | "agents" | "orgchart";

function MainApp() {
  const [activeView, setActiveView] = useState<ViewType>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [reportData, setReportData] = useState<{ command?: string; agentName?: string; file?: string; requestId?: string }>({});
  const [pendingApprovalCallback, setPendingApprovalCallback] = useState<(() => void) | null>(null);

  const { user, signOut, orgName } = useAuth();

  // Listen for daemon Report Mode approval prompts over WebSockets
  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: any = null;

    const connect = () => {
      try {
        ws = new WebSocket("ws://127.0.0.1:8080");
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "report_mode_prompt") {
              setReportData({
                command: data.command,
                agentName: data.agentName,
                file: data.file,
                requestId: data.requestId,
              });
              setReportModalOpen(true);
            }
          } catch (e) {}
        };
        ws.onclose = () => {
          timer = setTimeout(connect, 4000);
        };
      } catch (e) {
        timer = setTimeout(connect, 4000);
      }
    };

    connect();
    return () => {
      if (ws) ws.close();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const triggerReportMode = (onApprove: () => void) => {
    setPendingApprovalCallback(() => onApprove);
    setReportData({
      command: "npm publish",
      agentName: "Dev-Bot (Senior Coder)",
      file: "auth/middleware.ts",
    });
    setReportModalOpen(true);
  };

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "var(--base)" }}>
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top User Bar */}
        <div className="h-10 border-b border-[rgba(0,0,0,0.08)] bg-white px-4 flex items-center justify-between text-xs shrink-0 select-none">
          <div className="flex items-center gap-2 text-[#52535A]">
            <span className="font-semibold text-[#1E1F24]">{orgName}</span>
            <span className="text-[#878890]">·</span>
            <span className="text-[11px] text-[#878890]">Multi-Tenant RLS Active</span>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#1E1F24] text-white flex items-center justify-center text-[10px] font-bold">
                  {user.email?.[0].toUpperCase() || "U"}
                </div>
                <span className="font-medium text-[#1E1F24]">{user.email}</span>
                <button
                  onClick={() => signOut()}
                  className="btn-icon text-[#878890] hover:text-[#1E1F24] ml-1"
                  title="Sign Out"
                >
                  <LogOut size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1E1F24] text-white font-semibold text-[11px] hover:bg-[#32333A] transition-all"
              >
                <Key size={12} />
                <span>Sign In / Create AI Company</span>
              </button>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-hidden" style={{ background: "var(--base)" }}>
          {activeView === "dashboard" && <DashboardView />}
          {activeView === "projects" && <ProjectsMemoryView />}
          {activeView === "kanban" && (
            <ProjectsView triggerReportMode={triggerReportMode} />
          )}
          {activeView === "agents" && <AgentsView />}
          {activeView === "orgchart" && <OrgChartView />}
        </main>
      </div>

      {/* Auth & Onboarding Modal */}
      <AuthOnboardingModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAgentCreated={() => {}}
      />

      <AnimatePresence>
        {reportModalOpen && (
          <ReportModeModal
            command={reportData.command}
            agentName={reportData.agentName}
            file={reportData.file}
            requestId={reportData.requestId}
            onApprove={() => {
              pendingApprovalCallback?.();
              setReportModalOpen(false);
              setPendingApprovalCallback(null);
            }}
            onDeny={() => {
              setReportModalOpen(false);
              setPendingApprovalCallback(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ToastProvider>
  );
}
