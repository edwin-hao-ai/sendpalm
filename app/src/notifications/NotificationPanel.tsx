/** NotificationPanel — bell dropdown. */

import { For, Show, createMemo, createResource } from "solid-js";
import { listNotifications, markAllNotificationsRead } from "../stores/data";
import { setNotificationsOpen, setView } from "../stores/ui";
import { Icon } from "../components/Icon";
import { isToday, isYesterday, relativeTime } from "../utils/date";

const ICON_BY_TYPE: Record<string, string> = {
  followup: "ph-bell-ringing",
  agent: "ph-sparkle",
  draft: "ph-pencil-line",
  relationship: "ph-users-three",
  schedule: "ph-calendar",
  system: "ph-info",
  surfaced: "ph-arrow-fat-line-up",
};

export function NotificationPanel() {
  const [list, { refetch }] = createResource(listNotifications);

  const grouped = createMemo(() => {
    const items = list() ?? [];
    const today = items.filter((n) => isToday(n.createdAt));
    const yesterday = items.filter((n) => isYesterday(n.createdAt));
    const earlier = items.filter((n) => !isToday(n.createdAt) && !isYesterday(n.createdAt));
    return { today, yesterday, earlier };
  });

  return (
    <div
      style={{
        position: "fixed",
        top: "calc(var(--titlebar-height) + var(--topbar-height) + 4px)",
        right: "var(--space-5)",
        width: "360px",
        background: "var(--paper-light)",
        "border-radius": "var(--radius-lg)",
        "box-shadow": "var(--shadow-xl)",
        "z-index": "var(--z-modal)",
        animation: "view-enter 0.2s var(--ease-out) both",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          padding: "var(--space-3) var(--space-4)",
          "border-bottom": "0.5px solid var(--border)",
        }}
      >
        <strong style={{ flex: 1, "font-size": "var(--text-body-sm)" }}>Notifications</strong>
        <button
          onClick={async () => { await markAllNotificationsRead(); refetch(); }}
          style={{ "font-size": "var(--text-caption)", color: "var(--palm)", "font-weight": "700" }}
        >
          Mark all read
        </button>
        <button
          onClick={() => setNotificationsOpen(false)}
          aria-label="Close"
          style={{ "margin-left": "var(--space-3)", color: "var(--text-muted)" }}
        >
          <Icon name="ph-x" size={14} />
        </button>
      </div>
      <div style={{ "max-height": "60vh", "overflow-y": "auto" }}>
        <Show when={grouped().today.length > 0}>
          <Group title="Today">
            <For each={grouped().today}>{(n) => <Row n={n} />}</For>
          </Group>
        </Show>
        <Show when={grouped().yesterday.length > 0}>
          <Group title="Yesterday">
            <For each={grouped().yesterday}>{(n) => <Row n={n} />}</For>
          </Group>
        </Show>
        <Show when={grouped().earlier.length > 0}>
          <Group title="Earlier">
            <For each={grouped().earlier}>{(n) => <Row n={n} />}</For>
          </Group>
        </Show>
      </div>
    </div>
  );
}

function Group(props: { title: string; children: unknown }) {
  return (
    <div>
      <div
        style={{
          "font-size": "var(--text-micro)",
          color: "var(--text-muted)",
          "font-weight": "700",
          padding: "var(--space-2) var(--space-4)",
          "letter-spacing": "0.04em",
          "text-transform": "uppercase",
          background: "var(--paper-mid)",
        }}
      >
        {props.title}
      </div>
      {props.children as never}
    </div>
  );
}

function Row(props: { n: { id: string; type: string; title: string; body: string; read: boolean; createdAt: string; ref?: { type: string; id: string } } }) {
  const n = () => props.n;
  return (
    <button
      onClick={() => {
        if (n().ref?.type === "contact") setView("contacts");
        if (n().ref?.type === "event") setView("calendar");
        setNotificationsOpen(false);
      }}
      style={{
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        "border-bottom": "0.5px solid var(--border)",
        width: "100%",
        "text-align": "left",
        background: n().read ? "transparent" : "rgba(85,34,250,0.04)",
      }}
    >
      <Icon name={ICON_BY_TYPE[n().type] ?? "ph-info"} size={18} />
      <div style={{ flex: 1, "min-width": 0 }}>
        <div style={{ "font-weight": "600", "font-size": "var(--text-body-sm)" }}>{n().title}</div>
        <div style={{ "font-size": "var(--text-caption)", color: "var(--text-secondary)" }}>
          {n().body}
        </div>
        <div style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)", "margin-top": "2px" }}>
          {relativeTime(n().createdAt as unknown as string)}
        </div>
      </div>
    </button>
  );
}