/** Topbar — search, view title, notification bell, avatar. */

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
import { createSignal, onCleanup } from "solid-js";

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
        <button
          onClick={() => setNotificationsOpen(!notificationsOpen())}
          title="Notifications"
          aria-label="Notifications"
          style={iconButtonStyle}
        >
          <Icon name="ph-bell" size={18} />
        </button>
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
 * Tiny badge in the topbar showing the last IMAP sync time + a manual
 * "Sync now" button. Auto-refreshes every 60 s. Shows a dot when
 * no sync has happened yet.
 */
function SyncBadge() {
  const DEFAULT_ACCT = "acct_edwinhao@sendpalm.com";
  const [state, setState] = createSignal<{ last: string; uid: number; busy: boolean }>({
    last: "—",
    uid: 0,
    busy: false,
  });

  const refresh = async () => {
    try {
      const s = await getSyncState(DEFAULT_ACCT);
      setState((p) => ({
        ...p,
        last: s.last_uid > 0 ? `${s.last_uid} 封 · ${s.last_synced_at.slice(11, 16)}` : "未连接",
        uid: s.last_uid,
      }));
    } catch {
      // ignore
    }
  };

  refresh();
  const interval = window.setInterval(refresh, 60_000);
  onCleanup(() => clearInterval(interval));

  const manual = async () => {
    if (state().busy) return;
    setState((p) => ({ ...p, busy: true }));
    try {
      await syncNow(DEFAULT_ACCT);
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
      title={`IMAP · 账户 ${DEFAULT_ACCT} · 点击手动同步`}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-1)",
        padding: "4px 10px",
        "border-radius": "var(--radius-pill)",
        background: "var(--paper-mid)",
        color: "var(--text-secondary)",
        "font-size": "var(--text-micro)",
        "font-weight": "600",
      }}
    >
      <Icon name={state().busy ? "spinner" : "arrows-clockwise"} size={11} />
      <span>{state().last}</span>
    </button>
  );
}
