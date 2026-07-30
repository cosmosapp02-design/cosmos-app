"use client";

import { useState } from "react";
import Sidebar from "./components/sidebar";
import DashboardView from "./components/dashboard-view";
import AgentsView from "./components/agents-view";
import OrgChartView from "./components/org-chart-view";
import ProjectsView from "./components/projects-view";
import ProjectsMemoryView from "./components/projects-memory-view";
import ReportModeModal from "./components/report-mode-modal";
import { ToastProvider } from "./components/toast";
import { AnimatePresence } from "framer-motion";

export type ViewType = "dashboard" | "projects" | "kanban" | "agents" | "orgchart";

export default function Home() {
  const [activeView, setActiveView] = useState<ViewType>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [pendingApprovalCallback, setPendingApprovalCallback] = useState<
    (() => void) | null
  >(null);

  const triggerReportMode = (onApprove: () => void) => {
    setPendingApprovalCallback(() => onApprove);
    setReportModalOpen(true);
  };

  return (
    <ToastProvider>
      <div className="flex h-full w-full overflow-hidden" style={{ background: "var(--base)" }}>
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />

        <main className="flex-1 overflow-hidden" style={{ background: "var(--base)" }}>
          {activeView === "dashboard" && <DashboardView />}
          {activeView === "projects" && <ProjectsMemoryView />}
          {activeView === "kanban" && (
            <ProjectsView triggerReportMode={triggerReportMode} />
          )}
          {activeView === "agents" && <AgentsView />}
          {activeView === "orgchart" && <OrgChartView />}
        </main>

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
    </ToastProvider>
  );
}
