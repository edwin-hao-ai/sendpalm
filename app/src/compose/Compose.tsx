/** Compose modal — full-featured per prototype-v11 §3.2.
 * - From account dropdown
 * - Cc / Bcc toggle rows
 * - Snippet picker
 * - Auto-title suggestion when body has content
 * - Send split-button (Send now / Schedule / Save draft)
 * - Draft autosave (timer + status)
 */

import {
  Show,
  For,
  createMemo,
  createResource,
  createSignal,
  createEffect,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { RecipientInput } from "../components/RecipientInput";
import {
  listAccounts,
  listContacts,
  listSnippets,
  upsertDraft,
  upsertScheduledSend,
  upsertFollowUp,
  getFile,
} from "../stores/data";
import { getAttachmentContent } from "../services/backend";
import {
  composeOpen,
  composeContext,
  setComposeOpen,
  setComposeContext,
  composeMinimized,
  setComposeMinimized,
  appSettings,
  showToast,
} from "../stores/ui";
import { sendEmailViaBackend } from "../services/backend";
import type { Draft, ScheduledSend, Snippet } from "../types";
import { uid, arrayBufferToBase64 } from "../utils/id";
import { addHours, addDays, isoNow, nextWeekday } from "../utils/date";
import { formFactor } from "../utils/viewport";
import { htmlToPlainText, plainTextToHtml } from "../utils/html";

interface DraftAttachment {
  id: string;
  name: string;
  size: number;
  mime: string;
  dataBase64: string;
}

interface DraftState {
  id: string;
  recipient: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  accountId: string;
  fromAlias?: string;
  savingState: "idle" | "saving" | "saved";
  lastSaved: number;
  attachments: DraftAttachment[];
}

export function Compose() {
  const [accounts] = createResource(listAccounts);
  const [contacts] = createResource(listContacts);
  const [snippets] = createResource(listSnippets);

  const defaultAccount = () =>
    (accounts() ?? []).find((a) => a.type === "email");
  const defaultAccountId = () => defaultAccount()?.id ?? "";
  const defaultFromAlias = () => {
    const a = defaultAccount();
    if (!a || a.type !== "email") return undefined;
    const df = a.settings?.defaultFrom;
    return df && df !== a.email ? df : undefined;
  };

  const buildDraft = (): DraftState => {
    const ctx = composeContext();
    const m = ctx.originalMsg;
    const base: DraftState = {
      id: uid("dr"),
      recipient: ctx.to ?? "",
      cc: "",
      bcc: "",
      subject: ctx.subject ?? "",
      body: "",
      accountId: m?.ac ?? defaultAccountId(),
      fromAlias: defaultFromAlias(),
      savingState: "idle",
      lastSaved: 0,
      attachments: [],
    };
    if (!m || ctx.mode === "new") return base;

    const sender = (contacts() ?? []).find((c) => c.id === m.pid);
    const senderEmail = sender?.emails[0]?.value ?? "";
    const quoteBody = m.body || htmlToPlainText(m.bodyHtml || "");
    const quote = `\n\n--- 原始邮件 ---\n发件人: ${sender?.name ?? ""} <${senderEmail}>\n主题: ${m.subj}\n\n${quoteBody}`;

    if (ctx.mode === "reply") {
      return {
        ...base,
        recipient: senderEmail,
        subject: m.subj.startsWith("Re: ") ? m.subj : `Re: ${m.subj}`,
        body: quote,
      };
    }
    if (ctx.mode === "replyAll") {
      const others = [m.to, ...(m.cc ?? [])]
        .filter((e): e is string => typeof e === "string" && !!e)
        .filter((e) => e !== senderEmail);
      return {
        ...base,
        recipient: senderEmail,
        cc: others.join(", "),
        subject: m.subj.startsWith("Re: ") ? m.subj : `Re: ${m.subj}`,
        body: quote,
      };
    }
    // forward
    return {
      ...base,
      subject: m.subj.startsWith("Fwd: ") ? m.subj : `Fwd: ${m.subj}`,
      body: quote,
    };
  };

  const blank = (): DraftState => ({
    id: uid("dr"),
    recipient: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    accountId: defaultAccountId(),
    fromAlias: defaultFromAlias(),
    savingState: "idle",
    lastSaved: 0,
    attachments: [],
  });

  const [draft, setDraft] = createSignal<DraftState>(blank());
  const [showCc, setShowCc] = createSignal(false);
  const [showBcc, setShowBcc] = createSignal(false);
  const [showSnippetPicker, setShowSnippetPicker] = createSignal(false);
  const [showSchedulePicker, setShowSchedulePicker] = createSignal(false);
  const [sendMenuOpen, setSendMenuOpen] = createSignal(false);
  let fileInputRef: HTMLInputElement | undefined;

  const attachFiles = async (files: FileList | null) => {
    if (!files) return;
    const next = [...draft().attachments];
    for (const file of Array.from(files)) {
      const buf = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      next.push({
        id: uid("att"),
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        dataBase64: b64,
      });
    }
    setDraft({ ...draft(), attachments: next });
  };

  const removeAttachment = (id: string) => {
    setDraft({
      ...draft(),
      attachments: draft().attachments.filter((a) => a.id !== id),
    });
  };

  const draftFromSaved = (d: Draft): DraftState => ({
    id: d.id,
    recipient: d.recipient,
    cc: d.cc?.join(", ") ?? "",
    bcc: d.bcc?.join(", ") ?? "",
    subject: d.subject,
    body: d.body,
    accountId: d.accountId,
    fromAlias: d.fromAlias,
    savingState: "saved",
    lastSaved: new Date(d.lastEdited).getTime(),
    attachments: d.attachments?.map((a) => ({ ...a })) ?? [],
  });

  /* Reset draft when modal opens */
  createEffect(() => {
    if (composeOpen()) {
      const ctx = composeContext();
      if (ctx.draft) {
        setDraft(draftFromSaved(ctx.draft));
        setShowCc(!!ctx.draft.cc?.length);
        setShowBcc(!!ctx.draft.bcc?.length);
      } else {
        setDraft(ctx.mode === "new" ? blank() : buildDraft());
        setShowCc(!!ctx.originalMsg && ctx.mode === "replyAll");
        setShowBcc(false);
      }
    }
  });

  /* Forward: copy original attachments into the draft so they are sent along. */
  createEffect(() => {
    if (!composeOpen()) return;
    const ctx = composeContext();
    if (ctx.mode !== "forward" || !ctx.originalMsg) return;
    const ids = ctx.originalMsg.attachments ?? [];
    if (ids.length === 0) return;

    let cancelled = false;
    (async () => {
      const loaded: DraftAttachment[] = [];
      for (const id of ids) {
        const file = await getFile(id);
        if (!file) continue;
        const dataUrl = await getAttachmentContent(id);
        if (!dataUrl) continue;
        const base64 = dataUrl.split(",")[1] ?? "";
        if (!base64) continue;
        loaded.push({
          id: uid("att"),
          name: file.name,
          size: file.size,
          mime: file.mime,
          dataBase64: base64,
        });
      }
      if (cancelled) return;
      setDraft((d) => ({ ...d, attachments: [...d.attachments, ...loaded] }));
    })();
    onCleanup(() => {
      cancelled = true;
    });
  });

  const closeCompose = () => {
    setComposeOpen(false);
    setComposeContext({ mode: "new", to: undefined, subject: undefined });
  };

  /* Auto-title: when body has content and subject is empty, pre-fill the
   * subject with the first line of the body (truncated to 60 chars). */
  createEffect(() => {
    const d = draft();
    if (d.subject.trim()) return;
    const body = d.body.trim();
    if (body.length < 8) return;
    const firstLine = body.split(/\r?\n/).find((l) => l.trim()) ?? body;
    const title = firstLine.trim().slice(0, 60);
    if (title) setDraft((prev) => ({ ...prev, subject: title }));
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
      fromAlias: d.fromAlias,
      cc: d.cc
        ? d.cc
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      bcc: d.bcc
        ? d.bcc
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      attachments: d.attachments,
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
    const next = s.body.replace(
      /\{\{name\}\}/g,
      firstRecipientName() || "{{name}}",
    );
    setDraft({
      ...d,
      body: d.body ? d.body + "\n\n" + next : next,
    });
    setShowSnippetPicker(false);
  };

  const firstRecipientName = () => {
    const email = draft().recipient.split(",")[0]?.trim();
    return email?.split("@")[0] || "";
  };

  /* Send split-button actions */
  const sendNow = async () => {
    const d = draft();
    const subject = d.subject || "(no subject)";
    const recipient = d.recipient.trim();
    const hasRecipient = recipient
      .split(",")
      .map((s) => s.trim())
      .some((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    if (!hasRecipient) {
      showToast({ message: "请输入收件人地址", kind: "warning" });
      return;
    }
    setSendMenuOpen(false);
    showToast({ message: "正在通过 SMTP 发送…", kind: "info", ttlMs: 2000 });
    try {
      const outgoingAttachments = d.attachments.map((a) => ({
        filename: a.name,
        mime: a.mime,
        dataBase64: a.dataBase64,
      }));
      const htmlBody = plainTextToHtml(d.body);
      const result = await sendEmailViaBackend(
        recipient,
        subject,
        d.body,
        d.accountId,
        outgoingAttachments,
        d.cc,
        d.bcc,
        d.fromAlias,
        htmlBody,
      );
      await persistDraft("sent");
      closeCompose();
      if (result) {
        const createFollowUp = async () => {
          if (!result.local_message_id) {
            showToast({
              message: "无法创建跟进（无本地消息 ID）",
              kind: "info",
            });
            return;
          }
          const due = addDays(new Date(), 3);
          await upsertFollowUp({
            id: uid("fu"),
            msgId: result.local_message_id,
            dueAt: due.toISOString(),
            status: "pending",
            note: "发送后 3 天跟进",
          });
          showToast({ message: "已设置 3 天后跟进", kind: "success" });
        };
        showToast({
          message: `已发送 · ${result.message_id.slice(0, 24)}…`,
          kind: "success",
          action: {
            label: "设置跟进 3 天",
            run: () => void createFollowUp(),
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
    closeCompose();
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
      fromAlias: d.fromAlias,
      cc: d.cc
        ? d.cc
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      bcc: d.bcc
        ? d.bcc
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      attachments: d.attachments,
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
    closeCompose();
    showToast({
      message: `已安排在 ${when.toLocaleString()} 发送`,
      kind: "success",
    });
  };

  /* Signature for the selected account */
  const signature = createMemo(() => {
    const a = (accounts() ?? []).find((x) => x.id === draft().accountId);
    if (a && a.type === "email" && a.settings?.signature)
      return a.settings.signature;
    return appSettings.profile.signature;
  });

  const toggleMinimize = async () => {
    const next = !composeMinimized();
    if (next) await persistDraft();
    setComposeMinimized(next);
  };

  const title = () =>
    composeContext().mode === "replyAll"
      ? "Reply All"
      : composeContext().mode === "reply"
        ? "Reply"
        : composeContext().mode === "forward"
          ? "Forward"
          : "新邮件";

  return (
    <Show when={composeOpen()}>
      <Portal mount={document.body}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title()}
          style={{
            position: "fixed",
            "z-index": "var(--z-modal)",
            right: formFactor() === "mobile" ? 0 : "var(--space-5)",
            bottom: formFactor() === "mobile" ? 0 : "var(--space-5)",
            left: formFactor() === "mobile" ? 0 : "auto",
            top: formFactor() === "mobile" ? 0 : "auto",
            width: formFactor() === "mobile" ? "100dvw" : "640px",
            height:
              formFactor() === "mobile"
                ? "100dvh"
                : composeMinimized()
                  ? "48px"
                  : "580px",
            "max-width": formFactor() === "mobile" ? "100dvw" : "94vw",
            "max-height": formFactor() === "mobile" ? "100dvh" : "80vh",
            background: "var(--paper-light)",
            "border-radius": formFactor() === "mobile" ? 0 : "var(--radius-xl)",
            "box-shadow": "var(--shadow-xl)",
            border: "0.5px solid var(--border-strong)",
            display: "flex",
            "flex-direction": "column",
            overflow: "hidden",
            animation: "compose-float-in 0.3s var(--spring) both",
            transition: "height 0.25s var(--ease-out)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-3)",
              padding: "10px var(--space-4)",
              "border-bottom": composeMinimized()
                ? "none"
                : "0.5px solid var(--border)",
              background: "var(--paper-mid)",
              cursor: formFactor() === "mobile" ? "default" : "grab",
            }}
          >
            <strong
              style={{
                flex: 1,
                "font-size": "var(--text-body-sm)",
                "font-weight": "700",
              }}
            >
              {title()}
            </strong>
            <button
              onClick={toggleMinimize}
              aria-label={composeMinimized() ? "Expand" : "Minimize"}
              style={windowBtn}
            >
              <Icon
                name={composeMinimized() ? "ph-corners-out" : "ph-minus"}
                size={14}
              />
            </button>
            <button onClick={closeCompose} aria-label="Close" style={windowBtn}>
              <Icon name="ph-x" size={14} />
            </button>
          </div>

          {/* Body */}
          <Show when={!composeMinimized()}>
            <div
              style={{
                flex: 1,
                "overflow-y": "auto",
                padding: "var(--space-4)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  "flex-direction": "column",
                  gap: "var(--space-3)",
                }}
              >
                {/* From */}
                <Field label="From">
                  <select
                    value={`${draft().accountId}:${draft().fromAlias ?? ""}`}
                    onChange={(e) => {
                      const [accountId, alias] = e.currentTarget.value.split(
                        ":",
                      ) as [string, string];
                      setDraft({
                        ...draft(),
                        accountId,
                        fromAlias: alias || undefined,
                      });
                    }}
                    style={inputStyle}
                  >
                    <For
                      each={(accounts() ?? []).filter(
                        (a) => a.type === "email",
                      )}
                    >
                      {(a) => (
                        <>
                          <option value={`${a.id}:`}>
                            {a.label} &lt;{a.email}&gt;
                          </option>
                          <For each={a.settings?.aliases ?? []}>
                            {(alias) => (
                              <option value={`${a.id}:${alias}`}>
                                {a.label} &lt;{alias}&gt;
                              </option>
                            )}
                          </For>
                        </>
                      )}
                    </For>
                  </select>
                </Field>

                {/* Recipient */}
                <Field label="To" field="to">
                  <RecipientInput
                    value={draft().recipient}
                    onChange={(v) => setDraft({ ...draft(), recipient: v })}
                    placeholder="recipient@example.com"
                    contacts={contacts() ?? []}
                  />
                </Field>

                <Show when={showCc()}>
                  <Field label="Cc" field="cc">
                    <RecipientInput
                      value={draft().cc}
                      onChange={(v) => setDraft({ ...draft(), cc: v })}
                      placeholder="alice@example.com, bob@example.com"
                      contacts={contacts() ?? []}
                    />
                  </Field>
                </Show>

                <Show when={showBcc()}>
                  <Field label="Bcc" field="bcc">
                    <RecipientInput
                      value={draft().bcc}
                      onChange={(v) => setDraft({ ...draft(), bcc: v })}
                      placeholder="secret@example.com"
                      contacts={contacts() ?? []}
                    />
                  </Field>
                </Show>

                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <Show when={!showCc()}>
                    <button
                      onClick={() => setShowCc(true)}
                      style={toggleBtnStyle}
                    >
                      Cc
                    </button>
                  </Show>
                  <Show when={!showBcc()}>
                    <button
                      onClick={() => setShowBcc(true)}
                      style={toggleBtnStyle}
                    >
                      Bcc
                    </button>
                  </Show>
                </div>

                {/* Subject */}
                <Field label="Subject" field="subject">
                  <input
                    type="text"
                    value={draft().subject}
                    onInput={(e) =>
                      setDraft({ ...draft(), subject: e.currentTarget.value })
                    }
                    placeholder={draft().subject ? "" : "主题"}
                    style={inputStyle}
                  />
                </Field>

                {/* Body */}
                <textarea
                  value={draft().body}
                  onInput={(e) =>
                    setDraft({ ...draft(), body: e.currentTarget.value })
                  }
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void sendNow();
                    }
                  }}
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

                {/* Attachments */}
                <Show when={draft().attachments.length > 0}>
                  <div
                    style={{
                      "margin-top": "var(--space-2)",
                      display: "flex",
                      "flex-direction": "column",
                      gap: "var(--space-2)",
                    }}
                  >
                    <For each={draft().attachments}>
                      {(a) => (
                        <div
                          style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "var(--space-2)",
                            padding: "var(--space-2) var(--space-3)",
                            background: "var(--paper-mid)",
                            "border-radius": "var(--radius-md)",
                            border: "0.5px solid var(--border)",
                          }}
                        >
                          <Icon
                            name={
                              a.mime.startsWith("image/")
                                ? "ph-file-image"
                                : a.mime.includes("pdf")
                                  ? "ph-file-pdf"
                                  : "ph-file-text"
                            }
                            size={18}
                            style={{ color: "var(--text-secondary)" }}
                          />
                          <div style={{ flex: 1, "min-width": 0 }}>
                            <div
                              style={{
                                "font-size": "var(--text-caption)",
                                "font-weight": "600",
                                "white-space": "nowrap",
                                overflow: "hidden",
                                "text-overflow": "ellipsis",
                              }}
                            >
                              {a.name}
                            </div>
                            <div
                              style={{
                                "font-size": "var(--text-micro)",
                                color: "var(--text-muted)",
                              }}
                            >
                              {formatBytes(a.size)}
                            </div>
                          </div>
                          <button
                            onClick={() => removeAttachment(a.id)}
                            aria-label="Remove attachment"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <Icon name="ph-x" size={14} />
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

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
            </div>
          </Show>

          {/* Footer */}
          <Show when={!composeMinimized()}>
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-3)",
                padding: "var(--space-3) var(--space-4)",
                "border-top": "0.5px solid var(--border)",
                background: "var(--surface-recessed)",
              }}
            >
              <SaveStatus
                state={draft().savingState}
                lastSaved={draft().lastSaved}
              />
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setShowSnippetPicker(true)}
                style={toolbarBtnStyle}
                title="插入 Snippet"
              >
                <Icon name="ph-text-aa" size={14} /> Snippet
              </button>
              <button
                onClick={() => fileInputRef?.click()}
                style={toolbarBtnStyle}
                title="添加附件"
              >
                <Icon name="ph-paperclip" size={14} /> 附件
              </button>
              <input
                ref={(el) => (fileInputRef = el)}
                type="file"
                multiple
                data-testid="compose-file-input"
                style={{
                  position: "absolute",
                  opacity: 0,
                  width: "1px",
                  height: "1px",
                  overflow: "hidden",
                  "pointer-events": "none",
                }}
                onChange={(e) => {
                  void attachFiles(e.currentTarget.files);
                  e.currentTarget.value = "";
                }}
              />
              <div style={{ position: "relative", display: "flex" }}>
                <button
                  onClick={sendNow}
                  disabled={!draft().recipient}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-2)",
                    padding: "8px 14px",
                    background: draft().recipient
                      ? "var(--palm)"
                      : "var(--paper-dark)",
                    color: "white",
                    "border-radius":
                      "var(--radius-pill) 0 0 var(--radius-pill)",
                    "font-weight": "700",
                    "font-size": "var(--text-caption)",
                    opacity: draft().recipient ? 1 : 0.5,
                    border: "none",
                  }}
                >
                  <Icon name="ph-paper-plane-tilt" size={14} />
                  发送
                </button>
                <button
                  onClick={() => setSendMenuOpen(!sendMenuOpen())}
                  disabled={!draft().recipient}
                  aria-label="发送选项"
                  style={{
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    width: "28px",
                    padding: "8px 0",
                    background: draft().recipient
                      ? "var(--palm)"
                      : "var(--paper-dark)",
                    color: "white",
                    "border-radius":
                      "0 var(--radius-pill) var(--radius-pill) 0",
                    "font-size": "var(--text-caption)",
                    opacity: draft().recipient ? 1 : 0.5,
                    border: "none",
                    "border-left": "1px solid rgba(255,255,255,0.25)",
                  }}
                >
                  <Icon name="ph-caret-down" size={12} />
                </button>
                <Show when={sendMenuOpen()}>
                  <SendMenu
                    onSendNow={() => {
                      setSendMenuOpen(false);
                      void sendNow();
                    }}
                    onSchedule={() => {
                      setShowSchedulePicker(true);
                      setSendMenuOpen(false);
                    }}
                    onSaveDraft={() => {
                      setSendMenuOpen(false);
                      void saveAsDraft();
                    }}
                  />
                </Show>
              </div>
            </div>
          </Show>

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
        </div>
      </Portal>
    </Show>
  );
}

