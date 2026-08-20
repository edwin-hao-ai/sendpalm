/** Calendar view — day / week / year.
 * Spec: prototype-v11 §3.5.
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import {
  listEvents,
  upsertEvent,
  deleteEvent,
  listContacts,
} from "../stores/data";
import { Modal } from "../components/Modal";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import {
  addDays,
  sameDate,
  startOfWeek,
  endOfWeek,
  daysInMonth,
  timeToMinutes,
  formatMinutes,
} from "../utils/date";
import { uid } from "../utils/id";
import {
  setDetailOpen,
  setSelectedMeetingId,
  showToast,
  calendarJumpTo,
  calendarView as view,
  setCalendarView as setView,
  calendarSelected as cursor,
  setCalendarSelected as setCursor,
  calendarFilter as filter,
  setCalendarFilter as setFilter,
} from "../stores/ui";
import { useRefreshEffect } from "../utils/gestures";
import {
  expandOccurrences,
  type Occurrence,
} from "../utils/calendar-occurrences";
import type { CalendarEvent } from "../types";

/** M11 — A master event + a concrete start time, materialized
 *  from a recurrence rule inside the current view window. The
 *  view code treats this as a flat list (one row per occurrence)
 *  so the day/week/year grids can render recurring events
 *  without knowing about RRULE. */
interface OccurrenceView extends Occurrence {
  ev: CalendarEvent;
}

const DAY_MINUTES = 24 * 60;
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0"),
);
const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];
const FILTER_OPTIONS: { value: ReturnType<typeof filter>; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "meetings", label: "会议" },
  { value: "sometime", label: "待办" },
  { value: "habits", label: "习惯" },
  { value: "tracking", label: "计时" },
];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function Calendar() {
  const [events, { refetch }] = createResource(listEvents);
  const [editing, setEditing] = createSignal<CalendarEvent | null>(null);
  const [creating, setCreating] = createSignal(false);

  useRefreshEffect(() => {
    void refetch();
  });

  // When something asks us to recenter on a date (e.g. "已添加到日历" toast),
  // jump the cursor to that date and refetch events so it shows up.
  createEffect(() => {
    const stamp = calendarJumpTo();
    if (stamp === 0) return;
    const raw = sessionStorage.getItem("calendarJumpDate");
    if (!raw) return;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      setCursor(d);
      refetch();
    }
  });

  const matchesCalendarFilter = (e: CalendarEvent) => {
    const f = filter();
    if (f === "all") return true;
    if (f === "meetings")
      return (e.pids ?? []).length > 0 || !!e.location || !!e.videoLink;
    if (f === "sometime") return !!e.sometimeBucket;
    if (f === "habits") return !!e.habit;
    if (f === "tracking") return (e.timeTrackingMs ?? 0) > 0;
    return true;
  };

  // M11 — Build the list of occurrences (one row per master × date)
  // for the current view window. Day view shows 1 day, week shows 7,
  // year shows 365. Recurring events get expanded here; non-recurring
  // events pass through as a single occurrence. The result is sorted
  // by start time so the grids can iterate it directly.
  const occurrenceWindow = createMemo<[string, string]>(() => {
    if (view() === "day") {
      const d = cursor().toISOString().slice(0, 10);
      return [d, d];
    }
    if (view() === "week") {
      const s = startOfWeek(cursor());
      const e = endOfWeek(cursor());
      return [s.toISOString().slice(0, 10), e.toISOString().slice(0, 10)];
    }
    // year view: the whole calendar year centered on the cursor's year.
    const y = cursor().getFullYear();
    return [`${y}-01-01`, `${y}-12-31`];
  });

  const allOccurrences = createMemo<OccurrenceView[]>(() => {
    const [wStart, wEnd] = occurrenceWindow();
    const out: OccurrenceView[] = [];
    for (const ev of (events() ?? []).filter(matchesCalendarFilter)) {
      for (const occ of expandOccurrences(ev, wStart, wEnd)) {
        out.push({ ...occ, ev });
      }
    }
    out.sort((a, b) => {
      const ta = timeToMinutes(a.ev.tm);
      const tb = timeToMinutes(b.ev.tm);
      return a.start.localeCompare(b.start) || ta - tb;
    });
    return out;
  });

  // Convert an OccurrenceView into a flat CalendarEvent so the
  // existing day / week / year grids can keep consuming the
  // `CalendarEvent[]` shape they were built around. The synthetic
  // row carries the concrete start time on the right day as its
  // `dt` (so day-of-month lookups Just Work) and a stable
  // occurrence id (so click handlers can route back to the
  // master via `masterId#date → masterId`).
  const occurrenceAsEvent = (o: OccurrenceView): CalendarEvent => ({
    ...o.ev,
    dt: o.start,
    id: o.id,
  });

  // The view grids see one row per master × occurrence-in-window.
  // Year view also needs the full year, but `allOccurrences`
  // already covers it via the occurrenceWindow memo.
  const sortedEvents = createMemo<CalendarEvent[]>(() => {
    // Day / week / year grids are all driven by occurrences. The
    // bare-masters list (below) is only used by the edit / delete
    // flows that need the master row.
    if (
      view() === "day" ||
      view() === "week" ||
      view() === "year"
    ) {
      return allOccurrences().map(occurrenceAsEvent);
    }
    // Some other view (sometime / habit / tracking) is handled
    // by its own filter — fall back to the master list so we
    // don't accidentally drop non-recurring events that fall
    // outside the view window.
    const list = (events() ?? []).filter(matchesCalendarFilter);
    return [...list].sort((a, b) => {
      const ta = timeToMinutes(a.tm);
      const tb = timeToMinutes(b.tm);
      return a.dt.localeCompare(b.dt) || ta - tb;
    });
  });

  const eventsForDate = (_date: Date) => {
    // Backward-compat: the day view used to receive
    // master-events filtered by date. The day view's
    // occurrenceWindow already covers the cursor day, so the
    // synthetic list returned by sortedEvents() for `view() ==
    // "day"` is correct.
    return sortedEvents();
  };

  const visibleHasEvents = createMemo(() => sortedEvents().length > 0);

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

  const openEvent = (e: CalendarEvent) => {
    // Accept either a master event id or an occurrence id
    // (`masterId#YYYY-MM-DD`, from a recurring event tile).
    // Either way the meeting panel opens on the master, not a
    // phantom per-occurrence copy.
    const id = e.id.includes("#") ? e.id.split("#")[0]! : e.id;
    setSelectedMeetingId(id);
    setDetailOpen(true);
  };

  const startEditing = (e: CalendarEvent) => {
    setEditing(e);
  };

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        "background-color": "var(--cal-bg)",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      <header
        style={{
          padding: "var(--space-5)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          "flex-wrap": "wrap",
          "border-bottom": "1px solid var(--cal-border)",
          "background-color": "var(--cal-surface)",
        }}
      >
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h3)",
            "font-weight": "800",
            margin: 0,
            flex: 1,
          }}
        >
          Calendar
        </h2>
        <button onClick={() => setCursor(new Date())} style={toolbarBtn}>
          Today
        </button>
        <button
          onClick={() => setCursor(shiftCursor(cursor(), -1, view()))}
          style={toolbarBtn}
        >
          <Icon name="ph-caret-left" size={12} />
        </button>
        <button
          onClick={() => setCursor(shiftCursor(cursor(), 1, view()))}
          style={toolbarBtn}
        >
          <Icon name="ph-caret-right" size={12} />
        </button>
        <div style={{ display: "flex", gap: "4px" }}>
          <For each={["day", "week", "year"] as const}>
            {(v) => (
              <button
                data-cal-view-btn={v}
                onClick={() => setView(v)}
                style={{
                  padding: "4px 12px",
                  "border-radius": "var(--radius-pill)",
                  background:
                    view() === v ? "var(--palm-soft)" : "var(--paper-mid)",
                  color: view() === v ? "var(--palm)" : "var(--text-secondary)",
                  "font-size": "var(--text-caption)",
                  "font-weight": view() === v ? "700" : "500",
                }}
              >
                {v === "day" ? "Day" : v === "week" ? "Week" : "Year"}
              </button>
            )}
          </For>
        </div>

        {/* Filter chips */}
        <div
          data-testid="calendar-filter-chips"
          style={{ display: "flex", gap: "6px", "flex-wrap": "wrap" }}
        >
          <For each={FILTER_OPTIONS}>
            {(f) => (
              <button
                data-testid={`calendar-filter-${f.value}`}
                onClick={() => setFilter(f.value)}
                style={{
                  padding: "4px 10px",
                  "border-radius": "var(--radius-pill)",
                  background:
                    filter() === f.value
                      ? "var(--palm-soft)"
                      : "var(--paper-mid)",
                  color:
                    filter() === f.value
                      ? "var(--palm)"
                      : "var(--text-secondary)",
                  "font-size": "var(--text-caption)",
                  "font-weight": filter() === f.value ? "700" : "500",
                  border: "0.5px solid var(--border)",
                  transition: "all 0.15s var(--ease-out)",
                }}
              >
                {f.label}
              </button>
            )}
          </For>
        </div>

        <button
          onClick={() => setCreating(true)}
          style={{
            padding: "8px 16px",
            background: "var(--palm)",
            color: "white",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
            display: "flex",
            "align-items": "center",
            gap: "4px",
          }}
        >
          <Icon name="ph-plus" size={12} /> New
        </button>
      </header>

      <PeriodHeader date={cursor()} view={view()} />

      <Show
        when={!events.error}
        fallback={
          <ErrorState
            title="日历加载失败"
            message={String(events.error ?? "")}
            retry={() => void refetch()}
          />
        }
      >
        <></>
      </Show>
      <Show
        when={visibleHasEvents()}
        fallback={
          <Empty
            icon="ph-calendar-blank"
            title="这段时间没有会议"
            description="点击 New 创建。"
          />
        }
      >
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "0 var(--space-5) var(--space-5)",
          }}
        >
          <Show when={view() === "day"}>
            <DayView
              date={cursor()}
              events={eventsForDate(cursor())}
              onEventClick={openEvent}
              onEventEdit={startEditing}
            />
          </Show>
          <Show when={view() === "week"}>
            <WeekGrid
              date={cursor()}
              events={sortedEvents()}
              onEventClick={openEvent}
              onEventEdit={startEditing}
              onDayClick={(d) => {
                setCursor(d);
                setView("day");
              }}
            />
          </Show>
          <Show when={view() === "year"}>
            <YearGrid
              year={cursor().getFullYear()}
              events={sortedEvents()}
              selected={cursor()}
              onDayClick={(d) => {
                setCursor(d);
                setView("day");
              }}
            />
          </Show>
        </div>
      </Show>

      <Show when={creating()}>
        <EventEditModal
          ev={newEvent()}
          isNew
          onClose={() => setCreating(false)}
          onSave={onSave}
          onDelete={() => onDelete(editing()?.id ?? "")}
        />
      </Show>

      <Show when={editing()}>
        {(ev) => (
          <EventEditModal
            ev={ev()}
            isNew={false}
            onClose={() => setEditing(null)}
            onSave={onSave}
            onDelete={() => onDelete(ev().id)}
          />
        )}
      </Show>
    </div>
  );
}

