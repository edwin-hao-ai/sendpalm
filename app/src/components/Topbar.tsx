/** Topbar — search, view title, notification bell, sync badge, avatar menu. */

import { Show, For, onMount } from "solid-js";
import { Icon } from "./Icon";
import { BrandMark } from "./BrandMark";
import { ErrorLogButton } from "./ErrorLog";
import { useViewport, useSoftRefreshEffect } from "../utils/gestures";
import {
  commandPaletteOpen,
  setCommandPaletteOpen,
  notificationsOpen,
  setNotificationsOpen,
  searchQuery,
  setSearchQuery,
  setSearchOpen,
  view,
  setView,
  setSettingsTab,
  setHelpOpen,
  setErrorLogOpen,
  setErrorLogOpened,
  showToast,
  appSettings,
} from "../stores/ui";
import { NAV_SECTIONS } from "../utils/labels";
import { navDisplayLabel } from "./Sidebar";
import { Avatar } from "./Avatar";
import { getSyncState, syncNow } from "../services/backend";
import { createSignal, createResource, onCleanup } from "solid-js";
import { listAccounts, countUnreadNotifications } from "../stores/data";

/** Shared liquid-glass recipe for floating surfaces (topbar, popovers).
 *  Tokens live in styles/tokens.css (--glass-*) — never inline the recipe. */
const GLASS_BG = "var(--glass-bg)";
const GLASS_BLUR = "var(--glass-blur)";

export function Topbar() {
  const { isMobile } = useViewport();
  const currentTitle = () => {
    const sec = NAV_SECTIONS.find((s) => s.view === view());
    return sec ? navDisplayLabel(sec.view) : "";
  };

  return (
    <header
      id="topbar"
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between",
        padding: isMobile()
          ? "0 var(--space-5)"
          : "0 var(--space-5) 0 var(--titlebar-traffic-pad)",
        background: GLASS_BG,
        "backdrop-filter": GLASS_BLUR,
        "-webkit-backdrop-filter": GLASS_BLUR,
        "border-bottom": "0.5px solid var(--border)",
        gap: "var(--space-4)",
        position: "relative",
        "z-index": "var(--z-sticky)",
        "-webkit-app-region": "drag",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          "min-width": "0",
          "-webkit-app-region": "no-drag",
        }}
      >
        <BrandMark compact={isMobile()} />
        <span
          style={{
            "font-family": "var(--font-display)",
            "font-weight": "800",
            "font-size": "var(--text-body)",
            color: "var(--text-primary)",
            "letter-spacing": "-0.01em",
            "white-space": "nowrap",
            "overflow": "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {currentTitle()}
        </span>
      </div>

      <Show when={!isMobile()}>
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
            placeholder="搜索邮件、联系人、文件…（⌘/）"
            aria-label="搜索"
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
              "-webkit-app-region": "no-drag",
            }}
          />
        </div>
      </Show>

      <SyncBadge />

      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "-webkit-app-region": "no-drag",
        }}
      >
        <button
          onClick={() => setCommandPaletteOpen(!commandPaletteOpen())}
          title="命令面板 (⌘K)"
          aria-label="命令面板"
          style={iconButtonStyle(isMobile())}
        >
          <Icon name="ph-lightning" size={18} />
        </button>
        <NotificationBell
          onClick={() => setNotificationsOpen(!notificationsOpen())}
        />
        <ErrorLogButton />
        <AvatarMenu />
      </div>
    </header>
  );
}

const iconButtonStyle = (mobile: boolean) => ({
  width: mobile ? "44px" : "36px",
  height: mobile ? "44px" : "36px",
  "border-radius": "var(--radius-pill)",
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  color: "var(--text-secondary)",
  transition: "background var(--duration-fast) var(--ease-out)",
});

/** Avatar + account menu (设置 / 键盘快捷键 / 错误日志). The display name
 *  comes from the first connected account, falling back to the profile
 *  settings — never hard-coded. */
function AvatarMenu() {
  const { isMobile } = useViewport();
  const [accounts] = createResource(listAccounts);
  const [open, setOpen] = createSignal(false);

  const displayName = () =>
    accounts()?.[0]?.label ||
    appSettings.profile.displayName ||
    "我";

  const close = () => setOpen(false);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open()) {
      e.stopPropagation();
      close();
    }
  };
  onMount(() => document.addEventListener("keydown", onKey));
  onCleanup(() => document.removeEventListener("keydown", onKey));

  const item = (
    icon: string,
    label: string,
    run: () => void,
  ) => (
    <button
      onClick={() => {
        close();
        run();
      }}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-2)",
        width: "100%",
        padding: "var(--space-2) var(--space-3)",
        "border-radius": "var(--radius-sm)",
        "font-size": "var(--text-caption)",
        color: "var(--text-primary)",
        "text-align": "left",
      }}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open())}
        title="账户与设置"
        aria-label="账户与设置"
        aria-expanded={open()}
        style={{
          padding: 0,
          "border-radius": "50%",
          display: "flex",
          "min-width": isMobile() ? "44px" : undefined,
          "min-height": isMobile() ? "44px" : undefined,
          "align-items": "center",
          "justify-content": "center",
        }}
      >
        <Avatar name={displayName()} size={28} />
      </button>
      <Show when={open()}>
        <div
          onClick={close}
          style={{ position: "fixed", inset: "0", "z-index": "calc(var(--z-popover) - 1)" }}
        />
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: "0",
            "min-width": "180px",
            background: GLASS_BG,
            "backdrop-filter": GLASS_BLUR,
            "-webkit-backdrop-filter": GLASS_BLUR,
            border: "0.5px solid var(--border)",
            "border-radius": "var(--radius-md)",
            "box-shadow": "var(--shadow-lg)",
            padding: "var(--space-1)",
            "z-index": "var(--z-popover)",
          }}
        >
          <p
            style={{
              margin: "var(--space-1) var(--space-3)",
              "font-size": "var(--text-micro)",
              color: "var(--text-muted)",
              "white-space": "nowrap",
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "max-width": "220px",
            }}
          >
            {displayName()}
          </p>
          {item("ph-gear", "设置", () => setView("settings"))}
          {item("ph-keyboard", "键盘快捷键", () => setHelpOpen(true))}
          {item("ph-warning-circle", "错误日志", () => {
            setErrorLogOpened(Date.now());
            setErrorLogOpen(true);
          })}
        </div>
      </Show>
    </div>
  );
}

