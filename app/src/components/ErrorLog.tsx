/** ErrorLog button + slide-down panel.
 *
 * ARCH-4: surfaces the in-memory error log (every
 * `recordError(source, message)` call) so the user can scroll
 * back through transient failures that the toast auto-dismissed.
 *
 * Lives in the topbar; clicking opens a panel with timestamp,
 * source tag, message, and optional detail. The badge counts errors
 * recorded since the panel was last opened. The warning button is
 * not rendered at all while the log is empty and the panel closed.
 */

import { For, Show, onCleanup, onMount } from "solid-js";
import {
  errorLog,
  clearErrorLog,
  setErrorLogOpened,
  errorLogOpenedAt,
  errorLogOpen,
  setErrorLogOpen,
} from "../stores/ui";
import { Icon } from "./Icon";

function relTime(at: number): string {
  const dSec = Math.floor((Date.now() - at) / 1000);
  if (dSec < 5) return "刚刚";
  if (dSec < 60) return `${dSec} 秒前`;
  if (dSec < 3600) return `${Math.floor(dSec / 60)} 分钟前`;
  if (dSec < 86400) return `${Math.floor(dSec / 3600)} 小时前`;
  return new Date(at).toLocaleString("zh-CN");
}

export function ErrorLogButton() {
  const open = errorLogOpen;
  const newCount = () =>
    errorLog().filter((e) => e.at > errorLogOpenedAt()).length;

  return (
    <>
      <Show when={errorLog().length > 0 || open()}>
        <button
          type="button"
          aria-label="错误日志"
          title={
            newCount() > 0
              ? `错误日志 · 自上次打开以来新增 ${newCount()} 条`
              : "错误日志"
          }
          onClick={() => {
            const next = !open();
            setErrorLogOpen(next);
            if (next) setErrorLogOpened(Date.now());
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
          <Icon name="ph-warning" size={20} />
          <Show when={newCount() > 0}>
            <span
              style={{
                position: "absolute",
                top: "4px",
                right: "4px",
                "background": "var(--status-danger)",
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
              {newCount() > 99 ? "99+" : newCount()}
            </span>
          </Show>
        </button>
      </Show>

      <Show when={open()}>
        <ErrorLogPanel onClose={() => setErrorLogOpen(false)} />
      </Show>
    </>
  );
}

function ErrorLogPanel(props: { onClose: () => void }) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      props.onClose();
    }
  };
  onMount(() => document.addEventListener("keydown", onKey));
  onCleanup(() => document.removeEventListener("keydown", onKey));

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
        aria-label="错误日志"
        style={{
          position: "fixed",
          top: "56px",
          right: "12px",
          width: "min(420px, calc(100vw - 24px))",
          "max-height": "calc(100vh - 80px)",
          "background": "var(--glass-bg)",
          "backdrop-filter": "var(--glass-blur)",
          "-webkit-backdrop-filter": "var(--glass-blur)",
          "border": "0.5px solid var(--glass-border)",
          "border-radius": "var(--radius-lg)",
          "box-shadow": "var(--glass-shadow)",
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
            错误日志{" "}
            <span style={{ color: "var(--text-muted)", "font-weight": 400, "font-size": "var(--text-caption)" }}>
              (共 {errorLog().length} 条)
            </span>
          </h3>
          <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
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
              清空
            </button>
            <button
              type="button"
              onClick={props.onClose}
              aria-label="关闭"
              title="关闭"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                width: "28px",
                height: "28px",
                "border-radius": "var(--radius-pill)",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
              }}
            >
              <Icon name="ph-x" size={14} />
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
                  一切正常。出现问题时，错误会记录在这里。
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
