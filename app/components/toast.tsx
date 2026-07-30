"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

export type ToastVariant = "success" | "warning" | "info" | "danger";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  addToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const remove = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast container */}
      <div
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: "340px" }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const config: Record<ToastVariant, { icon: typeof CheckCircle2; color: string; bg: string; border: string }> = {
    success: {
      icon: CheckCircle2,
      color: "var(--success)",
      bg: "rgba(52,199,123,0.08)",
      border: "rgba(52,199,123,0.2)",
    },
    warning: {
      icon: AlertTriangle,
      color: "var(--warning)",
      bg: "rgba(229,167,49,0.08)",
      border: "rgba(229,167,49,0.2)",
    },
    info: {
      icon: Info,
      color: "var(--accent)",
      bg: "var(--accent-muted)",
      border: "var(--border-accent)",
    },
    danger: {
      icon: AlertTriangle,
      color: "var(--danger)",
      bg: "rgba(224,82,82,0.08)",
      border: "rgba(224,82,82,0.2)",
    },
  };

  const { icon: Icon, color, bg, border } = config[toast.variant];

  return (
    <div
      className="animate-toast pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3"
      style={{
        background: "var(--overlay)",
        border: `1px solid ${border}`,
        boxShadow: "var(--shadow-float)",
        backdropFilter: "blur(12px)",
        minWidth: "280px",
      }}
    >
      <div
        className="flex items-center justify-center rounded-lg shrink-0 mt-0.5"
        style={{ width: 28, height: 28, background: bg }}
      >
        <Icon size={14} style={{ color }} />
      </div>
      <p className="flex-1 text-sm leading-snug" style={{ color: "var(--text-primary)", fontSize: "13px" }}>
        {toast.message}
      </p>
      <button
        onClick={() => onRemove(toast.id)}
        className="btn-icon shrink-0 -mr-1 -mt-0.5"
        style={{ width: 24, height: 24, padding: 4 }}
      >
        <X size={12} />
      </button>
    </div>
  );
}
