/** MessagePanel — message detail with thread + sticky + actions. M2 will expand. */

import { Show, createResource } from "solid-js";
import { getContact, getMessage } from "../stores/data";
import { setDetailOpen, setSelectedMessageId, setComposeOpen, showToast } from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";

export function MessagePanel(props: { messageId: string }) {
  const [message] = createResource(() => props.messageId, getMessage);
  const [contact] = createResource(
    () => message()?.pid ?? "",
    (pid) => getContact(pid)
  );

  const reply = () => {
    setComposeOpen(true);
    showToast({ message: "Compose opened", kind: "info" });
  };

  const replyLater = () => {
    showToast({ message: "已标记 Reply Later（M3 实装持久化）", kind: "success" });
  };
  const setAside = () => {
    showToast({ message: "已 Set Aside（M3 实装持久化）", kind: "success" });
  };
  const bubbleUp = () => {
    showToast({ message: "Bubble Up（M3 实装 datetime picker）", kind: "info" });
  };

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        animation: "panel-slide 0.28s var(--ease-out) both",
      }}
    >
      <div
        style={{
          padding: "var(--space-3) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          background: "var(--surface-elevated)",
          position: "sticky",
          top: 0,
          "z-index": 2,
        }}
      >
        <button
          onClick={() => { setSelectedMessageId(null); setDetailOpen(false); }}
          aria-label="Close"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}>
          Message
        </strong>
      </div>

      <Show when={message() && contact()}>
        <div style={{ padding: "var(--space-5)", flex: 1, "overflow-y": "auto" }}>
          <div style={{ display: "flex", "align-items": "center", gap: "var(--space-3)", "margin-bottom": "var(--space-4)" }}>
            <Avatar name={contact()!.name} src={contact()!.avatar} size={40} />
            <div>
              <strong>{contact()!.name}</strong>
              <div style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
                {contact()!.emails[0]?.value ?? ""}
              </div>
            </div>
          </div>
          <h3
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h4)",
              "font-weight": "800",
              margin: 0,
              "margin-bottom": "var(--space-3)",
            }}
          >
            {message()!.subj}
          </h3>
          <p
            style={{
              "white-space": "pre-wrap",
              "font-size": "var(--text-body-sm)",
              color: "var(--text-secondary)",
              "line-height": 1.6,
            }}
          >
            {message()!.body}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "var(--space-1)",
            padding: "var(--space-3) var(--space-4)",
            "border-top": "0.5px solid var(--border)",
            background: "var(--surface-elevated)",
          }}
        >
          <ActionBtn icon="ph-arrow-u-up-left" label="Reply" onClick={reply} />
          <ActionBtn icon="ph-clock" label="Later" onClick={replyLater} />
          <ActionBtn icon="ph-push-pin" label="Save" onClick={setAside} />
          <ActionBtn icon="ph-arrow-fat-line-up" label="Remind" onClick={bubbleUp} />
          <ActionBtn icon="ph-sparkle" label="Agent" onClick={() => showToast({ message: "Ask Agent（M6 实装）", kind: "info" })} />
        </div>
      </Show>
    </div>
  );
}

function ActionBtn(props: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      style={{
        flex: 1,
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "2px",
        padding: "8px",
        "border-radius": "var(--radius-md)",
        color: "var(--text-secondary)",
        "font-size": "10px",
        "font-weight": "600",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon name={props.icon} size={18} />
      <span>{props.label}</span>
    </button>
  );
}