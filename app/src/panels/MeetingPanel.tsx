/** MeetingPanel — full meeting detail with brief, agenda, notes, action items, materials.
 * Spec: prototype-v11 §3.3.
 *
 * For events that came in as iCal invites (have `icalUid`), shows
 * Accept / Decline / Tentative RSVP buttons that send an iTip REPLY
 * to the organizer via SMTP. The sent response is recorded on the
 * event row and surfaced in the header as "已回复" with the timestamp.
 */

import {
  Show,
  For,
  createResource,
  createMemo,
  createSignal,
  onCleanup,
  type JSX,
} from "solid-js";
import {
  getEvent,
  listFiles,
  upsertEvent,
  deleteEvent,
} from "../stores/data";
import {
  setDetailOpen,
  setSelectedMeetingId,
  showToast,
} from "../stores/ui";
import { contactsList, refetchContacts } from "../stores/contacts";
import { Icon } from "../components/Icon";
import { ErrorState } from "../components/Empty";
import { Skeleton } from "../components/Skeleton";
import { EventEditModal } from "../views/Calendar";
import { FilePanel, fileTypeLabel } from "./FilePanel";
import { uid } from "../utils/id";
import { generateMeetingBrief, linkedMaterialIds } from "../utils/meeting";
import { fileIconName } from "../utils/labels";
import { formatBytes } from "../utils/date";
import {
  respondToCalendarInvite,
  type RsvpResponse,
} from "../services/backend";
import type { CalendarEvent, ActionItem, AgendaItem } from "../types";
import { useRefreshEffect, useSoftRefreshEffect } from "../utils/gestures";
import { listMessagesPaged } from "../stores/data";

