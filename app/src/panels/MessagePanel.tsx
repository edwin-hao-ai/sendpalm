/** MessagePanel — full message detail with thread, sticky notes, clips, follow-ups.
 * Spec: prototype-v11 §3.3 + P4 features.
 */

import {
  Show,
  For,
  createMemo,
  createResource,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
} from "solid-js";
import {
  getContact,
  getMessage,
  upsertSticky,
  deleteSticky,
  upsertFollowUp,
  upsertClip,
  upsertMessage,
  upsertContact,
  upsertDraft,
  moveMessageToBucket,
  listThreadMessages,
  listMessageNeighbours,
  listStickiesForMessage,
  listFollowUpsForMessage,
  listFilesByIds,
  listContactsByIds,
} from "../stores/data";
import {
  setDetailOpen,
  setSelectedMessageId,
  setComposeOpen,
  setComposeContext,
  showToast,
  setCalendarJumpTo,
  setView,
  setSelectedContactId,
  bumpRefreshTick,
  setAgentPanelOpen,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { glassPanelStyle } from "../components/glass";
import { Skeleton, SkeletonList } from "../components/Skeleton";
import { FollowUpPicker } from "../components/FollowUpPicker";
import { RemindPicker } from "../components/RemindPicker";
import { LabelPicker } from "../components/LabelPicker";
import { MovePicker } from "../components/MovePicker";
import { uid } from "../utils/id";
import { addDays, isoNow, relativeTime } from "../utils/date";
import { trackerSummary } from "../utils/trackers";
import type { Clip, Contact, FollowUp, Message, Sticky } from "../types";
import { useAgent } from "../agent/useAgent";
import {
  addCalendarEvent,
  getImageSenderPolicy,
  setImageSenderPolicy,
} from "../services/backend";
import { saveAttachment } from "../utils/save-attachment";
import { useRefreshEffect, useViewport } from "../utils/gestures";
import { notifyMessageUpdated } from "../services/sync-events";
import { formatMessageSource, messagePreview } from "./message-source";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  analyzeImages,
  extractExternalImageUrls,
  htmlEmailSrcdoc,
  plainTextToHtml,
  prefetchImages,
} from "../utils/html";

/** Click handler used by both the main panel's plain-text body and
 *  the per-message <MessageBodyIframe> fallback. Lives at module
 *  scope so the iframe child component can call it without prop
 *  drilling. Routed through the OS browser via Tauri's opener
 *  plugin, not window.open, so it picks up the user's default
 *  browser + handles the URL parsing correctly. */
function handlePlainTextLinkClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  e.preventDefault();
  e.stopPropagation();
  openUrl(a.href).catch(() => {});
}

type ViewMode = "rendered" | "plain" | "source";

