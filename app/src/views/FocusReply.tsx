/** Focus & Reply view — HEY-style distraction-free reply flow.
 * Lists every message parked in the Pending pile (reply_later = 1)
 * with an inline draft textarea.
 *
 * Data contract: the list comes from the scoped `listFocusReplyMessages`
 * query (reply_later = 1, trash/spam excluded, body included, body_html
 * omitted, LIMIT-bounded). The previous full-table `listMessages()` pull
 * was the §11.7 OOM pattern — ~360 MB across the IPC bridge on a real
 * mailbox.
 *
 * Draft contract: user edits are debounced into the `drafts` table
 * (id `focus-<messageId>`, status "edited") so switching views and
 * coming back restores the text (SolidJS <Switch> unmounts this view).
 * Send / Done delete the draft; Skip keeps it (the message stays in
 * Pending, so the draft stays too — matches the prototype's aiDraft
 * lifecycle).
 */

import {
  For,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import {
  listFocusReplyMessages,
  listContacts,
  getDraft,
  upsertDraft,
  deleteDraft,
  setMessagePileFlags,
  markMessageUnread,
} from "../stores/data";
import {
  setView,
  setComposeOpen,
  setComposeContext,
  showToast,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { ErrorState } from "../components/Empty";
import { ResourceGate } from "../components/ResourceGate";
import { SkeletonList } from "../components/Skeleton";
import { sendEmailViaBackend } from "../services/backend";
import { generateAiDraft } from "../utils/draft";
import { getFocusReplyCandidates } from "../utils/triage";
import type { Contact, Draft, Message } from "../types";

export function FocusReply() {
  const [contacts] = createResource(listContacts);
  const [messages, { refetch: refetchMessages }] = createResource(() =>
    listFocusReplyMessages(),
  );
  const [completedIds, setCompletedIds] = createSignal<Set<string>>(new Set());

  const contactMap = createMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts() ?? []) map.set(c.id, c);
    return map;
  });

  const replyLater = createMemo<Message[]>(() =>
    getFocusReplyCandidates(messages() ?? [], completedIds()),
  );

  const pendingCount = createMemo(() => replyLater().length);

  const close = () => {
    setCompletedIds(new Set<string>());
    setView("imbox");
  };

  const handleKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  document.addEventListener("keydown", handleKey);
  onCleanup(() => document.removeEventListener("keydown", handleKey));

  return (
    <div
      style={{
        padding: "0",
        animation: "view-enter 0.3s var(--ease-out) both",
        height: "100%",
        display: "flex",
        "flex-direction": "column",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          gap: "var(--space-3)",
          padding: "var(--space-4) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
        }}
      >
        <div>
          <h1
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h1)",
              "font-weight": "800",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            专注回复
          </h1>
          <p
            style={{
              margin: "2px 0 0",
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            {pendingCount()} 封待回复
          </p>
        </div>
        <button
          onClick={close}
          title="关闭专注回复"
          aria-label="关闭专注回复"
          style={{
            display: "inline-flex",
            "align-items": "center",
            "justify-content": "center",
            width: "44px",
            height: "44px",
            "border-radius": "var(--radius-pill)",
            background: "var(--paper-mid)",
            color: "var(--text-secondary)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Icon name="ph-x" size={18} />
        </button>
      </div>

      <ResourceGate
        resource={messages}
        isLoading={() => messages.loading || contacts.loading}
        loading={
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "var(--space-4) var(--space-5)",
            }}
          >
            <div
              style={{
                "max-width": "720px",
                margin: "0 auto",
                display: "flex",
                "flex-direction": "column",
                gap: "var(--space-4)",
              }}
            >
              <SkeletonList count={2} height={180} />
            </div>
          </div>
        }
        errorView={() => (
          <ErrorState
            title="加载失败，请重试"
            retry={() => void refetchMessages()}
          />
        )}
        empty={
          <DoneState
            onBack={() => {
              setCompletedIds(new Set<string>());
              setView("imbox");
            }}
          />
        }
        isEmpty={() => pendingCount() === 0}
      >
        {() => (
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "var(--space-4) var(--space-5)",
            }}
          >
            <div
              style={{
                display: "flex",
                "flex-direction": "column",
                gap: "var(--space-4)",
                "max-width": "720px",
                margin: "0 auto",
              }}
            >
              <For each={replyLater()}>
                {(m, i) => (
                  <FocusReplyItem
                    m={m}
                    contact={contactMap().get(m.pid)}
                    index={i()}
                    onChange={async () => {
                      await refetchMessages();
                    }}
                    onComplete={(id) => {
                      setCompletedIds((prev) => new Set([...prev, id]));
                    }}
                  />
                )}
              </For>
            </div>
          </div>
        )}
      </ResourceGate>
    </div>
  );
}

