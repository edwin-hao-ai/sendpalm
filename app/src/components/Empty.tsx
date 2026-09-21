/** Empty / Loading / Error state primitive. */

import { Show } from "solid-js";
import { Icon } from "./Icon";

interface EmptyProps {
  icon?: string;
  title: string;
  description?: string;
  /** Secondary guidance line under the description (smaller, muted). */
  hint?: string;
  action?: { label: string; onClick: () => void };
}

export function Empty(props: EmptyProps) {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        padding: "var(--space-12) var(--space-5)",
        "text-align": "center",
        color: "var(--text-secondary)",
        height: "100%",
      }}
    >
      <div
        style={{
          width: "76px",
          height: "76px",
          "border-radius": "50%",
          background:
            "linear-gradient(135deg, var(--paper-light) 0%, var(--paper-mid) 100%)",
          "box-shadow": "var(--shadow-md)",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          "margin-bottom": "var(--space-5)",
          color: "var(--text-muted)",
        }}
      >
        <Icon name={props.icon ?? "ph-tray"} size={30} />
      </div>
      <h3
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h4)",
          "font-weight": "800",
          color: "var(--text-primary)",
          margin: 0,
          "margin-bottom": "var(--space-2)",
        }}
      >
        {props.title}
      </h3>
      <Show when={props.description}>
        <p
          style={{
            "max-width": "320px",
            "font-size": "var(--text-body-sm)",
            color: "var(--text-secondary)",
            margin: 0,
            "line-height": "1.5",
          }}
        >
          {props.description}
        </p>
      </Show>
      <Show when={props.hint}>
        <p
          style={{
            "max-width": "320px",
            "font-size": "var(--text-caption)",
            color: "var(--text-muted)",
            margin: 0,
            "margin-top": "var(--space-2)",
            "line-height": "1.5",
          }}
        >
          {props.hint}
        </p>
      </Show>
      <Show when={props.action}>
        <button
          onClick={props.action!.onClick}
          style={{
            "margin-top": "var(--space-5)",
            padding: "10px 20px",
            background: "var(--palm)",
            color: "white",
            "border-radius": "var(--radius-pill)",
            "font-weight": "700",
            "font-size": "var(--text-caption)",
          }}
        >
          {props.action!.label}
        </button>
      </Show>
    </div>
  );
}

export function ErrorState(props: {
  title?: string;
  message?: string;
  retry?: () => void;
}) {
  return (
    <Empty
      icon="ph-warning-circle"
      title={props.title ?? "出错了"}
      description={props.message ?? ""}
      action={props.retry ? { label: "重试", onClick: props.retry } : undefined}
    />
  );
}
