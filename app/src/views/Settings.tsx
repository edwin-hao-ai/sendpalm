/** Settings view — 7 tabs.
 * Spec: prototype-v11 §3.19.
 */

import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
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
  listMessages,
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
} from "../stores/ui";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
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
  getSyncState,
  syncNow,
} from "../services/backend";
import { ensureNotificationPermission } from "../services/notifications";

const TABS = [
  { id: "profile", label: "Profile", icon: "ph-user-circle" },
  { id: "accounts", label: "Accounts", icon: "ph-plug" },
  { id: "preferences", label: "Preferences", icon: "ph-sliders" },
  { id: "agent", label: "Agent", icon: "ph-sparkle" },
  { id: "labels", label: "Labels", icon: "ph-tag" },
  { id: "snippets", label: "Snippets", icon: "ph-text-aa" },
  { id: "data", label: "Data", icon: "ph-database" },
  { id: "shortcuts", label: "Shortcuts", icon: "ph-keyboard" },
] as const;

export function Settings() {
  const { isMobile } = useViewport();
  const [mobileTab, setMobileTab] = createSignal<string | null>(null);

  let saveTimeout: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const settings = appSettings;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const store = await load(STORE_PATH);
      await store.set("app_settings", settings);
      await store.save();
    }, 400);
  });
  onCleanup(() => clearTimeout(saveTimeout));

  // Collapse back to the menu when the viewport grows to desktop/tablet.
  createEffect(() => {
    if (!isMobile()) setMobileTab(null);
  });

  const activeTab = () => mobileTab() ?? settingsTab();
  const showMenu = () => !isMobile() || mobileTab() === null;
  const showContent = () => !isMobile() || mobileTab() !== null;

  const navigateToTab = (id: string) => {
    setSettingsTab(id as (typeof TABS)[number]["id"]);
    if (isMobile()) setMobileTab(id);
  };

  return (
    <div
      data-testid="settings-view"
      style={{
        animation: "view-enter 0.3s var(--ease-out) both",
        display: "flex",
        "flex-direction": "column",
      }}
    >
      <Show when={showMenu()}>
        <header style={{ padding: "var(--space-5) var(--space-5) 0" }}>
          <h2
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h3)",
              "font-weight": "800",
              margin: 0,
            }}
          >
            Settings
          </h2>
        </header>
        <SettingsMenu onSelect={navigateToTab} />
      </Show>

      <Show when={showContent()}>
        <Show when={isMobile() && mobileTab() !== null}>
          <MobileContentHeader
            title={TABS.find((t) => t.id === activeTab())?.label ?? activeTab()}
            onBack={() => setMobileTab(null)}
          />
        </Show>
        <main
          style={{
            flex: 1,
            "min-width": 0,
            "max-width": isMobile() ? "100%" : "720px",
            width: "100%",
            padding:
              isMobile() && mobileTab() !== null
                ? "0 var(--space-5) var(--space-5)"
                : "var(--space-5)",
          }}
        >
          <SettingsContent activeTab={activeTab()} />
        </main>
      </Show>
    </div>
  );
}

function SettingsMenu(props: { onSelect: (id: string) => void }) {
  return (
    <nav
      data-testid="settings-menu"
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-1)",
        padding: "var(--space-4) var(--space-5) var(--space-5)",
      }}
    >
      <For each={TABS}>
        {(t) => (
          <button
            data-testid={`settings-menu-item-${t.id}`}
            onClick={() => props.onSelect(t.id)}
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-3)",
              padding: "12px var(--space-3)",
              "border-radius": "var(--radius-md)",
              background: "transparent",
              color: "var(--text-primary)",
              "font-weight": "500",
              "text-align": "left",
              "border-bottom": "0.5px solid var(--border)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--paper-mid)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Icon name={t.icon} size={20} style={{ color: "var(--palm)" }} />
            <span style={{ flex: 1, "font-size": "var(--text-body-sm)" }}>
              {t.label}
            </span>
            <Icon
              name="ph-caret-right"
              size={16}
              style={{ color: "var(--text-muted)", "flex-shrink": 0 }}
            />
          </button>
        )}
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
          padding: "4px 0",
        }}
      >
        <Icon name="ph-caret-left" size={18} />
        Settings
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
        margin: "0 0 var(--space-3)",
      }}
    >
      {props.children}
    </h3>
  );
}

