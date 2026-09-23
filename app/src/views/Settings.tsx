/** Settings view — 8 tabs.
 * Desktop: 280px left rail + content column. Mobile: drill-in menu.
 * Spec: prototype-v11 §3.19.
 */

import {
  For,
  Show,
  createContext,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";
import { useViewport } from "../utils/gestures";
import {
  listAccounts,
  upsertAccount,
  deleteAccount,
  listLabels,
  upsertLabel,
  deleteLabel,
  listShortcuts,
  upsertShortcut,
  resetShortcuts,
  listContacts,
  resetAllData,
  listSnippets,
  upsertSnippet,
  deleteSnippet,
  listMessagesPaged,
  listTasks,
  listFiles,
  emptyTrash,
} from "../stores/data";
import {
  appSettings,
  setAppSettings,
  settingsTab,
  setSettingsTab,
  showToast,
  setOnboardingStep,
  type SettingsTab,
} from "../stores/ui";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { Empty, ErrorState } from "../components/Empty";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ResourceGate } from "../components/ResourceGate";
import { SkeletonList } from "../components/Skeleton";
import { uid } from "../utils/id";
import type {
  Account,
  AccountSettings,
  Label,
  Shortcut,
  Snippet,
} from "../types";
import { isoNow } from "../utils/date";
import { load, STORE_PATH } from "../bootstrap";
import {
  listProviders as fetchProviders,
  vaultSave,
  vaultDelete,
  vaultSetSecret,
  LLM_API_KEY_VAULT_KEY,
  getSyncState,
  syncNow,
} from "../services/backend";
import { ensureNotificationPermission } from "../services/notifications";
import { setLocale, type Locale } from "../i18n";
import {
  onboardingResumeStep,
  setOnboardingResumeStep,
} from "./Onboarding";

const TABS = [
  { id: "profile", label: "个人资料", icon: "ph-user-circle" },
  { id: "accounts", label: "账户", icon: "ph-plug" },
  { id: "preferences", label: "偏好", icon: "ph-sliders" },
  { id: "agent", label: "Agent", icon: "ph-sparkle" },
  { id: "labels", label: "标签", icon: "ph-tag" },
  { id: "snippets", label: "片段", icon: "ph-text-aa" },
  { id: "data", label: "数据", icon: "ph-database" },
  { id: "shortcuts", label: "快捷键", icon: "ph-keyboard" },
] as const;

/** 账户状态 → 用户可读中文。 */
const ACCOUNT_STATUS_LABELS: Record<Account["status"], string> = {
  connected: "已连接",
  syncing: "同步中",
  error: "同步异常",
  disconnected: "未连接",
};

/** 快捷键 action id → 中文名（与快捷键帮助弹窗保持一致）。 */
const SHORTCUT_ACTION_LABELS: Record<string, string> = {
  "app:command-palette": "命令面板",
  "app:search": "搜索",
  "app:help": "键盘快捷键帮助",
  "app:compose": "写新邮件",
  "app:agent": "Agent 面板",
  "app:notifications": "通知",
  "nav:screener": "Gate（筛选台）",
  "nav:imbox": "Imbox（收件箱）",
  "nav:feed": "Stream（信息流）",
  "nav:paperTrail": "Records（记录）",
  "nav:contacts": "联系人",
  "nav:calendar": "日历",
  "nav:files": "文件",
  "nav:insights": "洞察",
  "nav:settings": "设置",
  "nav:drafts": "草稿",
  "list:cursor-down": "下一条",
  "list:cursor-up": "上一条",
  "list:select": "选择当前行",
  "list:open": "打开",
  "message:reply": "回复",
  "message:forward": "转发",
  "message:reply-later": "稍后回复",
  "message:set-aside": "搁置",
  "message:bubble-up": "提醒",
  "message:archive": "归档",
  "message:trash": "删除",
  "message:spam": "标记为垃圾邮件",
  "message:unread": "标为未读",
  "message:label": "加标签",
  "message:move": "移动",
  "bulk:menu": "批量操作",
  "calendar:day": "日历 · 日视图",
  "calendar:week": "日历 · 周视图",
  "calendar:year": "日历 · 年视图",
  "calendar:today": "日历 · 回到今天",
  "calendar:prev": "日历 · 上一页",
  "calendar:next": "日历 · 下一页",
};

export function shortcutActionLabel(action: string, fallback: string): string {
  return SHORTCUT_ACTION_LABELS[action] ?? fallback;
}

/** Build a shortcut combo string from a captured key event, in the same
 *  glyph format `matches()` in utils/shortcuts.ts parses ("⌘1", "⇧A",
 *  "j", "←"). Returns null for pure modifier presses and Escape (so Esc
 *  still closes the edit modal instead of being captured). */
export function comboFromKeyEvent(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}): string | null {
  if (["Meta", "Control", "Shift", "Alt", "Escape"].includes(e.key)) {
    return null;
  }
  const mods = (e.metaKey || e.ctrlKey ? "⌘" : "") + (e.shiftKey ? "⇧" : "");
  const named: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Enter: "Enter",
    " ": "Space",
  };
  const k =
    named[e.key] ??
    (e.key.length === 1
      ? e.shiftKey && /[a-z]/i.test(e.key)
        ? e.key.toUpperCase()
        : e.key.toLowerCase()
      : e.key);
  return mods + k;
}

const TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Shanghai", label: "上海 (UTC+8)" },
  { value: "Asia/Singapore", label: "新加坡 (UTC+8)" },
  { value: "Asia/Tokyo", label: "东京 (UTC+9)" },
  { value: "Asia/Dubai", label: "迪拜 (UTC+4)" },
  { value: "Europe/London", label: "伦敦 (UTC+0)" },
  { value: "Europe/Berlin", label: "柏林 (UTC+1)" },
  { value: "America/New_York", label: "纽约 (UTC-5)" },
  { value: "America/Los_Angeles", label: "洛杉矶 (UTC-8)" },
  { value: "Australia/Sydney", label: "悉尼 (UTC+10)" },
  { value: "UTC", label: "UTC（协调世界时）" },
];

const FOLDER_LABELS: Record<string, string> = {
  INBOX: "收件箱",
  Sent: "已发送",
  Drafts: "草稿",
  Archive: "归档",
  Trash: "回收站",
  Spam: "垃圾邮件",
  Starred: "星标",
  Important: "重要",
};

/** Stored as data (SQLite / color input), not a style — mirrors --palm. */
const DEFAULT_ACCOUNT_COLOR = "#0a8f63";
/** Mirrors --blurple; color inputs require a hex value. */
const DEFAULT_LABEL_COLOR = "#5522fa";

export function Settings() {
  const { isMobile } = useViewport();
  const [mobileTab, setMobileTab] = createSignal<string | null>(null);
  const [saveState, setSaveState] = createSignal<"idle" | "saving" | "saved">(
    "idle",
  );

  let saveTimeout: ReturnType<typeof setTimeout> | undefined;
  let savedReset: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const settings = appSettings;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      setSaveState("saving");
      try {
        const store = await load(STORE_PATH);
        await store.set("app_settings", settings);
        await store.save();
        setSaveState("saved");
        clearTimeout(savedReset);
        savedReset = setTimeout(() => {
          setSaveState((s) => (s === "saved" ? "idle" : s));
        }, 2000);
      } catch (e) {
        setSaveState("idle");
        showToast({
          message: "设置保存失败，请重试",
          kind: "error",
          source: "settings",
          detail: String(e),
        });
      }
    }, 400);
  });
  onCleanup(() => {
    clearTimeout(saveTimeout);
    clearTimeout(savedReset);
  });

  // Collapse back to the menu when the viewport grows to desktop/tablet.
  createEffect(() => {
    if (!isMobile()) setMobileTab(null);
  });

  const activeTab = () => mobileTab() ?? settingsTab();

  const navigateToTab = (id: string) => {
    setSettingsTab(id as SettingsTab);
    if (isMobile()) setMobileTab(id);
  };

  return (
    <div
      data-testid="settings-view"
      style={{
        animation: "view-enter 0.3s var(--ease-out) both",
        display: "flex",
        "flex-direction": "column",
        height: "100%",
      }}
    >
      <Show
        when={!isMobile()}
        fallback={
          <>
            <Show when={mobileTab() === null}>
              <header
                style={{
                  padding: "var(--space-5) var(--space-5) 0",
                  display: "flex",
                  "align-items": "baseline",
                  gap: "var(--space-3)",
                }}
              >
                <h2
                  style={{
                    "font-family": "var(--font-display)",
                    "font-size": "var(--text-h1)",
                    "font-weight": "800",
                    margin: 0,
                  }}
                >
                  设置
                </h2>
                <SaveIndicator state={saveState()} />
              </header>
              <SettingsMenu active={activeTab()} onSelect={navigateToTab} />
            </Show>
            <Show when={mobileTab() !== null}>
              <MobileContentHeader
                title={
                  TABS.find((t) => t.id === activeTab())?.label ?? activeTab()
                }
                onBack={() => setMobileTab(null)}
              />
              <main
                style={{
                  flex: 1,
                  "min-width": 0,
                  width: "100%",
                  padding: "0 var(--space-5) var(--space-5)",
                }}
              >
                <SettingsDetailContext.Provider
                  value={{
                    mobile: true,
                    label:
                      TABS.find((t) => t.id === activeTab())?.label ??
                      activeTab(),
                  }}
                >
                  <SettingsContent activeTab={activeTab()} />
                </SettingsDetailContext.Provider>
              </main>
            </Show>
          </>
        }
      >
        {/* Desktop / tablet: left rail + content column */}
        <header
          style={{
            padding: "var(--space-5) var(--space-6) 0",
            display: "flex",
            "align-items": "baseline",
            gap: "var(--space-3)",
          }}
        >
          <h2
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h1)",
              "font-weight": "800",
              margin: 0,
            }}
          >
            设置
          </h2>
          <SaveIndicator state={saveState()} />
        </header>
        <div
          style={{
            flex: 1,
            display: "grid",
            "grid-template-columns": "280px minmax(0, 1fr)",
            gap: "var(--space-6)",
            padding: "var(--space-4) var(--space-6) var(--space-6)",
            "align-items": "start",
            overflow: "auto",
          }}
        >
          <SettingsMenu
            active={settingsTab()}
            onSelect={navigateToTab}
            rail
          />
          <main
            style={{
              "min-width": 0,
              "max-width": "640px",
              width: "100%",
              "justify-self": "center",
            }}
          >
            <SettingsContent activeTab={settingsTab()} />
          </main>
        </div>
      </Show>
    </div>
  );
}

