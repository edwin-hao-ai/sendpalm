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
  listContactsForRecipient,
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
  setView,
  setSettingsTab,
} from "../stores/ui";
import { sendEmailViaBackend } from "../services/backend";
import type { Draft, ScheduledSend, Snippet } from "../types";
import { uid, arrayBufferToBase64 } from "../utils/id";
import { addHours, addDays, isoNow, nextWeekday } from "../utils/date";
import { formFactor } from "../utils/viewport";
import { htmlToPlainText, plainTextToHtml } from "../utils/html";
import { glassPanelStyle } from "../components/glass";

/** Email shape shared by the To/Cc/Bcc fields and the recipient pills. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First address in a comma-separated field that fails EMAIL_RE, if any. */
export function firstInvalidAddress(raw: string): string | null {
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (s && !EMAIL_RE.test(s)) return s;
  }
  return null;
}

/** Palm-green focus ring for compose fields — overrides the global
 *  `--blurple` :focus-visible outline inside the compose window so the
 *  composer matches the brand instead of looking like a generic form. */
const palmFocusHandlers = {
  onFocus: (e: FocusEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.outline = "2px solid var(--palm)";
    el.style.outlineOffset = "0";
    el.style.boxShadow = "0 0 0 3px var(--palm-glow)";
  },
  onBlur: (e: FocusEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.outline = "none";
    el.style.boxShadow = "none";
  },
};