function FocusReplyItem(props: {
  m: Message;
  contact?: Contact;
  index: number;
  onChange: () => Promise<void>;
  onComplete: (id: string) => void;
}) {
  const fromEmail = () =>
    props.contact?.emails[0]?.value ?? props.contact?.name ?? "";
  const replySubject = () =>
    `Re: ${props.m.subj.replace(/^Re:\s*/i, "").trim()}`;

  const generatedDraft = generateAiDraft(props.m, props.contact, fromEmail());
  const [draft, setDraft] = createSignal(generatedDraft);
  const [sending, setSending] = createSignal(false);
  // True once the user has typed into the textarea — only user edits are
  // persisted (auto-generated drafts don't belong in the Drafts view).
  let dirty = false;

  const draftId = `focus-${props.m.id}`;

  const draftRow = (): Draft => ({
    id: draftId,
    recipient: fromEmail(),
    subject: replySubject(),
    body: draft(),
    lastEdited: new Date().toISOString(),
    status: "edited",
    accountId: props.m.ac,
  });

  // Restore a previously-saved edit over the generated draft. Only
  // applied if the user hasn't typed yet this session.
  onMount(() => {
    void getDraft(draftId).then((saved) => {
      if (saved && !dirty) setDraft(saved.body);
    });
  });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const persistNow = async (): Promise<Draft> => {
    const d = draftRow();
    await upsertDraft(d);
    return d;
  };
  const schedulePersist = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void persistNow().catch((err: unknown) =>
        console.error("[focus-reply] draft persist failed:", err),
      );
    }, 500);
  };
  onCleanup(() => {
    // Flush a pending debounced write so leaving the view mid-typing
    // doesn't lose the last half-second of edits.
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
      void persistNow().catch((err: unknown) =>
        console.error("[focus-reply] draft flush failed:", err),
      );
    }
  });

  const clearFlags = async () => {
    // Scoped updates only — `props.m` is a body_html-less row from
    // listFocusReplyMessages and must never be round-tripped through
    // upsertMessage.
    await setMessagePileFlags(props.m.id, {
      replyLater: false,
      setAside: false,
      bubbleUpAt: null,
    });
    await markMessageUnread(props.m.id, false);
  };

  const send = async () => {
    const body = draft().trim();
    if (!body) {
      showToast({ message: "没有可发送的内容", kind: "warning" });
      return;
    }
    const to = fromEmail();
    if (!to.includes("@")) {
      showToast({
        message: "该联系人没有邮箱地址，无法发送",
        kind: "warning",
      });
      return;
    }
    setSending(true);
    try {
      const result = await sendEmailViaBackend(
        to,
        replySubject(),
        body,
        props.m.ac,
      );
      if (result) {
        await clearFlags();
        await deleteDraft(draftId);
        props.onComplete(props.m.id);
        showToast({ message: `已回复 ${to}`, kind: "success" });
      } else {
        showToast({
          message: "尚未绑定邮箱账户，回复未发送。草稿已保存。",
          kind: "info",
        });
      }
    } catch (err) {
      console.error("[focus-reply] send failed:", err);
      showToast({ message: "发送失败，请重试", kind: "error" });
    } finally {
      setSending(false);
    }
    await props.onChange();
  };

  const regenerate = () => {
    setDraft(generateAiDraft(props.m, props.contact, fromEmail()));
    dirty = false;
    // The regenerated text replaces any saved edit.
    void deleteDraft(draftId).catch(() => undefined);
  };

  const editInCompose = async () => {
    // Persist first so Compose opens with the user's edited text, not
    // the auto-generated one (Compose reads ctx.draft when present).
    let d: Draft | undefined;
    try {
      d = await persistNow();
    } catch (err) {
      console.error("[focus-reply] draft persist failed:", err);
    }
    setComposeContext({
      mode: "reply",
      originalMsg: props.m,
      draft: d,
    });
    setComposeOpen(true);
  };

  const skip = () => {
    props.onComplete(props.m.id);
    showToast({
      message: "已跳过，这封仍留在「稍后回复」里",
      kind: "info",
      ttlMs: 2500,
    });
  };

  const done = async () => {
    await clearFlags();
    await deleteDraft(draftId).catch(() => undefined);
    props.onComplete(props.m.id);
    await props.onChange();
    showToast({ message: "已标记为完成", kind: "success" });
  };

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-3)",
        animation: "list-item-enter 0.35s var(--ease-out) both",
        "animation-delay": `${props.index * 60}ms`,
      }}
    >
      {/* Original message card */}
      <div
        style={{
          background: "var(--paper-light)",
          border: "0.5px solid var(--border)",
          "border-radius": "var(--radius-lg)",
          padding: "var(--space-4)",
        }}
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-3)",
            "margin-bottom": "var(--space-3)",
          }}
        >
          <Avatar
            name={props.contact?.name ?? "?"}
            src={props.contact?.avatar}
            size={40}
          />
          <div style={{ flex: 1, "min-width": 0 }}>
            <div
              style={{
                "font-weight": "700",
                color: "var(--text-primary)",
                "white-space": "nowrap",
                overflow: "hidden",
                "text-overflow": "ellipsis",
              }}
            >
              {props.contact?.name ?? "未知发件人"}
            </div>
            <div
              style={{
                "font-size": "var(--text-caption)",
                color: "var(--text-muted)",
                "white-space": "nowrap",
                overflow: "hidden",
                "text-overflow": "ellipsis",
              }}
            >
              {fromEmail() || "—"}
            </div>
          </div>
          <span
            style={{
              "font-size": "var(--text-caption)",
              color: "var(--text-muted)",
            }}
          >
            {props.m.tm}
          </span>
        </div>
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h4)",
            "font-weight": "700",
            color: "var(--text-primary)",
            margin: "0 0 var(--space-3)",
          }}
        >
          {props.m.subj}
        </h2>
        <div
          style={{
            color: "var(--text-secondary)",
            "font-size": "var(--text-body)",
            "line-height": "1.6",
            "overflow-wrap": "anywhere",
          }}
        >
          <For each={props.m.body.split(/\n\s*\n/)}>
            {(p) =>
              p.trim() ? <p style={{ margin: "0 0 14px" }}>{p.trim()}</p> : null
            }
          </For>
        </div>
      </div>

      {/* Reply draft card */}
      <div
        style={{
          background: "var(--paper-light)",
          border: "0.5px solid var(--border)",
          "border-radius": "var(--radius-lg)",
          padding: "var(--space-4)",
        }}
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-2)",
            "margin-bottom": "var(--space-3)",
            color: "var(--agent)",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
          }}
        >
          <Icon name="ph-sparkle" size={16} />
          <span>SendPalm 起草的回复</span>
        </div>
        <textarea
          value={draft()}
          onInput={(e) => {
            setDraft(e.currentTarget.value);
            dirty = true;
            schedulePersist();
          }}
          placeholder="写下你的回复，或直接修改这份草稿…"
          style={{
            width: "100%",
            "min-height": "160px",
            padding: "var(--space-3)",
            "border-radius": "var(--radius-md)",
            border: "0.5px solid var(--border)",
            background: "var(--paper)",
            color: "var(--text-primary)",
            "font-family": "var(--font-body)",
            "font-size": "var(--text-body)",
            "line-height": "1.6",
            resize: "vertical",
            outline: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            "flex-wrap": "wrap",
            gap: "var(--space-2)",
            "margin-top": "var(--space-3)",
          }}
        >
          <ActionBtn
            icon="ph-paper-plane-right"
            label={sending() ? "发送中…" : "发送"}
            primary
            onClick={send}
            disabled={sending()}
          />
          <ActionBtn
            icon="ph-arrows-clockwise"
            label="重新生成"
            onClick={regenerate}
          />
          <ActionBtn
            icon="ph-pencil-simple"
            label="编辑"
            onClick={() => void editInCompose()}
          />
          <div style={{ flex: 1 }} />
          <ActionBtn icon="ph-check" label="完成" onClick={() => void done()} />
          <ActionBtn icon="ph-x" label="跳过" onClick={skip} />
        </div>
      </div>
    </div>
  );
}