function SaveIndicator(props: { state: "idle" | "saving" | "saved" }) {
  return (
    <Show when={props.state !== "idle"}>
      <span
        data-testid="settings-save-state"
        style={{
          "font-size": "var(--text-caption)",
          color: props.state === "saved" ? "var(--palm)" : "var(--text-muted)",
          display: "inline-flex",
          "align-items": "center",
          gap: "4px",
        }}
      >
        {props.state === "saving" ? (
          "保存中…"
        ) : (
          <>
            <Icon name="ph-check" size={12} />
            已自动保存
          </>
        )}
      </span>
    </Show>
  );
}

function SettingsMenu(props: {
  active: string;
  onSelect: (id: string) => void;
  rail?: boolean;
}) {
  return (
    <nav
      data-testid="settings-menu"
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-1)",
        padding: props.rail ? "var(--space-2)" : "var(--space-4) var(--space-5) var(--space-5)",
        ...(props.rail
          ? {
              position: "sticky" as const,
              top: "var(--space-4)",
              background:
                "color-mix(in srgb, var(--paper-light) 82%, transparent)",
              "backdrop-filter": "blur(20px) saturate(1.4)",
              "border-radius": "var(--radius-lg)",
              border: "0.5px solid var(--border)",
              "box-shadow": "0 8px 24px rgba(0,0,0,0.06)",
            }
          : {}),
      }}
    >
      <For each={TABS}>
        {(t) => {
          const selected = () => props.rail && props.active === t.id;
          return (
            <button
              data-testid={`settings-menu-item-${t.id}`}
              onClick={() => props.onSelect(t.id)}
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-3)",
                padding: "12px var(--space-3)",
                "min-height": "44px",
                "border-radius": "var(--radius-md)",
                background: selected() ? "var(--palm-soft)" : "transparent",
                "box-shadow": selected()
                  ? "inset 3px 0 0 var(--palm)"
                  : "none",
                color: "var(--text-primary)",
                "font-weight": selected() ? "700" : "500",
                "text-align": "left",
                "border-bottom": props.rail
                  ? "none"
                  : "0.5px solid var(--border)",
              }}
              onMouseEnter={(e) => {
                if (!selected())
                  e.currentTarget.style.background = "var(--paper-mid)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = selected()
                  ? "var(--palm-soft)"
                  : "transparent";
              }}
            >
              <Icon
                name={t.icon}
                size={20}
                style={{
                  color: selected() ? "var(--palm)" : "var(--text-muted)",
                }}
              />
              <span style={{ flex: 1, "font-size": "var(--text-body-sm)" }}>
                {t.label}
              </span>
              <Show when={!props.rail}>
                <Icon
                  name="ph-caret-right"
                  size={16}
                  style={{ color: "var(--text-muted)", "flex-shrink": 0 }}
                />
              </Show>
            </button>
          );
        }}
      </For>
    </nav>
  );
}

function MobileContentHeader(props: { title: string; onBack: () => void }) {
  return (
    <div
      data-testid="settings-mobile-header"
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-2)",
        padding: "var(--space-3) var(--space-5)",
        "border-bottom": "0.5px solid var(--border)",
        position: "sticky",
        top: 0,
        background: "var(--surface)",
        "z-index": "var(--z-sticky)",
      }}
    >
      <button
        onClick={props.onBack}
        style={{
          display: "flex",
          "align-items": "center",
          gap: "2px",
          color: "var(--palm)",
          "font-weight": "600",
          "font-size": "var(--text-body-sm)",
          padding: "10px 12px 10px 0",
          "min-height": "44px",
        }}
      >
        <Icon name="ph-caret-left" size={18} />
        设置
      </button>
      <span
        style={{
          flex: 1,
          "font-family": "var(--font-display)",
          "font-size": "var(--text-body-sm)",
          "font-weight": "800",
          "text-align": "center",
          "padding-right": "54px",
        }}
      >
        {props.title}
      </span>
    </div>
  );
}

function SettingsContent(props: { activeTab: string }) {
  return (
    <>
      <Show when={props.activeTab === "profile"}>
        <ProfileTab />
      </Show>
      <Show when={props.activeTab === "accounts"}>
        <AccountsTab />
      </Show>
      <Show when={props.activeTab === "preferences"}>
        <PreferencesTab />
      </Show>
      <Show when={props.activeTab === "agent"}>
        <AgentTab />
      </Show>
      <Show when={props.activeTab === "labels"}>
        <LabelsTab />
      </Show>
      <Show when={props.activeTab === "snippets"}>
        <SnippetsTab />
      </Show>
      <Show when={props.activeTab === "data"}>
        <DataTab />
      </Show>
      <Show when={props.activeTab === "shortcuts"}>
        <ShortcutsTab />
      </Show>
    </>
  );
}

function SectionTitle(props: { children: string }) {
  return (
    <h3
      style={{
        "font-family": "var(--font-display)",
        "font-size": "var(--text-h4)",
        "font-weight": "800",
        "margin": "0 0 var(--space-3)",
      }}
    >
      {props.children}
    </h3>
  );
}

/** On mobile the sticky content header already shows the active tab's
 *  label, so a leading SectionTitle with the same text reads as a
 *  duplicate. `PageTitle` renders a SectionTitle on desktop and on
 *  mobile only when its text differs from the tab label (e.g. the
 *  "外观" subsection under the 偏好 tab stays). */
const SettingsDetailContext = createContext<{
  mobile: boolean;
  label: string;
}>({ mobile: false, label: "" });

function PageTitle(props: { children: string }) {
  const ctx = useContext(SettingsDetailContext);
  return (
    <Show when={!(ctx.mobile && ctx.label === props.children)}>
      <SectionTitle>{props.children}</SectionTitle>
    </Show>
  );
}

function ProfileTab() {
  const s = appSettings;
  const replayOnboarding = async () => {
    const store = await load(STORE_PATH);
    await store.set("onboarding_completed", false);
    await store.save();
    setOnboardingStep(0);
    showToast({ message: "已开始新手引导", kind: "info" });
  };
  const timezoneKnown = () =>
    TIMEZONES.some((tz) => tz.value === s.profile.timezone);
  return (
    <div>
      <PageTitle>个人资料</PageTitle>
      <Field label="显示名称">
        <input
          value={s.profile.displayName}
          onInput={(e) =>
            setAppSettings("profile", "displayName", e.currentTarget.value)
          }
          style={inputStyle}
        />
      </Field>
      <Field label="时区">
        <select
          value={s.profile.timezone}
          onChange={(e) =>
            setAppSettings("profile", "timezone", e.currentTarget.value)
          }
          style={inputStyle}
        >
          <For each={TIMEZONES}>
            {(tz) => <option value={tz.value}>{tz.label}</option>}
          </For>
          <Show when={!timezoneKnown()}>
            <option value={s.profile.timezone}>{s.profile.timezone}</option>
          </Show>
        </select>
      </Field>
      <Field label="语言">
        <select
          value={s.profile.language}
          onChange={(e) => {
            const v = e.currentTarget.value as Locale;
            setAppSettings("profile", "language", v);
            setLocale(v);
          }}
          style={inputStyle}
        >
          <option value="zh-CN">中文 (zh-CN)</option>
          <option value="en-US">English (en-US)</option>
        </select>
      </Field>
      <Field label="签名" hint="写信时自动附加在邮件末尾。">
        <textarea
          value={s.profile.signature}
          onInput={(e) =>
            setAppSettings("profile", "signature", e.currentTarget.value)
          }
          rows={4}
          style={{
            ...inputStyle,
            "min-height": "100px",
            "font-family": "var(--font-body)",
            resize: "vertical",
          }}
        />
      </Field>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          onClick={replayOnboarding}
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "6px",
            padding: "10px 16px",
            "min-height": "44px",
            background: "var(--palm-soft)",
            color: "var(--palm)",
            border: "0.5px solid var(--palm)",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
            cursor: "pointer",
          }}
        >
          <Icon name="ph-arrow-counter-clockwise" size={14} />
          重新查看新手引导
        </button>
      </div>
    </div>
  );
}

function SyncStatus(props: { accountId: string }) {
  const [state] = createResource(
    () => props.accountId,
    (id) => getSyncState(id),
  );
  return (
    <span
      style={{
        "font-size": "var(--text-micro)",
        color: state()?.busy ? "var(--palm)" : "var(--text-muted)",
        "margin-left": "var(--space-2)",
      }}
    >
      <Show when={state()} fallback="—">
        {(s) => (
          <>
            <Show when={s().busy}>同步中 · </Show>
            {s().last_synced_at === "未配置（无 Tauri runtime）"
              ? "未配置"
              : `最近同步 ${formatRelative(s().last_synced_at)}`}
          </>
        )}
      </Show>
    </span>
  );
}

