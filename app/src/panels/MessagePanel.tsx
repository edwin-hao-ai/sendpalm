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
  listContacts,
  listMessages,
  listStickies,
  upsertSticky,
  deleteSticky,
  listFollowUps,
  upsertFollowUp,
  upsertClip,
  upsertMessage,
  upsertContact,
  upsertDraft,
  listFiles,
  moveMessageToBucket,
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
import { FollowUpPicker } from "../components/FollowUpPicker";
import { RemindPicker } from "../components/RemindPicker";
import { LabelPicker } from "../components/LabelPicker";
import { MovePicker } from "../components/MovePicker";
import { uid } from "../utils/id";
import { addDays, isoNow, relativeTime } from "../utils/date";
import { trackerSummary } from "../utils/trackers";
import type { Clip, Contact, FollowUp, Message, Sticky } from "../types";
import { addCalendarEvent, getAttachmentContent, setImageSenderPolicy } from "../services/backend";
import { useRefreshEffect, useViewport } from "../utils/gestures";
import { formatMessageSource, messagePreview } from "./message-source";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  sanitizeEmailHtml,
  analyzeImages,
  plainTextToHtml,
  extractExternalImageUrls,
  prefetchImages,
} from "../utils/html";
import { useAgent } from "../agent/useAgent";

type ViewMode = "rendered" | "plain" | "source";

