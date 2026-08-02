/** Compose modal — full-featured per prototype-v11 §3.2.
 * - From account dropdown
 * - Cc / Bcc toggle rows
 * - Snippet picker
 * - Auto-title suggestion when body has content
 * - Send split-button (Send now / Schedule / Save draft)
 * - Draft autosave (timer + status)
 */

import { Show, For, createMemo, createResource, createSignal, createEffect, onCleanup, onMount } from "solid-js";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import { listAccounts, listSnippets, upsertDraft, upsertScheduledSend } from "../stores/data";
import { composeOpen, setComposeOpen, appSettings, showToast } from "../stores/ui";
import { sendEmailViaBackend } from "../services/backend";
import type { Draft, ScheduledSend, Snippet } from "../types";
import { uid } from "../utils/id";
import { addHours, addDays, isoNow, nextWeekday } from "../utils/date";

interface DraftState {
  id: string;
  recipient: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  accountId: string;
  savingState: "idle" | "saving" | "saved";
  lastSaved: number;
}

export function Compose() {
  const [accounts] = createResource(listAccounts);
  const [snippets] = createResource(listSnippets);

  const blank = (): DraftState => ({
    id: uid("dr"),
    recipient: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    accountId: (accounts() ?? []).find((a) => a.type === "email")?.id ?? "",
    savingState: "idle",
    lastSaved: 0,
  });

  const [draft, setDraft] = createSignal<DraftState>(blank());
  const [showCc, setShowCc] = createSignal(false);
  const [showBcc, setShowBcc] = createSignal(false);
  const [showSnippetPicker, setShowSnippetPicker] = createSignal(false);
  const [showSchedulePicker, setShowSchedulePicker] = createSignal(false);
  const [sendMenuOpen, setSendMenuOpen] = createSignal(false);

  /* Reset draft when modal opens */
  createEffect(() => {
    if (composeOpen()) {
      setDraft(blank());
      setShowCc(false);
      setShowBcc(false);
    }
  });

  /* Auto-title suggestion: when body has >= 8 chars and subject is empty, suggest "Re: " */
  const titleSuggestion = createMemo(() => {
    const d = draft();
    if (d.body.trim().length < 8) return "";
    if (d.subject.trim()) return "";
    return d.subject || "(无主题)";
  });

  /* Autosave: persist draft every 4s if dirty. */
  let saveTimer: number | undefined;
  const persistDraft = async (status: Draft["status"] = "edited") => {
    const d = draft();
    if (!d.recipient && !d.subject && !d.body) return;
    setDraft({ ...d, savingState: "saving" });
    const draftRow: Draft = {
      id: d.id,
      recipient: d.recipient,
      subject: d.subject,
      body: d.body,
      lastEdited: isoNow(),
      status,
      accountId: d.accountId,
      cc: d.cc ? d.cc.split(",").map((s) => s.trim()).filter(Boolean) : [],
      bcc: d.bcc ? d.bcc.split(",").map((s) => s.trim()).filter(Boolean) : [],
    };
    await upsertDraft(draftRow);
    setDraft({ ...d, savingState: "saved", lastSaved: Date.now() });
  };

  onMount(() => {
    saveTimer = window.setInterval(() => {
      if (composeOpen() && draft().body) persistDraft();
    }, 4000);
    onCleanup(() => clearInterval(saveTimer));
  });

  /* Apply snippet */
  const applySnippet = (s: Snippet) => {
    const d = draft();
    const next = s.body.replace(/\{\{name\}\}/g, d.recipient || "{{name}}");
    setDraft({
      ...d,
      body: d.body ? d.body + "\n\n" + next : next,
    });
    setShowSnippetPicker(false);
  };

  /* Send split-button actions */
  const sendNow = async () => {
    const d = draft();
    const subject = d.subject || "(no subject)";
    const recipient = d.recipient.trim();
    if (!recipient) {
      showToast({ message: "请输入收件人地址", kind: "warning" });
      return;
    }
    setSendMenuOpen(false);
    showToast({ message: "正在通过 SMTP 发送…", kind: "info", ttlMs: 2000 });
    try {
      const result = await sendEmailViaBackend(recipient, subject, d.body);
      await persistDraft("sent");
      setComposeOpen(false);
      if (result) {
        showToast({
          message: `已发送 · ${result.message_id.slice(0, 24)}…`,
          kind: "success",
          action: {
            label: "设置跟进 3 天",
            run: () => showToast({ message: "跟进设置（M3 实装）", kind: "info" }),
          },
        });
      } else {
        showToast({
          message: "已保存为草稿（未配置真实账户）",
          kind: "info",
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast({ message: `发送失败：${msg}`, kind: "error", ttlMs: 8000 });
      // Keep modal open so user can retry.
      setSendMenuOpen(false);
    }
  };

  const saveAsDraft = async () => {
    await persistDraft("edited");
    setSendMenuOpen(false);
    showToast({ message: "已保存为草稿", kind: "success" });
    setComposeOpen(false);
  };

  const scheduleSend = async (when: Date) => {
    const d = draft();
    const draftRow: Draft = {
      id: d.id,
      recipient: d.recipient,
      subject: d.subject,
      body: d.body,
      lastEdited: isoNow(),
      status: "pending",
      accountId: d.accountId,
      cc: d.cc ? d.cc.split(",").map((s) => s.trim()).filter(Boolean) : [],
      bcc: d.bcc ? d.bcc.split(",").map((s) => s.trim()).filter(Boolean) : [],
    };
    await upsertDraft(draftRow);
    const sched: ScheduledSend = {
      id: uid("ss"),
      draftId: d.id,
      accountId: d.accountId,
      scheduledAt: when.toISOString(),
      status: "scheduled",
    };
    await upsertScheduledSend(sched);
    setSendMenuOpen(false);
    setComposeOpen(false);
    showToast({ message: `已安排在 ${when.toLocaleString()} 发送`, kind: "success" });
  };

  /* Signature for the selected account */
  const signature = createMemo(() => {
    const a = (accounts() ?? []).find((x) => x.id === draft().accountId);
    if (a && a.type === "email" && a.settings?.signature) return a.settings.signature;
    return appSettings.profile.signature;
  });

  return (
    <Modal
      open={composeOpen()}
      onClose={() => setComposeOpen(false)}
      title="新邮件"
      width="640px"
      fullScreenOnMobile
      footer={
        <div style={{ display: "flex", "align-items": "center", gap: "var(--space-3)", width: "100%" }}>
          <SaveStatus state={draft().savingState} lastSaved={draft().lastSaved} />
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowSnippetPicker(true)}
            style={toolbarBtnStyle}
            title="插入 Snippet"
          >
            <Icon name="ph-text-aa" size={14} /> Snippet
          </button>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setSendMenuOpen(!sendMenuOpen())}
              disabled={!draft().recipient}
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-2)",
                padding: "8px 16px",
                background: draft().recipient ? "var(--palm)" : "var(--paper-dark)",
                color: "white",
                "border-radius": "var(--radius-pill)",
                "font-weight": "700",
                "font-size": "var(--text-caption)",
                opacity: draft().recipient ? 1 : 0.5,
              }}
            >
              <Icon name="ph-paper-plane-tilt" size={14} />
              发送
              <Icon name="ph-caret-down" size={12} />
            </button>
            <Show when={sendMenuOpen()}>
              <SendMenu
                onSendNow={sendNow}
                onSchedule={() => { setShowSchedulePicker(true); setSendMenuOpen(false); }}
                onSaveDraft={saveAsDraft}
              />
            </Show>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-3)" }}>
        {/* From */}
        <Field label="From">
          <select
            value={draft().accountId}
            onChange={(e) => setDraft({ ...draft(), accountId: e.currentTarget.value })}
            style={inputStyle}
          >
            <For each={(accounts() ?? []).filter((a) => a.type === "email")}>
              {(a) => (
                <option value={a.id}>
                  {a.label} &lt;{a.email}&gt;
                </option>
              )}
            </For>
          </select>
        </Field>

        {/* Recipient */}
        <Field label="To">
          <input
            type="email"
            value={draft().recipient}
            onInput={(e) => setDraft({ ...draft(), recipient: e.currentTarget.value })}
            placeholder="recipient@example.com"
            style={inputStyle}
          />
        </Field>

        <Show when={showCc()}>
          <Field label="Cc">
            <input
              type="text"
              value={draft().cc}
              onInput={(e) => setDraft({ ...draft(), cc: e.currentTarget.value })}
              placeholder="alice@example.com, bob@example.com"
              style={inputStyle}
            />
          </Field>
        </Show>

        <Show when={showBcc()}>
          <Field label="Bcc">
            <input
              type="text"
              value={draft().bcc}
              onInput={(e) => setDraft({ ...draft(), bcc: e.currentTarget.value })}
              placeholder="secret@example.com"
              style={inputStyle}
            />
          </Field>
        </Show>

        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Show when={!showCc()}>
            <button onClick={() => setShowCc(true)} style={toggleBtnStyle}>Cc</button>
          </Show>
          <Show when={!showBcc()}>
            <button onClick={() => setShowBcc(true)} style={toggleBtnStyle}>Bcc</button>
          </Show>
        </div>

        {/* Subject */}
        <Field label="Subject">
          <input
            type="text"
            value={draft().subject}
            onInput={(e) => setDraft({ ...draft(), subject: e.currentTarget.value })}
            placeholder={titleSuggestion() || "主题"}
            style={inputStyle}
          />
        </Field>

        {/* Body */}
        <textarea
          value={draft().body}
          onInput={(e) => setDraft({ ...draft(), body: e.currentTarget.value })}
          placeholder="正文…"
          rows={12}
          style={{
            ...inputStyle,
            "min-height": "240px",
            "font-family": "var(--font-body)",
            "line-height": 1.5,
            resize: "vertical",
          }}
        />

        {/* Signature preview */}
        <Show when={signature()}>
          <div
            style={{
              "margin-top": "var(--space-2)",
              padding: "var(--space-3)",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "font-size": "var(--text-caption)",
              color: "var(--text-secondary)",
              "white-space": "pre-wrap",
            }}
          >
            {signature()}
          </div>
        </Show>
      </div>

      <Show when={showSnippetPicker()}>
        <SnippetPicker
          snippets={snippets() ?? []}
          onPick={applySnippet}
          onClose={() => setShowSnippetPicker(false)}
        />
      </Show>

      <Show when={showSchedulePicker()}>
        <SchedulePicker
          onPick={scheduleSend}
          onClose={() => setShowSchedulePicker(false)}
        />
      </Show>
    </Modal>
  );
}