function shiftCursor(
  d: Date,
  dir: 1 | -1,
  view: "day" | "week" | "year",
): Date {
  const out = new Date(d);
  if (view === "day") out.setDate(out.getDate() + dir);
  else if (view === "week") out.setDate(out.getDate() + dir * 7);
  else out.setFullYear(out.getFullYear() + dir);
  return out;
}

function PeriodHeader(props: { date: Date; view: "day" | "week" | "year" }) {
  const text = () => {
    if (props.view === "day")
      return props.date.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    if (props.view === "week") {
      const s = startOfWeek(props.date);
      const e = endOfWeek(s);
      const sameMonth = s.getMonth() === e.getMonth();
      const m1 = MONTH_NAMES[s.getMonth()];
      const m2 = MONTH_NAMES[e.getMonth()];
      const y = e.getFullYear();
      if (sameMonth) {
        return `${m1} ${s.getDate()} – ${e.getDate()}, ${y}`;
      }
      return `${m1} ${s.getDate()} – ${m2} ${e.getDate()}, ${y}`;
    }
    return `${props.date.getFullYear()} · 全年鸟瞰`;
  };
  return (
    <div
      style={{
        "text-align": "center",
        padding: "var(--space-3) var(--space-5) var(--space-2)",
        "font-family": "var(--font-display)",
        "font-size": "var(--text-h3)",
        "font-weight": "800",
        color: "var(--cal-ink)",
      }}
    >
      {text()}
    </div>
  );
}

