/** Empty / Loading / Error state primitive. */

import { Show } from "solid-js";
import { Icon } from "./Icon";

interface EmptyProps {
  icon?: string;
  title: string;
  description?: string;
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
          width: "64px",
          height: "64px",
          "border-radius": "50%",
          background: "var(--paper-mid)",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          "margin-bottom": "var(--space-4)",
          color: "var(--text-muted)",
        }}
      >
        <Icon name={props.icon ?? "ph-tray"} size={28} />
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

export function Skeleton(props: { height?: string; width?: string; radius?: string }) {
  return (
    <div
      style={{
        height: props.height ?? "16px",
        width: props.width ?? "100%",
        "border-radius": props.radius ?? "var(--radius-sm)",
        background:
          "linear-gradient(90deg, var(--paper-mid), var(--paper-dark), var(--paper-mid))",
        "background-size": "200% 100%",
        animation: "shimmer 1.6s linear infinite",
      }}
    />
  );
}

export function ErrorState(props: { title?: string; message?: string; retry?: () => void }) {
  return (
    <Empty
      icon="ph-warning-circle"
      title={props.title ?? "出错了"}
      description={props.message ?? ""}
      action={props.retry ? { label: "重试", onClick: props.retry } : undefined}
    />
  );
}