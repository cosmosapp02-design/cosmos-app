"use client";

// Loading skeleton components for agents gallery and kanban board.
// Uses the shimmer CSS animation from globals.css.

export function AgentCardSkeleton() {
  return (
    <div className="card" style={{ borderRadius: 18, overflow: "hidden" }}>
      {/* Header */}
      <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-start gap-3">
          <div className="skeleton shrink-0" style={{ width: 44, height: 44, borderRadius: "30%" }} />
          <div className="flex-1 pt-1">
            <div className="skeleton mb-2" style={{ height: 14, width: "55%", borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 12, width: "75%", borderRadius: 6 }} />
          </div>
          <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 8 }} />
        </div>
      </div>

      {/* SOUL section */}
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="skeleton mb-3" style={{ height: 10, width: "30%", borderRadius: 6 }} />
        <div className="skeleton mb-1.5" style={{ height: 11, width: "100%", borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 11, width: "80%", borderRadius: 6 }} />
      </div>

      {/* Skills */}
      <div className="px-5 py-4">
        <div className="skeleton mb-3" style={{ height: 10, width: "25%", borderRadius: 6 }} />
        {[85, 72, 90].map((w, i) => (
          <div key={i} className="mb-3">
            <div className="flex justify-between mb-1.5">
              <div className="skeleton" style={{ height: 11, width: `${w - 20}%`, borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 11, width: "28px", borderRadius: 6 }} />
            </div>
            <div className="skeleton" style={{ height: 5, width: "100%", borderRadius: 4 }} />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 flex justify-between" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="skeleton" style={{ height: 11, width: "35%", borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 11, width: "25%", borderRadius: 6 }} />
      </div>
    </div>
  );
}

export function KanbanColumnSkeleton() {
  return (
    <div style={{ width: 240, flexShrink: 0 }}>
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="skeleton" style={{ width: 8, height: 8, borderRadius: "50%" }} />
        <div className="skeleton" style={{ height: 13, width: "55%", borderRadius: 6 }} />
        <div className="skeleton ml-auto" style={{ height: 20, width: 28, borderRadius: 9999 }} />
      </div>

      {/* Ticket cards */}
      {[1, 2].map((i) => (
        <div key={i} className="card mb-3 p-4" style={{ borderRadius: 12 }}>
          <div className="skeleton mb-2" style={{ height: 10, width: "30%", borderRadius: 6 }} />
          <div className="skeleton mb-1.5" style={{ height: 13, width: "90%", borderRadius: 6 }} />
          <div className="skeleton mb-3" style={{ height: 13, width: "70%", borderRadius: 6 }} />
          <div className="flex gap-1.5 mb-3">
            {[40, 55, 45].map((w, j) => (
              <div key={j} className="skeleton" style={{ height: 18, width: `${w}px`, borderRadius: 9999 }} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="skeleton" style={{ width: 22, height: 22, borderRadius: "50%" }} />
            <div className="skeleton" style={{ height: 11, width: "40%", borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
