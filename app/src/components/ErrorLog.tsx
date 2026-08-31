/** ErrorLog button + slide-down panel.
 *
 * ARCH-4: surfaces the in-memory error log (every
 * `recordError(source, message)` call) so the user can scroll
 * back through transient failures that the toast auto-dismissed.
 *
 * Lives in the topbar; clicking opens a panel with timestamp,
 * source tag, message, and optional detail. "Clear" empties the
 * log. The badge shows the count of errors recorded since the
 * panel was last opened (or all-time, if the panel has never
 * been opened).
 */

import { For, Show, createSignal } from "solid-js";
import { errorLog, clearErrorLog, setErrorLogOpened } from "../stores/ui";
import { Icon } from "./Icon";

function relTime(at: number): string {
  const dSec = Math.floor((Date.now() - at) / 1000);
  if (dSec < 60) return `${dSec}s ago`;
  if (dSec < 3600) return `${Math.floor(dSec / 60)}m ago`;
  if (dSec < 86400) return `${Math.floor(dSec / 3600)}h ago`;
  return new Date(at).toLocaleString();
}

export function ErrorLogButton() {
  const [open, setOpen] = createSignal(false);
  const count = () => errorLog().length;

  return (
    <>
      <button
        type="button"
        aria-label="Error log"
        title={count() > 0 ? `${count()} error${count() === 1 ? "" : "s"} recorded` : "Error log"}
        onClick={() => {
          setOpen((o) => !o);
          setErrorLogOpened(Date.now());
        }}
        style={{
          position: "relative",
          "background": "transparent",
          "border": "none",
          "padding": "8px",
          "border-radius": "var(--radius-md)",
          "color": "var(--text-primary)",
          "cursor": "pointer",
          "min-width": "44px",
          "min-height": "44px",
          "display": "flex",
          "align-items": "center",
          "justify-content": "center",
        }}
      >
        <Icon name={count() > 0 ? "ph-warning-circle" : "ph-warning"} size={20} />
        <Show when={count() > 0}>
          <span
            style={{
              position: "absolute",
              top: "4px",
              right: "4px",
              "background": "var(--coral, #d94545)",
              color: "#fff",
              "border-radius": "999px",
              "font-size": "10px",
              "font-weight": "600",
              "min-width": "16px",
              "height": "16px",
              "padding": "0 4px",
              "display": "flex",
              "align-items": "center",
              "justify-content": "center",
            }}
          >
            {count() > 99 ? "99+" : count()}
          </span>
        </Show>
      </button>

      <Show when={open()}>
        <ErrorLogPanel onClose={() => setOpen(false)} />
      </Show>
    </>
  );
}

function ErrorLogPanel(props: { onClose: () => void }) {
  return (
    <>
      {/* dim backdrop */}
      <div
        onClick={props.onClose}
        style={{
          position: "fixed",
          inset: "0",
          background: "rgba(0,0,0,0.18)",
          "z-index": "var(--z-modal, 80)",
        }}
      />
      <div
        role="dialog"
        aria-label="Error log"
        style={{
          position: "fixed",
          top: "56px",
          right: "12px",
          width: "min(420px, calc(100vw - 24px))",
          "max-height": "calc(100vh - 80px)",
          "background": "var(--surface-elevated)",
          "border": "1px solid var(--ink-border-strong)",
          "border-radius": "var(--radius-lg)",
          "box-shadow": "0 8px 32px rgba(0,0,0,0.18)",
          "display": "flex",
          "flex-direction": "column",
          "z-index": "calc(var(--z-modal, 80) + 1)",
          "overflow": "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            "border-bottom": "1px solid var(--ink-border)",
            display: "flex",
            "align-items": "center",
            "justify-content": "space-between",
            "flex-shrink": 0,
          }}
        >
          <h3 style={{ margin: 0, "font-size": "var(--text-body)", "font-weight": 600 }}>
            Error log{" "}
            <span style={{ color: "var(--text-muted)", "font-weight": 400, "font-size": "var(--text-caption)" }}>
              ({errorLog().length})
            </span>
          </h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => clearErrorLog()}
              disabled={errorLog().length === 0}
              style={{
                background: "transparent",
                border: "1px solid var(--ink-border)",
                "border-radius": "var(--radius-sm)",
                padding: "4px 10px",
                "font-size": "var(--text-caption)",
                color: errorLog().length === 0 ? "var(--text-muted)" : "var(--text-primary)",
                cursor: errorLog().length === 0 ? "not-allowed" : "pointer",
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Close"
              style={{
                background: "transparent",
                border: "none",
                "font-size": "18px",
                "line-height": 1,
                color: "var(--text-secondary)",
                cursor: "pointer",
                padding: "0 6px",
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          style={{
            "overflow-y": "auto",
            "flex": 1,
            padding: "0",
          }}
        >
          <Show
            when={errorLog().length > 0}
            fallback={
              <div
                style={{
                  padding: "40px 16px",
                  "text-align": "center",
                  color: "var(--text-muted)",
                  "font-size": "var(--text-caption)",
                }}
              >
                <Icon name="ph-check-circle" size={32} />
                <p style={{ "margin-top": "12px" }}>
                  No errors recorded yet. Anything that goes wrong will show up here.
                </p>
              </div>
            }
          >
            <ul
              style={{
                "list-style": "none",
                margin: 0,
                padding: 0,
              }}
            >
              <For each={[...errorLog()].reverse()}>
                {(entry) => (
                  <li
                    style={{
                      padding: "12px 16px",
                      "border-bottom": "1px solid var(--ink-border)",
                      "font-size": "var(--text-caption)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        "justify-content": "space-between",
                        "align-items": "baseline",
                        gap: "8px",
                        "margin-bottom": "4px",
                      }}
                    >
                      <span
                        style={{
                          "background": "var(--paper-mid)",
                          color: "var(--text-secondary)",
                          "border-radius": "var(--radius-sm)",
                          padding: "1px 6px",
                          "font-size": "11px",
                          "font-weight": 600,
                          "text-transform": "uppercase",
                          "letter-spacing": "0.04em",
                        }}
                      >
                        {entry.source}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>{relTime(entry.at)}</span>
                    </div>
                    <div style={{ color: "var(--text-primary)" }}>{entry.message}</div>
                    <Show when={entry.detail}>
                      <div
                        style={{
                          "margin-top": "4px",
                          color: "var(--text-muted)",
                          "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
                          "font-size": "11px",
                          "white-space": "pre-wrap",
                          "word-break": "break-word",
                        }}
                      >
                        {entry.detail}
                      </div>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </>
  );
}