function Field(props: { label: string; children: unknown }) {
  return (
    <label style={{ display: "flex", "align-items": "center", gap: "var(--space-2)" }}>
      <span style={{ width: "60px", "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>{props.label}</span>
      <div style={{ flex: 1 }}>{props.children as never}</div>
    </label>
  );
}

function SaveStatus(props: { state: "idle" | "saving" | "saved"; lastSaved: number }) {
  const text = () => {
    if (props.state === "saving") return "Saving…";
    if (props.state === "saved") return "Draft saved";
    return "";
  };
  return (
    <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
      {text()}
    </span>
  );
}

function SendMenu(props: { onSendNow: () => void; onSchedule: () => void; onSaveDraft: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        right: 0,
        background: "var(--paper-light)",
        border: "0.5px solid var(--border-strong)",
        "border-radius": "var(--radius-md)",
        "box-shadow": "var(--shadow-md)",
        "min-width": "180px",
        "z-index": 1,
      }}
    >
      <MenuItem icon="ph-paper-plane-tilt" label="立即发送" onClick={props.onSendNow} />
      <MenuItem icon="ph-clock" label="安排发送" onClick={props.onSchedule} />
      <MenuItem icon="floppy-disk" label="保存为草稿" onClick={props.onSaveDraft} />
    </div>
  );
}