/** SMTP providers commonly reject messages over ~25MB; warn early
 *  instead of letting a giant base64 blob ride the autosave loop. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

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
  const [accounts, { refetch: refetchAccounts }] =
    createResource(listAccounts);

  // Lightweight projection — the recipient picker only needs
  // id/name/emails/avatar. The previous `listContacts` pull
  // included notes/pattern/stageHistory/topics/labels/photo per
  // row, ~75-300 KB of payload that Compose never reads, plus 5
  // safeParse calls per row. With 1500 contacts that was 7500
  // JSON.parse calls + ~600 KB of unused payload on every Compose
  // open. The full Contact row is still fetched by the detail
  // panel when the user clicks a contact, so no data is lost —
  // just deferred to the point of use.
  const [contacts, { refetch: refetchContacts }] = createResource(
    listContactsForRecipient,
  );
  const [snippets, { refetch: refetchSnippets }] =
    createResource(listSnippets);

  /* Refetch accounts/contacts/snippets on every open — these resources
   * otherwise only fire once at App mount, so an account added in
   * Settings (or a contact created by a fresh IMAP sync) after boot
   * never reaches the composer: the dialog keeps showing the
   * "还没有绑定邮箱账户" empty state and reply prefills resolve the
   * sender to "" until a full reload. */
  createEffect(() => {
    if (!composeOpen()) return;
    void refetchAccounts();
    void refetchContacts();
    void refetchSnippets();
  });

  const defaultAccount = () =>
    (accounts() ?? []).find((a) => a.type === "email");
  const defaultAccountId = () => defaultAccount()?.id ?? "";
  const defaultFromAlias = () => {
    const a = defaultAccount();
    if (!a || a.type !== "email") return undefined;
    const df = a.settings?.defaultFrom;
    return df && df !== a.email ? df : undefined;
  };

  /** True only once the accounts resource has resolved AND there is no
   *  email account — while loading we don't gate anything. */
  const noEmailAccount = () =>
    accounts() !== undefined &&
    (accounts() ?? []).filter((a) => a.type === "email").length === 0;

  const goToAccountSettings = () => {
    setSettingsTab("accounts");
    setView("settings");
  };

  /* When the accounts resource resolves AFTER the draft was initialised
   * (first open of the session), the draft's accountId is still "".
   * Backfill it with the default account so the From row is never an
   * empty dropdown selection. */
  createEffect(() => {
    const list = accounts();
    if (!list) return;
    const d = draft();
    if (d.accountId) return;
    const first = list.find((a) => a.type === "email");
    if (first) setDraft({ ...d, accountId: first.id });
  });

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
      // P1-4: split each address on comma / semicolon / whitespace.
      // The old code did `[m.to, ...(m.cc ?? [])]` and joined with
      // ", " — but `m.to` is a single string like
      // "alice@x.com, bob@x.com" from IMAP, so the join dumped the
      // entire comma-joined blob into the Cc field. The recipient
      // then saw an invalid Cc header (one giant address with
      // embedded commas).
      // `m.cc`/`m.bcc` arrive as string[] (cc_json is parsed by
      // rowToMessage), `m.to` as a single string — accept both.
      const splitAddrs = (raw: unknown): string[] => {
        const parts =
          typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
        return parts
          .flatMap((s) => String(s).split(/[,;\s]+/))
          .map((s) => s.trim())
          .filter(Boolean);
      };
      const others = [...splitAddrs(m.to), ...splitAddrs(m.cc)]
        .filter((e) => e !== senderEmail)
        // Deduplicate while preserving order.
        .filter((e, i, arr) => arr.indexOf(e) === i);
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

  /* Reply/forward drafts built while the contacts resource was still
   * stale (App-mount cache from before the contact existed) get an
   * empty recipient and a "发件人: <>" quote. Once the fresh contact
   * list lands (see the refetch-on-open effect above), patch only the
   * broken fields — never a full rebuild, so anything the user typed
   * in the meantime survives. */
  createEffect(() => {
    const list = contacts();
    if (!list || !composeOpen()) return;
    const ctx = composeContext();
    const m = ctx.originalMsg;
    if (!m || ctx.mode === "new" || ctx.draft) return;
    const sender = list.find((c) => c.id === m.pid);
    const senderEmail = sender?.emails[0]?.value ?? "";
    if (!sender || !senderEmail) return;
    const d = draft();
    const fixes: Partial<DraftState> = {};
    if (
      (ctx.mode === "reply" || ctx.mode === "replyAll") &&
      !d.recipient.trim()
    ) {
      fixes.recipient = senderEmail;
    }
    if (d.body.includes("发件人: <>")) {
      fixes.body = d.body.replace(
        "发件人: <>",
        `发件人: ${sender.name} <${senderEmail}>`,
      );
    }
    if (Object.keys(fixes).length > 0) setDraft({ ...d, ...fixes });
  });

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
      if (file.size > MAX_ATTACHMENT_BYTES) {
        showToast({
          message: `「${file.name}」超过 25MB，建议改用文件链接发送`,
          kind: "warning",
        });
        continue;
      }
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

  /* Closing the window persists the draft first — the autosave timer
   * only fires every 4s, so a fast "type last sentence → close" would
   * otherwise silently drop the final keystrokes. */
  const closeCompose = async () => {
    await persistDraft();
    setComposeOpen(false);
    setComposeContext({ mode: "new", to: undefined, subject: undefined });
  };

  /* Esc minimizes (never discards). Pickers layered on top (snippet /
     schedule / send menu) handle their own Esc via Modal; when one of
     them is open we step aside so Esc closes only the topmost layer. */
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !composeOpen()) return;
      if (showSnippetPicker() || showSchedulePicker()) return;
      if (sendMenuOpen()) {
        setSendMenuOpen(false);
        return;
      }
      e.preventDefault();
      void toggleMinimize();
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  /* P1-6: Auto-title becomes a *suggestion*, not a forced overwrite.
   * Previously the effect ran on every body change and overwrote the
   * subject even when the user had manually cleared it to retype.
   * Now we:
   *   - show a non-destructive hint chip in the subject row
   *   - only auto-apply when the user hasn't typed anything yet
   *     (i.e. the field is still the placeholder-equivalent empty)
   *   - let the user click the chip to "Use" the suggestion
   */
  const [autoTitleSuggestion, setAutoTitleSuggestion] = createSignal<
    string | null
  >(null);
  createEffect(() => {
    const d = draft();
    const body = d.body.trim();
    if (d.subject.trim() || body.length < 8) {
      setAutoTitleSuggestion(null);
      return;
    }
    const firstLine = body.split(/\r?\n/).find((l) => l.trim()) ?? body;
    const title = firstLine.trim().slice(0, 60);
    setAutoTitleSuggestion(title || null);
  });

  /* P1-5: Autosave only when the draft is actually dirty.
   * Previously `if (composeOpen() && draft().body)` ran every 4s and
   * called persistDraft which did a full upsertDraft (including the
   * JSON-serialized attachments). For a 5 MB attachment, that was a
   * 1.25 MB/s sustained IO during a 30 min draft. Now we compare
   * against a serialised "last saved" snapshot and skip if equal.
   */
  let lastSavedSnapshot = "";
  const serializeForDirty = (d: DraftState): string =>
    JSON.stringify({
      r: d.recipient,
      c: d.cc,
      b: d.bcc,
      s: d.subject,
      y: d.body,
      a: d.accountId,
      f: d.fromAlias,
      at: d.attachments.length,
      // Skip the actual attachment bytes in the dirty check — we
      // only care if the user added/removed attachments, not whether
      // the binary content shifted. Re-saving the same attachments
      // is still wasteful but harmless.
    });
  const persistDraft = async (status: Draft["status"] = "edited") => {
    const d = draft();
    if (!d.recipient && !d.subject && !d.body) return;
    const snapshot = serializeForDirty(d);
    if (snapshot === lastSavedSnapshot && status === "edited") {
      // nothing changed since the last save; skip the IO.
      return;
    }
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
    lastSavedSnapshot = snapshot;
    setDraft({ ...d, savingState: "saved", lastSaved: Date.now() });
  };

  let saveTimer: number | undefined;
  onMount(() => {
    saveTimer = window.setInterval(() => {
      if (composeOpen()) void persistDraft();
    }, 4000);
    onCleanup(() => {
      if (saveTimer !== undefined) clearInterval(saveTimer);
    });
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
    const subject = d.subject || "(无主题)";
    const recipient = d.recipient.trim();
    if (noEmailAccount()) {
      showToast({
        message: "尚未绑定邮箱账户，无法发送",
        kind: "warning",
        action: { label: "去设置", run: goToAccountSettings },
      });
      return;
    }
    const hasRecipient = recipient
      .split(",")
      .map((s) => s.trim())
      .some((s) => EMAIL_RE.test(s));
    if (!hasRecipient) {
      showToast({ message: "请输入收件人地址", kind: "warning" });
      return;
    }
    const badCc = firstInvalidAddress(d.cc);
    if (badCc) {
      showToast({ message: `抄送地址「${badCc}」格式不正确`, kind: "warning" });
      return;
    }
    const badBcc = firstInvalidAddress(d.bcc);
    if (badBcc) {
      showToast({ message: `密送地址「${badBcc}」格式不正确`, kind: "warning" });
      return;
    }
    setSendMenuOpen(false);
    showToast({ message: "正在发送…", kind: "info", ttlMs: 2000 });
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
      void closeCompose();
      if (result) {
        const firstTo = recipient.split(",")[0]?.trim() ?? recipient;
        const createFollowUp = async () => {
          if (!result.local_message_id) {
            showToast({
              message: "这封邮件没有同步到本地，暂时无法创建跟进",
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
          message: `已发送给 ${firstTo}`,
          kind: "success",
          action: {
            label: "3 天后跟进",
            run: () => void createFollowUp(),
          },
        });
      } else {
        showToast({
          message: "尚未绑定邮箱账户，无法发送。草稿已保存。",
          kind: "info",
          action: { label: "去设置", run: goToAccountSettings },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast({
        message: "发送失败，请检查网络后重试",
        kind: "error",
        ttlMs: 8000,
        detail: msg,
      });
      // Keep modal open so user can retry.
      setSendMenuOpen(false);
    }
  };

  const saveAsDraft = async () => {
    await persistDraft("edited");
    setSendMenuOpen(false);
    showToast({ message: "已保存为草稿", kind: "success" });
    void closeCompose();
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
    void closeCompose();
    showToast({
      message: `已安排在 ${formatScheduleTime(when)} 发送`,
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
      ? "回复全部"
      : composeContext().mode === "reply"
        ? "回复"
        : composeContext().mode === "forward"
          ? "转发"
          : "新邮件";

  /** Send buttons stay clickable-looking when disabled; the wrapper
   *  explains WHY (a disabled <button> swallows click events). */
  const sendBlockReason = () => {
    if (noEmailAccount()) return "请先在设置中添加邮箱账户";
    if (!draft().recipient.trim()) return "请先填写收件人";
    return null;
  };

  const finePointer =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(pointer: fine)").matches ?? true);

  return (
    <Show when={composeOpen()}>
      <Portal mount={document.body}>
        {/* Scrim behind the floating composer. Clicking it minimizes
            (never discards) — the draft is persisted by minimize. */}
        <Show when={formFactor() !== "mobile"}>
          <div
            data-compose-scrim
            onClick={() => void toggleMinimize()}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(30,25,20,0.25)",
              "backdrop-filter": "blur(6px)",
              "-webkit-backdrop-filter": "blur(6px)",
              animation: "backdrop-fade-in 0.22s var(--ease-out) both",
            }}
          />
        </Show>
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
          {/* Header — mobile gets a grabber + 取消/发送 row; the desktop
              window controls (minimize / close) only render on precise
              pointers where a 28px hit target is usable. */}
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
              position: "relative",
            }}
          >
            <Show when={formFactor() === "mobile" && !composeMinimized()}>
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: "4px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "36px",
                  height: "4px",
                  "border-radius": "var(--radius-pill)",
                  background: "var(--border-strong)",
                }}
              />
            </Show>
            <Show when={formFactor() === "mobile" && !composeMinimized()}>
              <button
                onClick={() => void closeCompose()}
                style={{
                  padding: "6px 4px",
                  color: "var(--text-secondary)",
                  "font-size": "var(--text-caption)",
                  "font-weight": "600",
                  "min-height": "44px",
                }}
              >
                取消
              </button>
            </Show>
            <strong
              style={{
                flex: 1,
                "text-align":
                  formFactor() === "mobile" && !composeMinimized()
                    ? "center"
                    : "left",
                "font-size": "var(--text-body-sm)",
                "font-weight": "700",
              }}
            >
              {title()}
            </strong>
            <Show when={formFactor() === "mobile" && !composeMinimized()}>
              <button
                onClick={() => void sendNow()}
                style={{
                  padding: "6px 14px",
                  background: "var(--palm)",
                  color: "white",
                  "border-radius": "var(--radius-pill)",
                  "font-size": "var(--text-caption)",
                  "font-weight": "700",
                  "min-height": "36px",
                }}
              >
                发送
              </button>
            </Show>
            <Show when={finePointer || composeMinimized()}>
              <button
                onClick={toggleMinimize}
                aria-label={composeMinimized() ? "展开" : "最小化"}
                title={composeMinimized() ? "展开" : "最小化"}
                style={windowBtn}
              >
                <Icon
                  name={composeMinimized() ? "ph-corners-out" : "ph-minus"}
                  size={14}
                />
              </button>
              <button
                onClick={() => void closeCompose()}
                aria-label="关闭"
                title="关闭（草稿会自动保存）"
                style={windowBtn}
              >
                <Icon name="ph-x" size={14} />
              </button>
            </Show>
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
              <Show
                when={!noEmailAccount()}
                fallback={
                  <div
                    style={{
                      display: "flex",
                      "flex-direction": "column",
                      "align-items": "center",
                      "justify-content": "center",
                      gap: "var(--space-3)",
                      padding: "var(--space-6) var(--space-4)",
                      "text-align": "center",
                      height: "100%",
                    }}
                  >
                    <Icon
                      name="ph-envelope-simple"
                      size={40}
                      style={{ color: "var(--text-muted)" }}
                    />
                    <p
                      style={{
                        margin: 0,
                        color: "var(--text-secondary)",
                        "font-size": "var(--text-body-sm)",
                        "line-height": 1.6,
                      }}
                    >
                      还没有绑定邮箱账户，暂时无法写信。
                    </p>
                    <button
                      onClick={goToAccountSettings}
                      style={{
                        padding: "8px 18px",
                        background: "var(--palm)",
                        color: "white",
                        "border-radius": "var(--radius-pill)",
                        "font-size": "var(--text-caption)",
                        "font-weight": "700",
                      }}
                    >
                      去设置添加邮箱账户 →
                    </button>
                  </div>
                }
              >
              <div
                style={{
                  display: "flex",
                  "flex-direction": "column",
                  gap: "var(--space-3)",
                }}
              >
                {/* From */}
                <Field label="发件人">
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
                    {...palmFocusHandlers}
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
                <Field label="收件人" field="to">
                  <RecipientInput
                    value={draft().recipient}
                    onChange={(v) => setDraft({ ...draft(), recipient: v })}
                    placeholder="recipient@example.com"
                    contacts={contacts() ?? []}
                  />
                </Field>

                <Show when={showCc()}>
                  <Field label="抄送" field="cc">
                    <RecipientInput
                      value={draft().cc}
                      onChange={(v) => setDraft({ ...draft(), cc: v })}
                      placeholder="alice@example.com, bob@example.com"
                      contacts={contacts() ?? []}
                    />
                  </Field>
                </Show>

                <Show when={showBcc()}>
                  <Field label="密送" field="bcc">
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
                      添加抄送
                    </button>
                  </Show>
                  <Show when={!showBcc()}>
                    <button
                      onClick={() => setShowBcc(true)}
                      style={toggleBtnStyle}
                    >
                      添加密送
                    </button>
                  </Show>
                </div>

                {/* Subject + P1-6 auto-title suggestion chip */}
                <Field label="主题" field="subject">
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--space-2)",
                      "align-items": "center",
                    }}
                  >
                    <input
                      type="text"
                      value={draft().subject}
                      onInput={(e) =>
                        setDraft({ ...draft(), subject: e.currentTarget.value })
                      }
                      placeholder={draft().subject ? "" : "主题"}
                      {...palmFocusHandlers}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <Show when={!draft().subject.trim() && autoTitleSuggestion()}>
                      {(title) => (
                        <button
                          type="button"
                          data-testid="autotitle-suggestion"
                          onClick={() =>
                            setDraft({ ...draft(), subject: title() })
                          }
                          style={{
                            padding: "6px 10px",
                            background: "var(--palm-soft)",
                            color: "var(--palm)",
                            "border-radius": "var(--radius-pill)",
                            "font-size": "var(--text-caption)",
                            "font-weight": "600",
                            "white-space": "nowrap",
                            border: "0.5px solid var(--palm)",
                            "max-width": "60%",
                            overflow: "hidden",
                            "text-overflow": "ellipsis",
                          }}
                          title={`点击使用建议主题：${title()}`}
                        >
                          用此主题：{title()}
                        </button>
                      )}
                    </Show>
                  </div>
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
                  {...palmFocusHandlers}
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
                            aria-label={`移除附件 ${a.name}`}
                            title={`移除附件 ${a.name}`}
                            style={{
                              color: "var(--text-muted)",
                              padding: "6px",
                              "min-width": "28px",
                              "min-height": "28px",
                            }}
                          >
                            <Icon name="ph-x" size={14} />
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Signature — a quiet trailing line, not a floating card. */}
                <Show when={signature()}>
                  <div
                    style={{
                      "margin-top": "var(--space-2)",
                      padding: "var(--space-2) 0 0",
                      "border-top": "0.5px dashed var(--border)",
                      "font-size": "var(--text-caption)",
                      color: "var(--text-muted)",
                      "white-space": "pre-wrap",
                      "line-height": 1.5,
                    }}
                  >
                    {signature()}
                  </div>
                </Show>
              </div>
              </Show>
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
                title="插入片段"
              >
                <Icon name="ph-text-aa" size={14} /> 片段
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
              {/* Wrapper span: disabled <button> swallows clicks, so the
                  reason toast lives on the wrapper. */}
              <div
                style={{ position: "relative", display: "flex" }}
                onClick={() => {
                  const reason = sendBlockReason();
                  if (reason) showToast({ message: reason, kind: "info" });
                }}
                title={sendBlockReason() ?? "发送（⌘↵）"}
              >
                <button
                  onClick={() => void sendNow()}
                  disabled={!!sendBlockReason()}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-2)",
                    padding: "8px 14px",
                    background: sendBlockReason()
                      ? "var(--paper-dark)"
                      : "var(--palm)",
                    color: "white",
                    "border-radius":
                      "var(--radius-pill) 0 0 var(--radius-pill)",
                    "font-weight": "700",
                    "font-size": "var(--text-caption)",
                    opacity: sendBlockReason() ? 0.6 : 1,
                    border: "none",
                    cursor: sendBlockReason() ? "not-allowed" : "pointer",
                  }}
                >
                  <Icon name="ph-paper-plane-tilt" size={14} />
                  发送
                </button>
                <button
                  onClick={() => setSendMenuOpen(!sendMenuOpen())}
                  disabled={!!sendBlockReason()}
                  aria-label="发送选项"
                  title="发送选项"
                  style={{
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    width: "28px",
                    padding: "8px 0",
                    background: sendBlockReason()
                      ? "var(--paper-dark)"
                      : "var(--palm)",
                    color: "white",
                    "border-radius":
                      "0 var(--radius-pill) var(--radius-pill) 0",
                    "font-size": "var(--text-caption)",
                    opacity: sendBlockReason() ? 0.6 : 1,
                    border: "none",
                    "border-left": "1px solid rgba(255,255,255,0.35)",
                    cursor: sendBlockReason() ? "not-allowed" : "pointer",
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
    if (props.state === "saving") return "保存中…";
    if (props.state === "saved") return "草稿已保存";
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
        ...glassPanelStyle,
        "border-radius": "var(--radius-md)",
        "min-width": "180px",
        "z-index": 1,
      }}
    >
      <MenuItem
        icon="ph-paper-plane-tilt"
        label="立即发送"
        onClick={props.onSendNow}
      />
      <MenuItem icon="ph-clock" label="定时发送" onClick={props.onSchedule} />
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
      onFocus={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
      onBlur={(e) => (e.currentTarget.style.background = "transparent")}
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
    <Modal open onClose={props.onClose} title="选择片段" width="420px">
      <input
        autofocus
        value={q()}
        onInput={(e) => setQ(e.currentTarget.value)}
        placeholder="搜索片段…"
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
            还没有片段。在 设置 → 片段 里创建常用回复模板。
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
            onFocus={(e) =>
              (e.currentTarget.style.background = "var(--paper-dark)")
            }
            onBlur={(e) =>
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

/** zh-CN short date+time for schedule confirmations. */
export function formatScheduleTime(d: Date): string {
  return d.toLocaleString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Schedule picker presets — exported for tests. Times are computed
 *  relative to `now` so the tests can pin a fixed clock. */
export function schedulePresets(now: Date): { label: string; at: Date }[] {
  const later = addHours(now, 4);
  const tomorrow = addDays(now, 1);
  tomorrow.setHours(9, 0, 0, 0);
  const monday = nextWeekday(now, 1);
  monday.setHours(9, 0, 0, 0);
  const friday = nextWeekday(now, 5);
  friday.setHours(9, 0, 0, 0);
  return [
    { label: "今天稍后", at: later },
    { label: "明天 9:00", at: tomorrow },
    { label: "下周一 9:00", at: monday },
    { label: "下周五 9:00", at: friday },
  ];
}

/** Combine the custom date + time inputs into a Date; null when either
 *  half is missing or the result is not a valid future time. */
export function combineCustomSchedule(
  dateStr: string,
  timeStr: string,
  now = new Date(),
): Date | null {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(d.getTime())) return null;
  if (d <= now) return null;
  return d;
}

function SchedulePicker(props: {
  onPick: (when: Date) => void;
  onClose: () => void;
}) {
  const [customDate, setCustomDate] = createSignal("");
  const [customTime, setCustomTime] = createSignal("");

  const applyCustom = () => {
    const d = combineCustomSchedule(customDate(), customTime());
    if (!d) {
      showToast({ message: "请选择未来的日期和时间", kind: "warning" });
      return;
    }
    props.onPick(d);
    props.onClose();
  };

  return (
    <Modal open onClose={props.onClose} title="定时发送" width="420px">
      <For each={schedulePresets(new Date())}>
        {(p) => (
          <button
            onClick={() => {
              props.onPick(p.at);
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
            onFocus={(e) =>
              (e.currentTarget.style.background = "var(--paper-dark)")
            }
            onBlur={(e) =>
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
              {formatScheduleTime(p.at)}
            </span>
          </button>
        )}
      </For>
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          "align-items": "center",
          "margin-top": "var(--space-2)",
        }}
      >
        <input
          type="date"
          aria-label="发送日期"
          value={customDate()}
          onInput={(e) => setCustomDate(e.currentTarget.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          type="time"
          aria-label="发送时间"
          value={customTime()}
          onInput={(e) => setCustomTime(e.currentTarget.value)}
          style={{ ...inputStyle, width: "110px" }}
        />
        <button
          onClick={applyCustom}
          disabled={!customDate() || !customTime()}
          style={{
            padding: "8px 14px",
            background: "var(--palm)",
            color: "white",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
            opacity: customDate() && customTime() ? 1 : 0.4,
          }}
        >
          确认
        </button>
      </div>
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
