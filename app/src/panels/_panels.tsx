/** Placeholder panels for Meeting, File, Task, Draft — fill in M2. */

import { Show, createResource } from "solid-js";
import { getEvent, getFile, getTask, getDraft } from "../stores/data";
import type { CalendarEvent, Draft, FileItem, Task } from "../types";
import { setDetailOpen, setSelectedMeetingId, setSelectedFileId, setSelectedTaskId, setSelectedDraftId } from "../stores/ui";
import { Icon } from "../components/Icon";

const HeaderShell = (props: { title: string; onClose: () => void; children: unknown }) => (
  <div style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
    <div
      style={{
        padding: "var(--space-3) var(--space-5)",
        "border-bottom": "0.5px solid var(--border)",
        display: "flex",
        "align-items": "center",
        gap: "var(--space-3)",
        background: "var(--surface-elevated)",
      }}
    >
      <button onClick={props.onClose} aria-label="Close" style={{ color: "var(--text-muted)" }}>
        <Icon name="ph-arrow-left" size={18} />
      </button>
      <strong style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}>
        {props.title}
      </strong>
    </div>
    <div style={{ padding: "var(--space-5)", flex: 1, "overflow-y": "auto" }}>
      {props.children as never}
    </div>
  </div>
);

export function MeetingPanel(props: { meetingId: string }) {
  const [ev] = createResource(() => props.meetingId, getEvent);
  const value = (): CalendarEvent | null => ev() ?? null;
  return (
    <HeaderShell title="Meeting" onClose={() => { setSelectedMeetingId(null); setDetailOpen(false); }}>
      <Show when={value()}>
        <h3 style={{ "font-family": "var(--font-display)", margin: 0 }}>{value()!.title}</h3>
        <p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>
          {new Date(value()!.dt).toLocaleString()} · {value()!.tm}
        </p>
        <p style={{ "margin-top": "var(--space-4)", "font-size": "var(--text-body-sm)" }}>{value()!.brief}</p>
        <p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>
          M2 实装 Agenda / Notes / Action items / Materials
        </p>
      </Show>
    </HeaderShell>
  );
}

export function FilePanel(props: { fileId: string }) {
  const [f] = createResource(() => props.fileId, getFile);
  const value = (): FileItem | null => f() ?? null;
  return (
    <HeaderShell title="File" onClose={() => { setSelectedFileId(null); setDetailOpen(false); }}>
      <Show when={value()}>
        <h3 style={{ margin: 0 }}>{value()!.name}</h3>
        <p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>
          {(value()!.size / 1024).toFixed(0)} KB · {value()!.type}
        </p>
        <Show when={value()!.md}>
          <pre
            style={{
              "margin-top": "var(--space-4)",
              padding: "var(--space-3)",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "font-family": "var(--font-mono)",
              "font-size": "var(--text-caption)",
              "white-space": "pre-wrap",
            }}
          >
            {value()!.md}
          </pre>
        </Show>
      </Show>
    </HeaderShell>
  );
}

export function TaskPanel(props: { taskId: string }) {
  const [t] = createResource(() => props.taskId, getTask);
  const value = (): Task | null => t() ?? null;
  return (
    <HeaderShell title="Task" onClose={() => { setSelectedTaskId(null); setDetailOpen(false); }}>
      <Show when={value()}>
        <h3 style={{ margin: 0 }}>{value()!.title}</h3>
        <p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>
          {value()!.status} · {value()!.priority}
        </p>
        <Show when={value()!.notes}>
          <p style={{ "margin-top": "var(--space-3)" }}>{value()!.notes}</p>
        </Show>
      </Show>
    </HeaderShell>
  );
}

export function DraftPanel(props: { draftId: string }) {
  const [d] = createResource(() => props.draftId, getDraft);
  const value = (): Draft | null => d() ?? null;
  return (
    <HeaderShell title="Draft" onClose={() => { setSelectedDraftId(null); setDetailOpen(false); }}>
      <Show when={value()}>
        <h3 style={{ margin: 0 }}>{value()!.subject}</h3>
        <p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>
          to {value()!.recipient} · {value()!.status}
        </p>
        <pre
          style={{
            "margin-top": "var(--space-3)",
            padding: "var(--space-3)",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-md)",
            "white-space": "pre-wrap",
            "font-family": "var(--font-body)",
            "font-size": "var(--text-body-sm)",
          }}
        >
          {value()!.body}
        </pre>
      </Show>
    </HeaderShell>
  );
}