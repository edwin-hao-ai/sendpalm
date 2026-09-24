/** DropBar — appears during drag-and-drop, lists bucket + workflow destinations.
 *
 * Each target is a REAL HTML5 drop zone: during a drag, `click` never
 * fires, so the buttons must handle `dragover` (preventDefault to allow
 * the drop) and `drop` (commit). `click` is kept as a fallback for
 * pointer-driven flows that don't use HTML5 DnD.
 */

import { Show, createSignal } from "solid-js";
import { useDragContext, endDrag, type DragTarget } from "../utils/drag";
import { Icon } from "./Icon";

interface TargetSpec {
  id: DragTarget;
  label: string;
  icon: string;
  kind: "bucket" | "workflow";
}

const TARGETS: readonly TargetSpec[] = [
  { id: "imbox", label: "Imbox", icon: "ph-tray", kind: "bucket" },
  { id: "feed", label: "Stream", icon: "ph-newspaper", kind: "bucket" },
  { id: "paperTrail", label: "Records", icon: "ph-receipt", kind: "bucket" },
  { id: "pending", label: "稍后回复", icon: "ph-clock", kind: "workflow" },
  { id: "saved", label: "已搁置", icon: "ph-push-pin", kind: "workflow" },
  { id: "remind", label: "提醒", icon: "ph-arrow-fat-line-up", kind: "workflow" },
  { id: "trash", label: "回收站", icon: "ph-trash", kind: "bucket" },
  { id: "spam", label: "垃圾邮件", icon: "ph-warning-circle", kind: "bucket" },
];

export function DropBar() {
  // Drag context is a singleton outside any view; the bar shows when active.
  const drag = useDragContext();
  // Which target the dragged item is currently hovering over — drives
  // the highlight so the user can see where the drop will land.
  const [hoverTarget, setHoverTarget] = createSignal<DragTarget | null>(null);

  const commit = async (target: DragTarget) => {
    const c = drag().commit;
    setHoverTarget(null);
    if (!c) {
      endDrag();
      return;
    }
    // Drain the commit first, then close the bar. We close regardless
    // of commit success so a thrown handler doesn't leave the bar stuck.
    try {
      await c(target);
    } catch (err) {
      console.error("[drop-bar] commit failed:", err);
    } finally {
      endDrag();
    }
  };

  return (
    <Show when={drag().active}>
      <div
        id="drop-bar"
        role="toolbar"
        aria-label="移动邮件到…"
        onDragOver={(ev) => {
          // Allow dropping anywhere on the bar; the per-target handlers
          // refine the destination. Without preventDefault the browser
          // rejects the drop entirely.
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        }}
        onDrop={(ev) => {
          // Dropped on the bar background (not on a target): cancel.
          ev.preventDefault();
          setHoverTarget(null);
          endDrag();
        }}
        style={{
          position: "fixed",
          bottom: "var(--space-5)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--glass-bg)",
          "backdrop-filter": "var(--glass-blur)",
          "-webkit-backdrop-filter": "var(--glass-blur)",
          border: "0.5px solid var(--glass-border)",
          "border-radius": "var(--radius-pill)",
          padding: "var(--space-2)",
          display: "flex",
          "flex-wrap": "wrap",
          "justify-content": "center",
          gap: "var(--space-1)",
          "max-width": "min(92vw, 720px)",
          "box-shadow": "var(--glass-shadow)",
          "z-index": "var(--z-detail)",
          animation: "dropbar-enter 0.2s var(--ease-out) both",
        }}
      >
        {TARGETS.map((t) => (
          <button
            type="button"
            data-drop-target={t.id}
            data-drop-kind={t.kind}
            title={t.label}
            aria-label={`移动到${t.label}`}
            onClick={() => void commit(t.id)}
            onDragOver={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
              setHoverTarget(t.id);
            }}
            onDragLeave={() => {
              setHoverTarget((cur) => (cur === t.id ? null : cur));
            }}
            onDrop={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              void commit(t.id);
            }}
            style={{
              display: "inline-flex",
              "align-items": "center",
              gap: "4px",
              padding: "6px 12px",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "600",
              color:
                hoverTarget() === t.id
                  ? "white"
                  : t.kind === "workflow"
                    ? "var(--palm)"
                    : "var(--text-secondary)",
              background:
                hoverTarget() === t.id
                  ? "var(--palm)"
                  : t.kind === "workflow"
                    ? "var(--palm-soft)"
                    : "transparent",
              transform:
                hoverTarget() === t.id ? "scale(1.06)" : "scale(1)",
              transition:
                "transform 0.12s var(--ease-out), background 0.12s var(--ease-out), color 0.12s var(--ease-out)",
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
