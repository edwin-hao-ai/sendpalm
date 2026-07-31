/** DropBar — appears during drag-and-drop, lists bucket destinations. */

import { Show } from "solid-js";
import { useDragContext } from "../utils/drag";

export function DropBar() {
  // Drag context is a singleton outside any view; the bar shows when active.
  const drag = useDragContext();
  return (
    <Show when={drag().active}>
      <div
        id="drop-bar"
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
          gap: "var(--space-1)",
          "box-shadow": "var(--shadow-lg)",
          "z-index": "var(--z-detail)",
          animation: "toast-enter 0.2s var(--ease-out) both",
        }}
      >
        {(["imbox", "feed", "paperTrail", "trash", "spam"] as const).map((b) => (
          <button
            onClick={() => drag().commit?.(b)}
            style={{
              padding: "6px 14px",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              color: "var(--text-secondary)",
            }}
          >
            {b === "imbox" ? "Inbox" : b === "feed" ? "Stream" : b === "paperTrail" ? "Records" : b === "trash" ? "Trash" : "Spam"}
          </button>
        ))}
      </div>
    </Show>
  );
}