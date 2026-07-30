"use client";

import { useState } from "react";
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
  const [pendingApprovalCallback, setPendingApprovalCallback] = useState<
    (() => void) | null
  >(null);

  const { user, signOut, orgName } = useAuth();

  const triggerReportMode = (onApprove: () => void) => {
    setPendingApprovalCallback(() => onApprove);
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