function ProfileTab() {
  const s = appSettings;
  const replayOnboarding = async () => {
    const store = await load(STORE_PATH);
    await store.set("onboarding_completed", false);
    await store.save();
    setOnboardingStep(0);
    showToast({ message: "开始 Onboarding 教程", kind: "info" });
  };
  return (
    <div>
      <SectionTitle>Profile</SectionTitle>
      <Field label="Display name">
        <input
          value={s.profile.displayName}
          onInput={(e) =>
            setAppSettings("profile", "displayName", e.currentTarget.value)
          }
          style={inputStyle}
        />
      </Field>
      <Field label="Timezone">
        <select
          value={s.profile.timezone}
          onChange={(e) =>
            setAppSettings("profile", "timezone", e.currentTarget.value)
          }
          style={inputStyle}
        >
          <option value="Asia/Shanghai">Asia/Shanghai</option>
          <option value="America/New_York">America/New_York</option>
          <option value="Europe/London">Europe/London</option>
          <option value="UTC">UTC</option>
        </select>
      </Field>
      <Field label="Language">
        <select
          value={s.profile.language}
          onChange={(e) =>
            setAppSettings("profile", "language", e.currentTarget.value)
          }
          style={inputStyle}
        >
          <option value="zh-CN">中文 (zh-CN)</option>
          <option value="en-US">English (en-US)</option>
        </select>
      </Field>
      <Field label="Signature">
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
        <button onClick={replayOnboarding} style={secondaryBtn}>
          重放 Onboarding
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

function AccountsTab() {
  const [accounts, { refetch }] = createResource(listAccounts);
  const [editing, setEditing] = createSignal<Account | null>(null);
  const [adding, setAdding] = createSignal(false);

  const onSave = async (a: Account) => {
    await upsertAccount(a);
    await refetch();
    setEditing(null);
    showToast({ message: "已保存", kind: "success" });
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-3)",
        }}
      >
        <SectionTitle>Connected accounts</SectionTitle>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setAdding(true)}
          style={{
            display: "flex",
            "align-items": "center",
            gap: "4px",
            padding: "6px 14px",
            background: "var(--palm)",
            color: "white",
            "border-radius": "var(--radius-pill)",
            "font-weight": "700",
            "font-size": "var(--text-caption)",
          }}
        >
          <Icon name="ph-plus" size={12} /> Add account
        </button>
      </div>
      <Show when={(accounts() ?? []).length === 0}>
        <Empty
          icon="ph-plug-charging"
          title="还没有连接邮箱"
          description="添加 IMAP/SMTP 账号后，会自动出现在这里。"
          action={{ label: "添加账号", onClick: () => setAdding(true) }}
        />
      </Show>
      <For each={accounts() ?? []}>
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
                {a.email ?? `${a.type} · ${a.workspace ?? ""}`} · {a.status}
                <SyncStatus accountId={a.id} />
              </p>
            </div>
            <button
              onClick={async () => {
                const r = await syncNow(a.id, "INBOX");
                if (r) {
                  showToast({
                    message: `已同步 ${a.label} · 新增 ${r.new_messages} 封`,
                    kind: "success",
                  });
                } else {
                  showToast({
                    message: `同步请求已发送（${a.label}）`,
                    kind: "info",
                  });
                }
              }}
              style={{
                color: "var(--palm)",
                "font-size": "var(--text-caption)",
                "font-weight": "700",
              }}
            >
              立即同步
            </button>
            <button
              onClick={() => setEditing(a)}
              style={{
                color: "var(--blurple)",
                "font-size": "var(--text-caption)",
                "font-weight": "700",
              }}
            >
              设置
            </button>
          </div>
        )}
      </For>

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
        <AddAccountModal onClose={() => setAdding(false)} />
      </Show>
    </div>
  );
}