function Field(props: { label: string; field?: string; children: unknown }) {
  return (
    <label
      data-field={props.field}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-2)",
      }}
    >
      <span
        style={{
          width: "60px",
          "font-size": "var(--text-caption)",
          color: "var(--text-muted)",
        }}
      >
        {props.label}
      </span>
      <div style={{ flex: 1 }}>{props.children as never}</div>
    </label>
  );
}

function SaveStatus(props: {
  state: "idle" | "saving" | "saved";
  lastSaved: number;
}) {
  const text = () => {
    if (props.state === "saving") return "Saving…";
    if (props.state === "saved") return "Draft saved";
    return "";
  };
  return (
    <span
      style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}
    >
      {text()}
    </span>
  );
}

function SendMenu(props: {
  onSendNow: () => void;
  onSchedule: () => void;
  onSaveDraft: () => void;
}) {
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
      <MenuItem
        icon="ph-paper-plane-tilt"
        label="立即发送"
        onClick={props.onSendNow}
      />
      <MenuItem icon="ph-clock" label="安排发送" onClick={props.onSchedule} />
      <MenuItem
        icon="ph-floppy-disk"
        label="保存为草稿"
        onClick={props.onSaveDraft}
      />
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
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--paper-mid)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon name={props.icon} size={14} />
      {props.label}
    </button>
  );
}

