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
  type JSX,
} from "solid-js";
import {
  getEvent,
  listContacts,
  listMessages,
  listFiles,
  upsertEvent,
} from "../stores/data";
import {
  setDetailOpen,
  setSelectedMeetingId,
  setSelectedFileId,
  showToast,
} from "../stores/ui";
import { Icon } from "../components/Icon";
import { uid } from "../utils/id";
import { generateMeetingBrief, linkedMaterialIds } from "../utils/meeting";
import { fileIconName } from "../utils/labels";
import { formatBytes } from "../utils/date";
import {
  respondToCalendarInvite,
  type RsvpResponse,
} from "../services/backend";
import type { CalendarEvent, ActionItem, AgendaItem } from "../types";
import { useRefreshEffect } from "../utils/gestures";

export function MeetingPanel(props: { meetingId: string }) {
  const [event, { refetch: refetchEvent }] = createResource(
    () => props.meetingId,
    getEvent,
  );
  const [contacts, { refetch: refetchContacts }] = createResource(listContacts);
  const [messages, { refetch: refetchMessages }] = createResource(listMessages);
  const [files, { refetch: refetchFiles }] = createResource(listFiles);
  const [rsvpBusy, setRsvpBusy] = createSignal(false);

  useRefreshEffect(() => {
    void refetchEvent();
    void refetchContacts();
    void refetchMessages();
    void refetchFiles();
  });

  const sendRsvp = async (response: RsvpResponse) => {
    const ev = event();
    if (!ev) return;
    setRsvpBusy(true);
    try {
      const r = await respondToCalendarInvite(ev.id, response);
      if (r) {
        const label =
          response === "ACCEPTED"
            ? "已接受"
            : response === "DECLINED"
              ? "已拒绝"
              : "已标记为暂定";
        showToast({ message: `${label} · 已通过 iTip 回信给组织者`, kind: "success" });
        await refetchEvent();
      } else {
        showToast({
          message: "未配置 Tauri 运行时，无法发送回信",
          kind: "info",
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast({ message: `RSVP 发送失败：${msg}`, kind: "error" });
    } finally {
      setRsvpBusy(false);
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

  const save = async (patch: Partial<CalendarEvent>) => {
    const e = event();
    if (!e) return;
    await upsertEvent({ ...e, ...patch });
    await refetchEvent();
  };

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
    updateAgenda(e.agenda.filter((a) => a.id !== id));
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

  return (
    <div
      style={{ display: "flex", "flex-direction": "column", height: "100%" }}
    >
      <header
        style={{
          padding: "var(--space-3) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          background: "var(--surface-elevated)",
        }}
      >
        <button
          onClick={() => {
            setSelectedMeetingId(null);
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
          Meeting
        </strong>
      </header>

      <Show when={event()}>
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
                  {new Date(ev()!.dt).toLocaleString()} · {ev()!.tm}
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
                    }}
                  >
                    <span
                      style={{
                        "font-size": "var(--text-micro)",
                        "font-weight": "700",
                        color: "var(--text-muted)",
                        "margin-right": "var(--space-2)",
                        "text-transform": "uppercase",
                        "letter-spacing": "0.04em",
                      }}
                    >
                      <Icon name="ph-envelope-simple-open" size={11} /> RSVP
                    </span>
                    <button
                      data-testid="rsvp-accept"
                      onClick={() => void sendRsvp("ACCEPTED")}
                      disabled={rsvpBusy()}
                      style={rsvpBtn("var(--palm)", true)}
                    >
                      <Icon name="ph-check" size={12} /> 接受
                    </button>
                    <button
                      data-testid="rsvp-tentative"
                      onClick={() => void sendRsvp("TENTATIVE")}
                      disabled={rsvpBusy()}
                      style={rsvpBtn("var(--yellow)", false)}
                    >
                      <Icon name="ph-question" size={12} /> 暂定
                    </button>
                    <button
                      data-testid="rsvp-decline"
                      onClick={() => void sendRsvp("DECLINED")}
                      disabled={rsvpBusy()}
                      style={rsvpBtn("var(--coral)", false)}
                    >
                      <Icon name="ph-x" size={12} /> 拒绝
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
                          ? ` · ${new Date(ev()!.attendeeResponseAt!).toLocaleString()}`
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
                          }}
                        >
                          {c?.name ?? pid}
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
                <SectionHeader icon="ph-sparkle" title="Brief" />
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
                      No prior context found for these attendees.
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
                  <SectionHeader icon="ph-paperclip" title="Materials" />
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
                          onClick={() => {
                            setSelectedFileId(f.id);
                            setDetailOpen(true);
                          }}
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
                              {formatBytes(f.size)} · {f.mime}
                            </div>
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Agenda */}
                <SectionHeader icon="ph-list-checks" title="Agenda" />
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
                        aria-label="Remove agenda item"
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
                  <Icon name="ph-plus" size={12} /> Add item
                </button>

                {/* Notes */}
                <SectionHeader icon="ph-notebook" title="Notes" />
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
                <SectionHeader icon="ph-check-square" title="Action items" />
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
                        aria-label="Toggle done"
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
                          {contactById(ai.owner!)?.name ?? ai.owner}
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
                  <Icon name="ph-plus" size={12} /> Add action item
                </button>
              </div>
            </>
          );
        }}
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