// Provider is referenced via the createResource generic; declared inline
// below in the function.
function AddAccountModal(props: { onClose: () => void }) {
  const [providerList] = createResource(fetchProviders);
  const [selectedProviderId, setSelectedProviderId] = createSignal("gmail");
  const [accountEmail, setAccountEmail] = createSignal("");
  const [accountPassword, setAccountPassword] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const onSubmit = async () => {
    const rawList = providerList();
    if (!rawList) return;
    const list = rawList as Array<{
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
    }>;
    const prov = list.find((p) => p.id === selectedProviderId());
    if (!prov) return;
    const e = accountEmail().trim();
    if (!e || !accountPassword()) {
      showToast({ message: "请填入邮箱地址和密码", kind: "warning" });
      return;
    }
    setSaving(true);
    const id = `acct_${e.replace(/[^a-z0-9]/gi, "_")}`;
    // Build the account. Provider is stored as TEXT in SQL, so we cast
    // through `unknown` since the TS union doesn't list every provider
    // string we allow at runtime (the SQL store is provider-agnostic).
    const providerId: string = prov.id;
    const account = {
      id,
      type: "email" as const,
      provider: providerId,
      email: e,
      label: prov.label,
      displayName: e.split("@")[0] ?? e,
      status: "connected" as const,
      synced: 0,
      total: 0,
      privacy: "unified" as const,
      color: "#0A8F63",
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
    // Persist password into OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service).
    try {
      const ok = await vaultSave(id, accountPassword());
      if (ok) {
        showToast({
          message: `已添加 ${prov.label} 账户 ${e} · 密码已存入 Keychain`,
          kind: "success",
        });
      } else {
        showToast({
          message: `已添加 ${prov.label} 账户 ${e}（浏览器模式，未存密码到 Keychain）`,
          kind: "info",
        });
      }
    } catch (vaultErr) {
      showToast({
        message: `已添加账户 ${e}，但 Keychain 写入失败：${vaultErr}`,
        kind: "warning",
      });
    }
    setSaving(false);
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
            }}
          >
            {saving() ? "添加中…" : "添加并连接"}
          </button>
        </>
      }
    >
      <Field label="邮箱服务商">
        <select
          value={selectedProviderId()}
          onChange={(e) => setSelectedProviderId(e.currentTarget.value)}
          style={inputStyle}
        >
          <For each={providerList() ?? []}>
            {(p) => <option value={p.id}>{p.label}</option>}
          </For>
        </select>
      </Field>
      <Field label="邮箱地址">
        <input
          value={accountEmail()}
          onInput={(e) => setAccountEmail(e.currentTarget.value)}
          placeholder="you@example.com"
          style={inputStyle}
        />
      </Field>
      <Field label="密码 / App password / 授权码">
        <input
          type="password"
          value={accountPassword()}
          onInput={(e) => setAccountPassword(e.currentTarget.value)}
          placeholder="见上方服务商提示"
          style={inputStyle}
        />
      </Field>
      <p
        style={{
          "font-size": "var(--text-micro)",
          color: "var(--text-muted)",
          "margin-top": "var(--space-2)",
        }}
      >
        {providerList()?.find((p) => p.id === selectedProviderId())
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
  const d = () => draft();

  return (
    <Modal
      open
      onClose={props.onClose}
      title={`${d().label} · 设置`}
      width="640px"
      footer={
        <>
          <button
            onClick={async () => {
              if (
                !confirm(
                  `确定删除账户 ${d().label}？这将同时清除 Keychain 密码。`,
                )
              )
                return;
              await props.onDelete(d());
            }}
            style={{
              padding: "8px 16px",
              "font-size": "var(--text-caption)",
              color: "var(--danger, #c33)",
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
          <button onClick={() => props.onSave(d())} style={primaryBtn}>
            保存
          </button>
        </>
      }
    >
      <Show when={d().type === "email"}>
        <Field label="Display name">
          <input
            value={d().displayName}
            onInput={(e) =>
              setDraft({ ...d(), displayName: e.currentTarget.value })
            }
            style={inputStyle}
          />
        </Field>
        <Field label="Signature">
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
        <Field label="Reply-to">
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
        <Field label="Aliases">
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
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
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
                    style={{ color: "var(--danger)" }}
                    aria-label="Remove alias"
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
                padding: "6px 12px",
                background: "var(--paper-mid)",
                color: "var(--text-secondary)",
                "border-radius": "var(--radius-pill)",
                "font-size": "var(--text-caption)",
                "font-weight": "600",
                "align-self": "flex-start",
              }}
            >
              <Icon name="ph-plus" size={12} /> Add alias
            </button>
          </div>
        </Field>
        <Field label="Default From">
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
            <option value={d().email}>{d().email} (primary)</option>
            <For
              each={d().type === "email" ? (d().settings?.aliases ?? []) : []}
            >
              {(alias) => <option value={alias}>{alias}</option>}
            </For>
          </select>
        </Field>
        <Field label="Sync frequency">
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
        <Field label="Sync folders">
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
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enabled()}
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
                    {name}
                  </label>
                );
              }}
            </For>
          </div>
        </Field>
        <Field label="Auto-BCC">
          <label
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-2)",
            }}
          >
            <input
              type="checkbox"
              checked={
                d().type === "email" ? (d().settings?.autoBcc ?? false) : false
              }
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
              启用 Auto-BCC
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
        <Field label="Vacation responder">
          <label
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-2)",
            }}
          >
            <input
              type="checkbox"
              checked={
                d().type === "email"
                  ? (d().settings?.vacationResponder?.enabled ?? false)
                  : false
              }
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
              启用 Vacation Responder
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
      </Show>
      <Show when={d().type !== "email"}>
        <p
          style={{
            color: "var(--text-muted)",
            "font-size": "var(--text-caption)",
          }}
        >
          {d().type === "im" ? "IM" : "Calendar"} 账户的详细设置（M10 实装）。
        </p>
      </Show>
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
  return (
    <div>
      <SectionTitle>Notifications</SectionTitle>
      <PreferencesNotificationsTab />

      <SectionTitle>Security</SectionTitle>
      <Toggle
        label="应用锁"
        checked={s.preferences.security.appLock}
        onChange={(v) =>
          setAppSettings("preferences", "security", "appLock", v)
        }
      />
      <Toggle
        label="允许截图"
        checked={s.preferences.security.screenshotAllowed}
        onChange={(v) =>
          setAppSettings("preferences", "security", "screenshotAllowed", v)
        }
      />
      <Toggle
        label="剪贴板同步"
        checked={s.preferences.security.clipboardSync}
        onChange={(v) =>
          setAppSettings("preferences", "security", "clipboardSync", v)
        }
      />

      <SectionTitle>Sync & Storage</SectionTitle>
      <Toggle
        label="自动下载附件"
        checked={s.preferences.syncAndStorage.autoDownloadAttachments}
        onChange={(v) =>
          setAppSettings(
            "preferences",
            "syncAndStorage",
            "autoDownloadAttachments",
            v,
          )
        }
      />
    </div>
  );
}

