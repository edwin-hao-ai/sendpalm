/** Read Together view — triage unread emails one at a time.
 * Mirrors prototype-v11's read-together flow.
 *
 * Data shape: the unread list comes from `listMessagesPaged` with
 * `lightweight: true` so the IPC payload omits `body` and `body_html`
 * (the previous full `listMessages()` pulled ~80 KB/row of HTML into
 * the list even though only one card was on screen). The current
 * message's full body is fetched lazily via `getMessage(id)` and
 * rendered as a sanitized iframe when `body_html` is present, falling
 * back to the plain-text body otherwise.
 *
 * Write path contract: actions on the current card use the SCOPED
 * updaters (`markMessageUnread` / `setMessagePileFlags` /
 * `moveMessageToBucket`), never `upsertMessage(current())` — `current()`
 * falls back to the lightweight list row while `getMessage` is in
 * flight, and upserting that row would wipe the stored body
 * (2026-09-22 data-loss bug).
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import {
  listMessagesPaged,
  getMessage,
  listContacts,
  markMessageUnread,
  setMessagePileFlags,
  moveMessageToBucket,
} from "../stores/data";
import {
  setView,
  setComposeOpen,
  setComposeContext,
  showToast,
  appSettings,
} from "../stores/ui";
import { formatMessageDate } from "../utils/message-dates";
import { useAccountScope } from "../utils/use-account-scope";

/** Profile timezone for mail date labels (falls back to OS zone in helpers). */
const profileTz = () => appSettings.profile.timezone;

import { Avatar } from "../components/Avatar";
import { PageHeader } from "../components/PageHeader";
import { EmailBody } from "../components/EmailBody";
import { Icon } from "../components/Icon";
import { Empty, ErrorState } from "../components/Empty";
import { SkeletonList } from "../components/Skeleton";
import { getReadTogetherCandidates } from "../utils/triage";
import type { Contact, Message } from "../types";

const READ_TOGETHER_PAGE = 200;

/** Above this many unread cards, one-at-a-time reading stops being a
 *  kindness. A freshly imported mailbox can hold thousands of unread
 *  messages; clicking 「下一封」 through them is not "reading together", it's
 *  a treadmill. Batch mode is the honest default past this size.
 *
 *  500 is the point where even a fast reader at 10s/message is facing an
 *  hour-plus of clicking. */
const READ_TOGETHER_BATCH_THRESHOLD = 500;

/** Rows a batch screen renders (and flips to read) at a time. Bounded so the
 *  list stays instant and the undo payload stays small. */
const READ_TOGETHER_BATCH_PAGE = 50;