function formatRelative(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

const PROVIDER_WALL = [
  "飞书",
  "QQ 邮箱",
  "网易 163",
  "网易 126",
  "iCloud",
  "Fastmail",
  "企业邮箱",
];

function AccountsTab() {
  const [accounts, { refetch }] = createResource(listAccounts);
  const [editing, setEditing] = createSignal<Account | null>(null);
  const [adding, setAdding] = createSignal(false);
  const [syncingId, setSyncingId] = createSignal<string | null>(null);

  const onSave = async (a: Account) => {
    await upsertAccount(a);
    await refetch();
    setEditing(null);
    showToast({ message: "已保存", kind: "success" });
  };

  const syncAccount = async (a: Account) => {
    if (syncingId()) return;
    setSyncingId(a.id);
    try {
      const r = await syncNow(a.id, "INBOX");
      if (r) {
        showToast({
          message: `已同步 ${a.label} · 新增 ${r.new_messages} 封`,
          kind: "success",
        });
      } else {
        showToast({
          message: `正在收取 ${a.label} 的新邮件…`,
          kind: "info",
        });
      }
    } finally {
      setSyncingId(null);
    }
  };

  const hasAccounts = () => (accounts() ?? []).length > 0;

  return (
    <div>
      <Show when={onboardingResumeStep() !== null}>
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            "margin-bottom": "var(--space-3)",
            background: "var(--palm-soft)",
            "border-radius": "var(--radius-md)",
            border: "0.5px solid var(--palm)",
            "font-size": "var(--text-caption)",
            color: "var(--text-primary)",
          }}
        >
          <Icon name="ph-sparkle" size={16} color="var(--palm)" />
          <span style={{ flex: 1 }}>
            你正在完成新手引导 — 添加账户后回来继续。
          </span>
          <button
            onClick={() => {
              const step = onboardingResumeStep();
              setOnboardingResumeStep(null);
              setOnboardingStep(step ?? 0);
            }}
            style={{
              padding: "6px 12px",
              background: "var(--palm)",
              color: "#fff",
              "border-radius": "var(--radius-pill)",
              "font-weight": "700",
              "font-size": "var(--text-micro)",
              "white-space": "nowrap",
            }}
          >
            继续新手引导
          </button>
        </div>
      </Show>

      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-3)",
        }}
      >
        <SectionTitle>邮箱账户</SectionTitle>
        <div style={{ flex: 1 }} />
        {/* The empty state below has its own CTA — don't show two
            "添加账户" entries when there are no accounts yet. */}
        <Show when={hasAccounts()}>
          <button
            onClick={() => setAdding(true)}
            style={{
              display: "flex",
              "align-items": "center",
              gap: "4px",
              padding: "6px 14px",
              "min-height": "32px",
              background: "var(--palm)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-weight": "700",
              "font-size": "var(--text-caption)",
            }}
          >
            <Icon name="ph-plus" size={12} /> 添加账户
          </button>
        </Show>
      </div>
      <ResourceGate
        resource={accounts}
        loading={<SkeletonList count={2} height={64} />}
        errorView={() => (
          <ErrorState
            title="账户加载失败"
            message="读取账户列表时出错，请重试。"
            retry={() => void refetch()}
          />
        )}
        empty={
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              "align-items": "center",
              padding: "var(--space-8) var(--space-5)",
              "text-align": "center",
            }}
          >
            <div
              style={{
                width: "72px",
                height: "72px",
                "border-radius": "50%",
                background: "var(--palm-soft)",
                color: "var(--palm)",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                "margin-bottom": "var(--space-4)",
              }}
            >
              <Icon name="ph-plug-charging" size={30} />
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
              还没有连接邮箱
            </h3>
            <p
              style={{
                "max-width": "360px",
                "font-size": "var(--text-body-sm)",
                color: "var(--text-secondary)",
                margin: 0,
                "line-height": 1.6,
              }}
            >
              连接你的邮箱（Gmail、QQ 邮箱、企业邮箱…），邮件会自动同步到这里。
            </p>
            <div
              style={{
                display: "flex",
                "flex-wrap": "wrap",
                gap: "var(--space-2)",
                "justify-content": "center",
                "margin-top": "var(--space-4)",
              }}
            >
              <For each={PROVIDER_WALL}>
                {(name) => (
                  <span
                    style={{
                      padding: "4px 12px",
                      background: "var(--paper-light)",
                      border: "0.5px solid var(--border)",
                      "border-radius": "var(--radius-pill)",
                      "font-size": "var(--text-micro)",
                      color: "var(--text-secondary)",
                      "font-weight": "600",
                    }}
                  >
                    {name}
                  </span>
                )}
              </For>
            </div>
            <button
              onClick={() => setAdding(true)}
              style={{ ...primaryBtn, "margin-top": "var(--space-5)" }}
            >
              添加账户
            </button>
          </div>
        }
      >
        {(list) => (
          <For each={list}>
            {(a) => (
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-3)",
                  padding: "var(--space-3)",
                  background: "var(--paper-light)",
                  "border-radius": "var(--radius-md)",
                  border: "0.5px solid var(--border)",
                  "margin-bottom": "var(--space-2)",
                  "align-items": "center",
                }}
              >
                <Avatar name={a.label} color={a.color} size={36} />
                <div style={{ flex: 1, "min-width": 0 }}>
                  <strong>{a.label}</strong>
                  <p
                    style={{
                      margin: "2px 0 0",
                      "font-size": "var(--text-caption)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {a.email ?? a.workspace ?? ""} ·{" "}
                    {ACCOUNT_STATUS_LABELS[a.status] ?? a.status}
                    <SyncStatus accountId={a.id} />
                  </p>
                </div>
                <button
                  onClick={() => void syncAccount(a)}
                  disabled={syncingId() === a.id}
                  style={{
                    color: "var(--palm)",
                    "font-size": "var(--text-caption)",
                    "font-weight": "700",
                    "min-height": "36px",
                    padding: "6px 8px",
                    opacity: syncingId() === a.id ? 0.5 : 1,
                    cursor:
                      syncingId() === a.id ? "not-allowed" : "pointer",
                  }}
                >
                  {syncingId() === a.id ? "同步中…" : "立即同步"}
                </button>
                <button
                  onClick={() => setEditing(a)}
                  style={{
                    color: "var(--palm)",
                    "font-size": "var(--text-caption)",
                    "font-weight": "700",
                    "min-height": "36px",
                    padding: "6px 8px",
                  }}
                >
                  设置
                </button>
              </div>
            )}
          </For>
        )}
      </ResourceGate>

      <Show when={editing()}>
        {(a) => (
          <AccountEditModal
            account={a()}
            onClose={() => setEditing(null)}
            onSave={onSave}
            onDelete={async (deleted) => {
              await deleteAccount(deleted.id);
              await vaultDelete(deleted.id).catch(() => undefined);
              await refetch();
              setEditing(null);
              showToast({
                message: `已删除账户 ${deleted.label}`,
                kind: "success",
              });
            }}
          />
        )}
      </Show>
      <Show when={adding()}>
        <AddAccountModal
          onClose={() => setAdding(false)}
          onAdded={() => void refetch()}
          existingEmails={(accounts() ?? [])
            .map((a) => a.email?.toLowerCase())
            .filter((e): e is string => !!e)}
        />
      </Show>
    </div>
  );
}

interface ProviderInfo {
  id: string;
  label: string;
  icon: string;
  credentials_hint: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  auth_mode: string;
  smtp_implicit_tls: boolean;
}