function MenuItem(props: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-2)",
        width: "100%",
        padding: "8px 12px",
        "text-align": "left",
        "font-size": "var(--text-body-sm)",
        color: "var(--text-primary)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon name={props.icon} size={14} />
      {props.label}
    </button>
  );
}

function SnippetPicker(props: { snippets: Snippet[]; onPick: (s: Snippet) => void; onClose: () => void }) {
  const [q, setQ] = createSignal("");
  const filtered = createMemo(() =>
    props.snippets.filter((s) => s.label.toLowerCase().includes(q().toLowerCase()))
  );
  return (
    <Modal
      open
      onClose={props.onClose}
      title="选择 Snippet"
      width="420px"
    >
      <input
        autofocus
        value={q()}
        onInput={(e) => setQ(e.currentTarget.value)}
        placeholder="搜索 snippet…"
        style={{ ...inputStyle, "margin-bottom": "var(--space-3)" }}
      />
      <For each={filtered()} fallback={<div style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>暂无 snippet</div>}>
        {(s) => (
          <button
            onClick={() => props.onPick(s)}
            style={{
              display: "block",
              width: "100%",
              "text-align": "left",
              padding: "var(--space-3)",
              "border-radius": "var(--radius-md)",
              "margin-bottom": "var(--space-2)",
              background: "var(--paper-mid)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-dark)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
          >
            <div style={{ "font-weight": "700", "margin-bottom": "2px" }}>{s.label}</div>
            <div style={{ "font-size": "var(--text-caption)", color: "var(--text-secondary)", "white-space": "pre-wrap" }}>
              {s.body.slice(0, 80)}…
            </div>
          </button>
        )}
      </For>
    </Modal>
  );
}

function SchedulePicker(props: { onPick: (when: Date) => void; onClose: () => void }) {
  const presets = [
    { label: "Later today", time: () => addHours(new Date(), 4) },
    { label: "Tomorrow 9 AM", time: () => { const d = addDays(new Date(), 1); d.setHours(9, 0, 0, 0); return d; } },
    { label: "Monday 9 AM", time: () => { const d = nextWeekday(new Date(), 1); d.setHours(9, 0, 0, 0); return d; } },
    { label: "Next Friday 9 AM", time: () => { const d = nextWeekday(new Date(), 5); d.setHours(9, 0, 0, 0); return d; } },
  ];

  return (
    <Modal open onClose={props.onClose} title="安排发送时间" width="420px">
      <For each={presets}>
        {(p) => (
          <button
            onClick={() => { props.onPick(p.time()); props.onClose(); }}
            style={{
              display: "flex",
              width: "100%",
              "align-items": "center",
              gap: "var(--space-2)",
              padding: "var(--space-3)",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "margin-bottom": "var(--space-2)",
              "text-align": "left",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-dark)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
          >
            <Icon name="ph-clock" size={16} />
            <span style={{ flex: 1, "font-weight": "600" }}>{p.label}</span>
            <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
              {p.time().toLocaleString()}
            </span>
          </button>
        )}
      </For>
    </Modal>
  );
}

const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  border: "0.5px solid var(--border)",
  "border-radius": "var(--radius-md)",
  background: "var(--paper)",
  "font-size": "var(--text-body-sm)",
  color: "var(--text-primary)",
};

const toolbarBtnStyle = {
  display: "flex",
  "align-items": "center",
  gap: "var(--space-1)",
  padding: "8px 12px",
  background: "transparent",
  "border-radius": "var(--radius-pill)",
  "font-size": "var(--text-caption)",
  "font-weight": "600",
  color: "var(--text-secondary)",
};

const toggleBtnStyle = {
  padding: "4px 10px",
  background: "transparent",
  "border-radius": "var(--radius-pill)",
  "font-size": "var(--text-micro)",
  color: "var(--text-muted)",
  "font-weight": "600",
};