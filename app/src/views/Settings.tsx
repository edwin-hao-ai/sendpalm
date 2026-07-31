/** Settings view — 7 tabs.
 * Spec: prototype-v11 §3.19.
 */

import { For, Show, createResource, createSignal } from "solid-js";
import {
  listAccounts, upsertAccount,
  listLabels, upsertLabel, deleteLabel,
  listShortcuts, upsertShortcut,
  listContacts,
  resetAllData,
} from "../stores/data";
import { appSettings, setAppSettings, settingsTab, setSettingsTab, showToast } from "../stores/ui";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { uid } from "../utils/id";
import type { Account, AccountSettings, Label, Shortcut } from "../types";
import { isoNow } from "../utils/date";
import { load, STORE_PATH } from "../bootstrap";
import { listSnippets } from "../stores/data";

const TABS = [
  { id: "profile", label: "Profile", icon: "ph-user-circle" },
  { id: "accounts", label: "Accounts", icon: "ph-plug" },
  { id: "preferences", label: "Preferences", icon: "ph-sliders" },
  { id: "agent", label: "Agent", icon: "ph-sparkle" },
  { id: "labels", label: "Labels", icon: "ph-tag" },
  { id: "data", label: "Data", icon: "ph-database" },
  { id: "shortcuts", label: "Shortcuts", icon: "ph-keyboard" },
] as const;

export function Settings() {
  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <header style={{ padding: "var(--space-5) var(--space-5) 0" }}>
        <h2 style={{ "font-family": "var(--font-display)", "font-size": "var(--text-h3)", "font-weight": "800", margin: 0 }}>
          Settings
        </h2>
      </header>

      <div style={{ display: "flex", gap: "var(--space-4)", padding: "var(--space-5)", "align-items": "flex-start" }}>
        {/* Tab nav */}
        <nav style={{ display: "flex", "flex-direction": "column", gap: "2px", "min-width": "180px" }}>
          <For each={TABS}>
            {(t) => (
              <button
                onClick={() => setSettingsTab(t.id)}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-2)",
                  padding: "8px 12px",
                  "border-radius": "var(--radius-md)",
                  background: settingsTab() === t.id ? "var(--palm-soft)" : "transparent",
                  color: settingsTab() === t.id ? "var(--palm)" : "var(--text-primary)",
                  "font-weight": settingsTab() === t.id ? "700" : "500",
                  "text-align": "left",
                }}
              >
                <Icon name={t.icon} size={16} />
                {t.label}
              </button>
            )}
          </For>
        </nav>

        {/* Tab content */}
        <main style={{ flex: 1, "min-width": 0, "max-width": "720px" }}>
          <Show when={settingsTab() === "profile"}><ProfileTab /></Show>
          <Show when={settingsTab() === "accounts"}><AccountsTab /></Show>
          <Show when={settingsTab() === "preferences"}><PreferencesTab /></Show>
          <Show when={settingsTab() === "agent"}><AgentTab /></Show>
          <Show when={settingsTab() === "labels"}><LabelsTab /></Show>
          <Show when={settingsTab() === "data"}><DataTab /></Show>
          <Show when={settingsTab() === "shortcuts"}><ShortcutsTab /></Show>
        </main>
      </div>
    </div>
  );
}

function SectionTitle(props: { children: string }) {
  return (
    <h3 style={{ "font-family": "var(--font-display)", "font-size": "var(--text-h4)", "font-weight": "800", margin: "0 0 var(--space-3)" }}>
      {props.children}
    </h3>
  );
}

