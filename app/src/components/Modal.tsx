/** Modal — base primitive. Renders into #modal-root portal target. */

import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "./Icon";

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
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.open) {
      e.preventDefault();
      props.onClose();
    }
  };

  onMount(() => document.addEventListener("keydown", handleKey));
  onCleanup(() => document.removeEventListener("keydown", handleKey));

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
            animation: "view-enter 0.2s var(--ease-out) both",
            padding: "var(--space-5)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) props.onClose();
          }}
        >
          <div
            style={{
              width: props.width ?? "560px",
              "max-width": "94vw",
              "max-height": props.fullScreenOnMobile ? "100dvh" : "85vh",
              background: "var(--paper-light)",
              "border-radius": "var(--radius-xl)",
              "box-shadow": "var(--shadow-xl)",
              animation: "modal-enter 0.3s var(--spring) both",
              display: "flex",
              "flex-direction": "column",
              overflow: "hidden",
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
              <strong style={{ flex: 1, "font-size": "var(--text-body-sm)", "font-weight": "700" }}>
                {props.title}
              </strong>
              <button
                onClick={props.onClose}
                aria-label="Close"
                style={{
                  color: "var(--text-muted)",
                  width: "28px",
                  height: "28px",
                  "border-radius": "var(--radius-pill)",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Icon name="ph-x" size={14} />
              </button>
            </header>
            <div style={{ flex: 1, "overflow-y": "auto", padding: "var(--space-5)" }}>
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
export { _composeOpen as composeModalOpen, _setComposeOpen as setComposeModalOpen };