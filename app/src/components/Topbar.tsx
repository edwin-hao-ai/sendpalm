/** Topbar — search, view title, notification bell, avatar. */

import { Show } from "solid-js";
import { Icon } from "./Icon";
import {
  commandPaletteOpen,
  setCommandPaletteOpen,
  notificationsOpen,
  setNotificationsOpen,
  setSearchOpen,
  view,
  showToast,
} from "../stores/ui";
import { NAV_SECTIONS } from "../utils/labels";
import { Avatar } from "./Avatar";
import { getSyncState, syncNow } from "../services/backend";
import { createSignal, onCleanup, createResource } from "solid-js";
import { listAccounts, countUnreadNotifications } from "../stores/data";

export function Topbar() {
  const currentTitle = () => {
    const sec = NAV_SECTIONS.find((s) => s.view === view());
    return sec?.label ?? "SendPalm";
  };

  return (
    <header
      id="topbar"
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between",
        height: "var(--topbar-height)",
        padding: "0 var(--space-5)",
        background: "var(--surface)",
        "border-bottom": "0.5px solid var(--border)",
        gap: "var(--space-4)",
        position: "relative",
        "z-index": "var(--z-sticky)",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "min-width": "0",
        }}
      >
        <Icon
          name="ph-leaf"
          size={18}
          style={{ color: "var(--palm)", "flex-shrink": "0" }}
        />
        <span
          style={{
            "font-family": "var(--font-display)",
            "font-weight": "800",
            "font-size": "var(--text-body)",
            color: "var(--text-primary)",
            "letter-spacing": "-0.01em",
            "white-space": "nowrap",
          }}
        >
          {currentTitle()}
        </span>
      </div>

      <div style={{ display: "flex", "align-items": "center", gap: "var(--space-3)", flex: 1, "min-width": "0", "max-width": "560px" }}>
        <input
          type="text"
          onFocus={() => setSearchOpen(true)}
          onClick={() => setSearchOpen(true)}
          placeholder="Search contacts, messages, files… (⌘K)"
          aria-label="Search"
          readOnly
          style={{
            display: "block",
            width: "100%",
            padding: "8px 14px",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-pill)",
            color: "var(--text-muted)",
            "font-size": "var(--text-caption)",
            border: "0.5px solid var(--border)",
            cursor: "pointer",
            "min-width": "0",
            "font-family": "var(--font-body)",
            outline: "none",
          }}
        />
      </div>

      <SyncBadge />

      <div style={{ display: "flex", "align-items": "center", gap: "var(--space-2)" }}>
        <button
          onClick={() => setCommandPaletteOpen(!commandPaletteOpen())}
          title="Command palette (⌘K)"
          aria-label="Command palette"
          style={iconButtonStyle}
        >
          <Icon name="ph-lightning" size={18} />
        </button>
        <NotificationBell onClick={() => setNotificationsOpen(!notificationsOpen())} />
        <Avatar name="Edwin Hao" size={28} />
      </div>
    </header>
  );
}

const iconButtonStyle = {
  width: "36px",
  height: "36px",
  "border-radius": "var(--radius-pill)",
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  color: "var(--text-secondary)",
  transition: "background var(--duration-fast) var(--ease-out)",
};
/**
 * Bell icon with unread count badge, auto-refreshed every 10 s and
 * refetched when the panel is opened/closed.
 */
function NotificationBell(props: { onClick: () => void }) {
  const [count, { refetch }] = createResource(countUnreadNotifications);

  // Keep badge fresh while the app is running.
  const interval = window.setInterval(() => refetch(), 10_000);
  onCleanup(() => clearInterval(interval));

  const n = () => count() ?? 0;

  return (
    <button
      onClick={() => {
        props.onClick();
        refetch();
      }}
      title="Notifications"
      aria-label="Notifications"
      style={{ ...iconButtonStyle, position: "relative" }}
    >
      <Icon name="ph-bell" size={18} />
      <Show when={n() > 0}>
        <span
          style={{
            position: "absolute",
            top: "4px",
            right: "4px",
            "min-width": "14px",
            height: "14px",
            padding: "0 4px",
            "border-radius": "var(--radius-pill)",
            background: "var(--palm)",
            color: "#fff",
            "font-size": "9px",
            "font-weight": "700",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
          }}
        >
          {n() > 99 ? "99+" : n()}
        </span>
      </Show>
    </button>
  );
}

function SyncBadge() {
  const [accounts] = createResource(listAccounts);
  const [state, setState] = createSignal<{
    last: string;
    uid: number;
    busy: boolean;
    connected: boolean;
  }>({
    last: "—",
    uid: 0,
    busy: false,
    connected: false,
  });

  const accountId = () => {
    const list = accounts() ?? [];
    const firstEmail = list.find((a) => a.type === "email");
    return firstEmail?.id;
  };

  const refresh = async () => {
    const id = accountId();
    if (!id) {
      setState({ last: "未连接", uid: 0, busy: false, connected: false });
      return;
    }
    try {
      const s = await getSyncState(id);
      const syncedAt = s.last_synced_at
        ? new Date(s.last_synced_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";
      setState({
        last: s.last_uid > 0 ? `${s.last_uid} 封 · ${syncedAt}` : "已连接",
        uid: s.last_uid,
        busy: s.busy,
        connected: true,
      });
    } catch {
      setState({ last: "未连接", uid: 0, busy: false, connected: false });
    }
  };

  createResource(() => accountId(), refresh);

  refresh();
  const interval = window.setInterval(refresh, 10_000);
  onCleanup(() => clearInterval(interval));

  const manual = async () => {
    const id = accountId();
    if (!id || state().busy) return;
    setState((p) => ({ ...p, busy: true }));
    try {
      await syncNow(id);
      showToast({ message: "正在从 IMAP 同步…", kind: "info", ttlMs: 2000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast({ message: `同步失败：${msg}`, kind: "error" });
    } finally {
      setState((p) => ({ ...p, busy: false }));
      await refresh();
    }
  };

  return (
    <button
      onClick={manual}
      title={`IMAP · ${accountId() ?? "无账户"} · 点击手动同步`}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-1)",
        padding: "4px 10px",
        "border-radius": "var(--radius-pill)",
        background: state().connected ? "var(--palm-soft)" : "var(--paper-mid)",
        color: state().connected ? "var(--palm)" : "var(--text-secondary)",
        "font-size": "var(--text-micro)",
        "font-weight": "600",
        transition: "background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
      }}
    >
      <Icon name={state().busy ? "spinner" : "arrows-clockwise"} size={11} />
      <span>{state().last}</span>
    </button>
  );
}