export function MeetingPanel(props: { meetingId: string }) {
  const [event, { refetch: refetchEvent, mutate: setEvent }] = createResource(
    () => props.meetingId,
    getEvent,
  );
  // P2/ARCH-3: contacts come from the shared store. MeetingPanel
  // already called listContacts() once on mount, but with the
  // shared store it joins the same signal used by ContactPanel,
  // Agent, Compose, and the rest.
  const contacts = contactsList;
  // P1-8: listMessages() pulled body / body_html for every row.
  // The MeetingPanel only needs id / subj / pid / tm for the brief
  // builder and the "linked materials" list. Use the lightweight
  // paginated query, default to the first 200 most-recent rows.
  const [messages, { refetch: refetchMessages }] = createResource(() =>
    listMessagesPaged({ offset: 0, limit: 200, lightweight: true })
      .then((p) => p.items)
  );
  const [files, { refetch: refetchFiles }] = createResource(listFiles);
  // Tracks which RSVP button is in flight (null = idle) so the busy
  // state can show a spinner on the clicked button specifically.
  const [rsvpBusy, setRsvpBusy] = createSignal<RsvpResponse | null>(null);
  // Attachment overlay: opening a meeting material used to swap the
  // whole detail panel to FilePanel with no way back to the meeting.
  // Now the file opens in an overlay layer inside this panel.
  const [overlayFileId, setOverlayFileId] = createSignal<string | null>(
    null,
  );
  const [editingEvent, setEditingEvent] = createSignal(false);
  // Autosave indicator for agenda / notes / action items.
  const [saveState, setSaveState] = createSignal<"idle" | "saving" | number>(
    "idle",
  );

  // P1-8: hard refresh for the event/contacts; soft refresh for
  // messages/files. The full table scan on every sync tick was the
  // biggest single-source of perf pain in the meeting panel.
  useRefreshEffect(() => {
    void refetchEvent();
    void refetchContacts();
  });
  useSoftRefreshEffect(() => {
    void refetchMessages();
    void refetchFiles();
  });

  const sendRsvp = async (response: RsvpResponse) => {
    const ev = event();
    if (!ev) return;
    setRsvpBusy(response);
    try {
      const r = await respondToCalendarInvite(ev.id, response);
      if (r) {
        const label =
          response === "ACCEPTED"
            ? "已接受"
            : response === "DECLINED"
              ? "已拒绝"
              : "已标记为暂定";
        showToast({ message: `${label} · 已回信给组织者`, kind: "success" });
        await refetchEvent();
      } else {
        showToast({
          message: "当前环境暂不支持回信",
          kind: "info",
        });
      }
    } catch (e) {
      showToast({
        message: "回信发送失败，请检查网络后重试",
        kind: "error",
        source: "rsvp",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRsvpBusy(null);
    }
  };

  const brief = createMemo(() => {
    const ev = event();
    if (!ev) return [];
    return generateMeetingBrief(
      ev,
      messages() ?? [],
      files() ?? [],
      contacts() ?? [],
    );
  });

  const materials = createMemo(() => {
    const ev = event();
    if (!ev) return [];
    const ids = new Set(linkedMaterialIds(ev, files() ?? []));
    return (files() ?? []).filter((f) => ids.has(f.id));
  });

  // P1-7: debounce agenda / notes / brief / action_items edits so
  // typing a long notes textarea doesn't trigger one full
  // upsertEvent (25 columns + FTS re-index) per keystroke. 600 ms
  // is the same delay Gmail uses for autosave; long enough that a
  // fast typist batches multiple chars, short enough that a
  // tab-switch feels instant.
  let saveTimer: number | undefined;
  const save = (patch: Partial<CalendarEvent>) => {
    const e = event();
    if (!e) return;
    // Optimistic local merge: the in-memory event carries the
    // pending patch so the UI updates without waiting for the DB.
    setEvent({ ...e, ...patch });
    setSaveState("saving");
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => {
      try {
        await upsertEvent({ ...event()!, ...patch });
        await refetchEvent();
        setSaveState(Date.now());
      } catch (err) {
        setSaveState("idle");
        showToast({
          message: "保存失败，请重试",
          kind: "error",
          source: "meeting-panel",
          detail: String(err),
        });
      }
    }, 600);
  };
  onCleanup(() => {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
  });

  const updateAgenda = (agenda: AgendaItem[]) => save({ agenda });
  const updateNotes = (notes: string) => save({ notes });
  const updateActionItems = (items: ActionItem[]) =>
    save({ actionItems: items });

  const contactById = (id: string) => contacts()?.find((c) => c.id === id);

  const newAgendaItem = () => {
    const e = event();
    if (!e) return;
    const agenda: AgendaItem[] = [...e.agenda, { id: uid("ag"), body: "" }];
    updateAgenda(agenda);
  };

  const updateAgendaBody = (id: string, body: string) => {
    const e = event();
    if (!e) return;
    updateAgenda(e.agenda.map((a) => (a.id === id ? { ...a, body } : a)));
  };

  const removeAgendaItem = (id: string) => {
    const e = event();
    if (!e) return;
    const idx = e.agenda.findIndex((a) => a.id === id);
    const removed = e.agenda[idx];
    if (!removed) return;
    updateAgenda(e.agenda.filter((a) => a.id !== id));
    showToast({
      message: "已删除议程项",
      kind: "info",
      ttlMs: 5000,
      action: {
        label: "撤销",
        run: () => {
          const cur = event();
          if (!cur) return;
          const next = [...cur.agenda];
          next.splice(Math.min(idx, next.length), 0, removed);
          updateAgenda(next);
        },
      },
    });
  };

  const newActionItem = () => {
    const e = event();
    if (!e) return;
    const items: ActionItem[] = [
      ...e.actionItems,
      { id: uid("ai"), title: "", done: false },
    ];
    updateActionItems(items);
  };

  const toggleActionDone = (id: string) => {
    const e = event();
    if (!e) return;
    updateActionItems(
      e.actionItems.map((a) => (a.id === id ? { ...a, done: !a.done } : a)),
    );
  };

  const saveStateText = () => {
    const s = saveState();
    if (s === "saving") return "正在保存…";
    if (typeof s === "number") {
      const d = new Date(s);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `已自动保存 ${hh}:${mm}`;
    }
    return "";
  };

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        position: "relative",
      }}
    >
      <style>{MEETING_PANEL_CSS}</style>
      <header
        style={{
          padding: "var(--space-3) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          background:
            "color-mix(in srgb, var(--surface-elevated) 82%, transparent)",
          "backdrop-filter": "blur(20px) saturate(1.4)",
          "-webkit-backdrop-filter": "blur(20px) saturate(1.4)",
        }}
      >
        <button
          onClick={() => {
            setSelectedMeetingId(null);
            setDetailOpen(false);
          }}
          aria-label="关闭"
          title="关闭 (Esc)"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-x" size={18} />
        </button>
        <strong
          style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}
        >
          会议
        </strong>
        <span
          aria-live="polite"
          style={{
            "margin-left": "auto",
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
          }}
        >
          {saveStateText()}
        </span>
        <Show when={event()}>
          <button
            onClick={() => setEditingEvent(true)}
            title="编辑会议"
            style={{
              display: "inline-flex",
              "align-items": "center",
              gap: "4px",
              padding: "6px 12px",
              "border-radius": "var(--radius-pill)",
              background: "var(--paper-mid)",
              color: "var(--text-secondary)",
              "font-size": "var(--text-caption)",
              "font-weight": "600",
            }}
          >
            <Icon name="ph-pencil-simple" size={12} /> 编辑
          </button>
        </Show>
      </header>

      <Show
        when={!event.error}
        fallback={
          <ErrorState
            title="会议加载失败"
            message="请稍后重试；若反复失败，可到顶栏的错误日志里查看详情。"
            retry={() => void refetchEvent()}
          />
        }
      >
        <Show
          when={event()}
          fallback={
            <div style={{ padding: "var(--space-5)" }} aria-busy="true">
              <Skeleton height="28px" width="60%" />
              <div style={{ height: "var(--space-3)" }} />
              <Skeleton height="14px" width="80%" />
              <div style={{ height: "var(--space-5)" }} />
              <Skeleton height="16px" />
              <div style={{ height: "var(--space-2)" }} />
              <Skeleton height="16px" />
              <div style={{ height: "var(--space-2)" }} />
              <Skeleton height="16px" width="70%" />
              <div style={{ height: "var(--space-5)" }} />
              <Skeleton height="120px" />
            </div>
          }
        >
        {(getEv) => {
          const ev = () => getEv() as CalendarEvent | undefined;
          return (
            <>
              <div
                style={{
                  padding: "var(--space-5)",
                  "border-bottom": "0.5px solid var(--border)",
                }}
              >
                <h3
                  style={{
                    "font-family": "var(--font-display)",
                    "font-size": "var(--text-h4)",
                    "font-weight": "800",
                    margin: 0,
                    "margin-bottom": "var(--space-2)",
                  }}
                >
                  {ev()!.title}
                </h3>
                <p
                  style={{
                    "font-size": "var(--text-caption)",
                    color: "var(--text-muted)",
                    margin: 0,
                  }}
                >
                  <Icon name="ph-calendar-blank" size={12} />{" "}
                  {new Date(ev()!.dt).toLocaleString("zh-CN", {
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  })}
                  {ev()!.tm ? ` · ${ev()!.tm}` : ""}
                  <Show when={ev()!.location}>
                    {" · "}
                    <Icon name="ph-map-pin" size={12} /> {ev()!.location}
                  </Show>
                </p>

                <Show when={ev()!.icalUid && ev()!.organizerEmail}>
                  <div
                    data-rsvp-row
                    style={{
                      "margin-top": "var(--space-3)",
                      display: "flex",
                      "flex-wrap": "wrap",
                      gap: "var(--space-2)",
                      "align-items": "center",
                      padding: "var(--space-3)",
                      "border-radius": "var(--radius-lg)",
                      background:
                        "color-mix(in srgb, var(--paper-light) 82%, transparent)",
                      "backdrop-filter": "blur(20px) saturate(1.4)",
                      "-webkit-backdrop-filter": "blur(20px) saturate(1.4)",
                      border: "0.5px solid var(--border)",
                    }}
                  >
                    <span
                      style={{
                        "font-size": "var(--text-micro)",
                        "font-weight": "700",
                        color: "var(--text-muted)",
                        "margin-right": "var(--space-2)",
                        "letter-spacing": "0.04em",
                      }}
                    >
                      <Icon name="ph-envelope-simple-open" size={11} /> 邀请回复
                    </span>
                    <button
                      data-testid="rsvp-accept"
                      onClick={() => void sendRsvp("ACCEPTED")}
                      disabled={rsvpBusy() !== null}
                      style={rsvpBtn("var(--palm)", true)}
                    >
                      <Icon
                        name={
                          rsvpBusy() === "ACCEPTED"
                            ? "ph-circle-notch"
                            : "ph-check"
                        }
                        size={12}
                        class={rsvpBusy() === "ACCEPTED" ? "mp-spin" : ""}
                      />{" "}
                      接受
                    </button>
                    <button
                      data-testid="rsvp-tentative"
                      onClick={() => void sendRsvp("TENTATIVE")}
                      disabled={rsvpBusy() !== null}
                      style={rsvpBtn("var(--yellow)", false)}
                    >
                      <Icon
                        name={
                          rsvpBusy() === "TENTATIVE"
                            ? "ph-circle-notch"
                            : "ph-question"
                        }
                        size={12}
                        class={rsvpBusy() === "TENTATIVE" ? "mp-spin" : ""}
                      />{" "}
                      暂定
                    </button>
                    <button
                      data-testid="rsvp-decline"
                      onClick={() => void sendRsvp("DECLINED")}
                      disabled={rsvpBusy() !== null}
                      style={rsvpBtn("var(--coral)", false)}
                    >
                      <Icon
                        name={
                          rsvpBusy() === "DECLINED"
                            ? "ph-circle-notch"
                            : "ph-x"
                        }
                        size={12}
                        class={rsvpBusy() === "DECLINED" ? "mp-spin" : ""}
                      />{" "}
                      拒绝
                    </button>
                    <Show when={ev()!.attendeeResponse}>
                      <span
                        data-testid="rsvp-status"
                        style={{
                          "margin-left": "auto",
                          "font-size": "var(--text-micro)",
                          color: "var(--palm)",
                          "font-weight": "700",
                        }}
                      >
                        <Icon name="ph-check-circle" size={11} /> 已回复
                        {ev()!.attendeeResponse === "ACCEPTED"
                          ? " 接受"
                          : ev()!.attendeeResponse === "DECLINED"
                            ? " 拒绝"
                            : ev()!.attendeeResponse === "TENTATIVE"
                              ? " 暂定"
                              : ""}
                        {ev()!.attendeeResponseAt
                          ? ` · ${new Date(ev()!.attendeeResponseAt!).toLocaleString("zh-CN")}`
                          : ""}
                      </span>
                    </Show>
                  </div>
                </Show>
                <div
                  style={{
                    display: "flex",
                    "flex-wrap": "wrap",
                    gap: "var(--space-2)",
                    "margin-top": "var(--space-3)",
                  }}
                >
                  <For each={ev()!.pids}>
                    {(pid) => {
                      const c = contactById(pid);
                      return (
                        <span
                          style={{
                            padding: "3px 10px",
                            background: "var(--paper-mid)",
                            "border-radius": "var(--radius-pill)",
                            "font-size": "var(--text-micro)",
                            "font-weight": "600",
                            color: c ? undefined : "var(--text-muted)",
                          }}
                        >
                          {c?.name ?? "未知联系人"}
                        </span>
                      );
                    }}
                  </For>
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  "overflow-y": "auto",
                  padding: "var(--space-5)",
                }}
              >
                {/* Brief */}
                <SectionHeader icon="ph-sparkle" title="简报" />
                <Show
                  when={brief().length > 0}
                  fallback={
                    <p
                      style={{
                        padding: "var(--space-3)",
                        background: "var(--paper-mid)",
                        "border-radius": "var(--radius-md)",
                        "font-size": "var(--text-caption)",
                        color: "var(--text-muted)",
                      }}
                    >
                      没有找到与这些参会人相关的历史邮件和文件。
                    </p>
                  }
                >
                  <div
                    style={{
                      display: "flex",
                      "flex-direction": "column",
                      gap: "var(--space-2)",
                    }}
                  >
                    <For each={brief()}>
                      {(item) => (
                        <div
                          style={{
                            display: "flex",
                            gap: "var(--space-2)",
                            "align-items": "flex-start",
                            padding: "var(--space-3)",
                            background: "var(--agent-soft)",
                            "border-radius": "var(--radius-md)",
                            "font-size": "var(--text-body-sm)",
                            "line-height": 1.5,
                          }}
                        >
                          <Icon
                            name="ph-lightbulb"
                            size={16}
                            style={{ "margin-top": "2px", "flex-shrink": 0 }}
                          />
                          <span>{item}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Materials */}
                <Show when={materials().length > 0}>
                  <SectionHeader icon="ph-paperclip" title="相关材料" />
                  <div
                    style={{
                      display: "flex",
                      "flex-direction": "column",
                      gap: "var(--space-2)",
                    }}
                  >
                    <For each={materials()}>
                      {(f) => (
                        <button
                          onClick={() => setOverlayFileId(f.id)}
                          style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "var(--space-3)",
                            padding: "var(--space-3)",
                            background: "var(--paper-mid)",
                            "border-radius": "var(--radius-md)",
                            "text-align": "left",
                            cursor: "pointer",
                          }}
                        >
                          <Icon
                            name={fileIconName(f.type)}
                            size={20}
                            style={{ color: "var(--text-secondary)" }}
                          />
                          <div style={{ flex: 1, "min-width": 0 }}>
                            <div
                              style={{
                                "font-size": "var(--text-body-sm)",
                                "font-weight": 600,
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
                              {formatBytes(f.size)} · {fileTypeLabel(f.type)}
                            </div>
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Agenda */}
                <SectionHeader icon="ph-list-checks" title="议程" />
                <For each={ev()!.agenda}>
                  {(a, i) => (
                    <div
                      style={{
                        display: "flex",
                        gap: "var(--space-2)",
                        "margin-bottom": "var(--space-2)",
                        "align-items": "flex-start",
                      }}
                    >
                      <span
                        style={{
                          "font-family": "var(--font-mono)",
                          "font-size": "var(--text-micro)",
                          color: "var(--text-muted)",
                          "padding-top": "8px",
                        }}
                      >
                        {String(i() + 1).padStart(2, "0")}
                      </span>
                      <input
                        value={a.body}
                        onChange={(e) =>
                          updateAgendaBody(a.id, e.currentTarget.value)
                        }
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          background: "var(--paper-mid)",
                          border: "none",
                          "border-radius": "var(--radius-md)",
                          "font-size": "var(--text-body-sm)",
                        }}
                      />
                      <button
                        onClick={() => removeAgendaItem(a.id)}
                        aria-label="删除议程项"
                        style={{ color: "var(--text-muted)", padding: "4px" }}
                      >
                        <Icon name="ph-x" size={12} />
                      </button>
                    </div>
                  )}
                </For>
                <button
                  onClick={newAgendaItem}
                  style={{
                    display: "inline-flex",
                    "align-items": "center",
                    gap: "var(--space-1)",
                    padding: "6px 12px",
                    background: "var(--paper-mid)",
                    "border-radius": "var(--radius-pill)",
                    "font-size": "var(--text-caption)",
                    color: "var(--text-secondary)",
                    "font-weight": "600",
                    "margin-top": "var(--space-2)",
                  }}
                >
                  <Icon name="ph-plus" size={12} /> 添加一项
                </button>

                {/* Notes */}
                <SectionHeader icon="ph-notebook" title="笔记" />
                <textarea
                  value={ev()!.notes}
                  onChange={(e) => updateNotes(e.currentTarget.value)}
                  rows={5}
                  placeholder="记下要点…"
                  style={{
                    width: "100%",
                    padding: "var(--space-3)",
                    background: "var(--paper-mid)",
                    border: "none",
                    "border-radius": "var(--radius-md)",
                    "font-family": "var(--font-body)",
                    "font-size": "var(--text-body-sm)",
                    resize: "vertical",
                  }}
                />

                {/* Action items */}
                <SectionHeader icon="ph-check-square" title="待办事项" />
                <For each={ev()!.actionItems}>
                  {(ai) => (
                    <div
                      style={{
                        display: "flex",
                        gap: "var(--space-2)",
                        "align-items": "center",
                        padding: "var(--space-2) 0",
                      }}
                    >
                      <button
                        onClick={() => toggleActionDone(ai.id)}
                        aria-label="标记完成"
                        style={{
                          width: "20px",
                          height: "20px",
                          "border-radius": "var(--radius-sm)",
                          border: "1.5px solid var(--border-strong)",
                          background: ai.done ? "var(--palm)" : "transparent",
                          display: "flex",
                          "align-items": "center",
                          "justify-content": "center",
                        }}
                      >
                        <Show when={ai.done}>
                          <Icon name="ph-check" size={12} color="white" />
                        </Show>
                      </button>
                      <input
                        value={ai.title}
                        onChange={(e) =>
                          updateActionItems(
                            ev()!.actionItems.map((x) =>
                              x.id === ai.id
                                ? { ...x, title: e.currentTarget.value }
                                : x,
                            ),
                          )
                        }
                        style={{
                          flex: 1,
                          border: "none",
                          background: "transparent",
                          "font-size": "var(--text-body-sm)",
                          "text-decoration": ai.done ? "line-through" : "none",
                          color: ai.done
                            ? "var(--text-muted)"
                            : "var(--text-primary)",
                        }}
                      />
                      <Show when={ai.owner}>
                        <span
                          style={{
                            "font-size": "var(--text-micro)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {contactById(ai.owner!)?.name ?? "未知联系人"}
                        </span>
                      </Show>
                    </div>
                  )}
                </For>
                <button
                  onClick={newActionItem}
                  style={{
                    display: "inline-flex",
                    "align-items": "center",
                    gap: "var(--space-1)",
                    padding: "6px 12px",
                    background: "var(--paper-mid)",
                    "border-radius": "var(--radius-pill)",
                    "font-size": "var(--text-caption)",
                    color: "var(--text-secondary)",
                    "font-weight": "600",
                    "margin-top": "var(--space-2)",
                  }}
                >
                  <Icon name="ph-plus" size={12} /> 添加待办
                </button>
              </div>
            </>
          );
        }}
        </Show>
      </Show>

      {/* Attachment overlay — opens the file in a layer on top of this
          panel so "back" returns to the meeting instead of losing it. */}
      <Show when={overlayFileId()}>
        {(fid) => (
          <div
            style={{
              position: "absolute",
              inset: 0,
              "z-index": 10,
              background: "var(--surface-elevated)",
              display: "flex",
              "flex-direction": "column",
            }}
          >
            <FilePanel
              fileId={fid()}
              onBack={() => setOverlayFileId(null)}
            />
          </div>
        )}
      </Show>

      <Show when={editingEvent() && event()}>
        {(getEv) => (
          <EventEditModal
            ev={getEv()}
            isNew={false}
            onClose={() => setEditingEvent(false)}
            onSave={async (next) => {
              await upsertEvent(next);
              await refetchEvent();
              setEditingEvent(false);
              showToast({ message: "已保存", kind: "success" });
            }}
            onDelete={async () => {
              await deleteEvent(getEv().id);
              setEditingEvent(false);
              setSelectedMeetingId(null);
              setDetailOpen(false);
              showToast({ message: "已删除", kind: "info" });
            }}
          />
        )}
      </Show>
    </div>
  );
}

function SectionHeader(props: { icon: string; title: string }) {
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

const MEETING_PANEL_CSS = `
@keyframes mp-spin { to { transform: rotate(360deg); } }
.mp-spin { animation: mp-spin 0.8s linear infinite; display: inline-flex; }
`;

const rsvpBtn = (accent: string, primary: boolean): JSX.CSSProperties => ({
  display: "inline-flex",
  "align-items": "center",
  gap: "4px",
  padding: "6px 12px",
  "border-radius": "var(--radius-pill)",
  background: primary ? accent : "transparent",
  color: primary ? "white" : accent,
  border: `1px solid ${accent}`,
  "font-size": "var(--text-micro)",
  "font-weight": "700",
  cursor: "pointer",
  opacity: 1,
  transition: "transform 0.15s var(--ease-out)",
});