function htmlEmailSrcdoc(html: string): string {
  const safe = sanitizeEmailHtml(html);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6; color: #333; }
img { max-width: 100%; height: auto; }
a { color: #0A8F63; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
table { border-collapse: collapse; max-width: 100%; }
td, th { padding: 6px 10px; vertical-align: top; }
blockquote { border-left: 3px solid #0A8F63; margin: 0; padding: 0 0 0 12px; color: #666; font-style: italic; }
.sp-img-hidden { display: none !important; }
.sp-img-hidden[data-shown="true"] { display: inline !important; }
</style>
<script>
document.addEventListener('click', function(e) {
  var a = e.target && e.target.closest && e.target.closest('a[href]');
  if (!a) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  e.stopPropagation();
  try { parent.postMessage({ type: 'sendpalm:open-url', href: a.href }, '*'); } catch (_) {}
}, true);
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'sendpalm:show-images') {
    var srcMap = e.data.srcMap || {};
    var imgs = document.querySelectorAll('.sp-img-hidden');
    for (var i = 0; i < imgs.length; i++) {
      var orig = imgs[i].getAttribute('data-original-src');
      if (orig && srcMap[orig]) {
        imgs[i].setAttribute('src', srcMap[orig]);
        imgs[i].removeAttribute('class');
        imgs[i].removeAttribute('data-original-src');
      } else {
        imgs[i].setAttribute('data-shown', 'true');
      }
    }
  }
});
</script>
</head>
<body>${safe}</body>
</html>`;
}

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
  const [allContacts, { refetch: refetchContacts }] =
    createResource(listContacts);
  const [allMessages, { refetch: refetchAll }] = createResource(listMessages);
  const [stickies, { refetch: refetchStickies }] = createResource(listStickies);
  const [followUps, { refetch: refetchFU }] = createResource(listFollowUps);
  const [files, { refetch: refetchFiles }] = createResource(listFiles);

  const [viewMode, setViewMode] = createSignal<ViewMode>("rendered");
  const [expandedIds, setExpandedIds] = createSignal<Set<string>>(new Set());

  const handlePlainTextLinkClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    openUrl(a.href).catch(() => {});
  };

  useRefreshEffect(() => {
    void refetchMessage();
    void refetchContact();
    void refetchContacts();
    void refetchAll();
    void refetchStickies();
    void refetchFU();
    void refetchFiles();
  });

  createEffect(() => {
    const m = message();
    if (m && m.unread) {
      void upsertMessage({ ...m, unread: false }).then(() => {
        bumpRefreshTick();
      });
    }
  });

  const contactsById = createMemo<Record<string, Contact>>(() => {
    const map: Record<string, Contact> = {};
    for (const c of allContacts() ?? []) map[c.id] = c;
    return map;
  });

  const currentMessage = createMemo<Message | null>(() => message() ?? null);

  // All messages in the same conversation, sorted oldest-first so the thread
  // reads top-down. The current message is included.
  const thread = createMemo<Message[]>(() => {
    const cur = currentMessage();
    if (!cur) return [];
    const tid = cur.threadId;
    const sameSubject = (m: Message) =>
      baseSubject(m.subj) === baseSubject(cur.subj);
    const list = (allMessages() ?? []).filter(
      (m) =>
        m.id !== cur.id &&
        ((tid && m.threadId === tid) ||
          (!tid && !m.threadId && m.pid === cur.pid && sameSubject(m))),
    );
    list.push(cur);
    list.sort((a, b) => (a.st ?? "").localeCompare(b.st ?? ""));
    return list;
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
      return { name: "You", email: "me@example.com", isMe: true };
    }
    const c = contactsById()[m.pid];
    if (c) {
      return {
        name: c.name,
        email: c.emails[0]?.value ?? "",
        isMe: false,
      };
    }
    return { name: "Unknown", email: "", isMe: false };
  }

  function openContactFromMessage(m: Message, e: MouseEvent) {
    e.stopPropagation();
    const c = contactsById()[m.pid];
    if (!c) return;
    setSelectedContactId(c.id);
    setView("contacts");
  }

  const attachmentsFor = (m: Message) => {
    const ids = new Set(m.attachments ?? []);
    return (files() ?? []).filter((f) => ids.has(f.id));
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
    await refetchAll();
    bumpRefreshTick();
    showToast({ message: "已标为未读", kind: "success" });
  };

  const archiveMessage = async () => {
    const m = message();
    if (!m) return;
    await moveMessageToBucket(m.id, "paperTrail");
    await refetchAll();
    bumpRefreshTick();
    showToast({ message: "已归档到 Records", kind: "success" });
  };

  const moveToTrash = async () => {
    const m = message();
    if (!m) return;
    const previousBucket = m.bucket;
    await moveMessageToBucket(m.id, "trash");
    await refetchAll();
    bumpRefreshTick();
    setDetailOpen(false);
    setSelectedMessageId(null);
    showToast({
      message: "已移到 Trash",
      kind: "success",
      action: {
        label: "撤销",
        run: async () => {
          const current = await getMessage(m.id);
          if (!current) return;
          await upsertMessage({ ...current, bucket: previousBucket });
          await refetchAll();
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
    await refetchAll();
    bumpRefreshTick();
    setDetailOpen(false);
    setSelectedMessageId(null);
    showToast({ message: "已移到 Spam", kind: "success" });
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
    await refetchAll();
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
      trash: "Trash",
      spam: "Spam",
    };
    return map[bucket] ?? bucket;
  };

  const moveToBucketDirect = async (bucket: Message["bucket"]) => {
    const m = message();
    if (!m) return;
    await moveMessageToBucket(m.id, bucket);
    await refetchAll();
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
      `Subject: ${m.subj}`,
      `From: ${c?.name ?? "Unknown"} <${c?.emails[0]?.value ?? ""}>`,
      `To: ${m.to ?? ""}`,
      `Date: ${m.tm}`,
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
      `Subject: ${m.subj}`,
      `From: ${c?.name ?? "Unknown"} <${c?.emails[0]?.value ?? ""}>`,
      `To: ${m.to ?? ""}`,
      `Date: ${m.tm}`,
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
    await refetchAll();
    bumpRefreshTick();
    showToast({
      message: m.replyLater ? "已取消 Reply Later" : "已 Reply Later",
      kind: "success",
    });
  };

  const toggleSetAside = async () => {
    const m = message();
    if (!m) return;
    await upsertMessage({ ...m, setAside: !m.setAside });
    await refetchMessage();
    await refetchAll();
    bumpRefreshTick();
    showToast({
      message: m.setAside ? "已取消 Set Aside" : "已 Set Aside",
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

  // Sorted message list used to determine next/previous neighbours.
  const sortedMessages = createMemo(() => {
    const list = allMessages() ?? [];
    return [...list].sort((a, b) => (b.st ?? "").localeCompare(a.st ?? ""));
  });

  const currentIndex = createMemo(() => {
    const id = props.messageId;
    return sortedMessages().findIndex((m) => m.id === id);
  });

  const nextMessage = () => sortedMessages()[currentIndex() + 1] ?? null;
  const prevMessage = () => sortedMessages()[currentIndex() - 1] ?? null;

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
    const body = prompt("写一条 sticky note…");
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
        message: "请先在邮件正文里选中文字，再点 Clip",
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

  let currentIframe: HTMLIFrameElement | null = null;

  const [showBusy, setShowBusy] = createSignal(false);
  const [alwaysShow, setAlwaysShow] = createSignal(false);

  onMount(() => {
    const handler = (e: MessageEvent) => {
      if (currentIframe && e.source !== currentIframe.contentWindow) return;
      const data = e.data as { type?: string; href?: string } | null;
      if (!data || data.type !== "sendpalm:open-url" || typeof data.href !== "string") return;
      openUrl(data.href).catch(() => {});
    };
    window.addEventListener("message", handler);
    onCleanup(() => window.removeEventListener("message", handler));
  });

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
      class="message-panel-root"
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        position: "relative",
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
          background: "var(--surface-elevated)",
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
          aria-label="Close"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong
          style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}
        >
          Message
        </strong>
        <Show when={trackCount() > 0}>
          <button
            onClick={() => setTrackerExpanded(!trackerExpanded())}
            title={`${trackCount()} tracker blocked`}
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
            {trackCount()} tracker blocked
          </button>
        </Show>
        <div style={{ "margin-left": "auto" }} />
        <HeaderActions
          onSummarize={summarizeMessage}
          onCopy={copyMessage}
          onDownload={downloadMessage}
        />
        <ViewModeToggle mode={viewMode()} onChange={setViewMode} />
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
            检测到以下 tracker 类型（已自动剥离）：
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
            transform:
              pullKind() === "down-next"
                ? `translateY(${pullDist() * 0.55}px)`
                : pullKind() === "up-prev"
                  ? `translateY(-${pullDist() * 0.55}px)`
                  : "translateY(0)",
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
                const imageAnalysis = createMemo(() =>
                  m.bodyHtml ? analyzeImages(m.bodyHtml) : null,
                );
                const onShowImages = async () => {
                  if (!m.bodyHtml) return;
                  setShowBusy(true);
                  try {
                    const urls = extractExternalImageUrls(m.bodyHtml);
                    const map = await prefetchImages(urls);
                    if (currentIframe?.contentWindow) {
                      currentIframe.contentWindow.postMessage(
                        {
                          type: "sendpalm:show-images",
                          srcMap: Object.fromEntries(map),
                        },
                        "*",
                      );
                    }
                    if (alwaysShow()) {
                      const senderEmail = sender().email;
                      if (senderEmail && sender().isMe === false) {
                        await setImageSenderPolicy(senderEmail, "always");
                      }
                    }
                  } finally {
                    setShowBusy(false);
                  }
                };
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
                    {/* Card meta */}
                    <div
                      style={{
                        display: "flex",
                        "align-items": "center",
                        gap: "var(--space-3)",
                      }}
                    >
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
                            title={c() ? "View contact" : undefined}
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
                      <span
                        style={{
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
                                color: "var(--text-secondary)",
                                "line-height": 1.6,
                                "overflow-wrap": "anywhere",
                                "word-break": "break-word",
                              }}
                               innerHTML={plainTextToHtml(m.body)}
                            />
                          }
                        >
                          <Show when={(imageAnalysis()?.externalImageCount ?? 0) > 0}>
                            <div
                              style={{
                                display: "flex",
                                "align-items": "center",
                                gap: "var(--space-3)",
                                "margin-bottom": "var(--space-2)",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => void onShowImages()}
                                disabled={showBusy()}
                                style={{
                                  opacity: showBusy() ? 0.6 : 1,
                                  cursor: showBusy() ? "wait" : "pointer",
                                }}
                              >
                                {showBusy()
                                  ? "Loading…"
                                  : `Show images (${imageAnalysis()!.externalImageCount})`}
                                {imageAnalysis()!.hasTrackingPixel ? " ⚠" : ""}
                              </button>
                              <label
                                style={{
                                  display: "inline-flex",
                                  "align-items": "center",
                                  gap: "6px",
                                  "font-size": "var(--text-caption)",
                                  color: "var(--text-secondary)",
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={alwaysShow()}
                                  onChange={(e) =>
                                    setAlwaysShow(e.currentTarget.checked)
                                  }
                                />
                                Always show from this sender
                              </label>
                            </div>
                          </Show>
                          <iframe
                            ref={(el) => {
                              currentIframe = el;
                              el.onload = () => {
                                try {
                                  const doc = el.contentDocument;
                                  if (doc) {
                                    const height = doc.body.scrollHeight + 16;
                                    el.style.height = `${height}px`;
                                  }
                                } catch {
                                  // sandboxed or cross-origin iframe — keep default height
                                }
                              };
                            }}
                            srcdoc={htmlEmailSrcdoc(m.bodyHtml!)}
                            sandbox="allow-scripts allow-same-origin"
                            style={{
                              width: "100%",
                              "min-height": "240px",
                              border: "none",
                              "background-color": "transparent",
                            }}
                            title="Message body"
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
                                  onClick={async () => {
                                    const dataUrl = await getAttachmentContent(
                                      f.id,
                                    );
                                    if (dataUrl) {
                                      const a = document.createElement("a");
                                      a.href = dataUrl;
                                      a.download = f.name;
                                      a.click();
                                    } else {
                                      showToast({
                                        message:
                                          "无法读取附件（浏览器模式不支持）",
                                        kind: "info",
                                      });
                                    }
                                  }}
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
                                    message: "未配置 Tauri 运行时，无法添加",
                                    kind: "info",
                                  });
                                }
                              } catch (e) {
                                const msg =
                                  e instanceof Error ? e.message : String(e);
                                showToast({
                                  message: `添加失败：${msg}`,
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
            <SectionHeader title="Sticky notes" icon="ph-note" />
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
                      aria-label="Remove sticky"
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

          {/* Follow-ups */}
          <SectionHeader title="Follow-ups" icon="ph-bell-ringing" />
          <Show
            when={fuForMsg().length > 0}
            fallback={
              <p
                style={{
                  color: "var(--text-muted)",
                  "font-size": "var(--text-caption)",
                  "margin-bottom": "var(--space-2)",
                }}
              >
                暂无跟进。
              </p>
            }
          >
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
                    {relativeTime(f.dueAt)} · {f.status}
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
                      Mark done
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

        {/* Bottom action bar — scrollable on mobile so 10 actions don't crush. */}
        <div
          style={{
            display: "flex",
            gap: isMobile() ? "0" : "var(--space-1)",
            "flex-wrap": isMobile() ? "nowrap" : "wrap",
            "overflow-x": isMobile() ? "auto" : "visible",
            padding: "var(--space-3) var(--space-4)",
            "border-top": "0.5px solid var(--border)",
            background: "var(--surface-elevated)",
          }}
        >
          <ActionBtn
            icon="ph-arrow-u-up-left"
            label="Reply"
            onClick={reply}
            compact={isMobile()}
          />
          <ActionBtn
            icon="ph-users"
            label="Reply All"
            onClick={replyAll}
            compact={isMobile()}
          />
          <ActionBtn
            icon="ph-share-fat"
            label="Forward"
            onClick={forward}
            compact={isMobile()}
          />
          <ActionBtn
            icon="ph-clock"
            label={message()!.replyLater ? "Unmark Later" : "Later"}
            active={!!message()!.replyLater}
            onClick={toggleReplyLater}
            compact={isMobile()}
          />
          <ActionBtn
            icon="ph-push-pin"
            label={message()!.setAside ? "Unmark Aside" : "Save"}
            active={!!message()!.setAside}
            onClick={toggleSetAside}
            compact={isMobile()}
          />
          <ActionBtn
            icon="ph-arrow-fat-line-up"
            label="Remind"
            onClick={bubbleUp}
            compact={isMobile()}
          />
          <ActionBtn
            icon="ph-bell-ringing"
            label="Follow-up"
            onClick={() => setFuPickerOpen(true)}
            compact={isMobile()}
          />
          <ActionBtn
            icon="ph-note"
            label="Sticky"
            onClick={addSticky}
            compact={isMobile()}
          />
          <ActionBtn
            icon="ph-bookmark-simple"
            label="Clip"
            onClick={addClip}
            compact={isMobile()}
          />
          <MoreMenu
            bucket={message()!.bucket}
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
                await refetchAll();
              }}
            />
            <MovePicker
              open={moveOpen()}
              onClose={() => setMoveOpen(false)}
              messageIds={[m().id]}
              onChange={async () => {
                await refetchMessage();
                await refetchAll();
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
        label="Summarize"
        testId="message-summarize"
        onClick={props.onSummarize}
      />
      <HeaderActionBtn
        icon="ph-copy"
        label="Copy"
        testId="message-copy"
        onClick={props.onCopy}
      />
      <HeaderActionBtn
        icon="ph-download-simple"
        label="Download"
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

function ViewModeToggle(props: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const modes: { value: ViewMode; label: string }[] = [
    { value: "rendered", label: "Rendered" },
    { value: "plain", label: "Plain" },
    { value: "source", label: "Source" },
  ];
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
      <For each={modes}>
        {(m) => (
          <button
            data-view-mode={m.value}
            onClick={() => props.onChange(m.value)}
            style={{
              padding: "4px 10px",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-micro)",
              "font-weight": "600",
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

function MoreMenu(props: {
  bucket: Message["bucket"];
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

  const directMoveItems: {
    icon: string;
    label: string;
    testId: string;
    bucket: Message["bucket"];
  }[] = [
    {
      icon: "ph-tray",
      label: "移到 Imbox",
      testId: "message-move-imbox",
      bucket: "imbox",
    },
    {
      icon: "ph-newspaper",
      label: "移到 Stream",
      testId: "message-move-feed",
      bucket: "feed",
    },
    {
      icon: "ph-folder",
      label: "移到 Records",
      testId: "message-move-paperTrail",
      bucket: "paperTrail",
    },
  ];

  type MenuItem = {
    icon: string;
    label: string;
    testId?: string;
    action: () => void;
  };

  const items: MenuItem[] = [
    ...directMoveItems
      .filter((it) => it.bucket !== props.bucket)
      .map((it) => ({
        icon: it.icon,
        label: it.label,
        testId: it.testId,
        action: () => {
          setOpen(false);
          void props.onMoveToBucket(it.bucket);
        },
      })),
    {
      icon: "ph-sparkle",
      label: "Ask Agent",
      testId: "message-ask-agent",
      action: () => {
        setOpen(false);
        void props.onAskAgent();
      },
    },
    {
      icon: "ph-archive",
      label: "归档",
      action: () => {
        setOpen(false);
        void props.onArchive();
      },
    },
    {
      icon: "ph-file-dotted",
      label: "保存为草稿",
      action: () => {
        setOpen(false);
        void props.onSaveDraft();
      },
    },
    {
      icon: "ph-tag",
      label: "标签",
      action: () => {
        setOpen(false);
        props.onLabel();
      },
    },
    {
      icon: "ph-folder",
      label: "移动",
      action: () => {
        setOpen(false);
        props.onMove();
      },
    },
    {
      icon: "ph-envelope-open",
      label: "标为未读",
      action: () => {
        setOpen(false);
        void props.onUnread();
      },
    },
    {
      icon: "ph-trash",
      label: "移到 Trash",
      testId: "message-move-trash",
      action: () => {
        setOpen(false);
        void props.onTrash();
      },
    },
    {
      icon: "ph-warning-circle",
      label: "移到 Spam",
      action: () => {
        setOpen(false);
        void props.onSpam();
      },
    },
    {
      icon: "ph-prohibit",
      label: "屏蔽发件人",
      action: () => {
        setOpen(false);
        void props.onBlock();
      },
    },
  ];
  return (
    <div style={{ position: "relative" }}>
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
            "min-width": "160px",
            background: "var(--surface-elevated)",
            border: "0.5px solid var(--border)",
            "border-radius": "var(--radius-md)",
            "box-shadow": "var(--shadow-md)",
            padding: "4px",
            "z-index": 10,
          }}
        >
          <For each={items}>
            {(item) => (
              <button
                data-testid={item.testId}
                onClick={item.action}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-2)",
                  width: "100%",
                  padding: "8px 10px",
                  "border-radius": "var(--radius-sm)",
                  "font-size": "var(--text-caption)",
                  color: "var(--text-primary)",
                  background: "transparent",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--paper-mid)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
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
