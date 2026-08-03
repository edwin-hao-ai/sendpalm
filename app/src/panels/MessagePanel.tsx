/** MessagePanel — full message detail with thread, sticky notes, clips, follow-ups.
 * Spec: prototype-v11 §3.3 + P4 features.
 */

import { Show, For, createMemo, createResource, createSignal, createEffect } from "solid-js";
import {
  getContact,
  getMessage,
  listMessages,
  listStickies,
  upsertSticky,
  deleteSticky,
  listFollowUps,
  upsertFollowUp,
  upsertClip,
  upsertMessage,
} from "../stores/data";
import { setDetailOpen, setSelectedMessageId, setComposeOpen, showToast, setCalendarJumpTo, setView } from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { FollowUpPicker } from "../components/FollowUpPicker";
import { RemindPicker } from "../components/RemindPicker";
import { uid } from "../utils/id";
import { addDays, isoNow, relativeTime } from "../utils/date";
import { trackerSummary } from "../utils/trackers";
import type { Clip, FollowUp, Message, Sticky } from "../types";
import { addCalendarEvent } from "../services/backend";

export function MessagePanel(props: { messageId: string }) {
  const [message, { refetch: refetchMessage }] = createResource(() => props.messageId, getMessage);
  const [contact] = createResource(
    () => message()?.pid ?? "",
    (pid) => getContact(pid)
  );
  const [allMessages, { refetch: refetchAll }] = createResource(listMessages);
  const [stickies, { refetch: refetchStickies }] = createResource(listStickies);
  const [followUps, { refetch: refetchFU }] = createResource(listFollowUps);

  const reply = () => {
    setComposeOpen(true);
    showToast({ message: "Compose opened", kind: "info" });
  };

  const toggleReplyLater = async () => {
    const m = message();
    if (!m) return;
    await upsertMessage({ ...m, replyLater: !m.replyLater });
    await refetchMessage();
    await refetchAll();
    showToast({ message: m.replyLater ? "已取消 Reply Later" : "已 Reply Later", kind: "success" });
  };

  const toggleSetAside = async () => {
    const m = message();
    if (!m) return;
    await upsertMessage({ ...m, setAside: !m.setAside });
    await refetchMessage();
    await refetchAll();
    showToast({ message: m.setAside ? "已取消 Set Aside" : "已 Set Aside", kind: "success" });
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
  const PULL_MAX = 140;      // clamp visual stretch
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

  // Other messages in the same conversation (matched by threadId). Excludes
  // the current message. Sorted oldest-first so the thread reads top-down.
  const threadMessages = createMemo<Message[]>(() => {
    const cur = message();
    if (!cur?.threadId) return [];
    const tid = cur.threadId;
    return (allMessages() ?? [])
      .filter((m) => m.id !== cur.id && m.threadId === tid)
      .sort((a, b) => (a.st ?? "").localeCompare(b.st ?? ""));
  });

  const currentIndex = createMemo(() => {
    const id = props.messageId;
    return sortedMessages().findIndex((m) => m.id === id);
  });

  const nextMessage = () => sortedMessages()[currentIndex() + 1] ?? null;
  const prevMessage = () => sortedMessages()[currentIndex() - 1] ?? null;

  // We need `allMessages` from the resource created above. Hoist a local
  // alias so the createMemo below can read it.
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
    // Track message id.
    props.messageId;
    // Replay the entry animation by clearing it and forcing reflow.
    queueMicrotask(() => {
      if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: "smooth" });
      if (heroEl) {
        heroEl.style.animation = "none";
        // Force reflow so the browser registers the reset.
        void heroEl.offsetHeight;
        heroEl.style.animation = "message-detail-enter 0.28s var(--ease-out) both";
      }
    });
  });

  function atTop() {
    return !scrollEl || scrollEl.scrollTop <= 0;
  }
  function atBottom() {
    if (!scrollEl) return false;
    return scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;
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
    // Bail out the moment the user scrolls inward past the edge — the
    // gesture was a mistake (probably a swipe-into-content).
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
    else if (pullOrigin === "bottom" && dy < 0) distance = Math.min(-dy, PULL_MAX);
    setPullDist(distance);
  }

  function onPullPointerUp(e: PointerEvent) {
    if (pullActivePointer !== e.pointerId) return;
    const distance = pullDist();
    const kind = pullKind();
    pullActivePointer = null;
    pullOrigin = null;
    if (distance >= PULL_THRESHOLD && kind) {
      // Commit the navigation with a spring snap.
      setPullDist(PULL_MAX);
      setTimeout(() => {
        if (kind === "down-next") goNext();
        else goPrev();
        setPullKind(null);
        setPullDist(0);
      }, 160);
    } else {
      // Spring back to the resting position.
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
    (stickies() ?? []).filter((s) => s.msgId === props.messageId)
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
    const c: Clip = {
      id: uid("cl"),
      text: m.prev || m.body.slice(0, 200),
      msgId: m.id,
      contactId: m.pid,
      createdAt: isoNow(),
    };
    await upsertClip(c);
    showToast({ message: "已保存为 Clip", kind: "success" });
  };

  const fuForMsg = createMemo<FollowUp[]>(() =>
    (followUps() ?? []).filter((f) => f.msgId === props.messageId)
  );

  const [fuPickerOpen, setFuPickerOpen] = createSignal(false);
  const [remindPickerOpen, setRemindPickerOpen] = createSignal(false);

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
          onClick={() => { setSelectedMessageId(null); setDetailOpen(false); }}
          aria-label="Close"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}>
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
          <div style={{ display: "flex", "flex-wrap": "wrap", gap: "4px", "margin-top": "var(--space-2)" }}>
            <For each={trackerTypes()}>
              {(t) => (
                <span style={{
                  padding: "2px 8px",
                  background: "var(--coral)",
                  color: "white",
                  "border-radius": "var(--radius-pill)",
                  "font-size": "10px",
                  "font-weight": "700",
                }}>
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
            transform: pullKind() === "down-next"
              ? `translateY(${pullDist() * 0.55}px)`
              : pullKind() === "up-prev"
                ? `translateY(-${pullDist() * 0.55}px)`
                : "translateY(0)",
            transition: pullActivePointer === null
              ? "transform 0.42s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
              : "none",
            "touch-action": "pan-y",
          }}
        >
          {/* Hero */}
          <div
            ref={(el) => (heroEl = el)}
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-3)",
              "margin-bottom": "var(--space-4)",
              animation: "message-detail-enter 0.28s var(--ease-out) both",
            }}
          >
            <Avatar name={contact()!.name} src={contact()!.avatar} size={40} />
            <div>
              <strong>{contact()!.name}</strong>
              <div style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
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
              "margin-bottom": "var(--space-3)",
            }}
          >
            {message()!.subj}
          </h3>
          <p
            style={{
              "white-space": "pre-wrap",
              "font-size": "var(--text-body-sm)",
              color: "var(--text-secondary)",
              "line-height": 1.6,
              "overflow-wrap": "anywhere",
              "word-break": "break-word",
            }}
          >
            {message()!.body}
          </p>

          {/* Calendar invite */}
          <Show when={message()!.calendarInvite}>
            <div
              data-calendar-invite
              style={{
                "margin-top": "var(--space-4)",
                padding: "var(--space-4)",
                background: "linear-gradient(135deg, var(--palm-soft) 0%, rgba(10,143,99,0.06) 100%)",
                border: "1px solid var(--palm)",
                "border-radius": "var(--radius-md)",
                "animation": "message-detail-enter 0.32s var(--ease-out) both",
              }}
            >
              <div style={{ display: "flex", "align-items": "center", gap: "var(--space-2)", "margin-bottom": "var(--space-2)" }}>
                <Icon name="ph-calendar-plus" size={18} style={{ color: "var(--palm)" }} />
                <strong style={{ "font-family": "var(--font-display)", "font-weight": "700" }}>
                  日历邀请
                </strong>
              </div>
              <div style={{ "font-size": "var(--text-body-sm)", "margin-bottom": "var(--space-1)" }}>
                <strong style={{ "font-weight": "700" }}>
                  {message()!.calendarInvite!.summary || "(无标题)"}
                </strong>
              </div>
              <div style={{ "font-size": "var(--text-caption)", color: "var(--text-secondary)", display: "flex", "flex-direction": "column", gap: "4px" }}>
                <Show when={message()!.calendarInvite!.dtstart}>
                  <span>
                    <Icon name="ph-clock" size={12} />{" "}
                    {formatIcalDate(message()!.calendarInvite!.dtstart)}
                    <Show when={message()!.calendarInvite!.dtend}>
                      {" → "}
                      {formatIcalDate(message()!.calendarInvite!.dtend, true)}
                    </Show>
                  </span>
                </Show>
                <Show when={message()!.calendarInvite!.location}>
                  <span><Icon name="ph-map-pin" size={12} /> {message()!.calendarInvite!.location}</span>
                </Show>
                <Show when={message()!.calendarInvite!.description}>
                  <p style={{ margin: "4px 0 0", "white-space": "pre-wrap", "max-height": "120px", overflow: "hidden", "text-overflow": "ellipsis" }}>
                    {message()!.calendarInvite!.description}
                  </p>
                </Show>
              </div>
              <button
                onClick={async () => {
                  const invite = message()!.calendarInvite!;
                  if (!invite.summary) {
                    showToast({ message: "邀请缺少标题", kind: "warning" });
                    return;
                  }
                  try {
                    const id = await addCalendarEvent(invite);
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
                      showToast({ message: "未配置 Tauri 运行时，无法添加", kind: "info" });
                    }
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    showToast({ message: `添加失败：${msg}`, kind: "error" });
                  }
                }}
                style={{
                  "margin-top": "var(--space-3)",
                  padding: "8px 16px",
                  background: "var(--palm)",
                  color: "white",
                  "border-radius": "var(--radius-pill)",
                  "font-size": "var(--text-caption)",
                  "font-weight": "700",
                  "box-shadow": "0 4px 12px rgba(10,143,99,0.25)",
                  transition: "transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(10,143,99,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(10,143,99,0.25)";
                }}
              >
                <Icon name="ph-calendar-plus" size={14} /> 添加到日历
              </button>
            </div>
          </Show>

          {/* Thread (other messages in the same conversation) */}
          <Show when={threadMessages().length > 0}>
            <SectionHeader
              title={`串内其他邮件 · ${threadMessages().length}`}
              icon="ph-chat-circle-dots"
            />
            <div
              style={{
                display: "flex",
                "flex-direction": "column",
                gap: "var(--space-2)",
                animation: "list-item-enter 0.32s var(--ease-out) both",
              }}
            >
              <For each={threadMessages()}>
                {(m) => (
                  <button
                    onClick={() => setSelectedMessageId(m.id)}
                    style={{
                      display: "flex",
                      "flex-direction": "column",
                      gap: "4px",
                      padding: "var(--space-3) var(--space-4)",
                      background: "var(--paper-mid)",
                      "border-radius": "var(--radius-md)",
                      "border-left": `3px solid ${
                        m.unread ? "var(--palm)" : "var(--border)"
                      }`,
                      "text-align": "left",
                      cursor: "pointer",
                      transition:
                        "background var(--duration-fast) var(--ease-out), transform 0.16s var(--ease-out)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--paper-light)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--paper-mid)";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        "align-items": "baseline",
                        gap: "var(--space-2)",
                      }}
                    >
                      <strong
                        style={{
                          "font-size": "var(--text-caption)",
                          "font-weight": m.unread ? "700" : "500",
                          color: m.unread
                            ? "var(--text-primary)"
                            : "var(--text-secondary)",
                          "white-space": "nowrap",
                          overflow: "hidden",
                          "text-overflow": "ellipsis",
                          flex: 1,
                        }}
                      >
                        {m.subj || "(无主题)"}
                      </strong>
                      <span
                        style={{
                          "font-size": "var(--text-micro)",
                          color: "var(--text-muted)",
                          "white-space": "nowrap",
                          "flex-shrink": 0,
                        }}
                      >
                        {m.tm}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        "font-size": "var(--text-caption)",
                        color: "var(--text-secondary)",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                      }}
                    >
                      {m.prev || "(无内容预览)"}
                    </p>
                  </button>
                )}
              </For>
            </div>
          </Show>

          {/* Stickies */}
          <Show when={stickyForMsg().length > 0 || true}>
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
                  <div style={{ display: "flex", "align-items": "center", gap: "var(--space-2)" }}>
                    <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)", "margin-left": "auto" }}>
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
          <Show when={fuForMsg().length > 0} fallback={
            <p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)", "margin-bottom": "var(--space-2)" }}>
              暂无跟进。
            </p>
          }>
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
              transition: pullActivePointer === null
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
              name={pullKind() === "down-next" ? "ph-arrow-down" : "ph-arrow-up"}
              size={14}
            />
            <span style={{
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "white-space": "nowrap",
            }}>
              {pullKind() === "down-next" ? "下一封: " : "上一封: "}
              <Show when={pullKind() === "down-next" ? nextMessage() : prevMessage()} fallback="（已是最后一封）">
                {(m) => m().subj}
              </Show>
            </span>
          </div>
        </Show>

        {/* Bottom action bar */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-1)",
            padding: "var(--space-3) var(--space-4)",
            "border-top": "0.5px solid var(--border)",
            background: "var(--surface-elevated)",
          }}
        >
          <ActionBtn icon="ph-arrow-u-up-left" label="Reply" onClick={reply} />
          <ActionBtn icon="ph-clock" label={message()!.replyLater ? "Unmark Later" : "Later"} active={!!message()!.replyLater} onClick={toggleReplyLater} />
          <ActionBtn icon="ph-push-pin" label={message()!.setAside ? "Unmark Aside" : "Save"} active={!!message()!.setAside} onClick={toggleSetAside} />
          <ActionBtn icon="ph-arrow-fat-line-up" label="Remind" onClick={bubbleUp} />
          <ActionBtn icon="ph-bell-ringing" label="Follow-up" onClick={() => setFuPickerOpen(true)} />
          <ActionBtn icon="ph-note" label="Sticky" onClick={addSticky} />
          <ActionBtn icon="ph-bookmark-simple" label="Clip" onClick={addClip} />
        </div>
      </Show>

      <FollowUpPicker open={fuPickerOpen()} onClose={() => setFuPickerOpen(false)} msgId={props.messageId} />
      <RemindPicker open={remindPickerOpen()} onClose={() => setRemindPickerOpen(false)} msgId={props.messageId} />
    </div>
  );
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

function ActionBtn(props: { icon: string; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      style={{
        flex: 1,
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "2px",
        padding: "8px",
        "border-radius": "var(--radius-md)",
        color: props.active ? "var(--palm)" : "var(--text-secondary)",
        background: props.active ? "var(--palm-soft)" : "transparent",
        "font-size": "10px",
        "font-weight": "600",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = props.active ? "var(--palm-soft)" : "var(--paper-mid)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = props.active ? "var(--palm-soft)" : "transparent")}
    >
      <Icon name={props.icon} size={18} />
      <span>{props.label}</span>
    </button>
  );
}