/* ── Day view (hero + filmstrip + agenda) ──────────────── */

function DayView(props: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onEventEdit: (e: CalendarEvent) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-4)",
        "max-width": "960px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      <DayHero date={props.date} events={props.events} />
      <DayFilmstrip events={props.events} onEventClick={props.onEventClick} />
      <DayAgenda
        events={props.events}
        onEventClick={props.onEventClick}
        onEventEdit={props.onEventEdit}
      />
    </div>
  );
}

function DayHero(props: { date: Date; events: CalendarEvent[] }) {
  const [label, setLabel] = createSignal(
    localStorage.getItem(dayLabelKey(props.date)) ?? "",
  );
  const [editing, setEditing] = createSignal(false);
  const inputRef = createSignal<HTMLInputElement | undefined>(undefined);

  const eventTimes = createMemo(() =>
    props.events.map((e) => ({
      start: timeToMinutes(e.tm),
      end: timeToMinutes(e.tm) + (e.dur ?? 30),
    })),
  );

  const stats = createMemo(() => {
    const slots = computeFreetimeSlots(eventTimes(), 6, 22);
    const totalBusy = eventTimes().reduce((s, e) => s + (e.end - e.start), 0);
    const freetime = slots.reduce((s, x) => s + x.duration, 0);
    const longest = slots.reduce(
      (a, b) => (b.duration > a.duration ? b : a),
      slots[0] ?? { start: 0, duration: 0 },
    );
    return { totalBusy, freetime, longest };
  });

  const saveLabel = (v: string) => {
    const trimmed = v.trim();
    if (trimmed) {
      localStorage.setItem(dayLabelKey(props.date), trimmed);
      setLabel(trimmed);
    } else {
      localStorage.removeItem(dayLabelKey(props.date));
      setLabel("");
    }
    setEditing(false);
  };

  const weekdayNames = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];
  const monthNames = [
    "一月",
    "二月",
    "三月",
    "四月",
    "五月",
    "六月",
    "七月",
    "八月",
    "九月",
    "十月",
    "十一月",
    "十二月",
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-5)",
        padding: "var(--space-5)",
        background: "var(--cal-surface)",
        "border-radius": "var(--radius-xl)",
        border: "1px solid var(--cal-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          "justify-content": "center",
          padding: "var(--space-3) var(--space-5)",
          "border-right": "0.5px solid var(--border)",
        }}
      >
        <div
          style={{
            "font-size": "var(--text-caption)",
            color: "var(--cal-ink-muted)",
            "font-weight": "700",
          }}
        >
          {weekdayNames[props.date.getDay()]}
        </div>
        <div
          style={{
            "font-family": "var(--font-serif)",
            "font-size": "var(--text-hero)",
            "font-weight": "900",
            color: "var(--cal-ink)",
            "line-height": 1,
          }}
        >
          {props.date.getDate()}
        </div>
        <div
          style={{
            "font-size": "var(--text-caption)",
            color: "var(--text-secondary)",
          }}
        >
          {monthNames[props.date.getMonth()]} {props.date.getFullYear()}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          "flex-direction": "column",
          gap: "var(--space-3)",
        }}
      >
        <div>
          <Show
            when={editing()}
            fallback={
              <button
                onClick={() => setEditing(true)}
                style={{
                  "font-family": "var(--font-display)",
                  "font-size": "var(--text-h4)",
                  "font-weight": "800",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: label() ? "var(--cal-ink)" : "var(--text-muted)",
                }}
              >
                {label() || "为这一天命名…"}
              </button>
            }
          >
            <input
              ref={(el) => {
                inputRef[1](el);
                if (el) {
                  el.focus();
                  el.select();
                }
              }}
              value={label()}
              onInput={(e) => setLabel(e.currentTarget.value)}
              onBlur={(e) => saveLabel(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveLabel(label());
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="为这一天命名…"
              style={{
                "font-family": "var(--font-display)",
                "font-size": "var(--text-h4)",
                "font-weight": "800",
                border: "none",
                "border-bottom": "2px solid var(--palm)",
                background: "transparent",
                outline: "none",
                width: "100%",
                color: "var(--cal-ink)",
              }}
            />
          </Show>
        </div>

        <div style={{ display: "flex", gap: "var(--space-5)" }}>
          <div>
            <div
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--cal-ink-muted)",
                "font-weight": "700",
              }}
            >
              会议
            </div>
            <div
              style={{
                "font-family": "var(--font-display)",
                "font-size": "var(--text-h5)",
                "font-weight": "800",
                color: "var(--cal-ink)",
              }}
            >
              {formatTimeCompact(stats().totalBusy)}
            </div>
          </div>
          <div>
            <div
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--cal-ink-muted)",
                "font-weight": "700",
              }}
            >
              空闲
            </div>
            <div
              style={{
                "font-family": "var(--font-display)",
                "font-size": "var(--text-h5)",
                "font-weight": "800",
                color: "var(--palm)",
              }}
            >
              {formatTimeCompact(stats().freetime)}
            </div>
          </div>
          <div>
            <div
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--cal-ink-muted)",
                "font-weight": "700",
              }}
            >
              最长空档
            </div>
            <div
              style={{
                "font-family": "var(--font-display)",
                "font-size": "var(--text-h5)",
                "font-weight": "800",
                color: "var(--cal-ink)",
              }}
            >
              {stats().longest.duration >= 60
                ? formatTimeCompact(stats().longest.duration)
                : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DayFilmstrip(props: {
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const startHour = 0;
  const endHour = 24;
  const totalMinutes = (endHour - startHour) * 60;

  const eventTimes = createMemo(() =>
    props.events
      .map((e) => {
        const start = timeToMinutes(e.tm);
        const end = start + (e.dur ?? 30);
        return { event: e, start, end };
      })
      .sort((a, b) => a.start - b.start),
  );

  const freetime = createMemo(() =>
    computeFreetimeSlots(
      eventTimes().map((e) => ({ start: e.start, end: e.end })),
      startHour,
      endHour,
    ).filter((s) => s.duration >= 60),
  );

  const now = new Date();
  const showNow = createMemo(
    () => sameDate(now, new Date(props.events[0]?.dt ?? now)), // placeholder: we don't have date in props, use current
  );
  void showNow;

  return (
    <div
      style={{
        background: "var(--cal-surface)",
        "border-radius": "var(--radius-xl)",
        border: "1px solid var(--cal-border)",
        padding: "var(--space-4)",
        overflow: "auto",
      }}
    >
      <div
        style={{
          position: "relative",
          height: "96px",
          "min-width": "800px",
        }}
      >
        <For each={HOUR_LABELS}>
          {(_, i) => (
            <div
              style={{
                position: "absolute",
                left: `${(i() / 24) * 100}%`,
                top: 0,
                bottom: 0,
                width: "1px",
                "background-color":
                  i() % 3 === 0 ? "var(--border-strong)" : "var(--border)",
              }}
            />
          )}
        </For>

        <For each={HOUR_LABELS}>
          {(_, i) => (
            <Show when={i() % 3 === 0}>
              <div
                style={{
                  position: "absolute",
                  left: `${(i() / 24) * 100}%`,
                  top: "78px",
                  "font-size": "var(--text-micro)",
                  color: "var(--cal-ink-muted)",
                  "font-family": "var(--font-mono)",
                  transform: "translateX(-50%)",
                }}
              >
                {HOUR_LABELS[i()]}:00
              </div>
            </Show>
          )}
        </For>

        <For each={freetime()}>
          {(s) => {
            const left = ((s.start - startHour * 60) / totalMinutes) * 100;
            const width = (s.duration / totalMinutes) * 100;
            return (
              <div
                title={`空闲 ${formatTimeCompact(s.duration)}`}
                style={{
                  position: "absolute",
                  top: "28px",
                  bottom: "28px",
                  left: `${left}%`,
                  width: `${width}%`,
                  "background-color": "var(--palm-soft)",
                  "border-radius": "var(--radius-sm)",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                }}
              >
                <Show when={s.duration >= 180}>
                  <span
                    style={{
                      "font-size": "var(--text-micro)",
                      color: "var(--palm)",
                      "font-weight": "700",
                    }}
                  >
                    {formatTimeCompact(s.duration)} 空闲
                  </span>
                </Show>
              </div>
            );
          }}
        </For>

        <For each={eventTimes()}>
          {(item) => {
            const left = ((item.start - startHour * 60) / totalMinutes) * 100;
            const width = Math.max(
              ((item.end - item.start) / totalMinutes) * 100,
              1.5,
            );
            return (
              <button
                onClick={() => props.onEventClick(item.event)}
                title={`${item.event.title || "(无标题)"} · ${formatMinutes(
                  item.start,
                )} – ${formatMinutes(item.end)}`}
                style={{
                  position: "absolute",
                  top: "18px",
                  bottom: "18px",
                  left: `${left}%`,
                  width: `${width}%`,
                  "background-color": item.event.color,
                  color: textColorForBg(item.event.color),
                  "border-radius": "var(--radius-sm)",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 6px",
                  "text-align": "left",
                  "font-size": "var(--text-micro)",
                  "font-weight": "700",
                  overflow: "hidden",
                  "box-shadow": "var(--shadow-sm)",
                  "z-index": 2,
                }}
              >
                <div style={{ opacity: 0.85 }}>{formatMinutes(item.start)}</div>
                <div
                  style={{
                    "white-space": "nowrap",
                    "text-overflow": "ellipsis",
                    overflow: "hidden",
                  }}
                >
                  {item.event.title || "(无标题)"}
                </div>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}

function DayAgenda(props: {
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onEventEdit: (e: CalendarEvent) => void;
}) {
  const sorted = createMemo(() =>
    [...props.events].sort((a, b) => {
      // All-day events float to the top.
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return timeToMinutes(a.tm) - timeToMinutes(b.tm);
    }),
  );

  return (
    <div
      style={{
        background: "var(--cal-surface)",
        "border-radius": "var(--radius-xl)",
        border: "1px solid var(--cal-border)",
        padding: "var(--space-4)",
      }}
    >
      <div
        style={{
          display: "flex",
          "justify-content": "space-between",
          "align-items": "center",
          "margin-bottom": "var(--space-3)",
        }}
      >
        <div
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-body)",
            "font-weight": "800",
            color: "var(--cal-ink)",
          }}
        >
          今日会议
        </div>
        <div
          style={{
            "font-size": "var(--text-caption)",
            color: "var(--text-muted)",
          }}
        >
          {sorted().length} 场
        </div>
      </div>

      <Show
        when={sorted().length > 0}
        fallback={
          <div
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
              padding: "var(--space-4) 0",
            }}
          >
            没有会议，给自己一点时间吧。
          </div>
        }
      >
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "var(--space-2)",
          }}
        >
          <For each={sorted()}>
            {(e) => {
              const start = timeToMinutes(e.tm);
              const end = start + (e.dur ?? 30);
              return (
                <button
                  onClick={() => props.onEventClick(e)}
                  onDblClick={() => props.onEventEdit(e)}
                  style={{
                    display: "flex",
                    gap: "var(--space-3)",
                    padding: "var(--space-3)",
                    background: e.allDay
                      ? "var(--palm-soft)"
                      : "var(--paper-light)",
                    border: "0.5px solid var(--border)",
                    "border-radius": "var(--radius-lg)",
                    cursor: "pointer",
                    "text-align": "left",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      width: "4px",
                      "border-radius": "var(--radius-pill)",
                      "background-color": e.color,
                      "flex-shrink": 0,
                    }}
                  />
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <div
                      style={{
                        "font-size": "var(--text-caption)",
                        color: e.allDay
                          ? "var(--palm)"
                          : "var(--cal-ink-muted)",
                        "font-family": "var(--font-mono)",
                        "margin-bottom": "2px",
                      }}
                    >
                      {e.allDay
                        ? "全天"
                        : `${formatMinutes(start)} – ${formatMinutes(end)}`}
                    </div>
                    <div
                      style={{
                        "font-weight": "700",
                        "font-size": "var(--text-body-sm)",
                        color: "var(--cal-ink)",
                      }}
                    >
                      {e.title || "(无标题)"}
                    </div>
                    <Show when={e.location}>
                      <div
                        style={{
                          "font-size": "var(--text-caption)",
                          color: "var(--text-secondary)",
                          "margin-top": "2px",
                        }}
                      >
                        {e.location}
                      </div>
                    </Show>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

function dayLabelKey(date: Date): string {
  return `sp:day-label:${date.toISOString().split("T")[0]}`;
}

/* ── Week grid ──────────────────────────────────────────── */

function WeekGrid(props: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onEventEdit: (e: CalendarEvent) => void;
  onDayClick: (d: Date) => void;
}) {
  const weekStart = createMemo(() => startOfWeek(props.date));
  const days = createMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart(), i)),
  );

  const weekSummary = createMemo(() => {
    let totalEvents = 0;
    let totalBusy = 0;
    let busiestDay = "";
    let busiestCount = 0;
    for (const day of days()) {
      const list = props.events.filter((e) => sameDate(new Date(e.dt), day));
      const busy = list.reduce((s, e) => s + (e.dur ?? 30), 0);
      totalEvents += list.length;
      totalBusy += busy;
      if (list.length > busiestCount) {
        busiestCount = list.length;
        busiestDay = `${day.getMonth() + 1}/${day.getDate()}`;
      }
    }
    return { totalEvents, totalBusy, busiestDay };
  });

  const multiDayEvents = createMemo(() =>
    getMultiDayEvents(props.events, weekStart(), addDays(weekStart(), 6)),
  );

  return (
    <div
      data-cal-view="week"
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-4)",
        "max-width": "1400px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "var(--space-4)",
          padding: "var(--space-4)",
          background: "var(--cal-surface)",
          "border-radius": "var(--radius-xl)",
          border: "1px solid var(--cal-border)",
        }}
      >
        <div>
          <div
            style={{
              "font-size": "var(--text-micro)",
              color: "var(--cal-ink-muted)",
              "font-weight": "700",
            }}
          >
            本周会议
          </div>
          <div
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h4)",
              "font-weight": "800",
              color: "var(--cal-ink)",
            }}
          >
            {weekSummary().totalEvents}
          </div>
        </div>
        <div>
          <div
            style={{
              "font-size": "var(--text-micro)",
              color: "var(--cal-ink-muted)",
              "font-weight": "700",
            }}
          >
            工作时长
          </div>
          <div
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h4)",
              "font-weight": "800",
              color: "var(--palm)",
            }}
          >
            {formatTimeCompact(weekSummary().totalBusy)}
          </div>
        </div>
        <div>
          <div
            style={{
              "font-size": "var(--text-micro)",
              color: "var(--cal-ink-muted)",
              "font-weight": "700",
            }}
          >
            最忙一天
          </div>
          <div
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h4)",
              "font-weight": "800",
              color: "var(--cal-ink)",
            }}
          >
            {weekSummary().busiestDay || "—"}
          </div>
        </div>
      </div>

      <Show when={multiDayEvents().length > 0}>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--cal-surface)",
            "border-radius": "var(--radius-xl)",
            border: "1px solid var(--cal-border)",
            "align-items": "center",
          }}
        >
          <div
            style={{
              "font-size": "var(--text-micro)",
              color: "var(--cal-ink-muted)",
              "font-weight": "700",
              "white-space": "nowrap",
            }}
          >
            跨日事件
          </div>
          <div
            style={{
              position: "relative",
              flex: 1,
              height: "28px",
            }}
          >
            <For each={multiDayEvents()}>
              {(e) => {
                const start = createMemo(() =>
                  Math.max(0, daysBetween(weekStart(), new Date(e.dt))),
                );
                const end = createMemo(() =>
                  Math.min(6, daysBetween(weekStart(), new Date(e.endDt!))),
                );
                return (
                  <button
                    onClick={() => props.onEventClick(e)}
                    title={e.title}
                    style={{
                      position: "absolute",
                      left: `${(start() / 7) * 100}%`,
                      width: `${((end() - start() + 1) / 7) * 100}%`,
                      top: 0,
                      height: "100%",
                      "background-color": e.color,
                      color: textColorForBg(e.color),
                      "border-radius": "var(--radius-md)",
                      border: "none",
                      padding: "0 var(--space-2)",
                      "font-size": "var(--text-caption)",
                      "font-weight": "700",
                      "text-align": "left",
                      "white-space": "nowrap",
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      cursor: "pointer",
                      "box-shadow": "var(--shadow-sm)",
                    }}
                  >
                    {e.title}
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      <div
        style={{
          display: "grid",
          "grid-template-columns": "repeat(7, 1fr)",
          gap: "var(--space-2)",
        }}
      >
        <For each={days()}>
          {(day) => {
            const isToday = sameDate(day, new Date());
            const isSelected = sameDate(day, props.date);
            const dayEvents = props.events.filter((e) =>
              sameDate(new Date(e.dt), day),
            );
            const dayStats = createMemo(() => {
              const busy = dayEvents.reduce((s, e) => s + (e.dur ?? 30), 0);
              const slots = computeFreetimeSlots(
                dayEvents.map((e) => ({
                  start: timeToMinutes(e.tm),
                  end: timeToMinutes(e.tm) + (e.dur ?? 30),
                })),
                6,
                22,
              );
              const longest = slots.reduce(
                (a, b) => (b.duration > a.duration ? b : a),
                slots[0] ?? { start: 0, duration: 0 },
              );
              return { busy, longest };
            });
            return (
              <div
                onClick={() => props.onDayClick(day)}
                style={{
                  display: "flex",
                  "flex-direction": "column",
                  gap: "var(--space-2)",
                  "background-color": "var(--cal-surface)",
                  border: `1px solid ${isSelected ? "var(--palm)" : "var(--cal-border)"}`,
                  "border-radius": "var(--radius-lg)",
                  padding: "var(--space-3)",
                  "min-height": "620px",
                  cursor: "pointer",
                  "box-shadow": isSelected
                    ? "0 0 0 3px var(--palm-soft), var(--shadow-sm)"
                    : "var(--shadow-sm)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    "flex-direction": "column",
                    "align-items": "center",
                    gap: "2px",
                    "padding-bottom": "var(--space-2)",
                    "border-bottom": "1px solid var(--cal-border)",
                  }}
                >
                  <span
                    style={{
                      "font-size": "var(--text-micro)",
                      "font-weight": "700",
                      "text-transform": "uppercase",
                      "letter-spacing": "0.06em",
                      color: "var(--cal-ink-soft)",
                    }}
                  >
                    {WEEKDAY_NAMES[day.getDay()]}
                  </span>
                  <span
                    style={{
                      "font-family": "var(--font-serif)",
                      "font-size": "var(--text-h3)",
                      "font-weight": "800",
                      width: "40px",
                      height: "40px",
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "center",
                      "border-radius": "var(--radius-md)",
                      "background-color": isToday
                        ? "var(--palm)"
                        : "var(--paper-mid)",
                      color: isToday ? "white" : "var(--cal-ink)",
                    }}
                  >
                    {day.getDate()}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      "margin-top": "var(--space-2)",
                      "font-size": "var(--text-micro)",
                      color: "var(--cal-ink-muted)",
                      "font-weight": "600",
                    }}
                  >
                    <span>{dayEvents.length} 会议</span>
                    <span>·</span>
                    <span>{formatTimeCompact(dayStats().busy)} 工作</span>
                  </div>
                </div>

                <div
                  style={{
                    position: "relative",
                    flex: 1,
                    height: "560px",
                  }}
                >
                  <For each={Array.from({ length: 13 }, (_, i) => i * 2)}>
                    {(h) => (
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: `${(h / 24) * 100}%`,
                          height: "1px",
                          "background-color": "var(--border)",
                          "z-index": 1,
                        }}
                      />
                    )}
                  </For>

                  <For each={dayEvents}>
                    {(e) => {
                      const start = timeToMinutes(e.tm);
                      const end = start + (e.dur ?? 30);
                      const isRecurring = !!e.recurrenceRule;
                      return (
                        <button
                          data-cal-event-tile={isRecurring ? "recurring" : "single"}
                          data-cal-event-id={e.id}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            props.onEventClick(e);
                          }}
                          onDblClick={(ev) => {
                            ev.stopPropagation();
                            props.onEventEdit(e);
                          }}
                          title={`${e.title || "(无标题)"} · ${formatMinutes(start)} – ${formatMinutes(end)}`}
                          style={{
                            position: "absolute",
                            left: "4px",
                            right: "4px",
                            top: `${(start / DAY_MINUTES) * 100}%`,
                            height: `${Math.max(((end - start) / DAY_MINUTES) * 100, 2)}%`,
                            "min-height": "20px",
                            "background-color": e.color,
                            color: textColorForBg(e.color),
                            "border-radius": "var(--radius-sm)",
                            border: "none",
                            padding: "3px 5px",
                            "text-align": "left",
                            cursor: "pointer",
                            "font-size": "var(--text-micro)",
                            "font-weight": "700",
                            "z-index": 2,
                            overflow: "hidden",
                            "box-shadow": "var(--shadow-sm)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              "align-items": "center",
                              gap: "4px",
                              "font-family": "var(--font-mono)",
                              opacity: 0.85,
                            }}
                          >
                            <span>{formatMinutes(start)}</span>
                            {isRecurring && (
                              <span
                                aria-label="recurring"
                                style={{
                                  display: "inline-flex",
                                  "align-items": "center",
                                  "justify-content": "center",
                                  width: "14px",
                                  height: "14px",
                                  "border-radius": "999px",
                                  background: "rgba(255,255,255,0.25)",
                                  "font-size": "10px",
                                  "line-height": 1,
                                  "font-weight": "800",
                                }}
                              >
                                周
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              "white-space": "nowrap",
                              "text-overflow": "ellipsis",
                              overflow: "hidden",
                            }}
                          >
                            {e.title || "(无标题)"}
                          </div>
                        </button>
                      );
                    }}
                  </For>
                </div>

                <div
                  style={{
                    "font-size": "var(--text-caption)",
                    "font-weight": "700",
                    color:
                      dayStats().longest.duration >= 60
                        ? "var(--palm)"
                        : "var(--text-muted)",
                    padding: "var(--space-2) 0",
                    "border-top": "1px solid var(--cal-border)",
                    "text-align": "center",
                  }}
                >
                  {dayStats().longest.duration >= 60
                    ? `空闲 ${formatTimeCompact(dayStats().longest.duration)}`
                    : "忙碌"}
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

