/** MessagePanel — full message detail with thread, sticky notes, clips, follow-ups.
 * Spec: prototype-v11 §3.3 + P4 features.
 */

import { Show, For, createMemo, createResource, createSignal } from "solid-js";
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
import { setDetailOpen, setSelectedMessageId, setComposeOpen, showToast } from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { FollowUpPicker } from "../components/FollowUpPicker";
import { RemindPicker } from "../components/RemindPicker";
import { uid } from "../utils/id";
import { addDays, isoNow, relativeTime } from "../utils/date";
import { trackerSummary } from "../utils/trackers";
import type { Clip, FollowUp, Sticky } from "../types";

export function MessagePanel(props: { messageId: string }) {
  const [message, { refetch: refetchMessage }] = createResource(() => props.messageId, getMessage);
  const [contact] = createResource(
    () => message()?.pid ?? "",
    (pid) => getContact(pid)
  );
  const [, { refetch: refetchAll }] = createResource(listMessages);
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
        <div style={{ padding: "var(--space-5)", flex: 1, "overflow-y": "auto" }}>
          {/* Hero */}
          <div style={{ display: "flex", "align-items": "center", gap: "var(--space-3)", "margin-bottom": "var(--space-4)" }}>
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
            }}
          >
            {message()!.body}
          </p>

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