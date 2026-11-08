/** Top-level error boundary — the difference between "this view broke" and
 *  "the app is black".
 *
 *  Before this existed, any exception thrown while rendering (a missing
 *  field, a bad date, a rejected lazy-chunk import) propagated out of the
 *  Solid tree and left the window blank — the 黑屏 users reported. The boot
 *  script in `index.html` did catch it, but only by covering the ENTIRE app
 *  with a black panel: the same experience with a stack trace on it.
 *
 *  This boundary keeps the shell alive and offers three ways out: retry,
 *  switch views, reload. The raw error goes to the error log, not the
 *  headline.
 */

import { ErrorBoundary, createEffect, createSignal, type JSX } from "solid-js";
import { Icon } from "./Icon";
import { recordError } from "../stores/ui";

export interface AppErrorBoundaryProps {
  children: JSX.Element;
  /** `app` = whole-window failure (offers reload); `view` = one view inside
   *  a working shell (offers retry + 回到收件箱). */
  scope?: "app" | "view";
  /** Change this (e.g. the current route) to clear a previous failure when
   *  the user navigates somewhere else. Solid's ErrorBoundary has no
   *  external reset, so the fallback hands us its `reset` and we hold it. */
  resetKey?: unknown;
  onRecover?: () => void;
}

export function AppErrorBoundary(props: AppErrorBoundaryProps): JSX.Element {
  const [resetBoundary, setResetBoundary] = createSignal<(() => void) | null>(
    null,
  );
  const [message, setMessage] = createSignal<string>("");
  const [detail, setDetail] = createSignal<string>("");
  const [lastKey, setLastKey] = createSignal<unknown>(props.resetKey);

  // Leaving a broken view must not leave the boundary armed: the next route
  // deserves a fresh mount.
  createEffect(() => {
    const key = props.resetKey;
    if (key === lastKey()) return;
    setLastKey(key);
    resetBoundary()?.();
  });

  const retry = () => {
    resetBoundary()?.();
    props.onRecover?.();
  };

  return (
    <ErrorBoundary
      fallback={(err, reset) => {
        const error = err instanceof Error ? err : new Error(String(err));
        setResetBoundary(() => reset);
        setMessage(error.message);
        setDetail(error.stack ?? String(err));
        recordError(
          props.scope === "app" ? "app-crash" : "view-crash",
          error.message,
          error.stack ?? String(err),
        );
        return (
          <div
            data-error-boundary={props.scope ?? "app"}
            role="alert"
            style={{
              display: "flex",
              "flex-direction": "column",
              "align-items": "center",
              "justify-content": "center",
              gap: "var(--space-3)",
              padding: "var(--space-8) var(--space-5)",
              "min-height": props.scope === "app" ? "100dvh" : "50vh",
              background: "var(--paper)",
              "text-align": "center",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                "border-radius": "50%",
                background: "var(--palm-soft)",
                color: "var(--palm)",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
              }}
            >
              <Icon name="ph-warning-circle" size={28} />
            </div>
            <h2
              style={{
                margin: 0,
                "font-family": "var(--font-display)",
                "font-size": "var(--text-h3)",
                "font-weight": "800",
                color: "var(--text-primary)",
              }}
            >
              {props.scope === "app"
                ? "界面遇到问题"
                : "这个视图没能显示出来"}
            </h2>
            <p
              style={{
                margin: 0,
                "max-width": "420px",
                "font-size": "var(--text-body-sm)",
                color: "var(--text-secondary)",
                "line-height": 1.6,
              }}
            >
              你的邮件数据没有受影响。可以先重试一次；如果反复出现，
              换到别的视图继续用，或重新载入应用。
            </p>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                "flex-wrap": "wrap",
                "justify-content": "center",
              }}
            >
              <button
                type="button"
                data-error-retry
                onClick={retry}
                style={primaryStyle}
              >
                重试
              </button>
              <button
                type="button"
                data-error-reload
                onClick={() => window.location.reload()}
                style={secondaryStyle}
              >
                重新载入
              </button>
            </div>
            <details
              data-error-boundary-detail
              style={{
                "max-width": "560px",
                width: "100%",
                "text-align": "left",
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              <summary style={{ cursor: "pointer", "text-align": "center" }}>
                技术详情
              </summary>
              <pre
                style={{
                  "margin-top": "var(--space-2)",
                  padding: "var(--space-3)",
                  background: "var(--paper-mid)",
                  "border-radius": "var(--radius-md)",
                  "white-space": "pre-wrap",
                  "word-break": "break-word",
                  "max-height": "220px",
                  overflow: "auto",
                  "font-family": "var(--font-mono)",
                  "font-size": "11px",
                }}
              >
                {message()}
                {"\n\n"}
                {detail()}
              </pre>
            </details>
          </div>
        );
      }}
    >
      {props.children}
    </ErrorBoundary>
  );
}

const primaryStyle = {
  "min-height": "40px",
  padding: "8px 18px",
  "border-radius": "var(--radius-pill)",
  border: "none",
  background: "var(--palm)",
  color: "#fff",
  "font-size": "var(--text-caption)",
  "font-weight": "700",
  cursor: "pointer",
} as const;

const secondaryStyle = {
  "min-height": "40px",
  padding: "8px 18px",
  "border-radius": "var(--radius-pill)",
  border: "0.5px solid var(--border)",
  background: "transparent",
  color: "var(--text-secondary)",
  "font-size": "var(--text-caption)",
  "font-weight": "700",
  cursor: "pointer",
} as const;