function SnippetPicker(props: {
  snippets: Snippet[];
  onPick: (s: Snippet) => void;
  onClose: () => void;
}) {
  const [q, setQ] = createSignal("");
  const filtered = createMemo(() =>
    props.snippets.filter((s) =>
      s.label.toLowerCase().includes(q().toLowerCase()),
    ),
  );
  return (
    <Modal open onClose={props.onClose} title="选择 Snippet" width="420px">
      <input
        autofocus
        value={q()}
        onInput={(e) => setQ(e.currentTarget.value)}
        placeholder="搜索 snippet…"
        style={{ ...inputStyle, "margin-bottom": "var(--space-3)" }}
      />
      <For
        each={filtered()}
        fallback={
          <div
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无 snippet
          </div>
        }
      >
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
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--paper-dark)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--paper-mid)")
            }
          >
            <div style={{ "font-weight": "700", "margin-bottom": "2px" }}>
              {s.label}
            </div>
            <div
              style={{
                "font-size": "var(--text-caption)",
                color: "var(--text-secondary)",
                "white-space": "pre-wrap",
              }}
            >
              {s.body.slice(0, 80)}…
            </div>
          </button>
        )}
      </For>
    </Modal>
  );
}

function SchedulePicker(props: {
  onPick: (when: Date) => void;
  onClose: () => void;
}) {
  const presets = [
    { label: "Later today", time: () => addHours(new Date(), 4) },
    {
      label: "Tomorrow 9 AM",
      time: () => {
        const d = addDays(new Date(), 1);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
    {
      label: "Monday 9 AM",
      time: () => {
        const d = nextWeekday(new Date(), 1);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
    {
      label: "Next Friday 9 AM",
      time: () => {
        const d = nextWeekday(new Date(), 5);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
  ];

  return (
    <Modal open onClose={props.onClose} title="安排发送时间" width="420px">
      <For each={presets}>
        {(p) => (
          <button
            onClick={() => {
              props.onPick(p.time());
              props.onClose();
            }}
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
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--paper-dark)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--paper-mid)")
            }
          >
            <Icon name="ph-clock" size={16} />
            <span style={{ flex: 1, "font-weight": "600" }}>{p.label}</span>
            <span
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
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

const windowBtn = {
  display: "inline-flex",
  "align-items": "center",
  "justify-content": "center",
  width: "28px",
  height: "28px",
  "border-radius": "var(--radius-pill)",
  background: "transparent",
  color: "var(--text-muted)",
  border: "none",
  cursor: "pointer",
} as const;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const unit = units[Math.min(i, units.length - 1)];
  const value = bytes / 1024 ** Math.min(i, units.length - 1);
  return `${value.toFixed(1)} ${unit}`;
}