function AddAccountModal(props: {
  onClose: () => void;
  onAdded: () => void;
  existingEmails: string[];
}) {
  const [providerList] = createResource(fetchProviders);
  const [selectedProviderId, setSelectedProviderId] = createSignal("");
  const [accountEmail, setAccountEmail] = createSignal("");
  const [accountPassword, setAccountPassword] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  // OAuth providers (Gmail / Outlook) can't be connected yet — offering
  // them in the picker leads to a dead end, so the select only lists
  // providers that accept a password / auth code today.
  const providerOptions = createMemo<ProviderInfo[]>(() => {
    const raw = (providerList() ?? []) as ProviderInfo[];
    return raw.filter((p) => p.auth_mode !== "oauth2-required");
  });
  createEffect(() => {
    const opts = providerOptions();
    if (opts.length > 0 && !opts.some((p) => p.id === selectedProviderId())) {
      setSelectedProviderId(opts[0]!.id);
    }
  });

  const onSubmit = async () => {
    const prov = providerOptions().find((p) => p.id === selectedProviderId());
    if (!prov) return;
    const e = accountEmail().trim();
    if (!e || !accountPassword()) {
      showToast({ message: "请填入邮箱地址和密码", kind: "warning" });
      return;
    }
    if (props.existingEmails.includes(e.toLowerCase())) {
      showToast({
        message: "这个邮箱已经添加过账户了",
        kind: "warning",
      });
      return;
    }
    setSaving(true);
    const id = `acct_${e.replace(/[^a-z0-9]/gi, "_")}`;
    const account = {
      id,
      type: "email" as const,
      provider: prov.id,
      email: e,
      label: prov.label,
      displayName: e.split("@")[0] ?? e,
      status: "connected" as const,
      synced: 0,
      total: 0,
      privacy: "unified" as const,
      color: DEFAULT_ACCOUNT_COLOR,
      avatar: prov.label[0] ?? "M",
      lastSync: "刚刚",
      settings: {
        aliases: [],
        signature: "Best,\n" + (e.split("@")[0] ?? ""),
        replyTo: "",
        defaultFrom: e,
        syncFolders: [
          { name: "INBOX", enabled: true },
          { name: "Sent", enabled: true },
        ],
        syncFrequency: "15min" as const,
        autoBcc: false,
        autoBccAddress: "",
        vacationResponder: { enabled: false, subject: "", body: "" },
      },
    } as unknown as Account;
    await upsertAccount(account);
    // Persist password into the OS keychain.
    try {
      const ok = await vaultSave(id, accountPassword());
      if (ok) {
        showToast({
          message: `已添加 ${prov.label} 账户 ${e}，密码已安全存入系统钥匙串`,
          kind: "success",
        });
      } else {
        showToast({
          message: `已添加账户 ${e}（浏览器预览模式，密码未保存）`,
          kind: "info",
        });
      }
    } catch (vaultErr) {
      showToast({
        message: `已添加账户 ${e}，但密码存入系统钥匙串失败`,
        kind: "error",
        source: "vault",
        detail: String(vaultErr),
      });
    }
    setSaving(false);
    props.onAdded();
    props.onClose();
  };

  return (
    <Modal
      open
      onClose={props.onClose}
      title="添加邮箱账户"
      width="560px"
      footer={
        <>
          <button
            onClick={props.onClose}
            style={{
              padding: "8px 16px",
              color: "var(--text-secondary)",
              "font-size": "var(--text-caption)",
            }}
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={saving()}
            style={{
              padding: "10px 20px",
              background: "var(--palm)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-weight": "700",
              "font-size": "var(--text-caption)",
              opacity: saving() ? 0.5 : 1,
              cursor: saving() ? "not-allowed" : "pointer",
            }}
          >
            {saving() ? "添加中…" : "添加并连接"}
          </button>
        </>
      }
    >
      <Field label="邮箱服务商">
        <Show
          when={providerOptions().length > 0}
          fallback={
            <p
              style={{
                "font-size": "var(--text-caption)",
                color: "var(--text-muted)",
              }}
            >
              服务商列表加载失败，请关闭后重试。
            </p>
          }
        >
          <select
            value={selectedProviderId()}
            onChange={(e) => setSelectedProviderId(e.currentTarget.value)}
            style={inputStyle}
          >
            <For each={providerOptions()}>
              {(p) => <option value={p.id}>{p.label}</option>}
            </For>
          </select>
        </Show>
      </Field>
      <Field label="邮箱地址">
        <input
          value={accountEmail()}
          onInput={(e) => setAccountEmail(e.currentTarget.value)}
          placeholder="you@example.com"
          style={inputStyle}
        />
      </Field>
      {(() => {
        const prov = providerOptions().find(
          (p) => p.id === selectedProviderId(),
        );
        const mode = prov?.auth_mode ?? "app-password";
        const labelByMode: Record<string, string> = {
          "app-password": "应用专用密码（推荐）",
          "password-with-auth-code": "授权码（不是登录密码）",
        };
        const placeholderByMode: Record<string, string> = {
          "app-password": "在服务商安全设置里生成的专用密码",
          "password-with-auth-code": "在网页版邮箱设置里生成的授权码",
        };
        return (
          <Field label={labelByMode[mode] ?? "密码"}>
            <input
              type="password"
              value={accountPassword()}
              onInput={(e) => setAccountPassword(e.currentTarget.value)}
              placeholder={placeholderByMode[mode] ?? "见上方服务商提示"}
              style={inputStyle}
            />
          </Field>
        );
      })()}
      <p
        style={{
          "font-size": "var(--text-micro)",
          color: "var(--text-muted)",
          "margin-top": "var(--space-2)",
        }}
      >
        {providerOptions().find((p) => p.id === selectedProviderId())
          ?.credentials_hint ?? ""}
      </p>
    </Modal>
  );
}

function AccountEditModal(props: {
  account: Account;
  onClose: () => void;
  onSave: (a: Account) => void;
  onDelete: (a: Account) => Promise<void>;
}) {
  const [draft, setDraft] = createSignal<Account>(
    JSON.parse(JSON.stringify(props.account)),
  );
  const [confirmingDelete, setConfirmingDelete] = createSignal(false);
  const [newPassword, setNewPassword] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const d = () => draft();

  const handleSave = async () => {
    const pwd = newPassword().trim();
    if (pwd) {
      try {
        const ok = await vaultSave(d().id, pwd);
        if (!ok) {
          showToast({
            message: "密码未保存（浏览器预览模式）",
            kind: "info",
          });
        }
      } catch (e) {
        showToast({
          message: "密码保存失败，账户设置未保存",
          kind: "error",
          source: "vault",
          detail: String(e),
        });
        return;
      }
    }
    setSaving(true);
    props.onSave(d());
  };

  return (
    <Modal
      open
      onClose={props.onClose}
      title={`${d().label} · 设置`}
      width="640px"
      footer={
        <>
          <button
            onClick={() => setConfirmingDelete(true)}
            style={{
              padding: "8px 16px",
              "font-size": "var(--text-caption)",
              color: "var(--status-danger)",
              "font-weight": "700",
            }}
          >
            删除账户
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={props.onClose}
            style={{
              padding: "8px 16px",
              "font-size": "var(--text-caption)",
              color: "var(--text-secondary)",
            }}
          >
            取消
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving()}
            style={primaryBtn}
          >
            保存
          </button>
        </>
      }
    >
      <Field label="显示名称">
        <input
          value={d().displayName}
          onInput={(e) =>
            setDraft({ ...d(), displayName: e.currentTarget.value })
          }
          style={inputStyle}
        />
      </Field>
      <Field label="签名">
        <textarea
          value={d().type === "email" ? (d().settings?.signature ?? "") : ""}
          onInput={(e) =>
            setDraft({
              ...d(),
              settings: {
                ...(d().type === "email"
                  ? d().settings!
                  : defaultEmailSettings()),
                signature: e.currentTarget.value,
              },
            })
          }
          rows={4}
          style={{
            ...inputStyle,
            "min-height": "100px",
            "font-family": "var(--font-body)",
            resize: "vertical",
          }}
        />
      </Field>
      <Field
        label="密码 / 授权码"
        hint="留空则不修改；填写后保存，下次同步生效。"
      >
        <input
          type="password"
          value={newPassword()}
          onInput={(e) => setNewPassword(e.currentTarget.value)}
          placeholder="留空则不修改"
          style={inputStyle}
        />
      </Field>
      <Field label="回复地址 (Reply-to)">
        <input
          value={d().type === "email" ? (d().settings?.replyTo ?? "") : ""}
          onInput={(e) =>
            setDraft({
              ...d(),
              settings: {
                ...(d().type === "email"
                  ? d().settings!
                  : defaultEmailSettings()),
                replyTo: e.currentTarget.value,
              },
            })
          }
          style={inputStyle}
        />
      </Field>
      <Field label="别名">
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "var(--space-2)",
          }}
        >
          <For
            each={d().type === "email" ? (d().settings?.aliases ?? []) : []}
          >
            {(alias, idx) => (
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-2)",
                  "align-items": "center",
                }}
              >
                <input
                  value={alias}
                  onInput={(e) => {
                    const next = [
                      ...(d().type === "email" ? d().settings!.aliases : []),
                    ];
                    next[idx()] = e.currentTarget.value;
                    setDraft({
                      ...d(),
                      settings: {
                        ...(d().type === "email"
                          ? d().settings!
                          : defaultEmailSettings()),
                        aliases: next,
                      },
                    });
                  }}
                  placeholder="alias@example.com"
                  style={{ ...inputStyle, flex: 1, "margin-top": 0 }}
                />
                <button
                  onClick={() => {
                    const next = [
                      ...(d().type === "email" ? d().settings!.aliases : []),
                    ];
                    next.splice(idx(), 1);
                    setDraft({
                      ...d(),
                      settings: {
                        ...(d().type === "email"
                          ? d().settings!
                          : defaultEmailSettings()),
                        aliases: next,
                      },
                    });
                  }}
                  style={{
                    color: "var(--status-danger)",
                    width: "36px",
                    height: "36px",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    "flex-shrink": 0,
                  }}
                  aria-label="删除别名"
                  title="删除别名"
                >
                  <Icon name="ph-trash" size={16} />
                </button>
              </div>
            )}
          </For>
          <button
            onClick={() =>
              setDraft({
                ...d(),
                settings: {
                  ...(d().type === "email"
                    ? d().settings!
                    : defaultEmailSettings()),
                  aliases: [
                    ...(d().type === "email" ? d().settings!.aliases : []),
                    "",
                  ],
                },
              })
            }
            style={{
              "margin-top": "var(--space-1)",
              padding: "8px 12px",
              "min-height": "36px",
              background: "var(--paper-mid)",
              color: "var(--text-secondary)",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "600",
              "align-self": "flex-start",
            }}
          >
            <Icon name="ph-plus" size={12} /> 添加别名
          </button>
        </div>
      </Field>
      <Field label="默认发件地址">
        <select
          value={
            d().type === "email"
              ? (d().settings?.defaultFrom ?? d().email)
              : ""
          }
          onChange={(e) =>
            setDraft({
              ...d(),
              settings: {
                ...(d().type === "email"
                  ? d().settings!
                  : defaultEmailSettings()),
                defaultFrom: e.currentTarget.value,
              },
            })
          }
          style={inputStyle}
        >
          <option value={d().email}>{d().email}（主地址）</option>
          <For
            each={d().type === "email" ? (d().settings?.aliases ?? []) : []}
          >
            {(alias) => <option value={alias}>{alias}</option>}
          </For>
        </select>
      </Field>
      <Field label="同步频率">
        <select
          value={
            d().type === "email"
              ? (d().settings?.syncFrequency ?? "15min")
              : "15min"
          }
          onChange={(e) =>
            setDraft({
              ...d(),
              settings: {
                ...(d().type === "email"
                  ? d().settings!
                  : defaultEmailSettings()),
                syncFrequency: e.currentTarget
                  .value as AccountSettings["syncFrequency"],
              },
            })
          }
          style={inputStyle}
        >
          <option value="5min">每 5 分钟</option>
          <option value="15min">每 15 分钟</option>
          <option value="30min">每 30 分钟</option>
          <option value="1h">每小时</option>
          <option value="manual">手动</option>
        </select>
      </Field>
      <Field label="同步文件夹">
        <div
          style={{
            display: "grid",
            "grid-template-columns": "repeat(2, 1fr)",
            gap: "var(--space-2)",
          }}
        >
          <For each={FOLDER_OPTIONS}>
            {(name) => {
              const folders = () =>
                d().type === "email" ? (d().settings?.syncFolders ?? []) : [];
              const enabled = () =>
                folders().some((f) => f.name === name && f.enabled);
              return (
                <label
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-2)",
                    "font-size": "var(--text-body-sm)",
                    color: "var(--text-secondary)",
                    "min-height": "32px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enabled()}
                    style={{ "accent-color": "var(--palm)" }}
                    onChange={(e) => {
                      const current = folders();
                      const next = current.some((f) => f.name === name)
                        ? current.map((f) =>
                            f.name === name
                              ? { ...f, enabled: e.currentTarget.checked }
                              : f,
                          )
                        : [
                            ...current,
                            { name, enabled: e.currentTarget.checked },
                          ];
                      setDraft({
                        ...d(),
                        settings: {
                          ...(d().type === "email"
                            ? d().settings!
                            : defaultEmailSettings()),
                          syncFolders: next,
                        },
                      });
                    }}
                  />
                  {FOLDER_LABELS[name] ?? name}
                </label>
              );
            }}
          </For>
        </div>
      </Field>
      <Field label="自动密送">
        <label
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-2)",
            "min-height": "32px",
          }}
        >
          <input
            type="checkbox"
            checked={
              d().type === "email" ? (d().settings?.autoBcc ?? false) : false
            }
            style={{ "accent-color": "var(--palm)" }}
            onChange={(e) =>
              setDraft({
                ...d(),
                settings: {
                  ...(d().type === "email"
                    ? d().settings!
                    : defaultEmailSettings()),
                  autoBcc: e.currentTarget.checked,
                },
              })
            }
          />
          <span style={{ "font-size": "var(--text-body-sm)" }}>
            每封发出的邮件自动密送一份
          </span>
        </label>
        <Show when={d().type === "email" && d().settings?.autoBcc}>
          <input
            value={
              d().type === "email" ? (d().settings?.autoBccAddress ?? "") : ""
            }
            onInput={(e) =>
              setDraft({
                ...d(),
                settings: {
                  ...(d().type === "email"
                    ? d().settings!
                    : defaultEmailSettings()),
                  autoBccAddress: e.currentTarget.value,
                },
              })
            }
            placeholder="bcc@example.com"
            style={{ ...inputStyle, "margin-top": "var(--space-2)" }}
          />
        </Show>
      </Field>
      <Field label="假期自动回复">
        <label
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-2)",
            "min-height": "32px",
          }}
        >
          <input
            type="checkbox"
            checked={
              d().type === "email"
                ? (d().settings?.vacationResponder?.enabled ?? false)
                : false
            }
            style={{ "accent-color": "var(--palm)" }}
            onChange={(e) =>
              setDraft({
                ...d(),
                settings: {
                  ...(d().type === "email"
                    ? d().settings!
                    : defaultEmailSettings()),
                  vacationResponder: {
                    enabled: e.currentTarget.checked,
                    subject:
                      d().type === "email"
                        ? (d().settings?.vacationResponder?.subject ?? "")
                        : "",
                    body:
                      d().type === "email"
                        ? (d().settings?.vacationResponder?.body ?? "")
                        : "",
                  },
                },
              })
            }
          />
          <span style={{ "font-size": "var(--text-body-sm)" }}>
            休假期间自动回复来信
          </span>
        </label>
        <Show
          when={
            d().type === "email" && d().settings?.vacationResponder?.enabled
          }
        >
          <input
            value={
              d().type === "email"
                ? (d().settings?.vacationResponder?.subject ?? "")
                : ""
            }
            onInput={(e) =>
              setDraft({
                ...d(),
                settings: {
                  ...(d().type === "email"
                    ? d().settings!
                    : defaultEmailSettings()),
                  vacationResponder: {
                    enabled: true,
                    subject: e.currentTarget.value,
                    body:
                      d().type === "email"
                        ? (d().settings?.vacationResponder?.body ?? "")
                        : "",
                  },
                },
              })
            }
            placeholder="主题"
            style={{ ...inputStyle, "margin-top": "var(--space-2)" }}
          />
          <textarea
            value={
              d().type === "email"
                ? (d().settings?.vacationResponder?.body ?? "")
                : ""
            }
            onInput={(e) =>
              setDraft({
                ...d(),
                settings: {
                  ...(d().type === "email"
                    ? d().settings!
                    : defaultEmailSettings()),
                  vacationResponder: {
                    enabled: true,
                    subject:
                      d().type === "email"
                        ? (d().settings?.vacationResponder?.subject ?? "")
                        : "",
                    body: e.currentTarget.value,
                  },
                },
              })
            }
            placeholder="正文"
            rows={3}
            style={{
              ...inputStyle,
              "min-height": "80px",
              "font-family": "var(--font-body)",
              "margin-top": "var(--space-2)",
              resize: "vertical",
            }}
          />
        </Show>
      </Field>

      <ConfirmDialog
        open={confirmingDelete()}
        title={`删除账户 ${d().label}？`}
        body="将从本机移除该账户及其已同步的邮件缓存，并清除系统钥匙串中保存的密码。此操作不可撤销。"
        confirmLabel="删除账户"
        onConfirm={() => void props.onDelete(d())}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Modal>
  );
}