function AgentTab() {
  const s = appSettings;
  const llm = () => s.agent.llm;
  return (
    <div>
      <SectionTitle>Agent behavior</SectionTitle>
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
        详细 memory 编辑器已在 Agent 面板的记忆 tab 中实装，可直接编辑。
      </p>

      <SectionTitle>LLM provider (M11 — OpenAI 兼容 API)</SectionTitle>
      <Field label="Base URL" hint="留空时使用 https://api.openai.com/v1；本地 Ollama 填 http://localhost:11434/v1">
        <input
          type="text"
          placeholder="https://api.openai.com/v1"
          value={llm().baseUrl}
          onInput={(e) => setAppSettings("agent", "llm", "baseUrl", e.currentTarget.value)}
          style={inputStyle}
        />
      </Field>
      <Field
        label="API key"
        hint="Bearer token。本地模型可留空。"
      >
        <input
          type="password"
          placeholder="sk-…"
          value={llm().apiKey}
          onInput={(e) => setAppSettings("agent", "llm", "apiKey", e.currentTarget.value)}
          style={inputStyle}
        />
      </Field>
      <Field
        label="Model"
        hint="例如 gpt-4o-mini / claude-3-5-sonnet / llama3.1:8b"
      >
        <input
          type="text"
          placeholder="gpt-4o-mini"
          value={llm().model}
          onInput={(e) => setAppSettings("agent", "llm", "model", e.currentTarget.value)}
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
        <Field
          label="Temperature"
          hint="0.0 严谨，1.0 创意"
        >
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
        <Field
          label="Max tokens"
          hint="单次回复上限"
        >
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
        label="System prompt"
        hint="每次 chat 都会带上这段前缀。留空则不发送 system 角色。"
      >
        <textarea
          rows={4}
          value={llm().systemPrompt}
          onInput={(e) =>
            setAppSettings("agent", "llm", "systemPrompt", e.currentTarget.value)
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

  const save = async (l: Label) => {
    await upsertLabel(l);
    await refetch();
    setEditing(null);
    showToast({ message: "已保存", kind: "success" });
  };
  const remove = async (id: string) => {
    await deleteLabel(id);
    await refetch();
    showToast({ message: "已删除", kind: "info" });
  };
  const newLabel = (): Label => ({ id: uid("lb"), name: "", color: "#5522fa" });

  return (
    <div>
      <SectionTitle>Labels</SectionTitle>
      <For
        each={labels() ?? []}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无 label
          </p>
        }
      >
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
              }}
            />
            <span style={{ flex: 1, "font-weight": "600" }}>{l.name}</span>
            <button
              onClick={() => setEditing(l)}
              style={{
                color: "var(--blurple)",
                "font-size": "var(--text-caption)",
                "font-weight": "700",
              }}
            >
              Edit
            </button>
            <button
              onClick={() => remove(l.id)}
              style={{ color: "var(--text-muted)" }}
              aria-label="Delete"
            >
              <Icon name="ph-trash" size={14} />
            </button>
          </div>
        )}
      </For>
      <button
        onClick={() => setEditing(newLabel())}
        style={{ ...primaryBtn, "margin-top": "var(--space-3)" }}
      >
        <Icon name="ph-plus" size={12} /> New label
      </button>

      <Show when={editing()}>
        <LabelEditModal
          label={editing()!}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      </Show>
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
      title="Edit label"
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
      <Field label="Name">
        <input
          value={draft().name}
          onInput={(e) => setDraft({ ...draft(), name: e.currentTarget.value })}
          style={inputStyle}
        />
      </Field>
      <Field label="Color">
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

  const save = async (s: Snippet) => {
    await upsertSnippet(s);
    await refetch();
    setEditing(null);
    showToast({ message: "已保存", kind: "success" });
  };
  const remove = async (id: string) => {
    await deleteSnippet(id);
    await refetch();
    showToast({ message: "已删除", kind: "info" });
  };
  const newSnippet = (): Snippet => ({
    id: uid("sn"),
    label: "",
    body: "",
    shortcut: "",
  });

  return (
    <div>
      <SectionTitle>Snippets</SectionTitle>
      <p
        style={{
          color: "var(--text-secondary)",
          "font-size": "var(--text-caption)",
          "margin-top": 0,
          "margin-bottom": "var(--space-3)",
        }}
      >
        在 Compose 中点击 Snippet 按钮插入常用段落。
      </p>
      <For
        each={snippets() ?? []}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无 snippet
          </p>
        }
      >
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
            <button
              onClick={() => setEditing(s)}
              style={{
                color: "var(--blurple)",
                "font-size": "var(--text-caption)",
                "font-weight": "700",
              }}
            >
              Edit
            </button>
            <button
              onClick={() => remove(s.id)}
              style={{ color: "var(--text-muted)" }}
              aria-label="Delete"
            >
              <Icon name="ph-trash" size={14} />
            </button>
          </div>
        )}
      </For>
      <button
        onClick={() => setEditing(newSnippet())}
        style={{ ...primaryBtn, "margin-top": "var(--space-3)" }}
      >
        <Icon name="ph-plus" size={12} /> New snippet
      </button>

      <Show when={editing()}>
        <SnippetEditModal
          snippet={editing()!}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      </Show>
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
      title={props.snippet.label ? "Edit snippet" : "New snippet"}
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
      <Field label="快捷输入">
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
          placeholder="Hi there, ..."
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
    showToast({ message: "已导出 CSV", kind: "success" });
  };
  const exportTasks = async () => {
    const tasks = await listTasks();
    download(
      "sendpalm-tasks.json",
      JSON.stringify({ exportedAt: isoNow(), tasks }, null, 2),
      "application/json",
    );
    showToast({ message: "已导出 Tasks JSON", kind: "success" });
  };
  const backupMailbox = async () => {
    const messages = await listMessages();
    const files = await listFiles();
    const data = {
      exportedAt: isoNow(),
      messages,
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
    showToast({ message: "已导出 Mailbox backup", kind: "success" });
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
    showToast({ message: "已导出 JSON", kind: "success" });
  };
  const emptyTrashNow = async () => {
    const count = await emptyTrash();
    showToast({ message: `已清空 Trash（${count} 封）`, kind: "success" });
  };
  const reset = async () => {
    const code = prompt("输入 DELETE 以清空所有数据：");
    if (code !== "DELETE") return;
    await resetAllData();
    location.reload();
  };
  const deleteAccount = () => {
    const code = prompt("输入 DELETE ACCOUNT 以删除当前账户（演示）：");
    if (code !== "DELETE ACCOUNT") return;
    showToast({ message: "账户删除请求已记录（演示模式）", kind: "info" });
  };
  return (
    <div>
      <SectionTitle>Export</SectionTitle>
      <button onClick={exportContacts} style={secondaryBtn}>
        导出 Contacts CSV
      </button>
      <button onClick={exportTasks} style={secondaryBtn}>
        导出 Tasks JSON
      </button>
      <button onClick={backupMailbox} style={secondaryBtn}>
        导出 Mailbox backup
      </button>
      <button onClick={exportAll} style={secondaryBtn}>
        导出全部数据 JSON
      </button>

      <SectionTitle>危险区</SectionTitle>
      <button onClick={emptyTrashNow} style={secondaryBtn}>
        清空 Trash
      </button>
      <button
        onClick={deleteAccount}
        style={{ ...secondaryBtn, color: "var(--coral)" }}
      >
        删除账户（演示）
      </button>
      <button
        onClick={reset}
        style={{ ...secondaryBtn, color: "var(--coral)" }}
      >
        清空所有数据（输入 DELETE 确认）
      </button>
    </div>
  );
}

