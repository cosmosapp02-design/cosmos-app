"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert, X, CheckCircle2, XCircle, Terminal, AlertTriangle, Code2, Bot, FolderKanban,
} from "lucide-react";

interface ReportModeModalProps {
  onApprove: () => void;
  onDeny: () => void;
}

const commandDetails = [
  { label: "Command",    value: "npm publish",                   Icon: Code2 },
  { label: "Agent",      value: "Dev-Bot (Senior Coder)",        Icon: Bot },
  { label: "Risk Level", value: "HIGH — External network write", Icon: AlertTriangle, danger: true },
  { label: "Context",    value: "Sprint 4 auth flow deployment", Icon: FolderKanban },
];

export default function ReportModeModal({ onApprove, onDeny }: ReportModeModalProps) {
  const [decision, setDecision] = useState<"approved" | "denied" | null>(null);

  const handleApprove = () => {
    setDecision("approved");
    setTimeout(onApprove, 1000);
  };

  const handleDeny = () => {
    setDecision("denied");
    setTimeout(onDeny, 700);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 8 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: 500,
          background: "var(--overlay)",
          border: "1px solid rgba(224,82,82,0.35)",
          borderRadius: 22,
          boxShadow: "0 0 80px rgba(224,82,82,0.12), var(--shadow-overlay)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center gap-3"
          style={{
            background: "linear-gradient(135deg, rgba(224,82,82,0.12), rgba(224,82,82,0.04))",
            borderBottom: "1px solid rgba(224,82,82,0.2)",
          }}
        >
          <motion.div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(224,82,82,0.15)", border: "1px solid rgba(224,82,82,0.3)" }}
            animate={{ boxShadow: ["0 0 0 0 rgba(224,82,82,0.25)", "0 0 0 8px rgba(224,82,82,0)", "0 0 0 0 rgba(224,82,82,0)"] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ShieldAlert size={19} style={{ color: "var(--danger)" }} />
          </motion.div>
          <div className="flex-1">
            <div className="t-body font-semibold" style={{ color: "var(--danger)" }}>
              Report Mode — Approval Required
            </div>
            <div className="t-small mt-0.5" style={{ color: "var(--text-muted)" }}>
              Agent intercepted a high-risk operation. Your decision required.
            </div>
          </div>
          <button className="btn-icon" onClick={handleDeny}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Command preview terminal block */}
          <div
            className="rounded-xl p-4 mb-5 font-mono"
            style={{ background: "#040608", border: "1px solid rgba(224,82,82,0.2)" }}
          >
            <div className="flex items-center gap-2 mb-2.5">
              <Terminal size={12} style={{ color: "var(--danger)" }} />
              <span className="t-label" style={{ color: "var(--danger)" }}>INTERCEPTED COMMAND</span>
            </div>
            <div className="t-small" style={{ color: "#F87171" }}>
              ${" "}
              <span style={{ color: "#FBBF24" }}>npm</span>{" "}
              <span style={{ color: "#6EE7B7" }}>publish</span>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2.5 mb-5">
            {commandDetails.map((detail) => {
              const Icon = detail.Icon;
              return (
                <div
                  key={detail.label}
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{ background: "var(--elevated)", border: "1px solid var(--border)" }}
                >
                  <Icon
                    size={14}
                    strokeWidth={1.75}
                    style={{ color: detail.danger ? "var(--danger)" : "var(--text-muted)", flexShrink: 0 }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="t-label mb-0.5" style={{ color: "var(--text-muted)" }}>{detail.label}</div>
                    <div
                      className="t-small font-medium"
                      style={{ color: detail.danger ? "var(--danger)" : "var(--text-primary)" }}
                    >
                      {detail.value}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Warning banner */}
          <div
            className="flex items-start gap-3 rounded-xl p-4 mb-6"
            style={{ background: "rgba(229,167,49,0.06)", border: "1px solid rgba(229,167,49,0.2)" }}
          >
            <AlertTriangle size={14} strokeWidth={1.75} style={{ color: "var(--warning)", marginTop: 1, flexShrink: 0 }} />
            <p className="t-small leading-relaxed" style={{ color: "var(--warning)" }}>
              This will publish a package to the npm public registry — an irreversible external write operation.
              Approve only if you intend to release.
            </p>
          </div>

          {/* Decision buttons */}
          <AnimatePresence mode="wait">
            {!decision ? (
              <motion.div
                key="buttons"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="grid grid-cols-2 gap-3"
              >
                <button
                  id="report-deny-btn"
                  onClick={handleDeny}
                  className="btn btn-danger py-3 rounded-xl justify-center"
                >
                  <XCircle size={15} strokeWidth={1.75} />
                  Deny — Block
                </button>
                <button
                  id="report-approve-btn"
                  onClick={handleApprove}
                  className="btn btn-success py-3 rounded-xl justify-center"
                >
                  <CheckCircle2 size={15} strokeWidth={1.75} />
                  Approve — Run
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="flex items-center justify-center gap-3 py-4 rounded-xl"
                style={{
                  background: decision === "approved" ? "rgba(52,199,123,0.1)" : "rgba(224,82,82,0.1)",
                  border: `1px solid ${decision === "approved" ? "rgba(52,199,123,0.3)" : "rgba(224,82,82,0.3)"}`,
                }}
              >
                <motion.div
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
                >
                  {decision === "approved" ? (
                    <CheckCircle2 size={20} style={{ color: "var(--success)" }} />
                  ) : (
                    <XCircle size={20} style={{ color: "var(--danger)" }} />
                  )}
                </motion.div>
                <span
                  className="t-body font-semibold"
                  style={{ color: decision === "approved" ? "var(--success)" : "var(--danger)" }}
                >
                  {decision === "approved" ? "Approved! Executing command..." : "Denied. Command blocked."}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