export function ReadTogether() {
  const [contacts] = createResource(listContacts);
  // Lightweight list (no body) — fast page load even for a busy mailbox.
  // The page is re-fetched after every action, so a mailbox with more
  // than READ_TOGETHER_PAGE unread messages simply keeps feeding new
  // cards into the flow; there is no silent truncation.
  // `total` is the real queue size. The loaded page is capped at
  // READ_TOGETHER_PAGE, so the batch-mode threshold must look at the total —
  // comparing against the page length would silently cap the decision at 200.
  const [unreadTotal, setUnreadTotal] = createSignal(0);
  // Scoped to the mailbox the user is reading. "一起读" is a mail queue, so
  // it follows the same 全部账户 / per-account selection as the Imbox — the
  // resource's source is the filter, which re-runs it when the tab changes.
  const accountScope = useAccountScope();
  const [unreadRaw, { refetch: refetchUnread }] = createResource(
    () => accountScope.scope(),
    async (scope): Promise<Message[]> => {
      const page = await listMessagesPaged({
        bucket: "imbox",
        direction: "in",
        unreadOnly: true,
        lightweight: true,
        limit: READ_TOGETHER_PAGE,
        offset: 0,
        ...scope,
      });
      setUnreadTotal(page.total);
      return page.items;
    },
  );
  const [index, setIndex] = createSignal(0);

  // `auto` follows the queue size; 逐封读 / 批量读 switch it explicitly.
  const [mode, setMode] = createSignal<"auto" | "single" | "batch">("auto");
  const [batchBusy, setBatchBusy] = createSignal(false);

  // Apply the same workflow / Gate filters the prototype uses so a
  // message the user has set aside, marked reply-later, or bubble-up'd
  // doesn't reappear here.
  // Newsletter skip: reading mode is for people. Promo/newsletter mail is
  // batch-consumed in Stream — a toggle keeps it out of the one-at-a-time
  // flow so 500 newsletters don't stand between you and real mail.
  const [skipNewsletter, setSkipNewsletter] = createSignal(false);

  const unread = createMemo<Message[]>(() => {
    const list = unreadRaw() ?? [];
    const candidates = getReadTogetherCandidates(list, contacts() ?? []);
    return skipNewsletter()
      ? candidates.filter((m) => !m.isNewsletter)
      : candidates;
  });

  /** Batch mode: forced by the user, or automatic past the threshold. */
  const batch = createMemo(
    () =>
      mode() === "batch" ||
      (mode() === "auto" && unreadTotal() > READ_TOGETHER_BATCH_THRESHOLD),
  );

  /** Flip a screenful of cards to read, with one undo for the batch. */
  const markBatchRead = async () => {
    const ids = unread()
      .slice(0, READ_TOGETHER_BATCH_PAGE)
      .map((m) => m.id);
    if (ids.length === 0) return;
    setBatchBusy(true);
    try {
      for (const id of ids) await markMessageUnread(id, false);
      undoToast(`已把 ${ids.length} 封标为已读`, async () => {
        for (const id of ids) await markMessageUnread(id, true);
      });
      await refetchAndAdvance();
    } finally {
      setBatchBusy(false);
    }
  };

  // The current card. The lightweight row is enough for the index/cursor
  // + sender info; we re-fetch the full row (with body/body_html) so the
  // iframe can render the real content.
  const currentId = createMemo(() => unread()[index()]?.id);
  const [currentFull] = createResource(
    currentId,
    // Batch mode never shows a body, so fetching one would undo the reason
    // the mode exists.
    async (id) => (id && !batch() ? await getMessage(id) : null),
  );

  // `.latest` keeps the previous message on screen while the next one
  // loads — without it the whole card unmounts and the user stares at a
  // blank page between messages (reported as "white flash + feels
  // laggy"). A slim progress hairline on the header signals the swap.
  const current = createMemo<Message | undefined>(
    () => currentFull.latest ?? unread()[index()],
  );

  // Prefetch the next full body in the background so advancing is
  // instant once the current one is resolved.
  createEffect(() => {
    if (batch()) return;
    const nextId = unread()[index() + 1]?.id;
    if (nextId) void getMessage(nextId).catch(() => {});
  });

  const contactMap = createMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts() ?? []) map.set(c.id, c);
    return map;
  });

  const currentContact = createMemo<Contact | undefined>(() => {
    const m = current();
    return m ? contactMap().get(m.pid) : undefined;
  });

  const close = () => {
    setIndex(0);
    setView("imbox");
  };

  /** Refetch the unread list after an action, then finish-or-stay.
   *  Every action removes the handled card from the unread candidates
   *  (read / reply-later / archived / trashed), so the NEXT card shifts
   *  into the current index — bumping the index here would skip one
   *  message per action. When the list drains (or the index runs off
   *  the end), close with a toast that names the action that just
   *  happened instead of the misleading bare "all caught up". */
  const refetchAndAdvance = async (doneMessage?: string) => {
    await refetchUnread();
    const list = unread();
    if (list.length === 0 || index() >= list.length) {
      close();
      showToast({
        message: doneMessage ?? "全部读完了",
        kind: "success",
      });
    }
  };

  const undoToast = (message: string, undo: () => Promise<void>) => {
    showToast({
      message,
      kind: "success",
      action: {
        label: "撤销",
        run: async () => {
          await undo();
          await refetchUnread();
        },
      },
    });
  };

  const markReadAndNext = async () => {
    const m = current();
    if (!m) return;
    await markMessageUnread(m.id, false);
    await refetchAndAdvance("已标为已读，全部读完了");
  };

  const replyLaterAndNext = async () => {
    const m = current();
    if (!m) return;
    await setMessagePileFlags(m.id, {
      replyLater: true,
      setAside: false,
      bubbleUpAt: null,
    });
    await markMessageUnread(m.id, false);
    undoToast("已加入稍后回复", async () => {
      await setMessagePileFlags(m.id, {
        replyLater: false,
        setAside: false,
        bubbleUpAt: null,
      });
      await markMessageUnread(m.id, true);
    });
    await refetchAndAdvance("已加入稍后回复，全部读完了");
  };

  const reply = () => {
    // Prefer the fully-loaded row so Compose quotes the real body; the
    // lightweight list row carries no body while getMessage is flying.
    const m = currentFull() ?? current();
    if (!m) return;
    setComposeContext({ mode: "reply", originalMsg: m });
    setComposeOpen(true);
    close();
  };

  const archive = async () => {
    const m = current();
    if (!m) return;
    await moveMessageToBucket(m.id, "paperTrail");
    undoToast("已归档到 Records", async () => {
      await moveMessageToBucket(m.id, "imbox");
    });
    await refetchAndAdvance("已归档到 Records，全部读完了");
  };

  const trash = async () => {
    const m = current();
    if (!m) return;
    await moveMessageToBucket(m.id, "trash");
    undoToast("已移到回收站", async () => {
      await moveMessageToBucket(m.id, "imbox");
    });
    await refetchAndAdvance("已移到回收站，全部读完了");
  };

  const handleKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "n" || e.key === " ") {
      e.preventDefault();
      void markReadAndNext();
    } else if (e.key === "p") {
      e.preventDefault();
      void replyLaterAndNext();
    } else if (e.key === "r") {
      e.preventDefault();
      reply();
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
      <Show
        when={!unreadRaw.error}
        fallback={
          <ErrorState
            title="加载失败，请重试"
            retry={() => void refetchUnread()}
          />
        }
      >
        <Show
          when={!unreadRaw.loading || unread().length > 0}
          fallback={
            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: "var(--space-5)",
              }}
            >
              <div style={{ "max-width": "960px", margin: "0 auto" }}>
                <SkeletonList count={1} height={320} />
              </div>
            </div>
          }
        >
          <Show
            when={current()}
            fallback={
              <Empty
                icon="ph-check-circle"
                title="全部读完了 🎉"
                description="没有未读邮件了。新邮件到了会出现在 Inbox。"
                action={{ label: "返回 Inbox", onClick: close }}
              />
            }
          >
            <div style={{ "border-bottom": "0.5px solid var(--border)" }}>
              <PageHeader
                titleOnMobile
                title="一起读"
                description={
                  <span
                    style={{
                      display: "inline-flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                    }}
                  >
                    <Show
                      when={batch()}
                      fallback={
                        <span>
                          第 {index() + 1} / {unread().length} 封
                        </span>
                      }
                    >
                      <span data-batch-copy>
                        待读 {unreadTotal()} 封 · 一次一封读不完
                      </span>
                    </Show>
                    <button
                      type="button"
                      data-skip-newsletter
                      aria-pressed={skipNewsletter()}
                      onClick={() => {
                        setSkipNewsletter(!skipNewsletter());
                        setIndex(0);
                      }}
                      style={{
                        padding: "1px 10px",
                        "border-radius": "var(--radius-pill)",
                        border: "none",
                        background: skipNewsletter()
                          ? "var(--palm-soft)"
                          : "var(--paper-mid)",
                        color: skipNewsletter()
                          ? "var(--palm)"
                          : "var(--text-secondary)",
                        "font-size": "var(--text-micro)",
                        "font-weight": 700,
                        cursor: "pointer",
                      }}
                    >
                      跳过订阅邮件
                    </button>
                  </span>
                }
                actions={
                  <>
                  <Show when={!batch() && unreadTotal() > READ_TOGETHER_BATCH_THRESHOLD}>
                    <button
                      data-batch-enter
                      onClick={() => setMode("batch")}
                      title="一次一屏地读"
                      style={{
                        padding: "6px 14px",
                        "border-radius": "var(--radius-pill)",
                        border: "0.5px solid var(--border)",
                        background: "var(--paper-mid)",
                        color: "var(--text-secondary)",
                        "font-size": "var(--text-caption)",
                        "font-weight": 700,
                        "min-height": "36px",
                        cursor: "pointer",
                      }}
                    >
                      批量读
                    </button>
                  </Show>
                  <Show when={batch()}>
                    <button
                      data-batch-single
                      onClick={() => setMode("single")}
                      title="改为逐封读"
                      style={{
                        padding: "6px 14px",
                        "border-radius": "var(--radius-pill)",
                        border: "0.5px solid var(--border)",
                        background: "var(--paper-mid)",
                        color: "var(--text-secondary)",
                        "font-size": "var(--text-caption)",
                        "font-weight": 700,
                        "min-height": "36px",
                        cursor: "pointer",
                      }}
                    >
                      逐封读
                    </button>
                  </Show>
                  <button
                    onClick={close}
                    title="关闭一起读"
                    aria-label="关闭一起读"
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
                  </>
                }
              />
            </div>

            <div
              style={{
                flex: 1,
                overflow: "auto",
                // A default macOS overlay scrollbar sits on top of the card's
                // right edge and reads as a foreign UI element. A thin,
                // colour-matched rail is quieter and does not overlap text.
                "scrollbar-width": "thin",
                "scrollbar-color": "var(--border-strong) transparent",
                padding: "var(--space-5)",
                display: "flex",
                "flex-direction": "column",
              }}
            >
              <Show when={batch()}>
                <BatchTriage
                  items={unread()}
                  contactOf={(m) => contactMap().get(m.pid)}
                  busy={batchBusy()}
                  onMarkRead={() => void markBatchRead()}
                />
              </Show>
              <Show when={!batch()}>
              <div
                style={{
                  // Wide reading column: emails at 680px waste half of a
                  // desktop window and feel "cramped into a postcard".
                  "max-width": "960px",
                  width: "100%",
                  // Fill the viewport vertically: a short email used to end
                  // mid-screen leaving a dead void before the action bar
                  // (worst on small laptops). The card now stretches like a
                  // sheet of paper and the actions sit right under it.
                  flex: 1,
                  margin: "0 auto",
                  background: "var(--paper-light)",
                  border: "0.5px solid var(--border)",
                  "border-radius": "var(--radius-lg)",
                  padding: "var(--space-5)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-3)",
                    // Compressed: the sender block + H3 subject stacked up to
                    // ~200px before the body on a laptop, so the first
                    // paragraph of every card fell below the fold.
                    "margin-bottom": "var(--space-2)",
                  }}
                >
                  <Avatar
                    name={currentContact()?.name ?? "?"}
                    src={currentContact()?.avatar}
                    size={36}
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
                      {currentContact()?.name ?? "未知发件人"}
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
                      {currentContact()?.emails[0]?.value ?? "—"}
                    </div>
                  </div>
                  <span
                    style={{
                      "font-size": "var(--text-caption)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {formatMessageDate(current()!, profileTz(), "list").primary.value}
                  </span>
                </div>

                <h2
                  style={{
                    "font-family": "var(--font-display)",
                    "font-size": "var(--text-h3)",
                    "font-weight": "800",
                    color: "var(--text-primary)",
                    margin: "0 0 var(--space-4)",
                  }}
                >
                  {current()!.subj}
                </h2>

                {/* One renderer for every surface. This card had its own
                    iframe with `sandbox=""`, which cannot read
                    contentDocument — so its auto-size silently never worked
                    and long mail scrolled inside a 240px box. */}
                <EmailBody
                  message={current()!}
                  minHeight={240}
                  trustSender={!currentContact()?.blocked}
                />
              </div>
              </Show>
            </div>

            <Show when={!batch()}>
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                "flex-wrap": "wrap",
                gap: "var(--space-3)",
                padding: "var(--space-4) var(--space-5)",
                "border-top": "0.5px solid var(--glass-border)",
                background: "var(--glass-bg)",
                "backdrop-filter": "var(--glass-blur)",
                "-webkit-backdrop-filter": "var(--glass-blur)",
              }}
            >
              <ActionBtn
                icon="ph-check"
                label="下一封"
                primary
                title="标为已读并看下一封 (n)"
                onClick={() => void markReadAndNext()}
              />
              <ActionBtn
                icon="ph-arrow-u-up-left"
                label="回复"
                title="回复 (r)"
                onClick={reply}
              />
              <ActionBtn
                icon="ph-clock"
                label="稍后"
                title="加入稍后回复 (p)"
                onClick={() => void replyLaterAndNext()}
              />
              <ActionBtn
                icon="ph-tray"
                label="归档"
                title="归档到 Records"
                onClick={() => void archive()}
              />
              <ActionBtn
                icon="ph-trash"
                label="删除"
                title="移到回收站"
                onClick={() => void trash()}
              />
            </div>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

/** Batch mode — a screenful of one-line cards instead of one card at a time.
 *
 *  Reading 3,000 messages one by one is not a feature, it's a treadmill. This
 *  keeps the same single-column sheet and the same 「标为已读」 mental model,
 *  just with fifty rows per screen and one undo for the batch. Bodies are
 *  never fetched here: that is the entire point of the mode. */
function BatchTriage(props: {
  items: Message[];
  contactOf: (m: Message) => Contact | undefined;
  busy: boolean;
  onMarkRead: () => void;
}) {
  const rows = () => props.items.slice(0, READ_TOGETHER_BATCH_PAGE);
  return (
    <div
      data-batch-triage
      style={{
        flex: 1,
        display: "flex",
        "flex-direction": "column",
        "min-height": 0,
      }}
    >
      <div style={{ flex: 1, overflow: "auto", padding: "var(--space-3)" }}>
        <div
          style={{
            "max-width": "960px",
            margin: "0 auto",
            background: "var(--paper-light)",
            border: "0.5px solid var(--border)",
            "border-radius": "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <For each={rows()}>
            {(m) => (
              <div
                data-batch-row={m.id}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-3) var(--space-4)",
                  "border-bottom": "0.5px solid var(--border)",
                }}
              >
                <Avatar name={props.contactOf(m)?.name ?? "?"} size={32} />
                <div style={{ flex: 1, "min-width": 0 }}>
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                    }}
                  >
                    <strong
                      style={{
                        "font-size": "var(--text-body-sm)",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                        "white-space": "nowrap",
                      }}
                    >
                      {props.contactOf(m)?.name ?? m.pid}
                    </strong>
                    <span
                      style={{
                        "font-size": "var(--text-micro)",
                        color: "var(--text-muted)",
                        "white-space": "nowrap",
                      }}
                    >
                      {formatMessageDate(m, profileTz(), "list").primary.value}
                    </span>
                  </div>
                  <div
                    style={{
                      "font-size": "var(--text-caption)",
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
                    }}
                  >
                    {m.subj || "(无主题)"}
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          gap: "var(--space-3)",
          padding: "var(--space-4) var(--space-5)",
          "border-top": "0.5px solid var(--glass-border)",
          background: "var(--glass-bg)",
        }}
      >
        <button
          data-batch-mark-read
          onClick={props.onMarkRead}
          disabled={props.busy || rows().length === 0}
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "6px",
            padding: "12px 18px",
            "min-height": "44px",
            "border-radius": "var(--radius-md)",
            border: "none",
            background: "var(--palm)",
            color: "#fff",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
            cursor: props.busy ? "default" : "pointer",
            opacity: props.busy ? 0.6 : 1,
          }}
        >
          <Icon name="ph-check" size={16} />这 {rows().length} 封标为已读
        </button>
      </div>
    </div>
  );
}

function ActionBtn(props: {
  icon: string;
  label: string;
  title: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      aria-label={props.title}
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "6px",
        padding: "12px 18px",
        "min-height": "44px",
        "border-radius": "var(--radius-md)",
        border: props.primary ? "none" : "0.5px solid var(--border)",
        background: props.primary ? "var(--palm)" : "var(--paper-mid)",
        color: props.primary ? "white" : "var(--text-secondary)",
        "font-size": "var(--text-caption)",
        "font-weight": "700",
        cursor: "pointer",
      }}
    >
      <Icon name={props.icon} size={16} />
      {props.label}
    </button>
  );
}
