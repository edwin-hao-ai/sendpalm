/** Modal — base primitive. Renders into #modal-root portal target. */

import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "./Icon";
import { useViewport } from "../utils/gestures";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: string;
  fullScreenOnMobile?: boolean;
  children: JSX.Element;
  footer?: JSX.Element;
}

export function Modal(props: ModalProps) {
  const { isMobile } = useViewport();
  // Capture phase + stopPropagation: the global shortcut handler
  // (utils/shortcuts.ts) listens on document in the bubble phase and would
  // otherwise ALSO close the underlying detail panel on the same Esc press
  // (audit agent-3 #2 — one Esc closing two layers). When the event target
  // is a text field we don't intercept, so Esc-to-clear inside inputs keeps
  // working.
  const handleKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !props.open) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    e.stopPropagation();
    props.onClose();
  };

  onMount(() => document.addEventListener("keydown", handleKey, true));
  onCleanup(() => document.removeEventListener("keydown", handleKey, true));

  const fullScreen = () => props.fullScreenOnMobile && isMobile();

  return (
    <Show when={props.open}>
      <Portal mount={document.body}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(35,28,51,0.4)",
            "backdrop-filter": "blur(8px)",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "z-index": "var(--z-modal)",
            animation: "backdrop-fade-in 0.22s var(--ease-out) both",
            padding: fullScreen() ? "0" : "var(--space-5)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) props.onClose();
          }}
        >
          <div
            style={{
              width: fullScreen() ? "100%" : (props.width ?? "560px"),
              "max-width": fullScreen() ? "100%" : "94vw",
              height: fullScreen() ? "100dvh" : undefined,
              "max-height": fullScreen()
                ? "100dvh"
                : props.fullScreenOnMobile
                  ? "100dvh"
                  : "85vh",
              background: "var(--paper-light)",
              "border-radius": fullScreen() ? "0" : "var(--radius-xl)",
              "box-shadow": "var(--shadow-xl)",
              animation: "modal-enter 0.3s var(--spring) both",
              display: "flex",
              "flex-direction": "column",
              overflow: "hidden",
              "padding-top": fullScreen()
                ? "env(safe-area-inset-top)"
                : undefined,
              "padding-bottom": fullScreen()
                ? "env(safe-area-inset-bottom)"
                : undefined,
            }}
          >
            <header
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-3)",
                padding: "var(--space-4) var(--space-5)",
                "border-bottom": "0.5px solid var(--border)",
              }}
            >
              <strong
                style={{
                  flex: 1,
                  "font-size": "var(--text-body-sm)",
                  "font-weight": "700",
                }}
              >
                {props.title}
              </strong>
              <button
                onClick={props.onClose}
                aria-label="关闭"
                title="关闭"
                style={{
                  color: "var(--text-muted)",
                  width: "28px",
                  height: "28px",
                  "border-radius": "var(--radius-pill)",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--paper-mid)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <Icon name="ph-x" size={14} />
              </button>
            </header>
            <div
              style={{
                flex: 1,
                "overflow-y": "auto",
                padding: "var(--space-5)",
              }}
            >
              {props.children}
            </div>
            <Show when={props.footer}>
              <footer
                style={{
                  padding: "var(--space-3) var(--space-5)",
                  "border-top": "0.5px solid var(--border)",
                  background: "var(--surface-recessed)",
                  display: "flex",
                  gap: "var(--space-2)",
                  "justify-content": "flex-end",
                }}
              >
                {props.footer}
              </footer>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

/** Hook for opening the compose modal from anywhere. */
const [_composeOpen, _setComposeOpen] = createSignal(false);
export {
  _composeOpen as composeModalOpen,
  _setComposeOpen as setComposeModalOpen,
};
