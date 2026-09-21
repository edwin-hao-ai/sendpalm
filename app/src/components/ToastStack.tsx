/** ToastStack — toast notifications.
 *  Desktop: anchored bottom-right. Mobile: stacked above the bottom tab bar
 *  (64px) plus the iOS home indicator safe area.
 *  Error toasts never auto-dismiss (see stores/ui.ts showToast).
 */

import { For, createEffect, createSignal, untrack } from "solid-js";
import { toasts, dismissToast, type Toast, type ToastKind } from "../stores/ui";
import { Icon } from "./Icon";
import { useViewport } from "../utils/gestures";

const COLOR: Record<ToastKind, { bg: string; border: string; icon: string }> = {
  info: {
    bg: "var(--paper-light)",
    border: "var(--border-strong)",
    icon: "ph-info",
  },
  success: {
    bg: "var(--mint)",
    border: "color-mix(in srgb, var(--palm) 30%, transparent)",
    icon: "ph-check-circle",
  },
  warning: {
    bg: "var(--canary)",
    border: "color-mix(in srgb, var(--yellow) 60%, transparent)",
    icon: "ph-warning",
  },
  error: {
    bg: "color-mix(in srgb, var(--status-danger) 8%, var(--paper-light))",
    border: "color-mix(in srgb, var(--status-danger) 30%, transparent)",
    icon: "ph-x-circle",
  },
};

const EXIT_MS = 240;

interface RenderedToast extends Toast {
  exiting?: boolean;
}

export function ToastStack() {
  const { isMobile } = useViewport();
  // Mirror of the toast queue that keeps dismissed entries mounted for one
  // exit-animation cycle. The queue itself (stores/ui.ts) removes instantly;
  // animating here keeps the store free of presentation state.
  const [items, setItems] = createSignal<RenderedToast[]>([]);

  createEffect(() => {
    const current = toasts();
    // Untracked: the effect's only dependency is the toast queue itself.
    // Reading items() reactively would re-fire the effect on our own
    // setItems() calls and loop.
    const prev = untrack(items);
    const removed = prev.filter(
      (p) => !p.exiting && !current.some((t) => t.id === p.id),
    );
    if (removed.length === 0 && prev.length === current.length) {
      // Same membership — sync mutable fields (message/action) in place.
      setItems(current.map((t) => ({ ...t })));
      return;
    }
    const next: RenderedToast[] = current.map((t) => ({ ...t }));
    // Keep already-exiting entries mounted until their timer fires, even if
    // a new toast arrived in the meantime.
    for (const p of prev) {
      if (p.exiting && !current.some((t) => t.id === p.id)) next.push(p);
    }
    for (const p of removed) {
      next.push({ ...p, exiting: true });
      const id = p.id;
      setTimeout(() => {
        setItems((xs) => xs.filter((x) => x.id !== id));
      }, EXIT_MS);
    }
    setItems(next);
  });

  return (
    <div
      id="toast"
      style={{
        position: "fixed",
        bottom: isMobile()
          ? "calc(64px + var(--space-3) + env(safe-area-inset-bottom, 0px))"
          : "var(--space-5)",
        right: "var(--space-5)",
        left: isMobile() ? "var(--space-3)" : "auto",
        display: "flex",
        "flex-direction": "column-reverse",
        gap: "var(--space-2)",
        "z-index": "var(--z-toast)",
        "max-width": "380px",
      }}
    >
      <For each={items()}>
        {(t) => (
          <div
            data-testid={`toast-${t.kind}`}
            role={t.kind === "error" ? "alert" : "status"}
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
              opacity: t.exiting ? 0 : 1,
              transform: t.exiting
                ? "translateY(8px) scale(0.97)"
                : undefined,
              transition: `opacity ${EXIT_MS}ms var(--ease-out), transform ${EXIT_MS}ms var(--ease-out)`,
              "font-size": "var(--text-body-sm)",
            }}
          >
            <Icon name={COLOR[t.kind].icon} size={18} />
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.action && (
              <button
                data-testid="toast-action"
                onClick={async () => {
                  await t.action!.run();
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
              aria-label="关闭"
              title="关闭"
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