const FOLDER_OPTIONS = [
  "INBOX",
  "Sent",
  "Drafts",
  "Archive",
  "Trash",
  "Spam",
  "Starred",
  "Important",
];

function defaultEmailSettings(): AccountSettings {
  return {
    aliases: [],
    signature: "",
    replyTo: "",
    defaultFrom: "",
    syncFolders: [],
    syncFrequency: "15min",
    autoBcc: false,
    autoBccAddress: "",
    vacationResponder: { enabled: false, subject: "", body: "" },
  };
}

function PreferencesTab() {
  const s = appSettings;
  // Bridge the theme toggle to <html data-theme>; dark-mode CSS in
  // tokens.css is gated on [data-theme="dark"].
  createEffect(() => {
    const t = s.preferences.theme;
    document.documentElement.setAttribute(
      "data-theme",
      t === "dark" ? "dark" : "light",
    );
  });
  return (
    <div style={{ "max-width": "520px" }}>
      <SectionTitle>外观</SectionTitle>
      <ToggleRow
        label="深色模式"
        description="切换到低光配色，选择会在重启后保留。"
        checked={s.preferences.theme === "dark"}
        onChange={(v) =>
          setAppSettings("preferences", "theme", v ? "dark" : "light")
        }
      />

      <SectionTitle>通知</SectionTitle>
      <PreferencesNotificationsTab />
    </div>
  );
}

function AgentTab() {
  const s = appSettings;
  const llm = () => s.agent.llm;
  return (
    <div>
      <SectionTitle>Agent 行为</SectionTitle>
      <Toggle
        label="自动起草回复"
        checked={s.agent.autoDraft}
        onChange={(v) => setAppSettings("agent", "autoDraft", v)}
      />
      <Toggle
        label="自动生成简报"
        checked={s.agent.autoSummarize}
        onChange={(v) => setAppSettings("agent", "autoSummarize", v)}
      />
      <Toggle
        label="记忆可编辑"
        checked={s.agent.memoryEditable}
        onChange={(v) => setAppSettings("agent", "memoryEditable", v)}
      />
      <p
        style={{
          "margin-top": "var(--space-4)",
          "font-size": "var(--text-caption)",
          color: "var(--text-muted)",
        }}
      >
        在 Agent 面板的「记忆」标签页中可以查看和编辑所有记忆，改动会自动保存。
      </p>

      <SectionTitle>模型服务（兼容 OpenAI API）</SectionTitle>
      <Field
        label="接口地址"
        hint="留空时使用 https://api.openai.com/v1；本地 Ollama 填 http://localhost:11434/v1"
      >
        <input
          type="text"
          placeholder="https://api.openai.com/v1"
          value={llm().baseUrl}
          onInput={(e) =>
            setAppSettings("agent", "llm", "baseUrl", e.currentTarget.value)
          }
          style={inputStyle}
        />
      </Field>
      <Field
        label="API 密钥"
        hint="保存在系统钥匙串，不会写入本地配置文件。本地模型可留空。"
      >
        <input
          type="password"
          placeholder="sk-…"
          value={llm().apiKey}
          onInput={(e) =>
            // Update the in-memory store so the input stays responsive;
            // the keychain write happens on blur (onChange) below.
            setAppSettings("agent", "llm", "apiKey", e.currentTarget.value)
          }
          onChange={async (e) => {
            try {
              await vaultSetSecret(LLM_API_KEY_VAULT_KEY, e.currentTarget.value);
            } catch (err) {
              showToast({
                message: "API 密钥保存失败，请重试",
                kind: "error",
                source: "vault",
                detail: String(err),
              });
            }
          }}
          style={inputStyle}
        />
      </Field>
      <Field
        label="模型"
        hint="例如 gpt-4o-mini / claude-3-5-sonnet / llama3.1:8b"
      >
        <input
          type="text"
          placeholder="gpt-4o-mini"
          value={llm().model}
          onInput={(e) =>
            setAppSettings("agent", "llm", "model", e.currentTarget.value)
          }
          style={inputStyle}
        />
      </Field>
      <div
        style={{
          display: "grid",
          "grid-template-columns": "1fr 1fr",
          gap: "var(--space-3)",
          "margin-bottom": "var(--space-3)",
        }}
      >
        <Field label="温度" hint="0.0 严谨，1.0 创意">
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={llm().temperature}
            onInput={(e) =>
              setAppSettings(
                "agent",
                "llm",
                "temperature",
                Number(e.currentTarget.value) || 0,
              )
            }
            style={inputStyle}
          />
        </Field>
        <Field label="单次回复上限" hint="生成内容的最大长度（tokens）">
          <input
            type="number"
            step="1"
            min="64"
            max="8192"
            value={llm().maxTokens}
            onInput={(e) =>
              setAppSettings(
                "agent",
                "llm",
                "maxTokens",
                Number(e.currentTarget.value) || 1024,
              )
            }
            style={inputStyle}
          />
        </Field>
      </div>
      <Field
        label="系统提示词"
        hint="每次对话都会带上这段前缀。留空则不发送。"
      >
        <textarea
          rows={4}
          value={llm().systemPrompt}
          onInput={(e) =>
            setAppSettings(
              "agent",
              "llm",
              "systemPrompt",
              e.currentTarget.value,
            )
          }
          style={{ ...inputStyle, resize: "vertical", "min-height": "80px" }}
        />
      </Field>
    </div>
  );
}

