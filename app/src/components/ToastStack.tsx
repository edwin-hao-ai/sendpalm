/** ToastStack — bottom-right toast notifications. */

import { For } from "solid-js";
import { toasts, dismissToast, ToastKind } from "../stores/ui";
import { Icon } from "./Icon";

const COLOR: Record<ToastKind, { bg: string; border: string; icon: string }> = {
  info: { bg: "var(--paper-light)", border: "var(--border-strong)", icon: "ph-info" },
  success: { bg: "var(--mint)", border: "rgba(10,143,99,0.3)", icon: "ph-check-circle" },
  warning: { bg: "var(--canary)", border: "rgba(245,214,82,0.5)", icon: "ph-warning" },
  error: { bg: "rgba(255,59,48,0.08)", border: "rgba(255,59,48,0.3)", icon: "ph-x-circle" },
};

export function ToastStack() {
  return (
    <div
      id="toast"
      style={{
        position: "fixed",
        bottom: "var(--space-5)",
        right: "var(--space-5)",
        display: "flex",
        "flex-direction": "column-reverse",
        gap: "var(--space-2)",
        "z-index": "var(--z-toast)",
        "max-width": "380px",
      }}
    >
      <For each={toasts()}>
        {(t) => (
          <div
            style={{
              padding: "var(--space-3) var(--space-4)",
              background: COLOR[t.kind].bg,
              border: `0.5px solid ${COLOR[t.kind].border}`,
              "border-radius": "var(--radius-md)",
              "box-shadow": "var(--shadow-lg)",
              display: "flex",
              "align-items": "center",
              gap: "var(--space-3)",
              animation: "toast-enter 0.4s var(--ease-out) both",
              "font-size": "var(--text-body-sm)",
            }}
          >
            <Icon name={COLOR[t.kind].icon} size={18} />
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  dismissToast(t.id);
                }}
                style={{
                  color: "var(--palm)",
                  "font-weight": "700",
                  "font-size": "var(--text-caption)",
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              style={{ color: "var(--text-muted)" }}
            >
              <Icon name="ph-x" size={14} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}