function ShortcutsTab() {
  const [shortcuts, { refetch }] = createResource(listShortcuts);
  const [editing, setEditing] = createSignal<Shortcut | null>(null);
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
    <div>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
        }}
      >
        <SectionTitle>Keyboard shortcuts</SectionTitle>
        <button
          onClick={restore}
          style={{
            padding: "6px 12px",
            "font-size": "var(--text-caption)",
            "font-weight": "600",
            color: "var(--text-secondary)",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-pill)",
          }}
        >
          Restore defaults
        </button>
      </div>
      <Show when={(shortcuts() ?? []).length === 0}>
        <Empty
          icon="ph-keyboard"
          title="还没有自定义快捷键"
          description="添加快捷键后，会显示在这里。"
        />
      </Show>
      <For each={shortcuts() ?? []}>
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
            <span style={{ flex: 1, "font-size": "var(--text-body-sm)" }}>
              {s.label}
            </span>
            <span
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              {s.action}
            </span>
            <Show when={s.editable}>
              <button
                onClick={() => setEditing(s)}
                style={{
                  color: "var(--blurple)",
                  "font-size": "var(--text-caption)",
                  "font-weight": "700",
                }}
              >
                Edit
              </button>
            </Show>
          </div>
        )}
      </For>

      <Show when={editing()}>
        <ShortcutEditModal
          s={editing()!}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      </Show>
    </div>
  );
}