function LabelsTab() {
  const [labels, { refetch }] = createResource(listLabels);
  const [editing, setEditing] = createSignal<Label | null>(null);
  const [deleting, setDeleting] = createSignal<Label | null>(null);

  const save = async (l: Label) => {
    await upsertLabel(l);
    await refetch();
    setEditing(null);
    showToast({ message: "已保存", kind: "success" });
  };
  const remove = async (id: string) => {
    await deleteLabel(id);
    await refetch();
    showToast({ message: "已删除标签", kind: "info" });
  };
  const newLabel = (): Label => ({
    id: uid("lb"),
    name: "",
    color: DEFAULT_LABEL_COLOR,
  });

  return (
    <div>
      <PageTitle>标签</PageTitle>
      <ResourceGate
        resource={labels}
        loading={<SkeletonList count={3} height={40} />}
        errorView={() => (
          <ErrorState
            title="标签加载失败"
            message="读取标签列表时出错，请重试。"
            retry={() => void refetch()}
          />
        )}
        empty={
          <Empty
            icon="ph-tag"
            title="还没有标签"
            description="标签可以给邮件分类，方便搜索和筛选。"
            action={{ label: "新建标签", onClick: () => setEditing(newLabel()) }}
          />
        }
      >
        {(list) => (
          <For each={list}>
            {(l) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--paper-light)",
                  "border-radius": "var(--radius-md)",
                  border: "0.5px solid var(--border)",
                  "margin-bottom": "var(--space-2)",
                }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    "border-radius": "50%",
                    background: l.color,
                    "flex-shrink": 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    "min-width": 0,
                    "font-weight": "600",
                  }}
                >
                  {l.name}
                </span>
                <button onClick={() => setEditing(l)} style={outlineBtn}>
                  编辑
                </button>
                <button
                  onClick={() => setDeleting(l)}
                  style={{
                    color: "var(--status-danger)",
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                  }}
                  aria-label={`删除标签 ${l.name}`}
                  title="删除标签"
                >
                  <Icon name="ph-trash" size={14} />
                </button>
              </div>
            )}
          </For>
        )}
      </ResourceGate>
      <Show when={(labels() ?? []).length > 0}>
        <button
          onClick={() => setEditing(newLabel())}
          style={{ ...primaryBtn, "margin-top": "var(--space-3)" }}
        >
          <Icon name="ph-plus" size={12} /> 新建标签
        </button>
      </Show>

      <Show when={editing()}>
        <LabelEditModal
          label={editing()!}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      </Show>
      <ConfirmDialog
        open={deleting() !== null}
        title={`删除标签「${deleting()?.name ?? ""}」？`}
        body="邮件上的该标签标记会被移除。"
        confirmLabel="删除"
        onConfirm={() => {
          const l = deleting();
          if (l) void remove(l.id);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function LabelEditModal(props: {
  label: Label;
  onClose: () => void;
  onSave: (l: Label) => void;
}) {
  const [draft, setDraft] = createSignal<Label>({ ...props.label });
  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.label.name ? "编辑标签" : "新建标签"}
      width="380px"
      footer={
        <>
          <button
            onClick={props.onClose}
            style={{
              padding: "8px 16px",
              "font-size": "var(--text-caption)",
              color: "var(--text-secondary)",
            }}
          >
            取消
          </button>
          <button onClick={() => props.onSave(draft())} style={primaryBtn}>
            保存
          </button>
        </>
      }
    >
      <Field label="名称">
        <input
          value={draft().name}
          onInput={(e) => setDraft({ ...draft(), name: e.currentTarget.value })}
          style={inputStyle}
        />
      </Field>
      <Field label="颜色">
        <input
          type="color"
          value={draft().color}
          onInput={(e) =>
            setDraft({ ...draft(), color: e.currentTarget.value })
          }
          style={{ width: "60px", height: "32px", padding: 0, border: "none" }}
        />
      </Field>
    </Modal>
  );
}

function SnippetsTab() {
  const [snippets, { refetch }] = createResource(listSnippets);
  const [editing, setEditing] = createSignal<Snippet | null>(null);
  const [deleting, setDeleting] = createSignal<Snippet | null>(null);

  const save = async (s: Snippet) => {
    await upsertSnippet(s);
    await refetch();
    setEditing(null);
    showToast({ message: "已保存", kind: "success" });
  };
  const remove = async (id: string) => {
    await deleteSnippet(id);
    await refetch();
    showToast({ message: "已删除片段", kind: "info" });
  };
  const newSnippet = (): Snippet => ({
    id: uid("sn"),
    label: "",
    body: "",
    shortcut: "",
  });

  return (
    <div>
      <PageTitle>片段</PageTitle>
      <p
        style={{
          color: "var(--text-secondary)",
          "font-size": "var(--text-caption)",
          "margin-top": 0,
          "margin-bottom": "var(--space-3)",
        }}
      >
        写信时点击「片段」按钮，即可插入常用段落。
      </p>
      <ResourceGate
        resource={snippets}
        loading={<SkeletonList count={3} height={56} />}
        errorView={() => (
          <ErrorState
            title="片段加载失败"
            message="读取片段列表时出错，请重试。"
            retry={() => void refetch()}
          />
        )}
        empty={
          <Empty
            icon="ph-text-aa"
            title="还没有片段"
            description="把问候语、报价说明、常见问题回复存成片段，写信时一键插入。"
            action={{
              label: "新建片段",
              onClick: () => setEditing(newSnippet()),
            }}
          />
        }
      >
        {(list) => (
          <For each={list}>
            {(s) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--paper-light)",
                  "border-radius": "var(--radius-md)",
                  border: "0.5px solid var(--border)",
                  "margin-bottom": "var(--space-2)",
                }}
              >
                <Icon name="ph-text-aa" size={18} color="var(--text-muted)" />
                <div style={{ flex: 1, "min-width": 0 }}>
                  <div style={{ "font-weight": "600" }}>{s.label}</div>
                  <div
                    style={{
                      "font-size": "var(--text-micro)",
                      color: "var(--text-muted)",
                      "white-space": "nowrap",
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                    }}
                  >
                    {s.shortcut ? `/${s.shortcut} · ` : ""}
                    {s.body}
                  </div>
                </div>
                <button onClick={() => setEditing(s)} style={outlineBtn}>
                  编辑
                </button>
                <button
                  onClick={() => setDeleting(s)}
                  style={{
                    color: "var(--status-danger)",
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                  }}
                  aria-label={`删除片段 ${s.label}`}
                  title="删除片段"
                >
                  <Icon name="ph-trash" size={14} />
                </button>
              </div>
            )}
          </For>
        )}
      </ResourceGate>
      <Show when={(snippets() ?? []).length > 0}>
        <button
          onClick={() => setEditing(newSnippet())}
          style={{ ...primaryBtn, "margin-top": "var(--space-3)" }}
        >
          <Icon name="ph-plus" size={12} /> 新建片段
        </button>
      </Show>

      <Show when={editing()}>
        <SnippetEditModal
          snippet={editing()!}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      </Show>
      <ConfirmDialog
        open={deleting() !== null}
        title={`删除片段「${deleting()?.label ?? ""}」？`}
        confirmLabel="删除"
        onConfirm={() => {
          const s = deleting();
          if (s) void remove(s.id);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function SnippetEditModal(props: {
  snippet: Snippet;
  onClose: () => void;
  onSave: (s: Snippet) => void;
}) {
  const [draft, setDraft] = createSignal<Snippet>({ ...props.snippet });
  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.snippet.label ? "编辑片段" : "新建片段"}
      width="480px"
      footer={
        <>
          <button
            onClick={props.onClose}
            style={{
              padding: "8px 16px",
              "font-size": "var(--text-caption)",
              color: "var(--text-secondary)",
            }}
          >
            取消
          </button>
          <button onClick={() => props.onSave(draft())} style={primaryBtn}>
            保存
          </button>
        </>
      }
    >
      <Field label="名称">
        <input
          value={draft().label}
          onInput={(e) =>
            setDraft({ ...draft(), label: e.currentTarget.value })
          }
          placeholder="问候语"
          style={inputStyle}
        />
      </Field>
      <Field label="快捷输入" hint="写信时输入 / 加这个名字即可插入。">
        <input
          value={draft().shortcut ?? ""}
          onInput={(e) =>
            setDraft({ ...draft(), shortcut: e.currentTarget.value })
          }
          placeholder="greeting"
          style={inputStyle}
        />
      </Field>
      <Field label="正文">
        <textarea
          value={draft().body}
          onInput={(e) => setDraft({ ...draft(), body: e.currentTarget.value })}
          placeholder="你好，…"
          rows={6}
          style={{
            ...inputStyle,
            resize: "vertical",
            "font-family": "var(--font-body)",
            "line-height": 1.5,
          }}
        />
      </Field>
    </Modal>
  );
}