/**
 * Bell icon with unread count badge. Event-driven, not polled:
 *  - re-fetches when the sync bridge fires a soft refresh tick
 *    (i.e. a new message arrived and the count might have changed)
 *  - re-fetches when the panel is opened (so the user sees a fresh
 *    count if the bridge fired while the panel was closed)
 *  - re-fetches once on mount for the initial render
 *
 * The previous setInterval(10s) was the source of the 78-second
 * sync freeze pre-Phase-1.5: every 10s a Topbar-mounted resource
 * pulled through the now-1-connection SQLite pool. With the pool
 * fixed (max_connections=8) the freeze is gone, but the polling
 * was still 100% wasteful — the data has a push channel.
 */
function NotificationBell(props: { onClick: () => void }) {
  const { isMobile } = useViewport();
  const [count, { refetch }] = createResource(countUnreadNotifications);

  onMount(() => {
    void refetch();
  });
  useSoftRefreshEffect(() => {
    void refetch();
  });

  const n = () => count() ?? 0;

  return (
    <button
      onClick={() => {
        props.onClick();
        void refetch();
      }}
      title="通知"
      aria-label="通知"
      style={{ ...iconButtonStyle(isMobile()), position: "relative" }}
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
  const { isMobile } = useViewport();
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
    if (list.length === 0) {
      setStates({});
      return;
    }
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

  // Event-driven refresh: re-pull sync state when the sync bridge
  // fires a soft tick (new message arrived → busy flag may have
  // flipped) and once on mount for the initial render. Previously
  // this polled every 10s, which was the bulk of the IPC traffic
  // when an account was mid-sync.
  onMount(() => {
    void refreshAll();
  });
  useSoftRefreshEffect(() => {
    void refreshAll();
  });

  // Esc closes the popover (the global handler only knows about
  // panels/modals, so the badge handles its own dismissal).
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open()) {
      e.stopPropagation();
      setOpen(false);
    }
  };
  onMount(() => document.addEventListener("keydown", onKey));
  onCleanup(() => document.removeEventListener("keydown", onKey));

  const aggregateBusy = () => {
    const s = states();
    return emailAccounts().some((a) => busyIds().has(a.id) || s[a.id]?.busy);
  };
  const aggregateConnected = () => emailAccounts().length > 0;

  const goToAccounts = () => {
    setOpen(false);
    setSettingsTab("accounts");
    setView("settings");
  };

  const triggerSync = async (id: string) => {
    if (busyIds().has(id)) return;
    setBusyIds((p) => new Set([...p, id]));
    try {
      await syncNow(id);
      showToast({ message: "正在收取新邮件…", kind: "info", ttlMs: 2000 });
    } catch (e) {
      showToast({
        message: "同步失败，请重试",
        kind: "error",
        source: "sync",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyIds((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
      await refreshAll();
    }
  };

  const label = () =>
    accounts.loading
      ? "加载中…"
      : emailAccounts().length === 0
        ? "添加邮箱账户 →"
        : aggregateBusy()
          ? "同步中…"
          : `${emailAccounts().length} 个账户`;

  return (
    <div style={{ position: "relative", "-webkit-app-region": "no-drag" }}>
      <button
        onClick={() =>
          emailAccounts().length === 0 && !accounts.loading
            ? goToAccounts()
            : setOpen(!open())
        }
        title="邮箱同步状态"
        aria-label="邮箱同步状态"
        data-sync-badge
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-1)",
          padding: "4px 10px",
          "min-height": isMobile() ? "44px" : undefined,
          "border-radius": "var(--radius-pill)",
          background: aggregateConnected()
            ? "var(--palm-soft)"
            : "var(--paper-mid)",
          color: aggregateConnected() ? "var(--palm)" : "var(--text-secondary)",
          "font-size": "var(--text-micro)",
          "font-weight": "600",
          "white-space": "nowrap",
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
        <Show when={!isMobile()}>
          <span>{label()}</span>
        </Show>
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
            background: GLASS_BG,
            "backdrop-filter": GLASS_BLUR,
            "-webkit-backdrop-filter": GLASS_BLUR,
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
              "letter-spacing": "0.04em",
            }}
          >
            邮箱同步 · {emailAccounts().length} 个账户
          </p>
          <Show when={emailAccounts().length === 0}>
            <button
              onClick={goToAccounts}
              style={{
                display: "block",
                width: "100%",
                margin: "var(--space-1) 0",
                padding: "var(--space-2)",
                "border-radius": "var(--radius-sm)",
                "font-size": "var(--text-caption)",
                color: "var(--palm)",
                "font-weight": "600",
                "text-align": "left",
              }}
            >
              添加邮箱账户 →
            </button>
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