function ActionBtn(props: {
  icon: string;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "6px",
        padding: "10px 14px",
        "min-height": "44px",
        "border-radius": "var(--radius-md)",
        border: props.primary ? "none" : "0.5px solid var(--border)",
        background: props.primary ? "var(--palm)" : "var(--paper-mid)",
        color: props.primary ? "white" : "var(--text-secondary)",
        "font-size": "var(--text-caption)",
        "font-weight": "700",
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
      }}
    >
      <Icon name={props.icon} size={14} />
      {props.label}
    </button>
  );
}

function DoneState(props: { onBack: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        gap: "var(--space-4)",
        color: "var(--text-secondary)",
        "text-align": "center",
        padding: "var(--space-5)",
      }}
    >
      <Icon name="ph-check-circle" size={64} color="var(--palm)" />
      <h2
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h3)",
          "font-weight": "800",
          color: "var(--text-primary)",
          margin: 0,
        }}
      >
        全部回复完了 🎉
      </h2>
      <p style={{ margin: 0, color: "var(--text-muted)" }}>
        「稍后回复」里的邮件都处理完了。
      </p>
      <button
        onClick={props.onBack}
        style={{
          padding: "10px 20px",
          "min-height": "44px",
          background: "var(--palm)",
          color: "white",
          "border-radius": "var(--radius-pill)",
          "font-weight": "700",
          border: "none",
          cursor: "pointer",
        }}
      >
        返回 Imbox
      </button>
    </div>
  );
}