function DataTab() {
  const exportContacts = async () => {
    const contacts = await listContacts();
    const csv = ["id,name,email,company,title,stage"]
      .concat(
        contacts.map((c) =>
          [
            c.id,
            c.name,
            c.emails[0]?.value ?? "",
            c.company,
            c.title,
            c.stage,
          ].join(","),
        ),
      )
      .join("\n");
    download("sendpalm-contacts.csv", csv, "text/csv");
    showToast({ message: "已导出联系人 CSV", kind: "success" });
  };
  const exportTasks = async () => {
    const tasks = await listTasks();
    download(
      "sendpalm-tasks.json",
      JSON.stringify({ exportedAt: isoNow(), tasks }, null, 2),
      "application/json",
    );
    showToast({ message: "已导出任务 JSON", kind: "success" });
  };
  const [exportProgress, setExportProgress] = createSignal<string | null>(
    null,
  );
  const backupMailbox = async () => {
    setExportProgress("正在读取邮件…");
    try {
      // Paginate with the lightweight projection (no body_html) — a
      // full-table pull on a 4,000-row mailbox is the §11.7 OOM pattern.
      // Bodies can be re-fetched from the mail server on next sync.
      const PAGE = 500;
      const out: unknown[] = [];
      let offset = 0;
      const first = await listMessagesPaged({
        offset: 0,
        limit: 1,
        lightweight: true,
      });
      const total = first.total;
      while (offset < total) {
        const page = await listMessagesPaged({
          offset,
          limit: PAGE,
          lightweight: true,
        });
        out.push(...page.items);
        offset += page.items.length;
        setExportProgress(`已导出 ${out.length} / ${total} 封…`);
        // Yield to the event loop so the progress pill can repaint.
        await new Promise((r) => setTimeout(r, 0));
      }
      const files = await listFiles();
      const data = {
        exportedAt: isoNow(),
        totalMessages: out.length,
        messages: out,
        files: files.map((f) => ({
          id: f.id,
          pid: f.pid,
          name: f.name,
          type: f.type,
          mime: f.mime,
          size: f.size,
          url: f.url,
          st: f.st,
        })),
      };
      download(
        "sendpalm-mailbox-backup.json",
        JSON.stringify(data, null, 2),
        "application/json",
      );
      showToast({ message: "已导出邮箱备份", kind: "success" });
    } catch (e) {
      showToast({
        message: "导出失败，请重试",
        kind: "error",
        source: "settings",
        detail: String(e),
      });
    } finally {
      setExportProgress(null);
    }
  };
  const exportAll = async () => {
    const data = {
      exportedAt: isoNow(),
      contacts: await listContacts(),
      accounts: await listAccounts(),
      snippets: await listSnippets(),
      labels: await listLabels(),
      shortcuts: await listShortcuts(),
    };
    download(
      "sendpalm-export.json",
      JSON.stringify(data, null, 2),
      "application/json",
    );
    showToast({ message: "已导出全部数据", kind: "success" });
  };

  const [confirmEmptyTrash, setConfirmEmptyTrash] = createSignal(false);
  const [trashCount, setTrashCount] = createSignal<number | null>(null);
  const openEmptyTrashConfirm = () => {
    setTrashCount(null);
    setConfirmEmptyTrash(true);
    listMessagesPaged({ bucket: "trash", limit: 1, lightweight: true })
      .then((r) => setTrashCount(r.total))
      .catch(() => setTrashCount(null));
  };
  const emptyTrashNow = async () => {
    const count = await emptyTrash();
    showToast({ message: `已清空回收站（${count} 封）`, kind: "success" });
  };

  const [resetOpen, setResetOpen] = createSignal(false);

  return (
    <div>
      <SectionTitle>数据导出</SectionTitle>
      <DataActionRow
        title="导出联系人 (CSV)"
        description="所有联系人的姓名、邮箱、公司和阶段。"
        icon="ph-users"
        onClick={exportContacts}
      />
      <DataActionRow
        title="导出任务 (JSON)"
        description="任务清单的完整备份。"
        icon="ph-list-checks"
        onClick={exportTasks}
      />
      <DataActionRow
        title="导出邮箱备份 (JSON)"
        description="邮件元数据与附件索引（不含正文，正文可在下次同步时重新拉取）。"
        icon="ph-tray"
        onClick={backupMailbox}
      />
      <DataActionRow
        title="导出全部数据 (JSON)"
        description="联系人、账户、片段、标签和快捷键。"
        icon="ph-database"
        onClick={exportAll}
      />
      <Show when={exportProgress()}>
        {(msg) => (
          <div
            data-testid="export-progress"
            style={{
              padding: "8px 14px",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-pill)",
              color: "var(--text-secondary)",
              "font-size": "var(--text-caption)",
              "font-weight": "600",
              "text-align": "center",
              "margin-top": "var(--space-2)",
            }}
          >
            {msg()}
          </div>
        )}
      </Show>

      <div style={{ "margin-top": "var(--space-6)" }}>
        <SectionTitle>危险区</SectionTitle>
        <DataActionRow
          title="清空回收站"
          description="永久删除回收站中的所有邮件，不可恢复。"
          icon="ph-trash"
          danger
          onClick={openEmptyTrashConfirm}
        />
        <DataActionRow
          title="清空所有数据"
          description="删除本机上的全部邮件、联系人、账户和设置。"
          icon="ph-warning"
          danger
          onClick={() => setResetOpen(true)}
        />
      </div>

      <ConfirmDialog
        open={confirmEmptyTrash()}
        title="清空回收站？"
        body={
          trashCount() === null
            ? "回收站中的邮件将被永久删除，不可恢复。"
            : `将永久删除回收站中的 ${trashCount()} 封邮件，不可恢复。`
        }
        confirmLabel="永久删除"
        onConfirm={() => void emptyTrashNow()}
        onCancel={() => setConfirmEmptyTrash(false)}
      />
      <Show when={resetOpen()}>
        <ResetDataModal onClose={() => setResetOpen(false)} />
      </Show>
    </div>
  );
}

function DataActionRow(props: {
  title: string;
  description: string;
  icon: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      style={{
        ...secondaryBtn,
        display: "flex",
        "align-items": "center",
        gap: "var(--space-3)",
        border: props.danger
          ? "0.5px solid var(--status-danger)"
          : secondaryBtn.border,
        cursor: "pointer",
      }}
    >
      <Icon
        name={props.icon}
        size={18}
        color={props.danger ? "var(--status-danger)" : "var(--text-muted)"}
      />
      <span style={{ flex: 1, "min-width": 0 }}>
        <strong
          style={{
            display: "block",
            "font-size": "var(--text-body-sm)",
            color: props.danger ? "var(--status-danger)" : "var(--text-primary)",
          }}
        >
          {props.title}
        </strong>
        <span
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
          }}
        >
          {props.description}
        </span>
      </span>
      <Icon name="ph-caret-right" size={14} color="var(--text-muted)" />
    </button>
  );
}

function ResetDataModal(props: { onClose: () => void }) {
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const run = async () => {
    setBusy(true);
    try {
      await resetAllData();
      location.reload();
    } catch (e) {
      setBusy(false);
      showToast({
        message: "清空失败，请重试",
        kind: "error",
        source: "settings",
        detail: String(e),
      });
    }
  };
  return (
    <Modal
      open
      onClose={props.onClose}
      title="清空所有数据"
      width="420px"
      footer={
        <>
          <button
            onClick={props.onClose}
            style={{
              padding: "8px 16px",
              "font-size": "var(--text-caption)",
              color: "var(--text-secondary)",
            }}
          >
            取消
          </button>
          <button
            onClick={() => void run()}
            disabled={code() !== "DELETE" || busy()}
            style={{
              padding: "8px 16px",
              "border-radius": "var(--radius-pill)",
              background: "var(--status-danger)",
              color: "#fff",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              opacity: code() === "DELETE" && !busy() ? 1 : 0.4,
              cursor:
                code() === "DELETE" && !busy() ? "pointer" : "not-allowed",
            }}
          >
            {busy() ? "清空中…" : "永久清空"}
          </button>
        </>
      }
    >
      <p
        style={{
          margin: "0 0 var(--space-3)",
          color: "var(--text-secondary)",
          "font-size": "var(--text-body-sm)",
          "line-height": 1.6,
        }}
      >
        此操作会删除本机上的全部邮件、联系人、账户和设置，且不可恢复。输入
        DELETE 确认。
      </p>
      <input
        value={code()}
        onInput={(e) => setCode(e.currentTarget.value)}
        placeholder="DELETE"
        aria-label="输入 DELETE 确认"
        style={inputStyle}
      />
    </Modal>
  );
}