function ShortcutEditModal(props: {
  s: Shortcut;
  onClose: () => void;
  onSave: (s: Shortcut) => void;
}) {
  const [combo, setCombo] = createSignal(props.s.combo);
  return (
    <Modal
      open
      onClose={props.onClose}
      title="Edit shortcut"
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
            style={primaryBtn}
          >
            保存
          </button>
        </>
      }
    >
      <Field label="Combo (e.g. ⌘1)">
        <input
          value={combo()}
          onInput={(e) => setCombo(e.currentTarget.value)}
          style={inputStyle}
        />
      </Field>
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

function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-3)",
        padding: "var(--space-2) 0",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span style={{ "font-size": "var(--text-body-sm)" }}>{props.label}</span>
    </label>
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
    <div style={{ display: "grid", gap: "var(--space-3)", "max-width": "520px" }}>
      <ToggleRow
        label="桌面通知"
        description="收到新邮件时在 macOS 通知中心弹出。"
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
      <ToggleRow
        label="每日摘要邮件"
        description="每天发送一封汇总未读邮件的摘要。"
        checked={prefs().digest}
        onChange={(v) =>
          setAppSettings("preferences", "notifications", {
            ...prefs(),
            digest: v,
          })
        }
      />
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
    <label
      style={{
        display: "grid",
        "grid-template-columns": "1fr auto",
        gap: "var(--space-2)",
        "align-items": "center",
        padding: "var(--space-3)",
        "border-radius": "var(--radius-md)",
        background: "var(--surface-elevated)",
        border: "0.5px solid var(--border)",
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
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
    </label>
  );
}
