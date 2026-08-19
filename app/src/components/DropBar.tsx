/** DropBar — appears during drag-and-drop, lists bucket + workflow destinations. */

import { Show } from "solid-js";
import { useDragContext, endDrag, type DragTarget } from "../utils/drag";
import { Icon } from "./Icon";

interface TargetSpec {
  id: DragTarget;
  label: string;
  icon: string;
  kind: "bucket" | "workflow";
}

const TARGETS: readonly TargetSpec[] = [
  { id: "imbox", label: "Inbox", icon: "ph-tray", kind: "bucket" },
  { id: "feed", label: "Stream", icon: "ph-newspaper", kind: "bucket" },
  { id: "paperTrail", label: "Records", icon: "ph-receipt", kind: "bucket" },
  { id: "pending", label: "Pending", icon: "ph-clock", kind: "workflow" },
  { id: "saved", label: "Saved", icon: "ph-push-pin", kind: "workflow" },
  { id: "remind", label: "Remind", icon: "ph-arrow-fat-line-up", kind: "workflow" },
  { id: "trash", label: "Trash", icon: "ph-trash", kind: "bucket" },
  { id: "spam", label: "Spam", icon: "ph-warning-circle", kind: "bucket" },
];

export function DropBar() {
  // Drag context is a singleton outside any view; the bar shows when active.
  const drag = useDragContext();

  const handleClick = async (target: DragTarget) => {
    const c = drag().commit;
    if (!c) return;
    // Drain the commit first, then close the bar. We close regardless
    // of commit success so a thrown handler doesn't leave the bar stuck.
    try {
      await c(target);
    } finally {
      endDrag();
    }
  };

  return (
    <Show when={drag().active}>
      <div
        id="drop-bar"
        role="toolbar"
        aria-label="Move message to"
        style={{
          position: "fixed",
          bottom: "var(--space-5)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--paper-light)",
          border: "0.5px solid var(--border-strong)",
          "border-radius": "var(--radius-pill)",
          padding: "var(--space-2)",
          display: "flex",
          "flex-wrap": "wrap",
          "justify-content": "center",
          gap: "var(--space-1)",
          "max-width": "min(92vw, 720px)",
          "box-shadow": "var(--shadow-lg)",
          "z-index": "var(--z-detail)",
          animation: "toast-enter 0.2s var(--ease-out) both",
        }}
      >
        {TARGETS.map((t) => (
          <button
            type="button"
            data-drop-target={t.id}
            data-drop-kind={t.kind}
            title={t.label}
            aria-label={`Move to ${t.label}`}
            onClick={() => void handleClick(t.id)}
            style={{
              display: "inline-flex",
              "align-items": "center",
              gap: "4px",
              padding: "6px 12px",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "600",
              color: t.kind === "workflow" ? "var(--palm)" : "var(--text-secondary)",
              background: t.kind === "workflow" ? "var(--palm-soft)" : "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>
    </Show>
  );
}