function ShortcutsTab() {
  const [shortcuts, { refetch }] = createResource(listShortcuts);
  const [editing, setEditing] = createSignal<Shortcut | null>(null);
  const [confirmRestore, setConfirmRestore] = createSignal(false);
  const save = async (s: Shortcut) => {
    await upsertShortcut(s);
    await refetch();
    setEditing(null);
    showToast({ message: "已保存", kind: "success" });
  };
  const restore = async () => {
    await resetShortcuts();
    await refetch();
    showToast({ message: "已恢复默认快捷键", kind: "success" });
  };
  return (
    <div style={{ "padding-bottom": "var(--space-8)" }}>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          gap: "var(--space-2)",
        }}
      >
        <SectionTitle>键盘快捷键</SectionTitle>
        <button
          onClick={() => setConfirmRestore(true)}
          style={{
            padding: "6px 12px",
            "min-height": "32px",
            "font-size": "var(--text-caption)",
            "font-weight": "600",
            color: "var(--text-secondary)",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-pill)",
            "white-space": "nowrap",
          }}
        >
          恢复默认
        </button>
      </div>
      <ResourceGate
        resource={shortcuts}
        loading={<SkeletonList count={4} height={48} />}
        errorView={() => (
          <ErrorState
            title="快捷键加载失败"
            message="读取快捷键列表时出错，请重试。"
            retry={() => void refetch()}
          />
        )}
        empty={
          <Empty
            icon="ph-keyboard"
            title="还没有自定义快捷键"
            description="添加快捷键后，会显示在这里。"
          />
        }
      >
        {(list) => (
          <For each={list}>
            {(s) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--paper-light)",
                  "border-radius": "var(--radius-md)",
                  border: "0.5px solid var(--border)",
                  "margin-bottom": "var(--space-2)",
                }}
              >
                <kbd
                  style={{
                    padding: "4px 10px",
                    background: "var(--paper-mid)",
                    "border-radius": "var(--radius-sm)",
                    "font-size": "var(--text-caption)",
                    "font-weight": "700",
                    color: "var(--text-primary)",
                    "font-family": "var(--font-mono)",
                  }}
                >
                  {s.combo}
                </kbd>
                <span
                  style={{
                    flex: 1,
                    "min-width": 0,
                    "font-size": "var(--text-body-sm)",
                  }}
                >
                  {shortcutActionLabel(s.action, s.label)}
                </span>
                <Show when={s.editable}>
                  <button onClick={() => setEditing(s)} style={outlineBtn}>
                    编辑
                  </button>
                </Show>
              </div>
            )}
          </For>
        )}
      </ResourceGate>

      <Show when={editing()}>
        <ShortcutEditModal
          s={editing()!}
          existingCombos={(shortcuts() ?? [])
            .filter((x) => x.id !== editing()!.id)
            .map((x) => x.combo)}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      </Show>
      <ConfirmDialog
        open={confirmRestore()}
        title="恢复默认快捷键？"
        body="你的全部自定义快捷键都会被重置。"
        confirmLabel="恢复默认"
        onConfirm={() => void restore()}
        onCancel={() => setConfirmRestore(false)}
      />
    </div>
  );
}

function ShortcutEditModal(props: {
  s: Shortcut;
  existingCombos: string[];
  onClose: () => void;
  onSave: (s: Shortcut) => void;
}) {
  const [combo, setCombo] = createSignal(props.s.combo);
  const conflict = () =>
    props.existingCombos.some(
      (c) => c.trim().toLowerCase() === combo().trim().toLowerCase(),
    );
  return (
    <Modal
      open
      onClose={props.onClose}
      title="编辑快捷键"
      width="380px"
      footer={
        <>
          <button
            onClick={props.onClose}
            style={{
              padding: "8px 16px",
              "font-size": "var(--text-caption)",
              color: "var(--text-secondary)",
            }}
          >
            取消
          </button>
          <button
            onClick={() => props.onSave({ ...props.s, combo: combo() })}
            disabled={conflict() || !combo().trim()}
            style={{
              ...primaryBtn,
              opacity: conflict() || !combo().trim() ? 0.5 : 1,
              cursor:
                conflict() || !combo().trim() ? "not-allowed" : "pointer",
            }}
          >
            保存
          </button>
        </>
      }
    >
      <Field
        label={shortcutActionLabel(props.s.action, props.s.label)}
        hint="点击输入框，然后按下新的组合键。"
      >
        <input
          value={combo()}
          readOnly
          onKeyDown={(e) => {
            e.preventDefault();
            const c = comboFromKeyEvent(e);
            if (c) setCombo(c);
          }}
          placeholder="按下新的快捷键"
          aria-label="快捷键组合"
          style={{ ...inputStyle, cursor: "pointer" }}
        />
      </Field>
      <Show when={conflict()}>
        <p
          style={{
            "font-size": "var(--text-caption)",
            color: "var(--status-danger)",
            margin: 0,
          }}
        >
          这个组合已被其他功能占用，请换一个。
        </p>
      </Show>
    </Modal>
  );
}

/* ── Shared ── */

function Field(props: { label: string; hint?: string; children: unknown }) {
  return (
    <label style={{ display: "block", "margin-bottom": "var(--space-3)" }}>
      <span
        style={{
          display: "block",
          "font-size": "var(--text-micro)",
          color: "var(--text-muted)",
          "font-weight": "700",
          "margin-bottom": "4px",
        }}
      >
        {props.label}
      </span>
      {props.children as never}
      {props.hint && (
        <span
          style={{
            display: "block",
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            "margin-top": "2px",
          }}
        >
          {props.hint}
        </span>
      )}
    </label>
  );
}

/** Visual switch control — parent wires the click/change handler. */
function SwitchTrack(props: { checked: boolean }) {
  return (
    <span
      style={{
        width: "40px",
        height: "24px",
        "border-radius": "var(--radius-pill)",
        background: props.checked ? "var(--palm)" : "var(--paper-dark)",
        position: "relative",
        transition: "background 0.2s var(--ease-out)",
        "flex-shrink": 0,
        display: "inline-block",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "2px",
          left: "2px",
          width: "20px",
          height: "20px",
          "border-radius": "50%",
          background: "var(--paper-light)",
          "box-shadow": "0 1px 3px rgba(0,0,0,0.2)",
          transform: props.checked ? "translateX(16px)" : "translateX(0)",
          transition: "transform 0.2s var(--ease-out)",
        }}
      />
    </span>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-3)",
        padding: "var(--space-2) 0",
        "min-height": "40px",
        cursor: "pointer",
        background: "none",
        border: "none",
        width: "100%",
        "text-align": "left",
        color: "var(--text-primary)",
      }}
    >
      <SwitchTrack checked={props.checked} />
      <span style={{ "font-size": "var(--text-body-sm)" }}>{props.label}</span>
    </button>
  );
}

const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  border: "0.5px solid var(--border)",
  "border-radius": "var(--radius-md)",
  background: "var(--paper-light)",
  "font-size": "var(--text-body-sm)",
};

const primaryBtn = {
  padding: "10px 20px",
  background: "var(--palm)",
  color: "white",
  "border-radius": "var(--radius-pill)",
  "font-weight": "700",
  "font-size": "var(--text-caption)",
};

const secondaryBtn = {
  display: "block",
  width: "100%",
  padding: "var(--space-3)",
  background: "var(--paper-light)",
  border: "0.5px solid var(--border)",
  "border-radius": "var(--radius-md)",
  "font-size": "var(--text-body-sm)",
  "font-weight": "600",
  "text-align": "left" as const,
  "margin-bottom": "var(--space-2)",
};

const outlineBtn = {
  padding: "4px 12px",
  "min-height": "28px",
  "font-size": "var(--text-caption)",
  "font-weight": "700",
  color: "var(--palm)",
  border: "0.5px solid var(--palm)",
  "border-radius": "var(--radius-pill)",
  background: "transparent",
};

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function PreferencesNotificationsTab() {
  const prefs = () => appSettings.preferences.notifications;
  return (
    <div
      style={{ display: "grid", gap: "var(--space-3)", "max-width": "520px" }}
    >
      <ToggleRow
        label="桌面通知"
        description="收到新邮件时在系统通知中心弹出。"
        checked={prefs().desktop}
        onChange={async (v) => {
          setAppSettings("preferences", "notifications", {
            ...prefs(),
            desktop: v,
          });
          await ensureNotificationPermission();
        }}
      />
      <ToggleRow
        label="静默时段"
        description="在指定时段内只显示应用内红点，不弹系统通知。"
        checked={prefs().quietHoursEnabled}
        onChange={(v) =>
          setAppSettings("preferences", "notifications", {
            ...prefs(),
            quietHoursEnabled: v,
          })
        }
      />
      <Show when={prefs().quietHoursEnabled}>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <label>
            <span>开始</span>
            <input
              type="time"
              value={prefs().quietHoursStart}
              onInput={(e) =>
                setAppSettings("preferences", "notifications", {
                  ...prefs(),
                  quietHoursStart: e.currentTarget.value,
                })
              }
              style={inputStyle}
            />
          </label>
          <label>
            <span>结束</span>
            <input
              type="time"
              value={prefs().quietHoursEnd}
              onInput={(e) =>
                setAppSettings("preferences", "notifications", {
                  ...prefs(),
                  quietHoursEnd: e.currentTarget.value,
                })
              }
              style={inputStyle}
            />
          </label>
        </div>
      </Show>
    </div>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
      style={{
        display: "grid",
        "grid-template-columns": "1fr auto",
        gap: "var(--space-2)",
        "align-items": "center",
        padding: "var(--space-3)",
        "min-height": "44px",
        "border-radius": "var(--radius-md)",
        background: "var(--surface-elevated)",
        border: "0.5px solid var(--border)",
        cursor: "pointer",
        "text-align": "left",
        color: "var(--text-primary)",
        width: "100%",
      }}
    >
      <span>
        <strong style={{ display: "block" }}>{props.label}</strong>
        <span
          style={{
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
          }}
        >
          {props.description}
        </span>
      </span>
      <SwitchTrack checked={props.checked} />
    </button>
  );
}