function ProfileTab() {
  const s = appSettings;
  const save = async () => {
    const store = await load(STORE_PATH);
    await store.set("app_settings", appSettings);
    await store.save();
    showToast({ message: "已保存", kind: "success" });
  };
  return (
    <div>
      <SectionTitle>Profile</SectionTitle>
      <Field label="Display name">
        <input
          value={s.profile.displayName}
          onInput={(e) => setAppSettings("profile", "displayName", e.currentTarget.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Timezone">
        <select
          value={s.profile.timezone}
          onChange={(e) => setAppSettings("profile", "timezone", e.currentTarget.value)}
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
          onChange={(e) => setAppSettings("profile", "language", e.currentTarget.value)}
          style={inputStyle}
        >
          <option value="zh-CN">中文 (zh-CN)</option>
          <option value="en-US">English (en-US)</option>
        </select>
      </Field>
      <Field label="Signature">
        <textarea
          value={s.profile.signature}
          onInput={(e) => setAppSettings("profile", "signature", e.currentTarget.value)}
          rows={4}
          style={{ ...inputStyle, "min-height": "100px", "font-family": "var(--font-body)", resize: "vertical" }}
        />
      </Field>
      <button onClick={save} style={primaryBtn}>保存</button>
    </div>
  );
}

function AccountsTab() {
  const [accounts, { refetch }] = createResource(listAccounts);
  const [editing, setEditing] = createSignal<Account | null>(null);

  const onSave = async (a: Account) => {
    await upsertAccount(a);
    await refetch();
    setEditing(null);
    showToast({ message: "已保存", kind: "success" });
  };

  return (
    <div>
      <SectionTitle>Connected accounts</SectionTitle>
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
              <p style={{ margin: "2px 0 0", "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
                {a.email ?? `${a.type} · ${a.workspace ?? ""}`} · {a.status}
              </p>
            </div>
            <button onClick={() => setEditing(a)} style={{ color: "var(--blurple)", "font-size": "var(--text-caption)", "font-weight": "700" }}>
              Settings
            </button>
          </div>
        )}
      </For>

      <Show when={editing()}>
        {(a) => <AccountEditModal account={a()} onClose={() => setEditing(null)} onSave={onSave} />}
      </Show>
    </div>
  );
}

function AccountEditModal(props: { account: Account; onClose: () => void; onSave: (a: Account) => void }) {
  const [draft, setDraft] = createSignal<Account>(JSON.parse(JSON.stringify(props.account)));
  const d = () => draft();

  return (
    <Modal
      open
      onClose={props.onClose}
      title={`${d().label} · 设置`}
      width="640px"
      footer={
        <>
          <button onClick={props.onClose} style={{ padding: "8px 16px", "font-size": "var(--text-caption)", color: "var(--text-secondary)" }}>
            取消
          </button>
          <button onClick={() => props.onSave(d())} style={primaryBtn}>保存</button>
        </>
      }
    >
      <Show when={d().type === "email"}>
        <Field label="Display name">
          <input
            value={d().displayName}
            onInput={(e) => setDraft({ ...d(), displayName: e.currentTarget.value })}
            style={inputStyle}
          />
        </Field>
        <Field label="Signature">
          <textarea
            value={d().type === "email" ? d().settings?.signature ?? "" : ""}
            onInput={(e) => setDraft({ ...d(), settings: { ...(d().type === "email" ? d().settings! : defaultEmailSettings()), signature: e.currentTarget.value } })}
            rows={4}
            style={{ ...inputStyle, "min-height": "100px", "font-family": "var(--font-body)", resize: "vertical" }}
          />
        </Field>
        <Field label="Reply-to">
          <input
            value={d().type === "email" ? d().settings?.replyTo ?? "" : ""}
            onInput={(e) => setDraft({ ...d(), settings: { ...(d().type === "email" ? d().settings! : defaultEmailSettings()), replyTo: e.currentTarget.value } })}
            style={inputStyle}
          />
        </Field>
        <Field label="Sync frequency">
          <select
            value={d().type === "email" ? d().settings?.syncFrequency ?? "15min" : "15min"}
            onChange={(e) => setDraft({ ...d(), settings: { ...(d().type === "email" ? d().settings! : defaultEmailSettings()), syncFrequency: e.currentTarget.value as AccountSettings["syncFrequency"] } })}
            style={inputStyle}
          >
            <option value="5min">每 5 分钟</option>
            <option value="15min">每 15 分钟</option>
            <option value="30min">每 30 分钟</option>
            <option value="1h">每小时</option>
            <option value="manual">手动</option>
          </select>
        </Field>
        <Field label="Auto-BCC">
          <label style={{ display: "flex", "align-items": "center", gap: "var(--space-2)" }}>
            <input
              type="checkbox"
              checked={d().type === "email" ? d().settings?.autoBcc ?? false : false}
              onChange={(e) => setDraft({ ...d(), settings: { ...(d().type === "email" ? d().settings! : defaultEmailSettings()), autoBcc: e.currentTarget.checked } })}
            />
            <span style={{ "font-size": "var(--text-body-sm)" }}>启用 Auto-BCC</span>
          </label>
          <Show when={d().type === "email" && d().settings?.autoBcc}>
            <input
              value={d().type === "email" ? d().settings?.autoBccAddress ?? "" : ""}
              onInput={(e) => setDraft({ ...d(), settings: { ...(d().type === "email" ? d().settings! : defaultEmailSettings()), autoBccAddress: e.currentTarget.value } })}
              placeholder="bcc@example.com"
              style={{ ...inputStyle, "margin-top": "var(--space-2)" }}
            />
          </Show>
        </Field>
        <Field label="Vacation responder">
          <label style={{ display: "flex", "align-items": "center", gap: "var(--space-2)" }}>
            <input
              type="checkbox"
              checked={d().type === "email" ? d().settings?.vacationResponder?.enabled ?? false : false}
              onChange={(e) => setDraft({
                ...d(),
                settings: {
                  ...(d().type === "email" ? d().settings! : defaultEmailSettings()),
                  vacationResponder: {
                    enabled: e.currentTarget.checked,
                    subject: d().type === "email" ? d().settings?.vacationResponder?.subject ?? "" : "",
                    body: d().type === "email" ? d().settings?.vacationResponder?.body ?? "" : "",
                  },
                },
              })}
            />
            <span style={{ "font-size": "var(--text-body-sm)" }}>启用 Vacation Responder</span>
          </label>
          <Show when={d().type === "email" && d().settings?.vacationResponder?.enabled}>
            <input
              value={d().type === "email" ? d().settings?.vacationResponder?.subject ?? "" : ""}
              onInput={(e) => setDraft({
                ...d(),
                settings: {
                  ...(d().type === "email" ? d().settings! : defaultEmailSettings()),
                  vacationResponder: {
                    enabled: true,
                    subject: e.currentTarget.value,
                    body: d().type === "email" ? d().settings?.vacationResponder?.body ?? "" : "",
                  },
                },
              })}
              placeholder="主题"
              style={{ ...inputStyle, "margin-top": "var(--space-2)" }}
            />
            <textarea
              value={d().type === "email" ? d().settings?.vacationResponder?.body ?? "" : ""}
              onInput={(e) => setDraft({
                ...d(),
                settings: {
                  ...(d().type === "email" ? d().settings! : defaultEmailSettings()),
                  vacationResponder: {
                    enabled: true,
                    subject: d().type === "email" ? d().settings?.vacationResponder?.subject ?? "" : "",
                    body: e.currentTarget.value,
                  },
                },
              })}
              placeholder="正文"
              rows={3}
              style={{ ...inputStyle, "min-height": "80px", "font-family": "var(--font-body)", "margin-top": "var(--space-2)", resize: "vertical" }}
            />
          </Show>
        </Field>
      </Show>
      <Show when={d().type !== "email"}>
        <p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>
          {d().type === "im" ? "IM" : "Calendar"} 账户的详细设置（M10 实装）。
        </p>
      </Show>
    </Modal>
  );
}

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
  const save = async () => {
    const store = await load(STORE_PATH);
    await store.set("app_settings", appSettings);
    await store.save();
    showToast({ message: "已保存", kind: "success" });
  };
  return (
    <div>
      <SectionTitle>Notifications</SectionTitle>
      <Toggle
        label="桌面通知"
        checked={s.preferences.notifications.desktop}
        onChange={(v) => setAppSettings("preferences", "notifications", "desktop", v)}
      />
      <Toggle
        label="每日摘要邮件"
        checked={s.preferences.notifications.digest}
        onChange={(v) => setAppSettings("preferences", "notifications", "digest", v)}
      />
      <Toggle
        label="勿扰时段"
        checked={s.preferences.notifications.quietHoursEnabled}
        onChange={(v) => setAppSettings("preferences", "notifications", "quietHoursEnabled", v)}
      />
      <Show when={s.preferences.notifications.quietHoursEnabled}>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <input
            type="time"
            value={s.preferences.notifications.quietHoursStart}
            onInput={(e) => setAppSettings("preferences", "notifications", "quietHoursStart", e.currentTarget.value)}
            style={inputStyle}
          />
          <span style={{ "align-self": "center", color: "var(--text-muted)" }}>到</span>
          <input
            type="time"
            value={s.preferences.notifications.quietHoursEnd}
            onInput={(e) => setAppSettings("preferences", "notifications", "quietHoursEnd", e.currentTarget.value)}
            style={inputStyle}
          />
        </div>
      </Show>

      <SectionTitle>Security</SectionTitle>
      <Toggle label="应用锁" checked={s.preferences.security.appLock} onChange={(v) => setAppSettings("preferences", "security", "appLock", v)} />
      <Toggle label="允许截图" checked={s.preferences.security.screenshotAllowed} onChange={(v) => setAppSettings("preferences", "security", "screenshotAllowed", v)} />
      <Toggle label="剪贴板同步" checked={s.preferences.security.clipboardSync} onChange={(v) => setAppSettings("preferences", "security", "clipboardSync", v)} />

      <SectionTitle>Sync & Storage</SectionTitle>
      <Toggle label="自动下载附件" checked={s.preferences.syncAndStorage.autoDownloadAttachments} onChange={(v) => setAppSettings("preferences", "syncAndStorage", "autoDownloadAttachments", v)} />

      <button onClick={save} style={{ ...primaryBtn, "margin-top": "var(--space-4)" }}>保存</button>
    </div>
  );
}

function AgentTab() {
  const s = appSettings;
  const save = async () => {
    const store = await load(STORE_PATH);
    await store.set("app_settings", appSettings);
    await store.save();
    showToast({ message: "已保存", kind: "success" });
  };
  return (
    <div>
      <SectionTitle>Agent behavior</SectionTitle>
      <Toggle label="自动起草回复" checked={s.agent.autoDraft} onChange={(v) => setAppSettings("agent", "autoDraft", v)} />
      <Toggle label="自动生成简报" checked={s.agent.autoSummarize} onChange={(v) => setAppSettings("agent", "autoSummarize", v)} />
      <Toggle label="记忆可编辑" checked={s.agent.memoryEditable} onChange={(v) => setAppSettings("agent", "memoryEditable", v)} />
      <p style={{ "margin-top": "var(--space-4)", "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
        详细 memory 编辑器在 M6 实装。
      </p>
      <button onClick={save} style={{ ...primaryBtn, "margin-top": "var(--space-3)" }}>保存</button>
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
      <For each={labels() ?? []} fallback={<p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>暂无 label</p>}>
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
            <div style={{ width: "16px", height: "16px", "border-radius": "50%", background: l.color }} />
            <span style={{ flex: 1, "font-weight": "600" }}>{l.name}</span>
            <button onClick={() => setEditing(l)} style={{ color: "var(--blurple)", "font-size": "var(--text-caption)", "font-weight": "700" }}>Edit</button>
            <button onClick={() => remove(l.id)} style={{ color: "var(--text-muted)" }} aria-label="Delete">
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
        <LabelEditModal label={editing()!} onClose={() => setEditing(null)} onSave={save} />
      </Show>
    </div>
  );
}

function LabelEditModal(props: { label: Label; onClose: () => void; onSave: (l: Label) => void }) {
  const [draft, setDraft] = createSignal<Label>({ ...props.label });
  return (
    <Modal
      open
      onClose={props.onClose}
      title="Edit label"
      width="380px"
      footer={
        <>
          <button onClick={props.onClose} style={{ padding: "8px 16px", "font-size": "var(--text-caption)", color: "var(--text-secondary)" }}>取消</button>
          <button onClick={() => props.onSave(draft())} style={primaryBtn}>保存</button>
        </>
      }
    >
      <Field label="Name">
        <input value={draft().name} onInput={(e) => setDraft({ ...draft(), name: e.currentTarget.value })} style={inputStyle} />
      </Field>
      <Field label="Color">
        <input type="color" value={draft().color} onInput={(e) => setDraft({ ...draft(), color: e.currentTarget.value })} style={{ width: "60px", height: "32px", padding: 0, border: "none" }} />
      </Field>
    </Modal>
  );
}

function DataTab() {
  const exportContacts = async () => {
    const contacts = await listContacts();
    const csv = ["id,name,email,company,title,stage"].concat(
      contacts.map((c) => [c.id, c.name, c.emails[0]?.value ?? "", c.company, c.title, c.stage].join(","))
    ).join("\n");
    download("sendpalm-contacts.csv", csv, "text/csv");
    showToast({ message: "已导出 CSV", kind: "success" });
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
    download("sendpalm-export.json", JSON.stringify(data, null, 2), "application/json");
    showToast({ message: "已导出 JSON", kind: "success" });
  };
  const reset = async () => {
    const code = prompt("输入 DELETE 以清空所有数据：");
    if (code !== "DELETE") return;
    await resetAllData();
    location.reload();
  };
  return (
    <div>
      <SectionTitle>Export</SectionTitle>
      <button onClick={exportContacts} style={secondaryBtn}>导出 Contacts CSV</button>
      <button onClick={exportAll} style={secondaryBtn}>导出全部数据 JSON</button>

      <SectionTitle>危险区</SectionTitle>
      <button onClick={reset} style={{ ...secondaryBtn, color: "var(--coral)" }}>
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
  return (
    <div>
      <SectionTitle>Keyboard shortcuts</SectionTitle>
      <For each={shortcuts() ?? []}>
        {(s) => (
          <div style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-3)",
            padding: "var(--space-2) var(--space-3)",
            background: "var(--paper-light)",
            "border-radius": "var(--radius-md)",
            border: "0.5px solid var(--border)",
            "margin-bottom": "var(--space-2)",
          }}>
            <kbd style={{
              padding: "4px 10px",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-sm)",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              color: "var(--text-primary)",
              "font-family": "var(--font-mono)",
            }}>{s.combo}</kbd>
            <span style={{ flex: 1, "font-size": "var(--text-body-sm)" }}>{s.label}</span>
            <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>{s.action}</span>
            <Show when={s.editable}>
              <button onClick={() => setEditing(s)} style={{ color: "var(--blurple)", "font-size": "var(--text-caption)", "font-weight": "700" }}>Edit</button>
            </Show>
          </div>
        )}
      </For>

      <Show when={editing()}>
        <ShortcutEditModal s={editing()!} onClose={() => setEditing(null)} onSave={save} />
      </Show>
    </div>
  );
}

