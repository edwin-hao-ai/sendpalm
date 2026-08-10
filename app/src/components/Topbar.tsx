/** Topbar — search, view title, notification bell, avatar. */

import { Show, For } from "solid-js";
import { Icon } from "./Icon";
import {
  commandPaletteOpen,
  setCommandPaletteOpen,
  notificationsOpen,
  setNotificationsOpen,
  searchQuery,
  setSearchQuery,
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

      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          flex: 1,
          "min-width": "0",
          "max-width": "560px",
        }}
      >
        <input
          type="text"
          value={searchQuery()}
          onInput={(e) => {
            setSearchQuery(e.currentTarget.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search contacts, messages, files… (⌘K)"
          aria-label="Search"
          style={{
            display: "block",
            width: "100%",
            padding: "8px 14px",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-pill)",
            color: "var(--text-primary)",
            "font-size": "var(--text-caption)",
            border: "0.5px solid var(--border)",
            cursor: "text",
            "min-width": "0",
            "font-family": "var(--font-body)",
            outline: "none",
          }}
        />
      </div>

      <SyncBadge />

      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
        }}
      >
        <button
          onClick={() => setCommandPaletteOpen(!commandPaletteOpen())}
          title="Command palette (⌘K)"
          aria-label="Command palette"
          style={iconButtonStyle}
        >
          <Icon name="ph-lightning" size={18} />
        </button>
        <NotificationBell
          onClick={() => setNotificationsOpen(!notificationsOpen())}
        />
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
            animation: "pulse-soft 1.8s ease-in-out infinite",
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
  const [open, setOpen] = createSignal(false);
  const [busyIds, setBusyIds] = createSignal<Set<string>>(new Set());
  const [states, setStates] = createSignal<
    Record<string, { last_uid: number; last_synced_at: string; busy: boolean }>
  >({});

  const emailAccounts = () =>
    (accounts() ?? []).filter((a) => a.type === "email");

  const refreshAll = async () => {
    const list = emailAccounts();
    const next: Record<
      string,
      { last_uid: number; last_synced_at: string; busy: boolean }
    > = {};
    await Promise.all(
      list.map(async (a) => {
        try {
          const s = await getSyncState(a.id);
          next[a.id] = {
            last_uid: s.last_uid,
            last_synced_at: s.last_synced_at,
            busy: s.busy,
          };
        } catch {
          next[a.id] = { last_uid: 0, last_synced_at: "", busy: false };
        }
      }),
    );
    setStates(next);
  };

  createResource(
    () => emailAccounts().length,
    () => {
      refreshAll();
      return null;
    },
  );
  refreshAll();
  const interval = window.setInterval(refreshAll, 10_000);
  onCleanup(() => clearInterval(interval));

  const aggregateBusy = () => {
    const s = states();
    return emailAccounts().some((a) => busyIds().has(a.id) || s[a.id]?.busy);
  };
  const aggregateConnected = () => emailAccounts().length > 0;

  const triggerSync = async (id: string) => {
    if (busyIds().has(id)) return;
    setBusyIds((p) => new Set([...p, id]));
    try {
      await syncNow(id);
      showToast({ message: "正在从 IMAP 同步…", kind: "info", ttlMs: 2000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast({ message: `同步失败：${msg}`, kind: "error" });
    } finally {
      setBusyIds((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
      await refreshAll();
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open())}
        title="IMAP 同步状态"
        aria-label="IMAP 同步状态"
        data-sync-badge
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-1)",
          padding: "4px 10px",
          "border-radius": "var(--radius-pill)",
          background: aggregateConnected()
            ? "var(--palm-soft)"
            : "var(--paper-mid)",
          color: aggregateConnected() ? "var(--palm)" : "var(--text-secondary)",
          "font-size": "var(--text-micro)",
          "font-weight": "600",
          animation: aggregateBusy()
            ? "pulse-soft 1.6s ease-in-out infinite"
            : undefined,
          transition:
            "background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
        }}
      >
        <Icon
          name={aggregateBusy() ? "spinner" : "arrows-clockwise"}
          size={11}
        />
        <span>
          {emailAccounts().length === 0
            ? "未连接"
            : aggregateBusy()
              ? "同步中…"
              : `${emailAccounts().length} 账户`}
        </span>
        <Show when={emailAccounts().length > 0}>
          <Icon name="ph-caret-down" size={9} />
        </Show>
      </button>
      <Show when={open()}>
        <div
          data-sync-popover
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: "0",
            "min-width": "280px",
            background: "var(--surface)",
            border: "0.5px solid var(--border)",
            "border-radius": "var(--radius-md)",
            "box-shadow": "0 8px 24px rgba(0,0,0,0.12)",
            padding: "var(--space-2)",
            "z-index": "var(--z-popover)",
          }}
        >
          <p
            style={{
              margin: "var(--space-1) var(--space-2)",
              "font-size": "var(--text-micro)",
              "font-weight": "700",
              color: "var(--text-muted)",
              "text-transform": "uppercase",
              "letter-spacing": "0.04em",
            }}
          >
            IMAP 同步 · {emailAccounts().length} 账户
          </p>
          <Show when={emailAccounts().length === 0}>
            <p
              style={{
                margin: "var(--space-2)",
                "font-size": "var(--text-caption)",
                color: "var(--text-muted)",
              }}
            >
              请到 Settings → Accounts 添加邮箱账户
            </p>
          </Show>
          <For each={emailAccounts()}>
            {(a) => {
              const s = () => states()[a.id];
              const busy = () => busyIds().has(a.id) || s()?.busy;
              const syncedAt = () => {
                const t = s()?.last_synced_at;
                if (!t || t === "未配置（无 Tauri runtime）") return "—";
                const d = new Date(t);
                if (Number.isNaN(d.getTime())) return "—";
                return d.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
              };
              return (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-2)",
                    "border-radius": "var(--radius-sm)",
                  }}
                >
                  <div style={{ flex: 1, "min-width": "0" }}>
                    <p
                      style={{
                        margin: 0,
                        "font-size": "var(--text-caption)",
                        "font-weight": "600",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                      }}
                    >
                      {a.label}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        "font-size": "var(--text-micro)",
                        color: busy() ? "var(--palm)" : "var(--text-muted)",
                      }}
                    >
                      <Show when={busy()} fallback={<>最近同步 {syncedAt()}</>}>
                        正在同步…
                      </Show>
                    </p>
                  </div>
                  <button
                    onClick={() => triggerSync(a.id)}
                    disabled={busy()}
                    title="立即同步"
                    style={{
                      padding: "4px 10px",
                      "border-radius": "var(--radius-pill)",
                      background: busy()
                        ? "var(--paper-mid)"
                        : "var(--palm-soft)",
                      color: busy() ? "var(--text-muted)" : "var(--palm)",
                      "font-size": "var(--text-micro)",
                      "font-weight": "700",
                      opacity: busy() ? 0.5 : 1,
                    }}
                  >
                    {busy() ? "…" : "同步"}
                  </button>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
      <Show when={open()}>
        <div
          data-sync-overlay
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: "0",
            "z-index": "calc(var(--z-popover) - 1)",
          }}
        />
      </Show>
    </div>
  );
}