/* ── Year grid ──────────────────────────────────────────── */

function YearGrid(props: {
  year: number;
  events: CalendarEvent[];
  selected: Date;
  onDayClick: (d: Date) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-5)",
        "max-width": "1280px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "var(--space-1)",
          padding: "var(--space-6)",
          "background-color": "var(--cal-surface)",
          "border-radius": "var(--radius-xl)",
          border: "1px solid var(--cal-border)",
        }}
      >
        <div
          style={{
            "font-family": "var(--font-serif)",
            "font-size": "var(--text-hero)",
            "font-weight": "900",
            color: "var(--cal-ink)",
            "line-height": 1,
          }}
        >
          {props.year}
        </div>
        <div style={{ color: "var(--cal-ink-soft)", "font-weight": "600" }}>
          全年节奏 · 单日事件 · 跨日弧线
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "var(--space-4)",
          padding: "var(--space-3) var(--space-4)",
          background: "var(--cal-surface)",
          "border-radius": "var(--radius-xl)",
          border: "1px solid var(--cal-border)",
          "font-size": "var(--text-caption)",
          color: "var(--cal-ink-soft)",
        }}
      >
        <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              "border-radius": "50%",
              "background-color": "var(--palm)",
            }}
          />
          <span>单日会议</span>
        </div>
        <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
          <span
            style={{
              width: "18px",
              height: "6px",
              "border-radius": "var(--radius-sm)",
              "background-color": "var(--palm)",
            }}
          />
          <span>跨日事件</span>
        </div>
        <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
          <span
            style={{
              width: "14px",
              height: "14px",
              "border-radius": "50%",
              "box-shadow": "inset 0 0 0 1.5px var(--palm)",
            }}
          />
          <span>已标记</span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          "grid-template-columns": "repeat(3, 1fr)",
          gap: "var(--space-3)",
        }}
      >
        <For each={MONTH_NAMES}>
          {(_, m) => (
            <MonthMiniCalendar
              year={props.year}
              month={m()}
              events={props.events}
              selected={props.selected}
              onDayClick={props.onDayClick}
            />
          )}
        </For>
      </div>
    </div>
  );
}