export function MessagePanel(props: { messageId: string }) {
  const agent = useAgent();
  const { isMobile } = useViewport();
  const [message, { refetch: refetchMessage }] = createResource(
    () => props.messageId,
    getMessage,
  );
  const [contact, { refetch: refetchContact }] = createResource(
    () => message()?.pid ?? "",
    (pid) => getContact(pid),
  );
  // Scoped thread query: same threadId, or no-threadId + same pid.
  // Lightweight (no body) because the thread list is just navigation.
  const [threadMessages, { refetch: refetchThread }] = createResource(
    () => {
      const m = message();
      if (!m) return null;
      return { messageId: m.id, threadId: m.threadId, pid: m.pid };
    },
    async (key) => {
      if (!key) return [];
      // Pull full body — thread messages default to expanded (≤3) and
      // a missing body on the older sibling would blank the rendered
      // view. Threads are short by design so the extra bytes per row
      // are negligible compared to the message-panel scoped queries.
      const list = await listThreadMessages({ ...key, lightweight: false });
      // For the no-threadId case the SQL can't filter by
      // baseSubject() (no normalised-subject column yet). Filter in
      // TS against a much smaller set — only the same sender, not
      // the whole table.
      const cur = message();
      if (cur && !cur.threadId) {
        const target = baseSubject(cur.subj);
        return list.filter((m) => baseSubject(m.subj) === target);
      }
      return list;
    },
  );
  // Thread + current-message contacts. Batched in one IPC round-trip
  // so j/k through thread siblings doesn't trigger N separate
  // getContact() calls.
  const [threadContacts, { refetch: refetchThreadContacts }] = createResource(
    () => {
      const cur = message();
      const t = threadMessages() ?? [];
      const pids = new Set<string>();
      if (cur) pids.add(cur.pid);
      for (const m of t) pids.add(m.pid);
      return Array.from(pids);
    },
    async (pids) => (pids.length > 0 ? await listContactsByIds(pids) : []),
  );
  // Stickies + follow-ups scoped to the current message id.
  const [stickies, { refetch: refetchStickies }] = createResource(
    () => props.messageId,
    listStickiesForMessage,
  );
  const [followUps, { refetch: refetchFU }] = createResource(
    () => props.messageId,
    listFollowUpsForMessage,
  );
  // Attachments: only the file rows the current message references.
  // Sibling messages may have their own attachments, but the panel
  // only renders attachments for the current message — the sibling
  // thread view just shows a count.
  const [attachments, { refetch: refetchAttachments }] = createResource(
    () => {
      const m = message();
      if (!m) return null;
      return [...(m.attachments ?? [])];
    },
    async (ids) => (ids && ids.length > 0 ? await listFilesByIds(ids) : []),
  );
  // Neighbours for j/k navigation: prev/next in the full table by
  // timestamp. Returns lightweight rows — the body isn't needed, just
  // the id to navigate to.
  const [neighbours] = createResource(
    () => props.messageId,
    listMessageNeighbours,
  );

  const [viewMode, setViewMode] = createSignal<ViewMode>("rendered");
  const [expandedIds, setExpandedIds] = createSignal<Set<string>>(new Set());
  // Narrow-panel flag (<420px): the three-way view-mode toggle collapses
  // into a compact dropdown so it doesn't crush the header actions.
  const [panelNarrow, setPanelNarrow] = createSignal(false);
  let rootEl: HTMLDivElement | undefined;
  onMount(() => {
    if (!rootEl) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setPanelNarrow(w > 0 && w < 420);
    });
    ro.observe(rootEl);
    onCleanup(() => ro.disconnect());
  });

  // The current-message iframe is rendered by a per-message
  // <MessageBodyIframe> component defined later in this file. Each
  // thread message has its own component instance with its own
  // `iframeSrc` + `iframeReady` state, so opening a sibling message
  // in the thread shows THAT message's body — not the current
  // message's. The earlier single-iframeSrc signal (shared across
  // all iframes in the thread) was a pre-existing bug.

  // (handlePlainTextLinkClick moved to module scope below so the
  // per-message <MessageBodyIframe> can call it too.)

  useRefreshEffect(() => {
    void refetchMessage();
    void refetchContact();
    void refetchThread();
    void refetchThreadContacts();
    void refetchStickies();
    void refetchFU();
    void refetchAttachments();
  });

  createEffect(() => {
    const m = message();
    if (m && m.unread) {
      void upsertMessage({ ...m, unread: false }).then(() => {
        // Patch owning lists in place and refresh our own resource — no
        // global refreshTick, so the Imbox list does not refetch its whole
        // page when the user simply opens a message.
        notifyMessageUpdated(m.id, { unread: false });
        void refetchMessage();
      });
    }
  });

  const contactsById = createMemo<Record<string, Contact>>(() => {
    const map: Record<string, Contact> = {};
    for (const c of threadContacts() ?? []) map[c.id] = c;
    return map;
  });

  const currentMessage = createMemo<Message | null>(() => message() ?? null);

  // All messages in the same conversation, sorted oldest-first so the thread
  // reads top-down. The current message is included. The threadMessages
  // resource already excludes the current and (for the no-threadId case)
  // baseSubject-filters, so we just append the current and sort.
  const thread = createMemo<Message[]>(() => {
    const cur = currentMessage();
    if (!cur) return [];
    const sibs = threadMessages() ?? [];
    sibs.push(cur);
    sibs.sort((a, b) => (a.st ?? "").localeCompare(b.st ?? ""));
    return sibs;
  });

  const threadParticipants = createMemo(() => {
    const names = new Set<string>();
    for (const m of thread()) {
      const s = senderFor(m);
      names.add(s.name);
    }
    return [...names];
  });

  const isCurrent = (m: Message) => m.id === props.messageId;

  const isExpanded = (m: Message, index: number) => {
    if (viewMode() === "source") return true;
    const list = thread();
    if (list.length <= 3) return true;
    if (isCurrent(m)) return true;
    if (index >= list.length - 2) return true;
    return expandedIds().has(m.id);
  };

  const toggleExpanded = (m: Message) => {
    if (isCurrent(m)) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(m.id)) next.delete(m.id);
      else next.add(m.id);
      return next;
    });
  };

  function senderFor(m: Message): {
    name: string;
    email: string;
    isMe: boolean;
  } {
    if (m.direction === "out") {
      return { name: "我", email: "me@example.com", isMe: true };
    }
    const c = contactsById()[m.pid];
    if (c) {
      return {
        name: c.name,
        email: c.emails[0]?.value ?? "",
        isMe: false,
      };
    }
    return { name: "未知发件人", email: "", isMe: false };
  }

  function openContactFromMessage(m: Message, e: MouseEvent) {
    e.stopPropagation();
    const c = contactsById()[m.pid];
    if (!c) return;
    setSelectedContactId(c.id);
    setView("contacts");
  }

  const attachmentsFor = (m: Message) => {
    // Only the current message has its file rows loaded (see the
    // `attachments` resource). For thread siblings we just return
    // empty — the thread row doesn't render attachment previews
    // anyway, only a count via m.attachments.length.
    if (m.id !== currentMessage()?.id) return [];
    const ids = new Set(m.attachments ?? []);
    return (attachments() ?? []).filter((f) => ids.has(f.id));
  };

  const openCompose = (mode: "reply" | "replyAll" | "forward") => {
    const m = message();
    if (!m) return;
    setComposeContext({ mode, originalMsg: m });
    setComposeOpen(true);
  };

  const reply = () => openCompose("reply");
  const replyAll = () => openCompose("replyAll");
  const forward = () => openCompose("forward");

  const markUnread = async () => {
    const m = message();
    if (!m) return;
    await upsertMessage({ ...m, unread: true });
    await refetchMessage();
    // (no local list to refresh — global bumpRefreshTick below covers other views)
    bumpRefreshTick();
    showToast({ message: "已标为未读", kind: "success" });
  };

  const archiveMessage = async () => {
    const m = message();
    if (!m) return;
    await moveMessageToBucket(m.id, "paperTrail");
    // (no local list to refresh — global bumpRefreshTick below covers other views)
    bumpRefreshTick();
    showToast({ message: "已归档到 Records", kind: "success" });
  };

  const moveToTrash = async () => {
    const m = message();
    if (!m) return;
    const previousBucket = m.bucket;
    await moveMessageToBucket(m.id, "trash");
    // (no local list to refresh — global bumpRefreshTick below covers other views)
    bumpRefreshTick();
    setDetailOpen(false);
    setSelectedMessageId(null);
    showToast({
      message: "已移到回收站",
      kind: "success",
      action: {
        label: "撤销",
        run: async () => {
          // Fetch the fresh row — `m` was captured before the trash write,
          // so it still has the pre-trash deletedAt; using it as the
          // upsert base would persist trash's deletedAt back onto the
          // message and silently hide it from list views that filter on
          // deleted_at IS NULL.
          const current = await getMessage(m.id);
          if (!current) return;
          await upsertMessage({
            ...current,
            bucket: previousBucket,
            deletedAt: null,
          });
          // (no local list to refresh — global bumpRefreshTick below covers other views)
          bumpRefreshTick();
          showToast({ message: "已恢复到原位置", kind: "success" });
        },
      },
    });
  };

  const moveToSpam = async () => {
    const m = message();
    if (!m) return;
    await moveMessageToBucket(m.id, "spam");
    // (no local list to refresh — global bumpRefreshTick below covers other views)
    bumpRefreshTick();
    setDetailOpen(false);
    setSelectedMessageId(null);
    showToast({ message: "已移到垃圾邮件", kind: "success" });
  };

  const blockSender = async () => {
    const c = contact();
    if (!c) return;
    await upsertContact({
      ...c,
      blocked: true,
      screened: true,
      firstSeen: false,
    });
    // (no local list to refresh — global bumpRefreshTick below covers other views)
    bumpRefreshTick();
    setDetailOpen(false);
    setSelectedMessageId(null);
    showToast({ message: `已屏蔽 ${c.name}`, kind: "success" });
  };

  const saveAsDraft = async () => {
    const m = message();
    if (!m) return;
    await upsertDraft({
      id: uid("dr"),
      recipient: m.to ?? "",
      subject: m.subj,
      body: m.body || m.prev || "",
      lastEdited: new Date().toISOString(),
      status: "pending",
      accountId: m.ac ?? "",
      cc: m.cc,
      bcc: m.bcc,
    });
    showToast({ message: "已保存为草稿", kind: "success" });
  };

  const bucketLabel = (bucket: string) => {
    const map: Record<string, string> = {
      imbox: "Imbox",
      feed: "Stream",
      paperTrail: "Records",
      trash: "回收站",
      spam: "垃圾邮件",
    };
    return map[bucket] ?? bucket;
  };

  const moveToBucketDirect = async (bucket: Message["bucket"]) => {
    const m = message();
    if (!m) return;
    await moveMessageToBucket(m.id, bucket);
    // (no local list to refresh — global bumpRefreshTick below covers other views)
    bumpRefreshTick();
    setDetailOpen(false);
    setSelectedMessageId(null);
    showToast({ message: `已移到 ${bucketLabel(bucket)}`, kind: "success" });
  };

  const askAgentAboutMessage = async () => {
    const m = message();
    if (!m) return;
    await agent.newSession("message", m.id);
    setAgentPanelOpen(true);
    showToast({
      message: "已打开 Agent，可以询问关于这封邮件的问题",
      kind: "info",
    });
  };

  const openContact = () => {
    const c = contact();
    if (!c) return;
    setSelectedContactId(c.id);
    setView("contacts");
  };

  const summarizeMessage = async () => {
    const m = message();
    if (!m) return;
    await agent.newSession("message", m.id);
    agent.setChatInput("请总结这封邮件");
    setAgentPanelOpen(true);
    // Give the panel a tick to mount, then send the pre-filled prompt.
    setTimeout(async () => {
      await agent.sendChat();
    }, 100);
  };

  const copyMessage = async () => {
    const m = message();
    if (!m) return;
    const c = contact();
    const text = [
      `主题: ${m.subj}`,
      `发件人: ${c?.name ?? "未知"} <${c?.emails[0]?.value ?? ""}>`,
      `收件人: ${m.to ?? ""}`,
      `日期: ${m.tm}`,
      "",
      m.body || m.prev || "",
    ].join("\n");
    try {
      await writeText(text);
      showToast({ message: "已复制邮件内容", kind: "success" });
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        showToast({ message: "已复制邮件内容", kind: "success" });
      } catch {
        showToast({ message: "复制失败", kind: "error" });
      }
    }
  };

  const downloadMessage = () => {
    const m = message();
    if (!m) return;
    const c = contact();
    const text = [
      `主题: ${m.subj}`,
      `发件人: ${c?.name ?? "未知"} <${c?.emails[0]?.value ?? ""}>`,
      `收件人: ${m.to ?? ""}`,
      `日期: ${m.tm}`,
      "",
      m.body || m.prev || "",
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = m.subj
      .replace(/[^a-z0-9\u4e00-\u9fa5]/gi, "_")
      .slice(0, 40);
    a.href = url;
    a.download = `${safeName || "message"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ message: "邮件已下载", kind: "success" });
  };

  const toggleReplyLater = async () => {
    const m = message();
    if (!m) return;
    await upsertMessage({ ...m, replyLater: !m.replyLater });
    await refetchMessage();
    // (no local list to refresh — global bumpRefreshTick below covers other views)
    bumpRefreshTick();
    showToast({
      message: m.replyLater ? "已取消稍后回复" : "已标记稍后回复",
      kind: "success",
    });
  };

  const toggleSetAside = async () => {
    const m = message();
    if (!m) return;
    await upsertMessage({ ...m, setAside: !m.setAside });
    await refetchMessage();
    // (no local list to refresh — global bumpRefreshTick below covers other views)
    bumpRefreshTick();
    showToast({
      message: m.setAside ? "已取消搁置" : "已搁置",
      kind: "success",
    });
  };

  const bubbleUp = () => {
    setRemindPickerOpen(true);
  };

  const trackCount = () => {
    const m = message();
    if (!m) return 0;
    const summary = trackerSummary(m.body + " " + m.prev);
    return summary.count;
  };

  const trackerTypes = () => {
    const m = message();
    if (!m) return [];
    return trackerSummary(m.body + " " + m.prev).types;
  };

  const [trackerExpanded, setTrackerExpanded] = createSignal(false);

  /* ── Pull-to-navigate (iOS-Mail style) ─────────────────────────
   * At the top of a message, pulling DOWN advances to the next (newer)
   * message. At the bottom, pulling UP returns to the previous one.
   * The gesture only fires when the scroll container is already at the
   * edge, so normal reading is never interrupted.
   */
  let scrollEl: HTMLDivElement | undefined;
  const PULL_THRESHOLD = 90; // px of overscroll needed to commit
  const PULL_MAX = 140; // clamp visual stretch
  type PullKind = "down-next" | "up-prev" | null;
  const [pullKind, setPullKind] = createSignal<PullKind>(null);
  const [pullDist, setPullDist] = createSignal(0);
  let pullOrigin: "top" | "bottom" | null = null;
  let pullStartY = 0;
  let pullActivePointer: number | null = null;

  let heroEl: HTMLDivElement | undefined;

  // Neighbours for j/k navigation: prev/next in the full table by
  // timestamp. Returned by the neighbours resource as lightweight
  // rows (id + st + subj + pid + bucket). The pull-gesture fallback
  // also reads the subj from these.
  const nextMessage = () => neighbours()?.next ?? null;
  const prevMessage = () => neighbours()?.prev ?? null;

  function goNext() {
    const m = nextMessage();
    if (m) setSelectedMessageId(m.id);
  }
  function goPrev() {
    const m = prevMessage();
    if (m) setSelectedMessageId(m.id);
  }

  // Auto-scroll to top and replay the entry animation whenever the
  // displayed message changes.
  createEffect(() => {
    const _id = props.messageId; // track message id
    void _id;
    queueMicrotask(() => {
      if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: "smooth" });
      if (heroEl) {
        heroEl.style.animation = "none";
        void heroEl.offsetHeight;
        heroEl.style.animation =
          "message-detail-enter 0.28s var(--ease-out) both";
      }
    });
  });

  function atTop() {
    return !scrollEl || scrollEl.scrollTop <= 0;
  }
  function atBottom() {
    if (!scrollEl) return false;
    return (
      scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1
    );
  }

  function onPullPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse") return; // mouse scroll wheel already works
    if (e.button !== 0) return;
    if (!atTop() && !atBottom()) return;
    pullStartY = e.clientY;
    pullActivePointer = e.pointerId;
    pullOrigin = atTop() ? "top" : "bottom";
    setPullKind(pullOrigin === "top" ? "down-next" : "up-prev");
    setPullDist(0);
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPullPointerMove(e: PointerEvent) {
    if (pullActivePointer !== e.pointerId) return;
    if (!pullOrigin) return;
    if (pullOrigin === "top" && scrollEl && scrollEl.scrollTop > 0) {
      resetPull();
      return;
    }
    if (pullOrigin === "bottom" && !atBottom()) {
      resetPull();
      return;
    }
    const dy = e.clientY - pullStartY;
    let distance = 0;
    if (pullOrigin === "top" && dy > 0) distance = Math.min(dy, PULL_MAX);
    else if (pullOrigin === "bottom" && dy < 0)
      distance = Math.min(-dy, PULL_MAX);
    setPullDist(distance);
  }

  function onPullPointerUp(e: PointerEvent) {
    if (pullActivePointer !== e.pointerId) return;
    const distance = pullDist();
    const kind = pullKind();
    pullActivePointer = null;
    pullOrigin = null;
    if (distance >= PULL_THRESHOLD && kind) {
      setPullDist(PULL_MAX);
      setTimeout(() => {
        if (kind === "down-next") goNext();
        else goPrev();
        setPullKind(null);
        setPullDist(0);
      }, 160);
    } else {
      setPullDist(0);
      setPullKind(null);
    }
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function resetPull() {
    pullActivePointer = null;
    pullOrigin = null;
    setPullKind(null);
    setPullDist(0);
  }

  const stickyForMsg = createMemo<Sticky[]>(() =>
    (stickies() ?? []).filter((s) => s.msgId === props.messageId),
  );

  const addSticky = async () => {
    const body = prompt("写一条便签…");
    if (!body || !body.trim()) return;
    const s: Sticky = {
      id: uid("st"),
      msgId: props.messageId,
      body,
      createdAt: isoNow(),
    };
    await upsertSticky(s);
    await refetchStickies();
  };

  const removeSticky = async (id: string) => {
    await deleteSticky(id);
    await refetchStickies();
  };

  const addClip = async () => {
    const m = message();
    if (!m) return;
    const selection = window.getSelection()?.toString().trim();
    if (!selection) {
      showToast({
        message: "请先在邮件正文里选中文字，再点『更多 → 保存为 Clip』",
        kind: "info",
      });
      return;
    }
    const c: Clip = {
      id: uid("cl"),
      text: selection,
      msgId: m.id,
      contactId: m.pid,
      createdAt: isoNow(),
    };
    await upsertClip(c);
    showToast({ message: "已保存为 Clip", kind: "success" });
  };

  const fuForMsg = createMemo<FollowUp[]>(() =>
    (followUps() ?? []).filter((f) => f.msgId === props.messageId),
  );

  const [fuPickerOpen, setFuPickerOpen] = createSignal(false);
  const [remindPickerOpen, setRemindPickerOpen] = createSignal(false);
  const [labelOpen, setLabelOpen] = createSignal(false);
  const [moveOpen, setMoveOpen] = createSignal(false);

  onMount(() => {
    const onLabel = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { messageId?: string };
      if (detail.messageId === props.messageId) setLabelOpen(true);
    };
    const onMove = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { messageId?: string };
      if (detail.messageId === props.messageId) setMoveOpen(true);
    };
    window.addEventListener("sp:message:label", onLabel);
    window.addEventListener("sp:message:move", onMove);
    onCleanup(() => {
      window.removeEventListener("sp:message:label", onLabel);
      window.removeEventListener("sp:message:move", onMove);
    });
  });

  const addFollowUp = async (days: number) => {
    const fu: FollowUp = {
      id: uid("fu"),
      msgId: props.messageId,
      dueAt: addDays(new Date(), days).toISOString(),
      status: "pending",
    };
    await upsertFollowUp(fu);
    await refetchFU();
    showToast({ message: `跟进已设 · ${days} 天后`, kind: "success" });
  };
  void addFollowUp;

  const markFollowUpDone = async (id: string) => {
    const fu = (followUps() ?? []).find((x) => x.id === id);
    if (!fu) return;
    await upsertFollowUp({ ...fu, status: "done" });
    await refetchFU();
  };

  return (
    <div
      ref={(el) => (rootEl = el)}
      class="message-panel-root"
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        position: "relative",
        background: "var(--glass-bg)",
        "backdrop-filter": "var(--glass-blur)",
        "-webkit-backdrop-filter": "var(--glass-blur)",
        "box-shadow": "-12px 0 40px rgba(35, 28, 51, 0.08)",
        animation: "panel-slide 0.28s var(--ease-out) both",
      }}
    >
      <div
        style={{
          padding: "var(--space-3) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          background: "var(--glass-bg-strong)",
          position: "sticky",
          top: 0,
          "z-index": 2,
        }}
      >
        <button
          onClick={() => {
            setSelectedMessageId(null);
            setDetailOpen(false);
          }}
          aria-label="返回列表"
          title="返回列表"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong
          style={{
            "font-size": "var(--text-body-sm)",
            "font-weight": "700",
            "white-space": "nowrap",
            "flex-shrink": 0,
          }}
        >
          邮件
        </strong>
        <Show when={trackCount() > 0}>
          <button
            onClick={() => setTrackerExpanded(!trackerExpanded())}
            title={`已屏蔽 ${trackCount()} 个跟踪器`}
            style={{
              display: "inline-flex",
              "align-items": "center",
              gap: "4px",
              padding: "2px 8px",
              background: "rgba(255,59,48,0.1)",
              color: "var(--coral)",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-micro)",
              "font-weight": "700",
              cursor: "pointer",
            }}
          >
            <Icon name="ph-shield-check" size={11} />
            已屏蔽 {trackCount()} 个跟踪器
          </button>
        </Show>
        <div style={{ "margin-left": "auto" }} />
        <HeaderActions
          onSummarize={summarizeMessage}
          onCopy={copyMessage}
          onDownload={downloadMessage}
        />
        <ViewModeToggle
          mode={viewMode()}
          onChange={setViewMode}
          narrow={panelNarrow()}
        />
      </div>

      <Show when={trackerExpanded() && trackCount() > 0}>
        <div
          style={{
            padding: "var(--space-3) var(--space-5)",
            background: "rgba(255,59,48,0.04)",
            "border-bottom": "0.5px solid var(--border)",
            "font-size": "var(--text-caption)",
          }}
        >
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            检测到以下类型的跟踪器（已自动剥离）：
          </p>
          <div
            style={{
              display: "flex",
              "flex-wrap": "wrap",
              gap: "4px",
              "margin-top": "var(--space-2)",
            }}
          >
            <For each={trackerTypes()}>
              {(t) => (
                <span
                  style={{
                    padding: "2px 8px",
                    background: "var(--coral)",
                    color: "white",
                    "border-radius": "var(--radius-pill)",
                    "font-size": "10px",
                    "font-weight": "700",
                  }}
                >
                  {t}
                </span>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Message still loading (IPC round-trip + maybe DOMPurify).
          Show a real skeleton — the previous version was just an empty
          space below the header, so the user saw a blank box and didn't
          know if anything was happening. The skeleton mirrors the
          MessageCard layout (avatar + 2 text lines + a long body
          block) so there's no layout shift when the real content
          arrives. */}
      <Show when={!message()}>
        <MessagePanelSkeleton />
      </Show>

      <Show when={message() && contact()}>
        <div
          ref={(el) => (scrollEl = el)}
          onPointerDown={onPullPointerDown}
          onPointerMove={onPullPointerMove}
          onPointerUp={onPullPointerUp}
          onPointerCancel={onPullPointerUp}
          style={{
            padding: "var(--space-5)",
            flex: 1,
            "overflow-y": "auto",
            "overscroll-behavior": "contain",
            // Only apply a transform during an active pull gesture. Leaving
            // `transform: translateY(0)` + a 420ms transition on at all
            // times was making the browser promote the scroll container
            // onto its own compositor layer and visibly slowed native
            // scroll on dense message bodies.
            transform: pullKind()
              ? `translateY(${
                  pullKind() === "down-next"
                    ? pullDist() * 0.55
                    : -pullDist() * 0.55
                }px)`
              : undefined,
            transition:
              pullActivePointer === null
                ? "transform 0.42s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
                : "none",
            "touch-action": "pan-y",
          }}
        >
          {/* Hero */}
          <div
            ref={(el) => (heroEl = el)}
            onClick={openContact}
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-3)",
              "margin-bottom": "var(--space-2)",
              animation: "message-detail-enter 0.28s var(--ease-out) both",
              cursor: "pointer",
            }}
          >
            <Avatar name={contact()!.name} src={contact()!.avatar} size={40} />
            <div>
              <strong>{contact()!.name}</strong>
              <div
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                }}
              >
                {contact()!.emails[0]?.value ?? ""}
              </div>
            </div>
          </div>

          <h3
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h4)",
              "font-weight": "800",
              margin: 0,
              "margin-bottom": "var(--space-2)",
              "text-wrap": "balance",
              "word-break": "keep-all",
              "overflow-wrap": "anywhere",
            }}
          >
            {message()!.subj}
          </h3>

          {/* Participant chips */}
          <Show when={threadParticipants().length > 1}>
            <div
              style={{
                display: "flex",
                "flex-wrap": "wrap",
                gap: "6px",
                "margin-bottom": "var(--space-4)",
              }}
            >
              <For each={threadParticipants()}>
                {(name) => (
                  <span
                    style={{
                      padding: "3px 10px",
                      background: "var(--paper-mid)",
                      "border-radius": "var(--radius-pill)",
                      "font-size": "var(--text-caption)",
                      color: "var(--text-secondary)",
                      "font-weight": "600",
                    }}
                  >
                    {name}
                  </span>
                )}
              </For>
            </div>
          </Show>

          {/* Thread */}
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "var(--space-3)",
              animation: "list-item-enter 0.32s var(--ease-out) both",
            }}
          >
            <For each={thread()}>
              {(m, index) => {
                const expanded = () => isExpanded(m, index());
                const sender = () => senderFor(m);
                const current = () => isCurrent(m);
                const c = () => contactsById()[m.pid];
                return (
                  <div
                    data-thread-message
                    data-message-id={m.id}
                    data-current={current()}
                    data-expanded={expanded()}
                    onClick={() => !current() && toggleExpanded(m)}
                    style={{
                      display: "flex",
                      "flex-direction": "column",
                      gap: "var(--space-2)",
                      padding: "var(--space-3) var(--space-4)",
                      background: current()
                        ? "var(--paper-light)"
                        : "var(--paper-mid)",
                      "border-radius": "var(--radius-md)",
                      border: current()
                        ? "1px solid var(--palm-soft)"
                        : "0.5px solid var(--border)",
                      "border-left": `3px solid ${
                        m.unread ? "var(--palm)" : "var(--border)"
                      }`,
                      cursor: current() ? "default" : "pointer",
                      transition:
                        "background var(--duration-fast) var(--ease-out), transform 0.16s var(--ease-out)",
                    }}
                  >
                    {/* Card meta — hidden for single-message threads:
                        the hero above already shows the sender identity
                        once, so repeating it here is pure duplication. */}
                    <div
                      style={{
                        display: "flex",
                        "align-items": "center",
                        gap: "var(--space-3)",
                      }}
                    >
                      <Show when={thread().length > 1}>
                        <Avatar
                          name={sender().name}
                          src={c()?.avatar}
                          size={34}
                          color={
                            sender().isMe
                              ? "linear-gradient(135deg, #0A8F63, #0CB87D)"
                              : undefined
                          }
                        />
                        <div style={{ flex: 1, "min-width": 0 }}>
                          <div
                            style={{
                              display: "flex",
                              "align-items": "baseline",
                              gap: "var(--space-2)",
                            }}
                          >
                            <strong
                              onClick={(e) =>
                                !sender().isMe && openContactFromMessage(m, e)
                              }
                              style={{
                                "font-size": "var(--text-caption)",
                                "font-weight": m.unread ? "700" : "600",
                                color: "var(--text-primary)",
                                cursor:
                                  !sender().isMe && c() ? "pointer" : "default",
                              }}
                              title={c() ? "查看联系人" : undefined}
                            >
                              {sender().name}
                            </strong>
                            <span
                              style={{
                                "font-size": "var(--text-micro)",
                                color: "var(--text-muted)",
                                overflow: "hidden",
                                "text-overflow": "ellipsis",
                                "white-space": "nowrap",
                              }}
                            >
                              {sender().email}
                            </span>
                          </div>
                        </div>
                      </Show>
                      <span
                        style={{
                          "margin-left": "auto",
                          "font-size": "var(--text-micro)",
                          color: "var(--text-muted)",
                          "white-space": "nowrap",
                        }}
                      >
                        {m.tm}
                      </span>
                    </div>

                    <Show
                      when={expanded()}
                      fallback={
                        <p
                          style={{
                            margin: 0,
                            "font-size": "var(--text-body-sm)",
                            color: "var(--text-secondary)",
                            "white-space": "nowrap",
                            overflow: "hidden",
                            "text-overflow": "ellipsis",
                          }}
                        >
                          {messagePreview(m.body || m.prev || "(无内容)")}
                        </p>
                      }
                    >
                      {/* Body */}
                      <Show when={viewMode() === "source"}>
                        <pre
                          style={{
                            margin: 0,
                            padding: "var(--space-3)",
                            background: "var(--paper-dark)",
                            "border-radius": "var(--radius-md)",
                            "font-size": "var(--text-caption)",
                            color: "var(--text-secondary)",
                            "white-space": "pre-wrap",
                            "overflow-wrap": "anywhere",
                            "max-height": "480px",
                            "overflow-y": "auto",
                          }}
                        >
                          {formatMessageSource(m, sender())}
                        </pre>
                      </Show>

                      <Show when={viewMode() !== "source"}>
                        <Show
                          when={viewMode() === "rendered" && m.bodyHtml}
                          fallback={
                            <div
                              class="sp-plaintext-body"
                              onClick={handlePlainTextLinkClick}
                              style={{
                                "font-size": "var(--text-body-sm)",
                                color: "var(--text-primary)",
                                "line-height": 1.7,
                                "overflow-wrap": "anywhere",
                                "word-break": "break-word",
                              }}
                              innerHTML={plainTextToHtml(m.body)}
                            />
                          }
                        >
                          <MessageBodyIframe
                            message={m}
                            senderEmail={
                              !sender().isMe ? sender().email : undefined
                            }
                          />
                        </Show>
                      </Show>

                      {/* Attachments (inside the current-message card) */}
                      <Show when={current() && attachmentsFor(m).length > 0}>
                        <div
                          data-attachments
                          style={{
                            "margin-top": "var(--space-2)",
                            padding: "var(--space-4)",
                            background: "var(--paper-mid)",
                            "border-radius": "var(--radius-md)",
                            border: "0.5px solid var(--border)",
                            animation:
                              "message-detail-enter 0.32s var(--ease-out) both",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              "align-items": "center",
                              gap: "var(--space-2)",
                              "margin-bottom": "var(--space-3)",
                            }}
                          >
                            <Icon
                              name="ph-paperclip"
                              size={18}
                              style={{ color: "var(--text-secondary)" }}
                            />
                            <strong
                              style={{
                                "font-family": "var(--font-display)",
                                "font-weight": "700",
                              }}
                            >
                              附件 · {attachmentsFor(m).length}
                            </strong>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              "flex-direction": "column",
                              gap: "var(--space-2)",
                            }}
                          >
                            <For each={attachmentsFor(m)}>
                              {(f) => (
                                <button
                                  onClick={() => saveAttachment(f.id, f.name)}
                                  style={{
                                    display: "flex",
                                    "align-items": "center",
                                    gap: "var(--space-3)",
                                    padding: "var(--space-3)",
                                    background: "var(--paper-light)",
                                    "border-radius": "var(--radius-md)",
                                    border: "0.5px solid var(--border)",
                                    cursor: "pointer",
                                    "text-align": "left",
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.background =
                                      "var(--paper-dark)")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.background =
                                      "var(--paper-light)")
                                  }
                                >
                                  <Icon
                                    name={
                                      f.type === "image"
                                        ? "ph-file-image"
                                        : f.type === "pdf"
                                          ? "ph-file-pdf"
                                          : f.type === "spreadsheet"
                                            ? "ph-file-xls"
                                            : f.type === "doc"
                                              ? "ph-file-doc"
                                              : "ph-file-text"
                                    }
                                    size={24}
                                    style={{ color: "var(--text-secondary)" }}
                                  />
                                  <div style={{ flex: 1, "min-width": 0 }}>
                                    <div
                                      style={{
                                        "font-weight": "600",
                                        "white-space": "nowrap",
                                        overflow: "hidden",
                                        "text-overflow": "ellipsis",
                                      }}
                                    >
                                      {f.name}
                                    </div>
                                    <div
                                      style={{
                                        "font-size": "var(--text-micro)",
                                        color: "var(--text-muted)",
                                      }}
                                    >
                                      {formatBytes(f.size)} · {f.mime}
                                    </div>
                                  </div>
                                  <Icon
                                    name="ph-download-simple"
                                    size={18}
                                    style={{ color: "var(--text-muted)" }}
                                  />
                                </button>
                              )}
                            </For>
                          </div>
                        </div>
                      </Show>

                      {/* Calendar invite (inside the current-message card) */}
                      <Show when={current() && m.calendarInvite}>
                        <div
                          data-calendar-invite
                          style={{
                            "margin-top": "var(--space-2)",
                            padding: "var(--space-4)",
                            background:
                              "linear-gradient(135deg, var(--palm-soft) 0%, rgba(10,143,99,0.06) 100%)",
                            border: "1px solid var(--palm)",
                            "border-radius": "var(--radius-md)",
                            animation:
                              "message-detail-enter 0.32s var(--ease-out) both",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              "align-items": "center",
                              gap: "var(--space-2)",
                              "margin-bottom": "var(--space-2)",
                            }}
                          >
                            <Icon
                              name="ph-calendar-plus"
                              size={18}
                              style={{ color: "var(--palm)" }}
                            />
                            <strong
                              style={{
                                "font-family": "var(--font-display)",
                                "font-weight": "700",
                              }}
                            >
                              日历邀请
                            </strong>
                          </div>
                          <div
                            style={{
                              "font-size": "var(--text-body-sm)",
                              "margin-bottom": "var(--space-1)",
                            }}
                          >
                            <strong style={{ "font-weight": "700" }}>
                              {m.calendarInvite!.summary || "(无标题)"}
                            </strong>
                          </div>
                          <div
                            style={{
                              "font-size": "var(--text-caption)",
                              color: "var(--text-secondary)",
                              display: "flex",
                              "flex-direction": "column",
                              gap: "4px",
                            }}
                          >
                            <Show when={m.calendarInvite!.dtstart}>
                              <span>
                                <Icon name="ph-clock" size={12} />{" "}
                                {formatIcalDate(m.calendarInvite!.dtstart)}
                                <Show when={m.calendarInvite!.dtend}>
                                  {" → "}
                                  {formatIcalDate(
                                    m.calendarInvite!.dtend,
                                    true,
                                  )}
                                </Show>
                              </span>
                            </Show>
                            <Show when={m.calendarInvite!.location}>
                              <span>
                                <Icon name="ph-map-pin" size={12} />{" "}
                                {m.calendarInvite!.location}
                              </span>
                            </Show>
                            <Show when={m.calendarInvite!.description}>
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  "white-space": "pre-wrap",
                                  "max-height": "120px",
                                  overflow: "hidden",
                                  "text-overflow": "ellipsis",
                                }}
                              >
                                {m.calendarInvite!.description}
                              </p>
                            </Show>
                          </div>
                          <button
                            onClick={async () => {
                              const invite = m.calendarInvite!;
                              if (!invite.summary) {
                                showToast({
                                  message: "邀请缺少标题",
                                  kind: "warning",
                                });
                                return;
                              }
                              try {
                                const id = await addCalendarEvent(
                                  invite,
                                  m.pid,
                                );
                                if (id) {
                                  showToast({
                                    message: "已添加到日历",
                                    kind: "success",
                                    action: invite.dtstart
                                      ? {
                                          label: "查看",
                                          run: () => {
                                            const d = new Date(invite.dtstart!);
                                            sessionStorage.setItem(
                                              "calendarJumpDate",
                                              d.toISOString(),
                                            );
                                            setCalendarJumpTo(Date.now());
                                            setView("calendar");
                                          },
                                        }
                                      : undefined,
                                  });
                                } else {
                                  showToast({
                                    message: "当前环境不支持添加到日历",
                                    kind: "info",
                                  });
                                }
                              } catch (e) {
                                console.error("addCalendarEvent failed", e);
                                showToast({
                                  message: "添加到日历失败，请重试",
                                  kind: "error",
                                });
                              }
                            }}
                            data-testid="add-to-calendar"
                            style={{
                              "margin-top": "var(--space-3)",
                              padding: "8px 16px",
                              background: "var(--palm)",
                              color: "white",
                              "border-radius": "var(--radius-pill)",
                              "font-size": "var(--text-caption)",
                              "font-weight": "700",
                              "box-shadow": "0 4px 12px rgba(10,143,99,0.25)",
                              transition:
                                "transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform =
                                "translateY(-1px)";
                              e.currentTarget.style.boxShadow =
                                "0 6px 16px rgba(10,143,99,0.35)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                              e.currentTarget.style.boxShadow =
                                "0 4px 12px rgba(10,143,99,0.25)";
                            }}
                          >
                            <Icon name="ph-calendar-plus" size={14} />{" "}
                            添加到日历
                          </button>
                        </div>
                      </Show>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Stickies */}
          <Show when={stickyForMsg().length > 0}>
            <SectionHeader title="便签" icon="ph-note" />
            <For each={stickyForMsg()}>
              {(s) => (
                <div
                  style={{
                    background: "var(--canary)",
                    "border-radius": "var(--radius-md)",
                    padding: "var(--space-3) var(--space-4)",
                    "margin-bottom": "var(--space-2)",
                    "font-size": "var(--text-body-sm)",
                    color: "var(--text-primary)",
                    "white-space": "pre-wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                    }}
                  >
                    <span
                      style={{
                        "font-size": "var(--text-micro)",
                        color: "var(--text-muted)",
                        "margin-left": "auto",
                      }}
                    >
                      {relativeTime(s.createdAt)}
                    </span>
                    <button
                      onClick={() => removeSticky(s.id)}
                      aria-label="删除便签"
                      title="删除便签"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <Icon name="ph-x" size={12} />
                    </button>
                  </div>
                  {s.body}
                </div>
              )}
            </For>
          </Show>

          {/* Follow-ups — the whole section stays hidden when there is
              nothing to track; an empty "暂无跟进" block was just noise. */}
          <Show when={fuForMsg().length > 0}>
            <SectionHeader title="跟进提醒" icon="ph-bell-ringing" />
            <For each={fuForMsg()}>
              {(f) => (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-2) var(--space-3)",
                    background: "var(--paper-mid)",
                    "border-radius": "var(--radius-md)",
                    "margin-bottom": "var(--space-2)",
                  }}
                >
                  <Icon name="ph-clock" size={14} />
                  <span style={{ flex: 1, "font-size": "var(--text-body-sm)" }}>
                    {relativeTime(f.dueAt)} ·{" "}
                    {f.status === "done" ? "已完成" : "待处理"}
                  </span>
                  <Show when={f.status === "pending"}>
                    <button
                      onClick={() => markFollowUpDone(f.id)}
                      style={{
                        padding: "4px 10px",
                        background: "var(--palm-soft)",
                        color: "var(--palm)",
                        "border-radius": "var(--radius-pill)",
                        "font-size": "var(--text-micro)",
                        "font-weight": "700",
                      }}
                    >
                      完成
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>

        {/* Pull-to-navigate indicator */}
        <Show when={pullKind() && pullDist() > 0}>
          <div
            data-pull-indicator
            style={{
              position: "absolute",
              left: "50%",
              transform: `translateX(-50%) translateY(${pullKind() === "down-next" ? -pullDist() : pullDist()}px)`,
              padding: "10px 16px",
              background: "var(--surface-elevated)",
              border: "0.5px solid var(--border)",
              "border-radius": "var(--radius-pill)",
              "box-shadow": "0 6px 18px rgba(0,0,0,0.12)",
              display: "flex",
              "align-items": "center",
              gap: "8px",
              "font-size": "var(--text-caption)",
              "font-weight": "600",
              color: "var(--text-primary)",
              "z-index": "var(--z-popover)",
              top: pullKind() === "down-next" ? "0" : "auto",
              bottom: pullKind() === "up-prev" ? "0" : "auto",
              opacity: Math.min(1, pullDist() / 60),
              transition:
                pullActivePointer === null
                  ? "transform 0.42s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease-out"
                  : "none",
              "white-space": "nowrap",
              "max-width": "calc(100% - 32px)",
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "pointer-events": "none",
            }}
          >
            <Icon
              name={
                pullKind() === "down-next" ? "ph-arrow-down" : "ph-arrow-up"
              }
              size={14}
            />
            <span
              style={{
                overflow: "hidden",
                "text-overflow": "ellipsis",
                "white-space": "nowrap",
              }}
            >
              {pullKind() === "down-next" ? "下一封: " : "上一封: "}
              <Show
                when={
                  pullKind() === "down-next" ? nextMessage() : prevMessage()
                }
                fallback="（已是最后一封）"
              >
                {(m) => m().subj}
              </Show>
            </span>
          </div>
        </Show>

        {/* Bottom action bar — the ten prototype actions collapse into a
            primary row (回复 / 稍后 / 更多) so the bar never wraps or
            scrolls; everything else lives in the ⋯ menu. */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-1)",
            padding: "var(--space-3) var(--space-4)",
            "border-top": "0.5px solid var(--border)",
            background: "var(--glass-bg-strong)",
          }}
        >
          <ActionBtn
            icon="ph-arrow-u-up-left"
            label="回复"
            onClick={reply}
            compact={isMobile()}
          />
          <ActionBtn
            icon="ph-clock"
            label={message()!.replyLater ? "取消稍后" : "稍后"}
            active={!!message()!.replyLater}
            onClick={toggleReplyLater}
            compact={isMobile()}
          />
          <MoreMenu
            bucket={message()!.bucket}
            replyLaterActive={!!message()!.replyLater}
            setAsideActive={!!message()!.setAside}
            onReplyAll={replyAll}
            onForward={forward}
            onToggleSetAside={toggleSetAside}
            onRemind={bubbleUp}
            onFollowUp={() => setFuPickerOpen(true)}
            onSticky={addSticky}
            onClip={addClip}
            onArchive={archiveMessage}
            onTrash={moveToTrash}
            onSpam={moveToSpam}
            onUnread={markUnread}
            onBlock={blockSender}
            onLabel={() => setLabelOpen(true)}
            onMove={() => setMoveOpen(true)}
            onSaveDraft={saveAsDraft}
            onMoveToBucket={moveToBucketDirect}
            onAskAgent={askAgentAboutMessage}
          />
        </div>
      </Show>

      <FollowUpPicker
        open={fuPickerOpen()}
        onClose={() => setFuPickerOpen(false)}
        msgId={props.messageId}
        onCreated={refetchFU}
      />
      <RemindPicker
        open={remindPickerOpen()}
        onClose={() => setRemindPickerOpen(false)}
        msgId={props.messageId}
      />
      <Show when={message()}>
        {(m) => (
          <>
            <LabelPicker
              open={labelOpen()}
              onClose={() => setLabelOpen(false)}
              messageIds={[m().id]}
              onChange={async () => {
                await refetchMessage();
                // (no local list to refresh — global bumpRefreshTick below covers other views)
              }}
            />
            <MovePicker
              open={moveOpen()}
              onClose={() => setMoveOpen(false)}
              messageIds={[m().id]}
              onChange={async () => {
                await refetchMessage();
                // (no local list to refresh — global bumpRefreshTick below covers other views)
                setDetailOpen(false);
                setSelectedMessageId(null);
              }}
            />
          </>
        )}
      </Show>
    </div>
  );
}

function HeaderActions(props: {
  onSummarize: () => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        gap: "2px",
        "margin-right": "var(--space-2)",
      }}
    >
      <HeaderActionBtn
        icon="ph-sparkle"
        label="总结"
        testId="message-summarize"
        onClick={props.onSummarize}
      />
      <HeaderActionBtn
        icon="ph-copy"
        label="复制"
        testId="message-copy"
        onClick={props.onCopy}
      />
      <HeaderActionBtn
        icon="ph-download-simple"
        label="下载"
        testId="message-download"
        onClick={props.onDownload}
      />
    </div>
  );
}

function HeaderActionBtn(props: {
  icon: string;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      data-testid={props.testId}
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      style={{
        width: "30px",
        height: "30px",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "border-radius": "var(--radius-md)",
        color: "var(--text-secondary)",
        background: "transparent",
        transition: "background var(--duration-fast) var(--ease-out)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--paper-mid)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon name={props.icon} size={17} />
    </button>
  );
}

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "rendered", label: "富文本" },
  { value: "plain", label: "纯文本" },
  { value: "source", label: "源码" },
];

function ViewModeToggle(props: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  narrow?: boolean;
}) {
  // Narrow panels (<420px, e.g. a resized detail pane or mobile sheet)
  // collapse the three-way pill toggle into a compact dropdown so the
  // header actions stay reachable.
  if (props.narrow) {
    return (
      <select
        aria-label="正文显示方式"
        title="正文显示方式"
        value={props.mode}
        onChange={(e) => props.onChange(e.currentTarget.value as ViewMode)}
        style={{
          padding: "4px 8px",
          "border-radius": "var(--radius-pill)",
          border: "0.5px solid var(--border)",
          background: "var(--paper-mid)",
          "font-size": "var(--text-micro)",
          "font-weight": "600",
          color: "var(--text-primary)",
        }}
      >
        <For each={VIEW_MODES}>
          {(m) => <option value={m.value}>{m.label}</option>}
        </For>
      </select>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        background: "var(--paper-mid)",
        "border-radius": "var(--radius-pill)",
        padding: "2px",
        border: "0.5px solid var(--border)",
      }}
    >
      <For each={VIEW_MODES}>
        {(m) => (
          <button
            data-view-mode={m.value}
            onClick={() => props.onChange(m.value)}
            style={{
              padding: "4px 10px",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-micro)",
              "font-weight": "600",
              "white-space": "nowrap",
              background:
                props.mode === m.value
                  ? "var(--surface-elevated)"
                  : "transparent",
              color:
                props.mode === m.value
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s var(--ease-out)",
              "box-shadow":
                props.mode === m.value ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {m.label}
          </button>
        )}
      </For>
    </div>
  );
}

function baseSubject(subj: string): string {
  return subj
    .replace(/^(Re:|Fwd?:)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function SectionHeader(props: { title: string; icon: string }) {
  return (
    <h4
      style={{
        "font-family": "var(--font-display)",
        "font-size": "var(--text-h4)",
        "font-weight": "800",
        margin: "var(--space-5) 0 var(--space-2)",
        display: "flex",
        "align-items": "center",
        gap: "var(--space-2)",
      }}
    >
      <Icon name={props.icon} size={16} />
      {props.title}
    </h4>
  );
}

function formatIcalDate(iso: string | undefined, endOnly = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (endOnly) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActionBtn(props: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  testId?: string;
  compact?: boolean;
}) {
  return (
    <button
      data-testid={props.testId}
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      style={{
        flex: props.compact ? "0 0 auto" : 1,
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: props.compact ? "1px" : "2px",
        padding: props.compact ? "8px 10px" : "8px",
        "border-radius": "var(--radius-md)",
        color: props.active ? "var(--palm)" : "var(--text-secondary)",
        background: props.active ? "var(--palm-soft)" : "transparent",
        "font-size": props.compact ? "9px" : "10px",
        "font-weight": "600",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = props.active
          ? "var(--palm-soft)"
          : "var(--paper-mid)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = props.active
          ? "var(--palm-soft)"
          : "transparent")
      }
    >
      <Icon name={props.icon} size={props.compact ? 20 : 18} />
      <Show when={!props.compact}>
        <span>{props.label}</span>
      </Show>
    </button>
  );
}

export interface MoreMenuItemDef {
  id: string;
  icon: string;
  label: string;
  testId?: string;
  danger?: boolean;
  /** Visual separator rendered above this item. */
  separator?: boolean;
}

/** Pure item list for the message ⋯ menu — exported for tests. The
 *  current bucket's move target and any not-applicable actions are
 *  filtered out here so the component stays a dumb renderer. */
export function moreMenuItemDefs(opts: {
  bucket: Message["bucket"];
  setAsideActive: boolean;
}): MoreMenuItemDef[] {
  const defs: MoreMenuItemDef[] = [
    { id: "reply-all", icon: "ph-users", label: "回复全部" },
    { id: "forward", icon: "ph-share-fat", label: "转发" },
    {
      id: "set-aside",
      icon: "ph-push-pin",
      label: opts.setAsideActive ? "取消搁置" : "搁置",
    },
    { id: "remind", icon: "ph-arrow-fat-line-up", label: "提醒我" },
    { id: "follow-up", icon: "ph-bell-ringing", label: "跟进提醒" },
    { id: "sticky", icon: "ph-note", label: "添加便签" },
    { id: "clip", icon: "ph-bookmark-simple", label: "保存为 Clip" },
  ];
  const moves: MoreMenuItemDef[] = (
    [
      {
        id: "move-imbox",
        icon: "ph-tray",
        label: "移到 Imbox",
        testId: "message-move-imbox",
        bucket: "imbox",
      },
      {
        id: "move-feed",
        icon: "ph-newspaper",
        label: "移到 Stream",
        testId: "message-move-feed",
        bucket: "feed",
      },
      {
        id: "move-paperTrail",
        icon: "ph-folder",
        label: "移到 Records",
        testId: "message-move-paperTrail",
        bucket: "paperTrail",
      },
    ] as (MoreMenuItemDef & { bucket: Message["bucket"] })[]
  )
    .filter((it) => it.bucket !== opts.bucket)
    .map(({ bucket: _bucket, ...rest }) => ({
      ...rest,
      separator: rest.id === "move-imbox" || undefined,
    }));
  // The separator belongs on the first surviving move item, not
  // specifically on move-imbox (which is filtered out when the message
  // is already in the Imbox).
  if (moves.length > 0) moves[0]!.separator = true;
  return [
    ...defs,
    ...moves,
    { id: "ask-agent", icon: "ph-sparkle", label: "问 Agent", testId: "message-ask-agent", separator: moves.length === 0 || undefined },
    { id: "label", icon: "ph-tag", label: "标签" },
    { id: "move", icon: "ph-folder", label: "移动到…" },
    { id: "save-draft", icon: "ph-file-dotted", label: "保存为草稿" },
    { id: "archive", icon: "ph-archive", label: "归档" },
    { id: "unread", icon: "ph-envelope-open", label: "标为未读" },
    {
      id: "trash",
      icon: "ph-trash",
      label: "移到回收站",
      testId: "message-move-trash",
      danger: true,
    },
    { id: "spam", icon: "ph-warning-circle", label: "移到垃圾邮件", danger: true },
    { id: "block", icon: "ph-prohibit", label: "屏蔽发件人", danger: true },
  ];
}

function MoreMenu(props: {
  bucket: Message["bucket"];
  replyLaterActive: boolean;
  setAsideActive: boolean;
  onReplyAll: () => void;
  onForward: () => void;
  onToggleSetAside: () => Promise<void> | void;
  onRemind: () => void;
  onFollowUp: () => void;
  onSticky: () => Promise<void> | void;
  onClip: () => Promise<void> | void;
  onArchive: () => Promise<void> | void;
  onTrash: () => Promise<void> | void;
  onSpam: () => Promise<void> | void;
  onUnread: () => Promise<void> | void;
  onBlock: () => Promise<void> | void;
  onLabel: () => void;
  onMove: () => void;
  onSaveDraft: () => Promise<void> | void;
  onMoveToBucket: (bucket: Message["bucket"]) => Promise<void> | void;
  onAskAgent: () => Promise<void> | void;
}) {
  const [open, setOpen] = createSignal(false);

  const handlers: Record<string, () => void> = {
    "reply-all": () => props.onReplyAll(),
    forward: () => props.onForward(),
    "set-aside": () => void props.onToggleSetAside(),
    remind: () => props.onRemind(),
    "follow-up": () => props.onFollowUp(),
    sticky: () => void props.onSticky(),
    clip: () => void props.onClip(),
    "move-imbox": () => void props.onMoveToBucket("imbox"),
    "move-feed": () => void props.onMoveToBucket("feed"),
    "move-paperTrail": () => void props.onMoveToBucket("paperTrail"),
    "ask-agent": () => void props.onAskAgent(),
    label: () => props.onLabel(),
    move: () => props.onMove(),
    "save-draft": () => void props.onSaveDraft(),
    archive: () => void props.onArchive(),
    unread: () => void props.onUnread(),
    trash: () => void props.onTrash(),
    spam: () => void props.onSpam(),
    block: () => void props.onBlock(),
  };

  const items = () =>
    moreMenuItemDefs({
      bucket: props.bucket,
      setAsideActive: props.setAsideActive,
    });

  return (
    <div style={{ position: "relative", flex: 1, display: "flex" }}>
      <ActionBtn
        icon="ph-dots-three"
        label="更多"
        testId="message-more-menu"
        onClick={() => setOpen(!open())}
      />
      <Show when={open()}>
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            "min-width": "180px",
            ...glassPanelStyle,
            "border-radius": "var(--radius-lg, var(--radius-md))",
            padding: "4px",
            "z-index": 10,
            "max-height": "70vh",
            "overflow-y": "auto",
          }}
        >
          <For each={items()}>
            {(item) => (
              <>
                <Show when={item.separator}>
                  <div
                    style={{
                      height: "0.5px",
                      background: "var(--border)",
                      margin: "4px 6px",
                    }}
                  />
                </Show>
                <button
                  data-testid={item.testId}
                  onClick={() => {
                    setOpen(false);
                    handlers[item.id]?.();
                  }}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-2)",
                    width: "100%",
                    padding: "8px 10px",
                    "border-radius": "var(--radius-sm)",
                    "font-size": "var(--text-caption)",
                    color: item.danger
                      ? "var(--status-danger)"
                      : "var(--text-primary)",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--paper-mid)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                  onFocus={(e) =>
                    (e.currentTarget.style.background = "var(--paper-mid)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </button>
              </>
            )}
          </For>
        </div>
        <div
          style={{
            position: "fixed",
            inset: 0,
            "z-index": 9,
          }}
          onClick={() => setOpen(false)}
        />
      </Show>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return `${(bytes / k ** idx).toFixed(1)} ${sizes[idx]}`;
}

/** Skeleton shown while the message is loading (IPC round-trip in
 *  flight). Mirrors the real MessageCard + body layout (avatar + 2
 *  text lines + a long body block) so there is no layout shift when
 *  the real content arrives. The header bar above is already rendered
 *  (it doesn't depend on `message()`), so the user sees a coherent
 *  panel even at the 0-byte moment. The shimmer animation is on the
 *  existing Skeleton component (1.4s linear). */
function MessagePanelSkeleton() {
  return (
    <div
      data-message-panel-skeleton
      style={{
        padding: "var(--space-5)",
        flex: 1,
        "overflow-y": "auto",
        "overscroll-behavior": "contain",
      }}
    >
      {/* Hero: avatar + sender + email + timestamp. */}
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          "margin-bottom": "var(--space-2)",
        }}
      >
        <Skeleton circle width={40} height={40} />
        <div style={{ flex: 1 }}>
          <Skeleton width="30%" height="14px" />
          <div style={{ "margin-top": "6px" }}>
            <Skeleton width="50%" height="12px" />
          </div>
        </div>
        <Skeleton width="80px" height="12px" />
      </div>
      {/* Subject */}
      <Skeleton width="70%" height="22px" />
      <div style={{ "margin-bottom": "var(--space-3)" }} />
      {/* Body: 6 lines fading to 100% so the panel reads as a real
          email body, not a tiny placeholder. */}
      <SkeletonList count={6} height={14} />
      <div
        style={{
          "margin-top": "var(--space-3)",
          "font-size": "var(--text-caption)",
          color: "var(--text-muted)",
        }}
      >
        正在加载邮件…
      </div>
    </div>
  );
}

/** Per-message iframe with plain-text streaming fallback, Show
 *  images button, and per-sender "always show images" toggle.
 *  Extracted from MessagePanel so each thread message has its own
 *  iframe state — the previous single-`iframeSrc()` signal made
 *  every iframe in the thread show the current message's body, not
 *  its own. Owns its own `currentIframe` ref so the postMessage
 *  handlers (sendpalm:open-url, sendpalm:show-images) target only
 *  this message's iframe and not a sibling's. */
function MessageBodyIframe(props: { message: Message; senderEmail?: string }) {
  const m = () => props.message;
  const [iframeSrc, setIframeSrc] = createSignal("");
  const [iframeReady, setIframeReady] = createSignal(false);
  const [showBusy, setShowBusy] = createSignal(false);
  const [alwaysShow, setAlwaysShow] = createSignal(false);
  let pendingSanitize = 0;
  let currentIframe: HTMLIFrameElement | null = null;
  let currentIframeResizeObserver: ResizeObserver | null = null;
  // 200ms cooldown timer + last-write timestamp. See the ref callback
  // below for the full reasoning. Exposed so onShowImages can re-trigger
  // a measurement after the prefetched image map is delivered to the
  // iframe (which causes the body to grow, but the body's contentWindow
  // is cross-realm so we can't observe it from the host realm).
  let currentMeasure: (() => void) | null = null;
  let currentMeasureTimer: ReturnType<typeof setTimeout> | null = null;

  // Image analysis is cheap (regex over bodyHtml) but we still memo
  // it so the Show images button only re-evaluates when the message
  // actually changes. Hidden messages (externalImageCount = 0)
  // collapse the toolbar via the outer <Show when={...}>.
  const imageAnalysis = createMemo(() => {
    const html = m().bodyHtml;
    if (!html) return null;
    return analyzeImages(html);
  });

  // Hydrate alwaysShow from the per-sender image policy on mount
  // and whenever the sender prop changes. The async load races
  // with the parent's own update via onToggleAlwaysShow, so a
  // `cancelled` guard prevents stale writes.
  createEffect(() => {
    const sender = props.senderEmail;
    if (!sender) {
      setAlwaysShow(false);
      return;
    }
    let cancelled = false;
    void getImageSenderPolicy(sender).then((p) => {
      if (!cancelled) setAlwaysShow(p === "always");
    });
    onCleanup(() => {
      cancelled = true;
    });
  });

  createEffect(() => {
    const html = m().bodyHtml;
    if (!html || !html.trim()) {
      setIframeSrc("");
      return;
    }
    // Reset the ready flag when the message changes so the
    // plain-text fallback shows for the new message too.
    setIframeReady(false);
    const myId = ++pendingSanitize;
    setTimeout(() => {
      if (myId !== pendingSanitize) return; // stale
      setIframeSrc(htmlEmailSrcdoc(html));
      setIframeReady(true);
    }, 0);
  });

  // Window-level message handler — bound to the component's own
  // iframe via the `e.source === currentIframe?.contentWindow`
  // check, so we never accidentally receive a sibling thread
  // message's link click. The `sendpalm:open-url` postMessage is
  // emitted by the click interceptor injected in `htmlEmailSrcdoc`.
  const onIframeMessage = (e: MessageEvent) => {
    if (!e.data || typeof e.data !== "object") return;
    const iframeWin = currentIframe?.contentWindow;
    if (!iframeWin || e.source !== iframeWin) return;
    if (
      e.data.type === "sendpalm:open-url" &&
      typeof e.data.href === "string"
    ) {
      e.preventDefault?.();
      openUrl(e.data.href).catch(() => {});
    }
  };

  onMount(() => {
    window.addEventListener("message", onIframeMessage);
  });

  // Per-component cleanup for the message listener + the
  // ResizeObserver + the cooldown timer (see commit 58b9df0 for the
  // original leak; see commit a6ebd81 / this change for the loop).
  onCleanup(() => {
    window.removeEventListener("message", onIframeMessage);
    try {
      currentIframeResizeObserver?.disconnect();
    } catch {
      /* already torn down */
    }
    currentIframeResizeObserver = null;
    if (currentMeasureTimer !== null) {
      clearTimeout(currentMeasureTimer);
      currentMeasureTimer = null;
    }
    currentMeasure = null;
    if (currentIframe) {
      currentIframe.onload = null;
      currentIframe.dataset.roAttached = "";
    }
  });

  const onShowImages = async () => {
    const html = m().bodyHtml;
    if (!html) return;
    setShowBusy(true);
    try {
      const urls = extractExternalImageUrls(html);
      if (urls.length === 0) {
        showToast({ kind: "info", message: "此邮件没有外部图片" });
        return;
      }
      const map = await prefetchImages(urls);
      const win = currentIframe?.contentWindow;
      if (win) {
        win.postMessage(
          {
            type: "sendpalm:show-images",
            srcMap: Object.fromEntries(map),
          },
          "*",
        );
        // Re-measure once the image map is delivered to the iframe.
        // The postMessage is dispatched immediately; the iframe's
        // image swap + layout pass happens in the next animation
        // frame. We schedule a measurement in that frame so the
        // body.scrollHeight is read AFTER the new images have
        // actually contributed to layout (otherwise we'd capture
        // the pre-image height and need a second tick).
        requestAnimationFrame(() => {
          currentMeasure?.();
        });
      }
    } catch {
      showToast({ kind: "error", message: "加载图片失败" });
    } finally {
      setShowBusy(false);
    }
  };

  const onToggleAlwaysShow = async (val: boolean) => {
    const sender = props.senderEmail;
    if (!sender) return;
    setAlwaysShow(val);
    try {
      await setImageSenderPolicy(sender, val ? "always" : "ask");
    } catch {
      showToast({ kind: "error", message: "保存图片策略失败" });
    }
  };

  return (
    <>
      {/* Plain-text fallback while DOMPurify sanitize is in flight. */}
      <Show when={!iframeReady() || !iframeSrc()}>
        <div
          class="sp-plaintext-body"
          data-plaintext-fallback
          onClick={handlePlainTextLinkClick}
          style={{
            "font-size": "var(--text-body-sm)",
            color: "var(--text-primary)",
            "line-height": 1.7,
            "overflow-wrap": "anywhere",
            "word-break": "break-word",
            "margin-bottom": "var(--space-2)",
          }}
          innerHTML={plainTextToHtml(m().body)}
        />
        <div
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            "margin-bottom": "var(--space-3)",
            "font-style": "italic",
          }}
        >
          <Icon name="ph-arrow-fat-line-up" size={11} /> 正在加载完整版式…
        </div>
      </Show>
      <iframe
        ref={(el) => {
          // ResizeObserver leak fix — see commit 58b9df0.
          if (el === null) {
            if (currentIframe?.dataset.roAttached === "1") {
              try {
                currentIframeResizeObserver?.disconnect();
              } catch {
                /* already torn down */
              }
              currentIframeResizeObserver = null;
              if (currentIframe) {
                currentIframe.dataset.roAttached = "";
                currentIframe.onload = null;
              }
            }
            return;
          }
          currentIframe = el;
          // 200ms cooldown: every height write bumps `lastWrite`;
          // subsequent measure() calls within the cooldown window
          // collapse to the next cooldown boundary. This is the
          // physical guarantee that a 50-burst (e.g. onload + N
          // image loads) produces at most ceil(bursts / cooldown)
          // height writes — usually exactly 1, and never more than
          // the number of distinct cooldown windows the burst spans.
          //
          // Why not ResizeObserver on the iframe body's contentDocument?
          //   - It was the source of the "ResizeObserver loop completed
          //     with undelivered notifications" error.
          //   - The iframe body is cross-realm; the host document's
          //     ResizeObserver can observe the BODY node (same window),
          //     but writing `el.style.height` from that callback
          //     triggers the host iframe's own layout, which fires
          //     another RO entry on the body, which the browser
          //     suppresses AND the Tauri webview logs as a
          //     frame-stalling warning. With long emails (many inline
          //     images, web fonts, CSS animations), the body's scroll
          //     height changes across many frames and the loop can
          //     compound until the webview is unresponsive.
          //   - The previous rAF-debounce (commit 8bc925d) coalesced
          //     same-frame bursts but did NOT prevent cross-frame
          //     burst compounding, and the user still reports the
          //     loop on real Tauri.
          //
          // Why is observing the HOST element safe?
          //   - The host iframe's size is driven by the OUTER layout
          //     (window resize, panel toggle, sidebar toggle). None of
          //     those happen synchronously from inside this callback,
          //     so writing `el.style.height` here is a one-way trip —
          //     it does not cause the host to resize again within the
          //     same frame. The W3C spec
          //     (https://www.w3.org/TR/resize-observer/#deliver-resize-errors)
          //     only suppresses notifications when callback → DOM
          //     write → DOM mutation → callback is synchronous within
          //     one frame. We break that chain by (a) writing the
          //     iframe's own height, not the host's, and (b) gating
          //     the write with a 200ms cooldown so a runaway outer
          //     resize cannot drive us into a tight loop.
          //
          // What about content changes (Show images, etc.)?
          //   - onShowImages explicitly calls `currentMeasure()` after
          //     the postMessage delivery, so the image-reveal path
          //     gets a fresh height write.
          //   - Other body mutations (font load, CSS animation) are
          //     not directly observable from the host realm. They
          //     typically settle within 200ms of onload, which the
          //     cooldown covers.
          const COOLDOWN_MS = 200;
          let lastWrite = 0;
          const doWrite = () => {
            currentMeasureTimer = null;
            lastWrite = performance.now();
            try {
              const doc = el.contentDocument;
              if (doc && doc.body) {
                const height = doc.body.scrollHeight + 24;
                // Skip the DOM write if the height is unchanged. This
                // breaks the only remaining feedback edge: a RO entry
                // that fires when the host hasn't actually changed
                // size would otherwise write the same `style.height`
                // and look identical to a no-op, but the assignment
                // still forces a style invalidation. Skipping the
                // assignment when the value matches removes that
                // micro-cost AND guarantees the next layout pass
                // produces zero host-geometry change.
                if (el.style.height !== `${height}px`) {
                  el.style.height = `${height}px`;
                }
              }
            } catch {
              /* sandboxed — keep default height */
            }
          };
          const measure = () => {
            if (currentMeasureTimer !== null) {
              clearTimeout(currentMeasureTimer);
            }
            const now = performance.now();
            const wait = Math.max(0, COOLDOWN_MS - (now - lastWrite));
            currentMeasureTimer = setTimeout(doWrite, wait);
          };
          currentMeasure = measure;
          el.onload = measure;
          try {
            // Observe the HOST (the iframe element itself), not the
            // body's contentDocument. See the long comment above.
            const ro = new ResizeObserver(measure);
            currentIframeResizeObserver = ro;
            el.dataset.roAttached = "1";
            ro.observe(el);
          } catch {
            /* sandbox denies */
          }
        }}
        srcdoc={iframeSrc()}
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: "100%",
          "min-height": "240px",
          border: "none",
          "background-color": "transparent",
        }}
        title="邮件正文"
      />
      {/* Show images + per-sender "always show" — only mount when the
          sanitized HTML actually contains external <img> tags. The
          button is per-message because the prefetch map must target
          this message's iframe, and the checkbox policy is per-sender
          so the same sender in another thread inherits it. */}
      <Show
        when={imageAnalysis() && (imageAnalysis()?.externalImageCount ?? 0) > 0}
      >
        <div
          data-show-images-bar
          style={{
            display: "flex",
            "align-items": "center",
            "flex-wrap": "wrap",
            gap: "var(--space-3)",
            "margin-top": "var(--space-2)",
            "font-size": "var(--text-caption)",
            color: "var(--text-secondary)",
          }}
        >
          <button
            type="button"
            onClick={() => void onShowImages()}
            disabled={showBusy()}
            data-show-images
            style={{
              display: "inline-flex",
              "align-items": "center",
              gap: "var(--space-1)",
              padding: "4px 10px",
              "border-radius": "var(--radius-pill, 999px)",
              border: "0.5px solid var(--border)",
              background: "var(--paper-light)",
              color: "var(--text-primary)",
              cursor: showBusy() ? "wait" : "pointer",
              "font-size": "var(--text-caption)",
              opacity: showBusy() ? 0.6 : 1,
            }}
          >
            <Show
              when={showBusy()}
              fallback={<Icon name="ph-image" size={12} />}
            >
              <Icon name="ph-spinner" size={12} />
            </Show>
            显示图片（{imageAnalysis()?.externalImageCount}）
          </button>
          <Show when={props.senderEmail}>
            <label
              style={{
                display: "inline-flex",
                "align-items": "center",
                gap: "var(--space-1)",
                cursor: "pointer",
                "user-select": "none",
              }}
            >
              <input
                type="checkbox"
                checked={alwaysShow()}
                onChange={(e) =>
                  void onToggleAlwaysShow(e.currentTarget.checked)
                }
                data-always-show-images
                style={{ margin: 0 }}
              />
              <span>始终显示此发件人的图片</span>
            </label>
          </Show>
        </div>
      </Show>
    </>
  );
}
