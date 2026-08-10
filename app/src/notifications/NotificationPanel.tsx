/** NotificationPanel — bell dropdown. */

import {
  For,
  Show,
  createMemo,
  createResource,
  onCleanup,
  onMount,
} from "solid-js";
import { listNotifications, markAllNotificationsRead } from "../stores/data";
import {
  setNotificationsOpen,
  setView,
  setSelectedMessageId,
  setSelectedContactId,
  setSelectedFileId,
  setSelectedDraftId,
  setDetailOpen,
  setCalendarSelected,
  setCalendarView,
} from "../stores/ui";
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
  mail: "ph-envelope",
};

const TINT_BY_TYPE: Record<string, string> = {
  followup: "var(--sunset)",
  agent: "var(--lavender)",
  draft: "var(--slate)",
  relationship: "var(--ocean)",
  schedule: "var(--palm)",
  system: "var(--slate)",
  surfaced: "var(--berry)",
  mail: "var(--palm)",
};

export function NotificationPanel() {
  const [list, { refetch }] = createResource(listNotifications);
  let panelRef: HTMLDivElement | undefined;

  const grouped = createMemo(() => {
    const items = list() ?? [];
    const today = items.filter((n) => isToday(n.createdAt));
    const yesterday = items.filter((n) => isYesterday(n.createdAt));
    const earlier = items.filter(
      (n) => !isToday(n.createdAt) && !isYesterday(n.createdAt),
    );
    return { today, yesterday, earlier };
  });

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!panelRef) return;
      if (!panelRef.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    onCleanup(() => document.removeEventListener("click", onDocClick));
  });

  return (
    <div
      ref={(el) => {
        panelRef = el;
      }}
      style={{
        position: "fixed",
        top: "calc(var(--titlebar-height) + var(--topbar-height) + 4px)",
        right: "var(--space-5)",
        width: "360px",
        background: "var(--paper-light)",
        "border-radius": "var(--radius-lg)",
        "box-shadow": "var(--shadow-xl)",
        "z-index": "var(--z-modal)",
        animation: "view-enter 0.26s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "transform-origin": "top right",
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
        <strong style={{ flex: 1, "font-size": "var(--text-body-sm)" }}>
          Notifications
        </strong>
        <button
          onClick={async () => {
            await markAllNotificationsRead();
            refetch();
          }}
          style={{
            "font-size": "var(--text-caption)",
            color: "var(--palm)",
            "font-weight": "700",
          }}
        >
          Mark all read
        </button>
        <button
          onClick={() => setNotificationsOpen(false)}
          aria-label="Close"
          style={{
            "margin-left": "var(--space-3)",
            color: "var(--text-muted)",
          }}
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
        <Show
          when={
            grouped().today.length +
              grouped().yesterday.length +
              grouped().earlier.length ===
            0
          }
        >
          <div
            style={{
              padding: "var(--space-8) var(--space-5)",
              "text-align": "center",
              color: "var(--text-muted)",
            }}
          >
            <Icon name="ph-bell-slash" size={28} />
            <p
              style={{
                margin: "var(--space-3) 0 0",
                "font-size": "var(--text-caption)",
              }}
            >
              暂无新通知。新邮件到达时会出现在这里。
            </p>
          </div>
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

function Row(props: {
  n: {
    id: string;
    type: string;
    title: string;
    body: string;
    read: boolean;
    createdAt: string;
    ref?: { type: string; id: string };
  };
}) {
  const n = () => props.n;
  const onClick = () => {
    const ref = n().ref;
    if (ref?.type === "contact") {
      setView("contacts");
      setSelectedContactId(ref.id);
      setDetailOpen(true);
    } else if (ref?.type === "message") {
      setView("imbox");
      setSelectedMessageId(ref.id);
      setDetailOpen(true);
    } else if (ref?.type === "file") {
      setView("files");
      setSelectedFileId(ref.id);
      setDetailOpen(true);
    } else if (ref?.type === "draft") {
      setView("drafts");
      setSelectedDraftId(ref.id);
      setDetailOpen(true);
    } else if (ref?.type === "event") {
      setView("calendar");
      setCalendarView("day");
      setCalendarSelected(new Date());
    }
    setNotificationsOpen(false);
  };
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        "border-bottom": "0.5px solid var(--border)",
        width: "100%",
        "text-align": "left",
        background: n().read ? "transparent" : "var(--palm-soft)",
        transition:
          "background var(--duration-fast) var(--ease-out), transform 0.16s var(--ease-out)",
      }}
      onMouseEnter={(ev) => {
        if (n().read) ev.currentTarget.style.background = "var(--paper-mid)";
      }}
      onMouseLeave={(ev) => {
        if (n().read) ev.currentTarget.style.background = "transparent";
        else ev.currentTarget.style.background = "var(--palm-soft)";
      }}
    >
      <Show when={!n().read}>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "14px",
            left: "6px",
            width: "5px",
            height: "5px",
            "border-radius": "50%",
            background: "var(--palm)",
          }}
        />
      </Show>
      <div
        style={{
          "margin-left": n().read ? 0 : "var(--space-2)",
          "flex-shrink": 0,
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            "border-radius": "50%",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            background: n().read
              ? "var(--paper-mid)"
              : `${TINT_BY_TYPE[n().type] ?? "var(--palm)"}20`,
          }}
        >
          <Icon
            name={ICON_BY_TYPE[n().type] ?? "ph-info"}
            size={18}
            style={{
              color: n().read
                ? "var(--text-muted)"
                : (TINT_BY_TYPE[n().type] ?? "var(--palm)"),
            }}
          />
        </div>
      </div>
      <div style={{ flex: 1, "min-width": 0 }}>
        <div
          style={{
            "font-weight": n().read ? "500" : "700",
            "font-size": "var(--text-body-sm)",
            "font-family": "var(--font-display)",
            "letter-spacing": n().read ? "-0.005em" : "-0.012em",
            color: n().read ? "var(--text-secondary)" : "var(--text-primary)",
          }}
        >
          {n().title}
        </div>
        <div
          style={{
            "font-size": "var(--text-caption)",
            color: "var(--text-secondary)",
            "white-space": "nowrap",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {n().body}
        </div>
        <div
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            "margin-top": "2px",
          }}
        >
          {relativeTime(n().createdAt as unknown as string)}
        </div>
      </div>
    </button>
  );
}