function MonthMiniCalendar(props: {
  year: number;
  month: number;
  events: CalendarEvent[];
  selected: Date;
  onDayClick: (d: Date) => void;
}) {
  const firstDay = createMemo(() => new Date(props.year, props.month, 1));
  const startWeekday = createMemo(() => firstDay().getDay());
  const dayCount = createMemo(() => daysInMonth(firstDay()));
  const cells = createMemo(() => {
    const out: (number | null)[] = [];
    for (let i = 0; i < startWeekday(); i++) out.push(null);
    for (let d = 1; d <= dayCount(); d++) out.push(d);
    return out;
  });

  const hasEvent = (d: number) =>
    props.events.some((e) =>
      sameDate(new Date(e.dt), new Date(props.year, props.month, d)),
    );

  const monthMultiDayEvents = createMemo(() => {
    const monthStart = new Date(props.year, props.month, 1);
    const monthEnd = new Date(props.year, props.month + 1, 0);
    return getMultiDayEvents(props.events, monthStart, monthEnd).sort((a, b) =>
      a.dt.localeCompare(b.dt),
    );
  });

  return (
    <div
      style={{
        "background-color": "var(--cal-surface)",
        border: "1px solid var(--cal-border)",
        "border-radius": "var(--radius-lg)",
        padding: "var(--space-3)",
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-2)",
        "box-shadow": "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          "justify-content": "space-between",
          "align-items": "baseline",
          "padding-bottom": "var(--space-1)",
        }}
      >
        <span
          style={{
            "font-family": "var(--font-serif)",
            "font-size": "var(--text-body)",
            "font-weight": "800",
            color: "var(--cal-ink)",
          }}
        >
          {MONTH_NAMES[props.month]}
        </span>
        <span
          style={{
            "font-family": "var(--font-mono)",
            "font-size": "var(--text-micro)",
            color: "var(--cal-ink-muted)",
            "font-weight": "600",
          }}
        >
          {props.year}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          "grid-template-columns": "repeat(7, 1fr)",
          gap: "2px",
        }}
      >
        <For each={["S", "M", "T", "W", "T", "F", "S"]}>
          {(w) => (
            <div
              style={{
                "font-size": "var(--text-micro)",
                "font-weight": "700",
                "text-align": "center",
                color: "var(--cal-ink-muted)",
              }}
            >
              {w}
            </div>
          )}
        </For>
      </div>

      <div
        style={{
          display: "grid",
          "grid-template-columns": "repeat(7, 1fr)",
          gap: "2px",
        }}
      >
        <For each={cells()}>
          {(d) => {
            if (d === null) {
              return <div />;
            }
            const date = new Date(props.year, props.month, d);
            const today = sameDate(date, new Date());
            const selected = sameDate(date, props.selected);
            const event = hasEvent(d);
            return (
              <button
                onClick={() => props.onDayClick(date)}
                style={{
                  "font-family": "var(--font-mono)",
                  "font-size": "var(--text-micro)",
                  "font-weight": today ? "800" : "600",
                  "text-align": "center",
                  padding: "4px 0",
                  "border-radius": "var(--radius-micro)",
                  "background-color": today ? "var(--palm)" : "transparent",
                  color: today ? "white" : "var(--cal-ink)",
                  border: "none",
                  cursor: "pointer",
                  outline: selected ? "2px solid var(--palm)" : "none",
                  "outline-offset": selected ? "1px" : 0,
                  position: "relative",
                }}
              >
                {d}
                {event && (
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      bottom: "1px",
                      transform: "translateX(-50%)",
                      width: "4px",
                      height: "4px",
                      "border-radius": "50%",
                      "background-color": today ? "white" : "var(--palm)",
                    }}
                  />
                )}
              </button>
            );
          }}
        </For>
      </div>

      <Show when={monthMultiDayEvents().length > 0}>
        <div
          style={{
            position: "relative",
            height: `${Math.min(monthMultiDayEvents().length, 3) * 14 + 6}px`,
            "margin-top": "var(--space-2)",
            padding: "3px 0",
          }}
        >
          <For each={monthMultiDayEvents()}>
            {(e, idx) => {
              const monthStart = new Date(props.year, props.month, 1);
              const monthEnd = new Date(props.year, props.month + 1, 0);
              const eventStart = new Date(e.dt);
              const eventEnd = new Date(e.endDt!);
              const spanStart =
                eventStart < monthStart ? monthStart : eventStart;
              const spanEnd = eventEnd > monthEnd ? monthEnd : eventEnd;
              const left =
                ((spanStart.getDate() - 1) / monthEnd.getDate()) * 100;
              const width =
                ((spanEnd.getDate() - spanStart.getDate() + 1) /
                  monthEnd.getDate()) *
                100;
              return (
                <div
                  title={e.title}
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    width: `${width}%`,
                    top: `${idx() * 14 + 3}px`,
                    height: "10px",
                    "background-color": e.color,
                    "border-radius": "var(--radius-md)",
                    "min-width": "4px",
                  }}
                />
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

/* ── Layout helpers ─────────────────────────────────────── */

function textColorForBg(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "var(--cal-ink)";
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.6 ? "var(--cal-ink)" : "white";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "");
  if (clean.length !== 3 && clean.length !== 6) return null;
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function formatTimeCompact(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function computeFreetimeSlots(
  events: { start: number; end: number }[],
  startHour: number,
  endHour: number,
): { start: number; duration: number }[] {
  const boundsStart = startHour * 60;
  const boundsEnd = endHour * 60;
  const sorted = [...events]
    .filter((e) => e.end > boundsStart && e.start < boundsEnd)
    .sort((a, b) => a.start - b.start);

  const slots: { start: number; duration: number }[] = [];
  let cursor = boundsStart;
  for (const e of sorted) {
    if (e.start > cursor) {
      slots.push({ start: cursor, duration: e.start - cursor });
    }
    cursor = Math.max(cursor, e.end);
  }
  if (cursor < boundsEnd) {
    slots.push({ start: cursor, duration: boundsEnd - cursor });
  }
  return slots;
}

function getMultiDayEvents(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent[] {
  return events.filter((e) => {
    if (!e.endDt) return false;
    const s = new Date(e.dt);
    const en = new Date(e.endDt);
    return en > s && en >= rangeStart && s <= rangeEnd;
  });
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/* ── Event edit modal ───────────────────────────────────── */

function EventEditModal(props: {
  ev: CalendarEvent;
  isNew: boolean;
  onClose: () => void;
  onSave: (e: CalendarEvent) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = createSignal<CalendarEvent>(
    JSON.parse(JSON.stringify(props.ev)),
  );
  const [contacts] = createResource(listContacts);
  const [attendeeQ, setAttendeeQ] = createSignal("");

  const toggleAttendee = (id: string) => {
    const d = draft();
    const next = d.pids.includes(id)
      ? d.pids.filter((x) => x !== id)
      : [...d.pids, id];
    setDraft({ ...d, pids: next });
  };

  const filteredContacts = createMemo(() => {
    const q = attendeeQ().trim().toLowerCase();
    const list = contacts() ?? [];
    if (!q) return list.slice(0, 20);
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.emails.some((e) => e.value.toLowerCase().includes(q)),
    );
  });

  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.isNew ? "New event" : "Edit event"}
      width="560px"
      footer={
        <>
          <Show when={!props.isNew}>
            <button
              onClick={props.onDelete}
              style={{
                padding: "8px 16px",
                color: "var(--coral)",
                "font-size": "var(--text-caption)",
              }}
            >
              Delete
            </button>
          </Show>
          <button
            onClick={props.onClose}
            style={{
              padding: "8px 16px",
              color: "var(--text-secondary)",
              "font-size": "var(--text-caption)",
            }}
          >
            取消
          </button>
          <button
            onClick={() => props.onSave(draft())}
            style={{
              padding: "10px 20px",
              background: "var(--palm)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-weight": "700",
              "font-size": "var(--text-caption)",
            }}
          >
            保存
          </button>
        </>
      }
    >
      <Field label="Title">
        <input
          value={draft().title}
          onInput={(e) =>
            setDraft({ ...draft(), title: e.currentTarget.value })
          }
          style={inputStyle}
        />
      </Field>
      <Field label="All day">
        <label
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-2)",
            "font-size": "var(--text-body-sm)",
            color: "var(--text-secondary)",
          }}
        >
          <input
            type="checkbox"
            checked={draft().allDay ?? false}
            onChange={(e) =>
              setDraft({
                ...draft(),
                allDay: e.currentTarget.checked,
                tm: e.currentTarget.checked ? "" : "10:00",
                dur: e.currentTarget.checked ? undefined : 30,
              })
            }
          />
          All-day event
        </label>
      </Field>
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <Field label="Start date">
          <input
            type="date"
            value={draft().dt.slice(0, 10)}
            onInput={(e) =>
              setDraft({
                ...draft(),
                dt: e.currentTarget.value + draft().dt.slice(10),
              })
            }
            style={inputStyle}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            value={draft().endDt?.slice(0, 10) ?? ""}
            onInput={(e) => {
              const v = e.currentTarget.value;
              setDraft({
                ...draft(),
                endDt: v ? v + "T00:00:00" : undefined,
              });
            }}
            style={inputStyle}
          />
        </Field>
        <Show when={!draft().allDay}>
          <Field label="Time">
            <input
              type="time"
              value={draft().tm}
              onInput={(e) =>
                setDraft({ ...draft(), tm: e.currentTarget.value })
              }
              style={inputStyle}
            />
          </Field>
          <Field label="Duration (min)">
            <input
              type="number"
              value={draft().dur ?? 30}
              onInput={(e) =>
                setDraft({
                  ...draft(),
                  dur: parseInt(e.currentTarget.value) || 30,
                })
              }
              style={inputStyle}
            />
          </Field>
        </Show>
      </div>
      <Field label="Location">
        <input
          value={draft().location ?? ""}
          onInput={(e) =>
            setDraft({
              ...draft(),
              location: e.currentTarget.value || undefined,
            })
          }
          placeholder="会议室 / 地址"
          style={inputStyle}
        />
      </Field>
      <Field label="Video link">
        <input
          value={draft().videoLink ?? ""}
          onInput={(e) =>
            setDraft({
              ...draft(),
              videoLink: e.currentTarget.value || undefined,
            })
          }
          placeholder="https://…"
          style={inputStyle}
        />
      </Field>
      <Field label="Reminder (minutes before)">
        <input
          type="number"
          value={draft().reminder ?? ""}
          onInput={(e) => {
            const v = e.currentTarget.value;
            setDraft({
              ...draft(),
              reminder: v ? parseInt(v) : undefined,
            });
          }}
          placeholder="15"
          style={inputStyle}
        />
      </Field>
      <Field label="Attendees">
        <input
          value={attendeeQ()}
          onInput={(e) => setAttendeeQ(e.currentTarget.value)}
          placeholder="搜索联系人…"
          style={{ ...inputStyle, "margin-bottom": "var(--space-2)" }}
        />
        <div
          style={{
            display: "flex",
            "flex-wrap": "wrap",
            gap: "var(--space-2)",
            "max-height": "160px",
            "overflow-y": "auto",
            padding: "var(--space-2)",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-md)",
          }}
        >
          <For each={filteredContacts()}>
            {(c) => {
              const selected = () => draft().pids.includes(c.id);
              return (
                <button
                  onClick={() => toggleAttendee(c.id)}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-1)",
                    padding: "4px 10px",
                    background: selected()
                      ? "var(--palm-soft)"
                      : "var(--paper-light)",
                    color: selected() ? "var(--palm)" : "var(--text-secondary)",
                    "border-radius": "var(--radius-pill)",
                    border: selected()
                      ? "1px solid var(--palm)"
                      : "1px solid transparent",
                    "font-size": "var(--text-caption)",
                    cursor: "pointer",
                  }}
                >
                  <Avatar name={c.name} src={c.avatar} size={16} />
                  <span>{c.name}</span>
                  {selected() && <Icon name="ph-check" size={12} />}
                </button>
              );
            }}
          </For>
        </div>
      </Field>
      <Field label="Color">
        <input
          type="color"
          value={draft().color}
          onInput={(e) =>
            setDraft({ ...draft(), color: e.currentTarget.value })
          }
          style={{ width: "60px", height: "32px", padding: 0, border: "none" }}
        />
      </Field>
      <Field label="Brief">
        <textarea
          value={draft().brief}
          onInput={(e) =>
            setDraft({ ...draft(), brief: e.currentTarget.value })
          }
          rows={3}
          placeholder="会议简介 / 议程摘要"
          style={{
            ...inputStyle,
            "min-height": "80px",
            "font-family": "var(--font-body)",
            resize: "vertical",
          }}
        />
      </Field>
    </Modal>
  );
}

function Field(props: { label: string; children: unknown }) {
  return (
    <label style={{ display: "block", "margin-bottom": "var(--space-3)" }}>
      <span
        style={{
          display: "block",
          "font-size": "var(--text-micro)",
          color: "var(--text-muted)",
          "font-weight": "700",
          "margin-bottom": "4px",
        }}
      >
        {props.label}
      </span>
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