function ShortcutEditModal(props: { s: Shortcut; onClose: () => void; onSave: (s: Shortcut) => void }) {
  const [combo, setCombo] = createSignal(props.s.combo);
  return (
    <Modal
      open
      onClose={props.onClose}
      title="Edit shortcut"
      width="380px"
      footer={
        <>
          <button onClick={props.onClose} style={{ padding: "8px 16px", "font-size": "var(--text-caption)", color: "var(--text-secondary)" }}>取消</button>
          <button onClick={() => props.onSave({ ...props.s, combo: combo() })} style={primaryBtn}>保存</button>
        </>
      }
    >
      <Field label="Combo (e.g. ⌘1)">
        <input value={combo()} onInput={(e) => setCombo(e.currentTarget.value)} style={inputStyle} />
      </Field>
    </Modal>
  );
}

/* ── Shared ── */

function Field(props: { label: string; children: unknown }) {
  return (
    <label style={{ display: "block", "margin-bottom": "var(--space-3)" }}>
      <span style={{ display: "block", "font-size": "var(--text-micro)", color: "var(--text-muted)", "font-weight": "700", "margin-bottom": "4px" }}>{props.label}</span>
      {props.children as never}
    </label>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", "align-items": "center", gap: "var(--space-3)", padding: "var(--space-2) 0", cursor: "pointer" }}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.currentTarget.checked)} />
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