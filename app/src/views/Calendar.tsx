/** Calendar view — day / week / year.
 * Spec: prototype-v11 §3.5.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { listEvents, upsertEvent, deleteEvent } from "../stores/data";
import { Modal } from "../components/Modal";
import { Empty } from "../components/Empty";
import { Icon } from "../components/Icon";
import { addDays } from "../utils/date";
import { uid } from "../utils/id";
import { setDetailOpen, setSelectedMeetingId, showToast } from "../stores/ui";
import type { CalendarEvent } from "../types";

export function Calendar() {
  const [events, { refetch }] = createResource(listEvents);
  const [view, setView] = createSignal<"day" | "week" | "year">("day");
  const [cursor, setCursor] = createSignal(new Date());
  const [editing, setEditing] = createSignal<CalendarEvent | null>(null);
  const [creating, setCreating] = createSignal(false);

  const eventsByDay = createMemo(() => {
    const list = events() ?? [];
    const map = new Map<string, CalendarEvent[]>();
    for (const e of list) {
      const key = new Date(e.dt).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  });

  const visibleEvents = createMemo<CalendarEvent[]>(() => {
    const list = events() ?? [];
    if (view() === "day") {
      const k = cursor().toDateString();
      return eventsByDay().get(k) ?? [];
    } else if (view() === "week") {
      const start = new Date(cursor());
      const dow = start.getDay();
      start.setDate(start.getDate() - dow);
      start.setHours(0, 0, 0, 0);
      const end = addDays(start, 7);
      return list.filter((e) => {
        const d = new Date(e.dt);
        return d >= start && d < end;
      });
    } else {
      const y = cursor().getFullYear();
      return list.filter((e) => new Date(e.dt).getFullYear() === y);
    }
  });

  const newEvent = (): CalendarEvent => {
    const dt = new Date(cursor());
    dt.setHours(10, 0, 0, 0);
    return {
      id: uid("ev"),
      title: "",
      dt: dt.toISOString(),
      tm: "10:00",
      dur: 30,
      pids: [],
      color: "#0A8F63",
      agenda: [],
      notes: "",
      brief: "",
      actionItems: [],
      materials: [],
    };
  };

  const onSave = async (e: CalendarEvent) => {
    await upsertEvent(e);
    await refetch();
    setEditing(null);
    setCreating(false);
    showToast({ message: "已保存", kind: "success" });
  };

  const onDelete = async (id: string) => {
    await deleteEvent(id);
    await refetch();
    setEditing(null);
    showToast({ message: "已删除", kind: "info" });
  };

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <header style={{ padding: "var(--space-5)", display: "flex", "align-items": "center", gap: "var(--space-3)", "flex-wrap": "wrap" }}>
        <h2 style={{ "font-family": "var(--font-display)", "font-size": "var(--text-h3)", "font-weight": "800", margin: 0, flex: 1 }}>
          Calendar
        </h2>
        <button onClick={() => setCursor(new Date())} style={toolbarBtn}>Today</button>
        <button onClick={() => setCursor(shiftCursor(cursor(), -1, view()))} style={toolbarBtn}>
          <Icon name="ph-caret-left" size={12} />
        </button>
        <button onClick={() => setCursor(shiftCursor(cursor(), 1, view()))} style={toolbarBtn}>
          <Icon name="ph-caret-right" size={12} />
        </button>
        <div style={{ display: "flex", gap: "4px" }}>
          <For each={["day", "week", "year"] as const}>
            {(v) => (
              <button onClick={() => setView(v)} style={{
                padding: "4px 12px",
                "border-radius": "var(--radius-pill)",
                background: view() === v ? "var(--palm-soft)" : "var(--paper-mid)",
                color: view() === v ? "var(--palm)" : "var(--text-secondary)",
                "font-size": "var(--text-caption)",
                "font-weight": view() === v ? "700" : "500",
              }}>
                {v === "day" ? "Day" : v === "week" ? "Week" : "Year"}
              </button>
            )}
          </For>
        </div>
        <button onClick={() => setCreating(true)} style={{
          padding: "8px 16px",
          background: "var(--palm)",
          color: "white",
          "border-radius": "var(--radius-pill)",
          "font-size": "var(--text-caption)",
          "font-weight": "700",
          display: "flex",
          "align-items": "center",
          gap: "4px",
        }}>
          <Icon name="ph-plus" size={12} /> New
        </button>
      </header>

      <PeriodHeader date={cursor()} view={view()} />

      <Show when={visibleEvents().length > 0} fallback={
        <Empty icon="ph-calendar-blank" title="这段时间没有会议" description="点击 New 创建。" />
      }>
        <div style={{ "max-width": "760px", margin: "0 auto", padding: "0 var(--space-5) var(--space-5)" }}>
          <For each={visibleEvents()}>
            {(e) => (
              <button
                onClick={() => { setSelectedMeetingId(e.id); setDetailOpen(true); }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "var(--space-4)",
                  background: "var(--paper-light)",
                  "border-left": `4px solid ${e.color}`,
                  "border-radius": "var(--radius-md)",
                  border: "0.5px solid var(--border)",
                  "margin-bottom": "var(--space-2)",
                  "text-align": "left",
                  cursor: "pointer",
                }}
                onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--paper-mid)")}
                onMouseLeave={(ev) => (ev.currentTarget.style.background = "var(--paper-light)")}
              >
                <div style={{ display: "flex", "align-items": "baseline", gap: "var(--space-2)" }}>
                  <strong style={{ "font-size": "var(--text-body-sm)" }}>{e.title || "(无标题)"}</strong>
                  <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)", "margin-left": "auto" }}>
                    {new Date(e.dt).toLocaleDateString()} · {e.tm}
                  </span>
                </div>
                <Show when={e.pids.length > 0}>
                  <p style={{ margin: "4px 0 0", "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
                    {e.pids.length} 参会人
                  </p>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={creating()}>
        <EventEditModal ev={newEvent()} isNew onClose={() => setCreating(false)} onSave={onSave} onDelete={() => onDelete(editing()?.id ?? "")} />
      </Show>
    </div>
  );
}

function shiftCursor(d: Date, dir: 1 | -1, view: "day" | "week" | "year"): Date {
  const out = new Date(d);
  if (view === "day") out.setDate(out.getDate() + dir);
  else if (view === "week") out.setDate(out.getDate() + dir * 7);
  else out.setFullYear(out.getFullYear() + dir);
  return out;
}

function PeriodHeader(props: { date: Date; view: "day" | "week" | "year" }) {
  const text = () => {
    if (props.view === "day") return props.date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    if (props.view === "week") {
      const start = new Date(props.date);
      start.setDate(start.getDate() - start.getDay());
      const end = addDays(start, 6);
      return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
    }
    return props.date.getFullYear().toString();
  };
  return (
    <div style={{ "text-align": "center", padding: "var(--space-3) var(--space-5) var(--space-2)", "font-family": "var(--font-display)", "font-size": "var(--text-h3)", "font-weight": "800" }}>
      {text()}
    </div>
  );
}

function EventEditModal(props: { ev: CalendarEvent; isNew: boolean; onClose: () => void; onSave: (e: CalendarEvent) => void; onDelete: () => void }) {
  const [draft, setDraft] = createSignal<CalendarEvent>(JSON.parse(JSON.stringify(props.ev)));
  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.isNew ? "New event" : "Edit event"}
      width="560px"
      footer={
        <>
          <Show when={!props.isNew}>
            <button onClick={props.onDelete} style={{ padding: "8px 16px", color: "var(--coral)", "font-size": "var(--text-caption)" }}>Delete</button>
          </Show>
          <button onClick={props.onClose} style={{ padding: "8px 16px", color: "var(--text-secondary)", "font-size": "var(--text-caption)" }}>取消</button>
          <button onClick={() => props.onSave(draft())} style={{
            padding: "10px 20px", background: "var(--palm)", color: "white",
            "border-radius": "var(--radius-pill)", "font-weight": "700", "font-size": "var(--text-caption)",
          }}>保存</button>
        </>
      }
    >
      <Field label="Title">
        <input value={draft().title} onInput={(e) => setDraft({ ...draft(), title: e.currentTarget.value })} style={inputStyle} />
      </Field>
      <Field label="Date">
        <input type="date" value={draft().dt.slice(0, 10)} onInput={(e) => setDraft({ ...draft(), dt: e.currentTarget.value + draft().dt.slice(10) })} style={inputStyle} />
      </Field>
      <Field label="Time">
        <input type="time" value={draft().tm} onInput={(e) => setDraft({ ...draft(), tm: e.currentTarget.value })} style={inputStyle} />
      </Field>
      <Field label="Duration (minutes)">
        <input type="number" value={draft().dur ?? 30} onInput={(e) => setDraft({ ...draft(), dur: parseInt(e.currentTarget.value) || 30 })} style={inputStyle} />
      </Field>
      <Field label="Color">
        <input type="color" value={draft().color} onInput={(e) => setDraft({ ...draft(), color: e.currentTarget.value })} style={{ width: "60px", height: "32px", padding: 0, border: "none" }} />
      </Field>
      <Field label="Brief">
        <textarea value={draft().brief} onInput={(e) => setDraft({ ...draft(), brief: e.currentTarget.value })} rows={3} style={{ ...inputStyle, "min-height": "80px", "font-family": "var(--font-body)", resize: "vertical" }} />
      </Field>
    </Modal>
  );
}

function Field(props: { label: string; children: unknown }) {
  return (
    <label style={{ display: "block", "margin-bottom": "var(--space-3)" }}>
      <span style={{ display: "block", "font-size": "var(--text-micro)", color: "var(--text-muted)", "font-weight": "700", "margin-bottom": "4px" }}>{props.label}</span>
      {props.children as never}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  border: "0.5px solid var(--border)",
  "border-radius": "var(--radius-md)",
  background: "var(--paper-light)",
  "font-size": "var(--text-body-sm)",
};

const toolbarBtn = {
  padding: "6px 12px",
  background: "var(--paper-mid)",
  "border-radius": "var(--radius-pill)",
  "font-size": "var(--text-caption)",
  color: "var(--text-secondary)",
  "font-weight": "600",
  display: "flex",
  "align-items": "center",
  gap: "4px",
};