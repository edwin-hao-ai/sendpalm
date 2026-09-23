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
  onMount,
  onCleanup,
  type JSX,
} from "solid-js";
import {
  listEvents,
  upsertEvent,
  deleteEvent,
  listContacts,
} from "../stores/data";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { ResourceGate } from "../components/ResourceGate";
import { SkeletonList } from "../components/Skeleton";
import {
  addDays,
  sameDate,
  startOfWeek,
  endOfWeek,
  daysInMonth,
  timeToMinutes,
  formatMinutes,
  localDateKey,
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
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

/** Default color for a freshly-created event. Mirrors `--palm` in
 *  tokens.css (the token can't be read from IndexedDB-persisted
 *  event rows, so the literal is duplicated here deliberately). */
export const DEFAULT_EVENT_COLOR = "#0A8F63";



/** Chinese duration label: 45 → "45 分钟", 75 → "1 小时 15 分",
 *  120 → "2 小时". Replaces the old "1h 15m" format. */
export function formatMinutesCN(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} 小时` : `${h} 小时 ${rem} 分`;
}

export interface TimelinePlacement<T> {
  item: T;
  start: number;
  end: number;
  /** Column index inside the overlap cluster (0-based). */
  col: number;
  /** Total columns in the cluster — tile width is `1 / cols`. */
  cols: number;
}

/** Side-by-side column assignment for overlapping timeline items
 *  (filmstrip + week grid). Greedy interval partitioning per
 *  transitively-overlapping cluster: each item gets the first column
 *  whose previous occupant has ended, so `cols` equals the maximum
 *  concurrency of the cluster. Input is not mutated. */
export function layoutTimeline<T>(
  items: readonly { item: T; start: number; end: number }[],
): TimelinePlacement<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: TimelinePlacement<T>[] = [];
  let cluster: { item: T; start: number; end: number }[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = [];
    const placed = cluster.map((it) => {
      let col = colEnds.findIndex((end) => end <= it.start);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(it.end);
      } else {
        colEnds[col] = it.end;
      }
      return { item: it.item, start: it.start, end: it.end, col, cols: 0 };
    });
    for (const p of placed) out.push({ ...p, cols: colEnds.length });
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const it of sorted) {
    if (it.start >= clusterEnd) {
      flush();
      cluster = [it];
      clusterEnd = it.end;
    } else {
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.end);
    }
  }
  flush();
  return out;
}

/** Reactive `window.matchMedia` — same pattern as Imbox.tsx. Used for
 *  the week-grid responsive collapse and ≥44px touch targets. */
function useMedia(query: string): () => boolean {
  const [matches, setMatches] = createSignal(false);
  onMount(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    onCleanup(() => mq.removeEventListener("change", handler));
  });
  return matches;
}

/** Liquid-glass card surface (Apple-style floating layer). */
const glassCard = {
  background: "color-mix(in srgb, var(--paper-light) 82%, transparent)",
  "backdrop-filter": "blur(20px) saturate(1.4)",
  "-webkit-backdrop-filter": "blur(20px) saturate(1.4)",
} as const;

export function Calendar() {
  const [events, { refetch }] = createResource(listEvents);
  const [editing, setEditing] = createSignal<CalendarEvent | null>(null);
  // Holds an optional time-slot preset when the user clicked a free
  // block in the day filmstrip ("click empty time to create").
  const [creating, setCreating] = createSignal<{
    tm?: string;
    dur?: number;
  } | null>(null);

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
      const d = localDateKey(cursor());
      return [d, d];
    }
    if (view() === "week") {
      return [
        localDateKey(startOfWeek(cursor())),
        localDateKey(endOfWeek(cursor())),
      ];
    }
    // year view: the whole calendar year centered on the cursor's year.
    const y = cursor().getFullYear();
    return [`${y}-01-01`, `${y}-12-31`];
  });

  const allOccurrences = createMemo<OccurrenceView[]>(() => {
    const [wStart, wEnd] = occurrenceWindow();
    const out: OccurrenceView[] = [];
    // PERF: pre-filter + early-exit. `expandOccurrences` already
    // caps a single master's occurrences at 500 (and the window
    // is at most 365 days in year view), but each event still
    // walks its own RRULE math. Filtering by the master's date
    // portion (`dt.slice(0, 10)`) first drops past masters entirely
    // — most calendars have hundreds of completed instances that we
    // never expand. Compare date-only: a full `dt` timestamp sorts
    // lexically AFTER the bare `YYYY-MM-DD` window end, which used
    // to drop every event scheduled on the last day of the window.
    const masters = (events() ?? []).filter(matchesCalendarFilter);
    for (const ev of masters) {
      if (ev.dt.slice(0, 10) > wEnd) continue;
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

  // Separate memo for all-day events: they don't have a meaningful
  // time-of-day, so they don't participate in the time sort. The
  // day / week grids render all-day events in a pinned strip at
  // the top, so we keep them out of `allOccurrences` to avoid
  // them getting sorted into a 00:00 bucket.
  const allDayOccurrences = createMemo<OccurrenceView[]>(() => {
    const [wStart, wEnd] = occurrenceWindow();
    const out: OccurrenceView[] = [];
    const masters = (events() ?? [])
      .filter(matchesCalendarFilter)
      .filter((e) => e.allDay === true);
    for (const ev of masters) {
      if (ev.dt.slice(0, 10) > wEnd) continue;
      for (const occ of expandOccurrences(ev, wStart, wEnd)) {
        out.push({ ...occ, ev });
      }
    }
    out.sort((a, b) => a.start.localeCompare(b.start));
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
    if (view() === "day" || view() === "week" || view() === "year") {
      // Concatenate all-day + timed occurrences. The day-grid
      // DayAgenda already separates them in its own sort, so the
      // concatenation order doesn't matter for the consumer.
      const timed = allOccurrences().map(occurrenceAsEvent);
      const allday = allDayOccurrences().map(occurrenceAsEvent);
      return [...allday, ...timed];
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

  // P1-9: build the canonical local-time dt string instead of
  // `new Date().toISOString()`. The previous code produced a UTC
  // ISO (e.g. "2026-08-30T02:00:00.000Z" for 10am UTC+8), but
  // `tm` was a local "HH:MM". When the date input later overwrote
  // `dt` to a bare "YYYY-MM-DD", week view did `new Date(e.dt)` and
  // placed the event on the wrong day. Use the same YYYY-MM-DD
  // split as the rest of the calendar.
  const newEvent = (preset?: { tm?: string; dur?: number }): CalendarEvent => {
    const d = new Date(cursor());
    const hh = preset?.tm ? parseInt(preset.tm.slice(0, 2), 10) : 10;
    d.setHours(hh, 0, 0, 0);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return {
      id: uid("ev"),
      title: "",
      dt: `${yyyy}-${mm}-${dd}`,
      tm: preset?.tm ?? "10:00",
      dur: preset?.dur ?? 30,
      pids: [],
      color: DEFAULT_EVENT_COLOR,
      agenda: [],
      notes: "",
      brief: "",
      actionItems: [],
      materials: [],
    };
  };

  const openCreateAtSlot = (startMin: number, durMin: number) => {
    // Pre-fill the modal with the clicked free slot; cap the duration
    // at the slot length so the suggestion never overlaps the next
    // meeting (user can extend it in the modal).
    setCreating({
      tm: formatMinutes(startMin),
      dur: Math.min(durMin, 60),
    });
  };

  const onSave = async (e: CalendarEvent) => {
    await upsertEvent(e);
    await refetch();
    setEditing(null);
    setCreating(null);
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

  const coarsePointer = useMedia("(pointer: coarse)");
  // Touch targets: AGENTS §6 requires ≥44px on coarse pointers.
  const touchBtn = (base: JSX.CSSProperties): JSX.CSSProperties =>
    coarsePointer() ? { ...base, "min-height": "44px" } : base;

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
      <style>{CALENDAR_CSS}</style>
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
          日历
        </h2>
        <button
          onClick={() => setCursor(new Date())}
          style={touchBtn(toolbarBtn)}
          title="回到今天"
        >
          今天
        </button>
        <button
          onClick={() => setCursor(shiftCursor(cursor(), -1, view()))}
          style={touchBtn(toolbarBtn)}
          aria-label="上一周期"
          title="上一周期"
        >
          <Icon name="ph-caret-left" size={12} />
        </button>
        <button
          onClick={() => setCursor(shiftCursor(cursor(), 1, view()))}
          style={touchBtn(toolbarBtn)}
          aria-label="下一周期"
          title="下一周期"
        >
          <Icon name="ph-caret-right" size={12} />
        </button>
        {/* Segmented view switcher (日 / 周 / 年) */}
        <div
          role="tablist"
          aria-label="切换日历视图"
          style={{
            display: "flex",
            gap: "2px",
            padding: "2px",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-pill)",
          }}
        >
          <For each={["day", "week", "year"] as const}>
            {(v) => (
              <button
                role="tab"
                aria-selected={view() === v}
                data-cal-view-btn={v}
                onClick={() => setView(v)}
                style={touchBtn({
                  padding: "4px 14px",
                  "border-radius": "var(--radius-pill)",
                  background:
                    view() === v ? "var(--paper-light)" : "transparent",
                  color: view() === v ? "var(--palm)" : "var(--text-secondary)",
                  "font-size": "var(--text-caption)",
                  "font-weight": view() === v ? "700" : "500",
                  "box-shadow": view() === v ? "var(--shadow-sm)" : "none",
                })}
              >
                {v === "day" ? "日" : v === "week" ? "周" : "年"}
              </button>
            )}
          </For>
        </div>

        {/* Filter chips — horizontal scroll on narrow screens instead of
            wrapping into a second toolbar row. */}
        <div
          data-testid="calendar-filter-chips"
          style={{
            display: "flex",
            gap: "6px",
            "flex-wrap": "nowrap",
            "overflow-x": "auto",
            "max-width": "100%",
          }}
        >
          <For each={FILTER_OPTIONS}>
            {(f) => (
              <button
                data-testid={`calendar-filter-${f.value}`}
                onClick={() => setFilter(f.value)}
                style={touchBtn({
                  padding: "4px 10px",
                  "flex-shrink": 0,
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
                })}
              >
                {f.label}
              </button>
            )}
          </For>
        </div>

        <button
          onClick={() => setCreating({})}
          style={touchBtn({
            padding: "8px 16px",
            background: "var(--palm)",
            color: "white",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
            display: "flex",
            "align-items": "center",
            gap: "4px",
          })}
        >
          <Icon name="ph-plus" size={12} /> 新建
        </button>
      </header>

      <PeriodHeader date={cursor()} view={view()} />

      <ResourceGate
        resource={events}
        loading={
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "var(--space-5)",
            }}
          >
            <SkeletonList count={6} height={48} />
          </div>
        }
        errorView={() => (
          <ErrorState
            title="日历加载失败"
            message="请稍后重试；若反复失败，可到顶栏的错误日志里查看详情。"
            retry={() => void refetch()}
          />
        )}
        empty={
          filter() === "all" ? (
            <Empty
              icon="ph-calendar-blank"
              title="这段时间还没有安排"
              description="点右上角「新建」加一场会议，或点日视图里的空白时段快速创建。"
            />
          ) : (
            <Empty
              icon="ph-funnel"
              title="当前筛选下没有事件"
              description="换一个筛选条件，或清除筛选查看全部日程。"
              action={{ label: "清除筛选", onClick: () => setFilter("all") }}
            />
          )
        }
        isEmpty={() => !visibleHasEvents()}
      >
        {() => (
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
                onSlotClick={openCreateAtSlot}
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
        )}
      </ResourceGate>

      <Show when={creating()}>
        {(preset) => (
          <EventEditModal
            ev={newEvent(preset())}
            isNew
            onClose={() => setCreating(null)}
            onSave={onSave}
          />
        )}
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
    // Day view renders nothing here: the DayHero card directly below
    // already shows weekday + day-of-month + month/year, and repeating
    // the same date in 44px type above it was pure duplication.
    if (props.view === "day") return null;
    if (props.view === "week") {
      const s = startOfWeek(props.date);
      const e = endOfWeek(s);
      const sameMonth = s.getMonth() === e.getMonth();
      const y = e.getFullYear();
      if (sameMonth) {
        return `${y}年${s.getMonth() + 1}月${s.getDate()}日 – ${e.getDate()}日`;
      }
      return `${s.getMonth() + 1}月${s.getDate()}日 – ${e.getMonth() + 1}月${e.getDate()}日 · ${y}年`;
    }
    return `${props.date.getFullYear()} · 全年鸟瞰`;
  };
  return (
    <Show when={text()}>
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
    </Show>
  );
}

/* ── Day view (hero + filmstrip + agenda) ──────────────── */

function DayView(props: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onEventEdit: (e: CalendarEvent) => void;
  onSlotClick: (startMin: number, durMin: number) => void;
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
      <DayFilmstrip
        date={props.date}
        events={props.events}
        onEventClick={props.onEventClick}
        onSlotClick={props.onSlotClick}
      />
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
  // Snapshot of the label when editing starts so Escape can restore it
  // (previously Escape closed the input but the blur handler then saved
  // the half-typed value anyway).
  let editSnapshot = "";
  let editCancelled = false;

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

  const startEdit = () => {
    editSnapshot = label();
    setEditing(true);
  };

  const cancelEdit = () => {
    setLabel(editSnapshot);
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
        ...glassCard,
        "border-radius": "var(--radius-xl)",
        border: "1px solid var(--cal-border)",
        "box-shadow": "var(--shadow-sm)",
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
                class="cal-day-label"
                onClick={startEdit}
                title="点击为这一天命名"
                style={{
                  "font-family": "var(--font-display)",
                  "font-size": "var(--text-h4)",
                  "font-weight": "800",
                  background: "transparent",
                  border: "none",
                  padding: "2px 6px",
                  "margin-left": "-6px",
                  "border-radius": "var(--radius-md)",
                  cursor: "pointer",
                  color: label() ? "var(--cal-ink)" : "var(--text-muted)",
                  display: "inline-flex",
                  "align-items": "center",
                  gap: "var(--space-2)",
                }}
              >
                {label() || "为这一天命名…"}
                <span class="cal-day-label-pencil" style={{ display: "inline-flex" }}>
                  <Icon name="ph-pencil-simple" size={14} />
                </span>
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
              onBlur={(e) => {
                if (editCancelled) {
                  editCancelled = false;
                  return;
                }
                saveLabel(e.currentTarget.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveLabel(label());
                if (e.key === "Escape") {
                  editCancelled = true;
                  cancelEdit();
                  e.currentTarget.blur();
                }
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
                "font-size": "var(--text-body-lg)",
                "font-weight": "800",
                color: "var(--cal-ink)",
              }}
            >
              {formatMinutesCN(stats().totalBusy)}
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
                "font-size": "var(--text-body-lg)",
                "font-weight": "800",
                color: "var(--palm)",
              }}
            >
              {formatMinutesCN(stats().freetime)}
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
                "font-size": "var(--text-body-lg)",
                "font-weight": "800",
                color: "var(--cal-ink)",
              }}
            >
              {stats().longest.duration >= 60
                ? formatMinutesCN(stats().longest.duration)
                : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DayFilmstrip(props: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (startMin: number, durMin: number) => void;
}) {
  const startHour = 0;
  const endHour = 24;
  const totalMinutes = (endHour - startHour) * 60;

  // Measured pixel width of the strip (min 800 — the inner div's
  // min-width). Drives the "narrow tile = color bar only" cutoff:
  // below 48px of width, text wraps one glyph per line and explodes
  // the tile, so we render just the color bar and keep the full
  // title + time on the tooltip.
  const [stripWidth, setStripWidth] = createSignal(800);
  let stripEl!: HTMLDivElement;
  onMount(() => {
    if (!stripEl) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setStripWidth(w);
    });
    ro.observe(stripEl);
    setStripWidth(stripEl.clientWidth || 800);
    onCleanup(() => ro.disconnect());
  });

  const timedEvents = createMemo(() =>
    props.events.filter((e) => !e.allDay && e.tm),
  );

  const placements = createMemo(() =>
    layoutTimeline(
      timedEvents().map((e) => {
        const start = timeToMinutes(e.tm);
        return { item: e, start, end: start + (e.dur ?? 30) };
      }),
    ),
  );

  const freetime = createMemo(() =>
    computeFreetimeSlots(
      placements().map((p) => ({ start: p.start, end: p.end })),
      startHour,
      endHour,
    ).filter((s) => s.duration >= 60),
  );

  const isToday = createMemo(() => sameDate(props.date, new Date()));
  const nowMinutes = () => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  };

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
        ref={(el) => (stripEl = el)}
        style={{
          position: "relative",
          height: "96px",
          "min-width": "0",
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
                  transform:
                    i() === 0 ? "none" : "translateX(-50%)",
                  "white-space": "nowrap",
                }}
              >
                {`${HOUR_LABELS[i()]}:00`}
              </div>
            </Show>
          )}
        </For>

        {/* Current-time marker (only when the strip shows today). */}
        <Show when={isToday()}>
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: `${(nowMinutes() / totalMinutes) * 100}%`,
              top: "10px",
              bottom: "16px",
              width: "2px",
              "background-color": "var(--coral)",
              "z-index": 3,
              "pointer-events": "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-4px",
                left: "-3px",
                width: "8px",
                height: "8px",
                "border-radius": "50%",
                "background-color": "var(--coral)",
              }}
            />
          </div>
        </Show>

        <For each={freetime()}>
          {(s) => {
            const left = ((s.start - startHour * 60) / totalMinutes) * 100;
            const width = (s.duration / totalMinutes) * 100;
            return (
              <button
                onClick={() => props.onSlotClick(s.start, s.duration)}
                title={`空闲 ${formatMinutesCN(s.duration)} · 点击新建事件`}
                style={{
                  position: "absolute",
                  top: "28px",
                  bottom: "28px",
                  left: `${left}%`,
                  width: `${width}%`,
                  "background-color": "var(--palm-soft)",
                  "border-radius": "var(--radius-sm)",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  padding: 0,
                }}
              >
                <Show when={s.duration >= 180}>
                  <span
                    style={{
                      "font-size": "var(--text-micro)",
                      color: "var(--palm)",
                      "font-weight": "700",
                      "white-space": "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {formatMinutesCN(s.duration)} 空闲
                  </span>
                </Show>
              </button>
            );
          }}
        </For>

        <For each={placements()}>
          {(p) => {
            const baseLeft =
              ((p.start - startHour * 60) / totalMinutes) * 100;
            const baseWidth = Math.max(
              ((p.end - p.start) / totalMinutes) * 100,
              1.5,
            );
            const width = baseWidth / p.cols;
            const left = baseLeft + width * p.col;
            const widthPx = (width / 100) * stripWidth();
            const showText = widthPx >= 48;
            return (
              <button
                onClick={() => props.onEventClick(p.item)}
                title={`${p.item.title || "(无标题)"} · ${formatMinutes(
                  p.start,
                )} – ${formatMinutes(p.end)}`}
                style={{
                  position: "absolute",
                  top: "18px",
                  bottom: "18px",
                  left: `${left}%`,
                  width: `${width}%`,
                  "background-color": p.item.color,
                  color: textColorForBg(p.item.color),
                  "border-radius": "var(--radius-sm)",
                  border: "none",
                  cursor: "pointer",
                  padding: showText ? "4px 6px" : 0,
                  "text-align": "left",
                  "font-size": "var(--text-micro)",
                  "font-weight": "700",
                  overflow: "hidden",
                  "box-shadow": "var(--shadow-sm)",
                  "z-index": 2,
                }}
              >
                <Show when={showText}>
                  <div
                    style={{
                      opacity: 0.85,
                      "white-space": "nowrap",
                      overflow: "hidden",
                    }}
                  >
                    {formatMinutes(p.start)}
                  </div>
                  <div
                    style={{
                      "white-space": "nowrap",
                      "text-overflow": "ellipsis",
                      overflow: "hidden",
                    }}
                  >
                    {p.item.title || "(无标题)"}
                  </div>
                </Show>
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
                  class="cal-row"
                  onClick={() => props.onEventClick(e)}
                  onDblClick={() => props.onEventEdit(e)}
                  title="单击查看详情 · 双击编辑"
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
                    "align-items": "center",
                  }}
                >
                  <div
                    style={{
                      width: "4px",
                      "align-self": "stretch",
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
                  <span
                    class="cal-row-edit"
                    role="button"
                    aria-label={`编辑 ${e.title || "事件"}`}
                    title="编辑"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      props.onEventEdit(e);
                    }}
                    style={{
                      display: "inline-flex",
                      "align-items": "center",
                      "justify-content": "center",
                      width: "32px",
                      height: "32px",
                      "border-radius": "var(--radius-pill)",
                      color: "var(--text-muted)",
                      "flex-shrink": 0,
                    }}
                  >
                    <Icon name="ph-pencil-simple" size={14} />
                  </span>
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
  // Use local YYYY-MM-DD, not UTC, so a label set in Beijing for
  // "August 30" doesn't land on the 29th or 31st when viewed in
  // another zone.
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `sp:day-label:${yyyy}-${mm}-${dd}`;
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

  const isMobile = useMedia("(max-width: 767px)");
  const isTablet = useMedia("(max-width: 1023px)");

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
          ...glassCard,
          "border-radius": "var(--radius-xl)",
          border: "1px solid var(--cal-border)",
          "box-shadow": "var(--shadow-sm)",
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
            {formatMinutesCN(weekSummary().totalBusy)}
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

      <Show
        when={!isMobile()}
        fallback={
          /* Mobile (<768px): a 7-column time grid squeezes each day to
             ~48px — unusable. Fall back to a 7-day agenda list. */
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "var(--space-2)",
            }}
          >
            <For each={days()}>
              {(day) => {
                const isToday = sameDate(day, new Date());
                const dayEvents = props.events
                  .filter((e) => sameDate(new Date(e.dt), day))
                  .sort(
                    (a, b) => timeToMinutes(a.tm) - timeToMinutes(b.tm),
                  );
                return (
                  <div
                    style={{
                      background: "var(--cal-surface)",
                      border: `1px solid ${isToday ? "var(--palm)" : "var(--cal-border)"}`,
                      "border-radius": "var(--radius-lg)",
                      padding: "var(--space-3)",
                    }}
                  >
                    <button
                      onClick={() => props.onDayClick(day)}
                      style={{
                        display: "flex",
                        "align-items": "baseline",
                        gap: "var(--space-2)",
                        width: "100%",
                        "text-align": "left",
                        "min-height": "44px",
                        color: "var(--cal-ink)",
                      }}
                    >
                      <span
                        style={{
                          "font-weight": "800",
                          "font-size": "var(--text-body-sm)",
                        }}
                      >
                        周{WEEKDAY_NAMES[day.getDay()]}
                      </span>
                      <span
                        style={{
                          "font-size": "var(--text-caption)",
                          color: "var(--cal-ink-muted)",
                        }}
                      >
                        {day.getMonth() + 1}月{day.getDate()}日
                      </span>
                      <Show when={isToday}>
                        <span
                          style={{
                            "font-size": "var(--text-micro)",
                            "font-weight": "700",
                            color: "var(--palm)",
                          }}
                        >
                          今天
                        </span>
                      </Show>
                      <span
                        style={{
                          "margin-left": "auto",
                          "font-size": "var(--text-caption)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {dayEvents.length > 0 ? `${dayEvents.length} 场` : ""}
                      </span>
                    </button>
                    <Show when={dayEvents.length > 0}>
                      <div
                        style={{
                          display: "flex",
                          "flex-direction": "column",
                          gap: "4px",
                          "margin-top": "var(--space-1)",
                        }}
                      >
                        <For each={dayEvents}>
                          {(e) => (
                            <button
                              onClick={(ev) => {
                                ev.stopPropagation();
                                props.onEventClick(e);
                              }}
                              style={{
                                display: "flex",
                                "align-items": "center",
                                gap: "var(--space-2)",
                                padding: "8px 10px",
                                "min-height": "44px",
                                background: "var(--paper-light)",
                                border: "0.5px solid var(--border)",
                                "border-radius": "var(--radius-md)",
                                "text-align": "left",
                                cursor: "pointer",
                                "font-size": "var(--text-caption)",
                              }}
                            >
                              <span
                                style={{
                                  width: "4px",
                                  height: "16px",
                                  "border-radius": "var(--radius-pill)",
                                  "background-color": e.color,
                                  "flex-shrink": 0,
                                }}
                              />
                              <span
                                style={{
                                  "font-family": "var(--font-mono)",
                                  color: "var(--cal-ink-muted)",
                                  "flex-shrink": 0,
                                }}
                              >
                                {e.allDay ? "全天" : e.tm}
                              </span>
                              <span
                                style={{
                                  "font-weight": "600",
                                  overflow: "hidden",
                                  "text-overflow": "ellipsis",
                                  "white-space": "nowrap",
                                }}
                              >
                                {e.title || "(无标题)"}
                              </span>
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        }
      >
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
              const allDayEvents = dayEvents.filter(
                (e) => e.allDay || !e.tm,
              );
              const timedPlacements = createMemo(() =>
                layoutTimeline(
                  dayEvents
                    .filter((e) => !e.allDay && e.tm)
                    .map((e) => {
                      const start = timeToMinutes(e.tm);
                      return { item: e, start, end: start + (e.dur ?? 30) };
                    }),
                ),
              );
              const dayStats = createMemo(() => {
                const busy = dayEvents.reduce((s, e) => s + (e.dur ?? 30), 0);
                const slots = computeFreetimeSlots(
                  timedPlacements().map((p) => ({
                    start: p.start,
                    end: p.end,
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
                    padding: isTablet() ? "var(--space-2)" : "var(--space-3)",
                    "min-height": isTablet() ? "380px" : "620px",
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
                        "letter-spacing": "0.06em",
                        color: "var(--cal-ink-soft)",
                      }}
                    >
                      {WEEKDAY_NAMES[day.getDay()]}
                    </span>
                    <span
                      style={{
                        "font-family": "var(--font-serif)",
                        "font-size": isTablet()
                          ? "var(--text-body-lg)"
                          : "var(--text-h3)",
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
                    <Show when={!isTablet()}>
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
                        <span>{formatMinutesCN(dayStats().busy)} 工作</span>
                      </div>
                    </Show>
                  </div>

                  {/* All-day events live in a pinned strip at the top of
                      the column — they have no time-of-day, so the time
                      axis below would otherwise draw them as a 20px
                      sliver at 00:00. */}
                  <Show when={allDayEvents.length > 0}>
                    <div
                      style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "2px",
                      }}
                    >
                      <For each={allDayEvents}>
                        {(e) => (
                          <button
                            data-cal-event-tile="all-day"
                            data-cal-event-id={e.id}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              props.onEventClick(e);
                            }}
                            title={`${e.title || "(无标题)"} · 全天`}
                            style={{
                              display: "block",
                              width: "100%",
                              padding: "2px 6px",
                              "background-color": e.color,
                              color: textColorForBg(e.color),
                              "border-radius": "var(--radius-sm)",
                              border: "none",
                              "font-size": "var(--text-micro)",
                              "font-weight": "700",
                              "text-align": "left",
                              "white-space": "nowrap",
                              overflow: "hidden",
                              "text-overflow": "ellipsis",
                              cursor: "pointer",
                            }}
                          >
                            {e.title || "(无标题)"}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>

                  <div
                    style={{
                      position: "relative",
                      flex: 1,
                      height: isTablet() ? "260px" : "560px",
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

                    <For each={timedPlacements()}>
                      {(p) => {
                        const e = p.item;
                        const isRecurring = !!e.recurrenceRule;
                        const colWidth = 100 / p.cols;
                        return (
                          <button
                            data-cal-event-tile={
                              isRecurring ? "recurring" : "single"
                            }
                            data-cal-event-id={e.id}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              props.onEventClick(e);
                            }}
                            onDblClick={(ev) => {
                              ev.stopPropagation();
                              props.onEventEdit(e);
                            }}
                            title={`${e.title || "(无标题)"} · ${formatMinutes(p.start)} – ${formatMinutes(p.end)}${isTablet() ? " · 双击编辑" : ""}`}
                            style={{
                              position: "absolute",
                              left: `calc(4px + ${p.col * colWidth}%)`,
                              width: `calc(${colWidth}% - 8px)`,
                              top: `${(p.start / DAY_MINUTES) * 100}%`,
                              height: `${Math.max(((p.end - p.start) / DAY_MINUTES) * 100, 2)}%`,
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
                            <Show when={!isTablet()}>
                              <div
                                style={{
                                  display: "flex",
                                  "align-items": "center",
                                  gap: "4px",
                                  "font-family": "var(--font-mono)",
                                  opacity: 0.85,
                                  "white-space": "nowrap",
                                  overflow: "hidden",
                                }}
                              >
                                <span>{formatMinutes(p.start)}</span>
                                {isRecurring && (
                                  <span
                                    aria-label="每周重复"
                                    title="重复事件"
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
                            </Show>
                          </button>
                        );
                      }}
                    </For>
                  </div>

                  <Show when={!isTablet()}>
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
                        ? `空闲 ${formatMinutesCN(dayStats().longest.duration)}`
                        : "忙碌"}
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
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
  // Session 2026-08-21 perf pass: pre-compute a `Set<YYYY-MM-DD>` of
  // every day in the year that has at least one event. The previous
  // shape pushed `props.events` (692 expanded occurrences for the
  // Feishu workload) into each of 12 MonthMiniCalendar instances,
  // and `MonthMiniCalendar.hasEvent(d)` did a fresh O(events) scan
  // for every cell — 12 × 42 × 692 = 348,768 comparisons on every
  // render. With the Set the lookup is O(1) and the cost is paid
  // once at the YearGrid level (O(events) per year).
  const yearDaysWithEvents = createMemo<Set<string>>(() => {
    const out = new Set<string>();
    const y = props.year;
    for (const e of props.events) {
      // Occurrences already have a concrete `dt` after
      // `occurrenceAsEvent`; slice to the date portion.
      const ds = e.dt.slice(0, 10);
      if (ds.startsWith(`${y}-`)) out.add(ds);
    }
    return out;
  });

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
              yearDaysWithEvents={yearDaysWithEvents()}
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
  /** Pre-computed `Set<YYYY-MM-DD>` of every day in `year` that has
   * an event. Built once at the YearGrid level so the per-cell
   * `hasEvent` lookup is O(1) instead of an O(events) scan that
   * would multiply to 12 × 42 × events per render. */
  yearDaysWithEvents: Set<string>;
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

  // O(1) lookup using the parent-provided Set. Bypasses the previous
  // `props.events.some(e => sameDate(new Date(e.dt), ...))` which
  // allocated a Date for every event for every cell.
  const hasEvent = (d: number) => {
    const mm = String(props.month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return props.yearDaysWithEvents.has(`${props.year}-${mm}-${dd}`);
  };

  const monthMultiDayEvents = createMemo(() => {
    const monthStart = new Date(props.year, props.month, 1);
    const monthEnd = new Date(props.year, props.month + 1, 0);
    return getMultiDayEvents(props.events, monthStart, monthEnd).sort((a, b) =>
      a.dt.localeCompare(b.dt),
    );
  });

  // The arc strip under the mini calendar shows at most 3 lanes; the
  // rest collapse into a "+N" line so tall months don't overflow the
  // card.
  const visibleArcs = createMemo(() => monthMultiDayEvents().slice(0, 3));
  const hiddenArcs = createMemo(() =>
    Math.max(0, monthMultiDayEvents().length - 3),
  );

  const coarsePointer = useMedia("(pointer: coarse)");

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
        <For each={WEEKDAY_NAMES}>
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
                  padding: coarsePointer() ? "10px 0" : "4px 0",
                  "min-height": coarsePointer() ? "36px" : undefined,
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
            overflow: "hidden",
          }}
        >
          <For each={visibleArcs()}>
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
        <Show when={hiddenArcs() > 0}>
          <div
            style={{
              "font-size": "var(--text-micro)",
              color: "var(--cal-ink-muted)",
              "text-align": "right",
            }}
          >
            +{hiddenArcs()} 个跨日事件
          </div>
        </Show>
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

export function EventEditModal(props: {
  ev: CalendarEvent;
  isNew: boolean;
  onClose: () => void;
  onSave: (e: CalendarEvent) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [draft, setDraft] = createSignal<CalendarEvent>(
    JSON.parse(JSON.stringify(props.ev)),
  );
  const [contacts] = createResource(listContacts);
  const [attendeeQ, setAttendeeQ] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [confirmingDelete, setConfirmingDelete] = createSignal(false);

  const titleOk = () => draft().title.trim().length > 0;
  const datesOk = () =>
    !draft().endDt ||
    draft().endDt!.slice(0, 10) >= draft().dt.slice(0, 10);
  const durOk = () => (draft().allDay ?? false) || (draft().dur ?? 30) > 0;
  const canSave = () => titleOk() && datesOk() && durOk() && !saving();

  const save = async () => {
    if (!canSave()) return;
    setSaving(true);
    try {
      await props.onSave(draft());
    } finally {
      setSaving(false);
    }
  };

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
    <>
      <Modal
        open
        onClose={props.onClose}
        title={props.isNew ? "新建事件" : "编辑事件"}
        width="560px"
        footer={
          <>
            <Show when={!props.isNew && props.onDelete}>
              <button
                onClick={() => setConfirmingDelete(true)}
                style={{
                  padding: "8px 16px",
                  color: "var(--status-danger)",
                  border: "0.5px solid var(--status-danger)",
                  "border-radius": "var(--radius-pill)",
                  "font-size": "var(--text-caption)",
                  "margin-right": "auto",
                }}
              >
                删除
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
              onClick={() => void save()}
              disabled={!canSave()}
              title={
                !titleOk()
                  ? "请先填写标题"
                  : !datesOk()
                    ? "结束日期不能早于开始日期"
                    : !durOk()
                      ? "时长需大于 0 分钟"
                      : undefined
              }
              style={{
                padding: "10px 20px",
                background: "var(--palm)",
                color: "white",
                "border-radius": "var(--radius-pill)",
                "font-weight": "700",
                "font-size": "var(--text-caption)",
                opacity: canSave() ? 1 : 0.5,
                cursor: canSave() ? "pointer" : "not-allowed",
              }}
            >
              {saving() ? "保存中…" : "保存"}
            </button>
          </>
        }
      >
        <Field label="标题">
          <input
            value={draft().title}
            onInput={(e) =>
              setDraft({ ...draft(), title: e.currentTarget.value })
            }
            placeholder="例如：晨会、产品评审…"
            style={inputStyle}
          />
          <Show when={!titleOk()}>
            <div
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
                "margin-top": "2px",
              }}
            >
              标题必填
            </div>
          </Show>
        </Field>
        <Field label="全天">
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
              style={{ "accent-color": "var(--palm)" }}
            />
            全天事件
          </label>
        </Field>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            "flex-wrap": "wrap",
          }}
        >
          <Field label="开始日期">
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
          <Field label="结束日期">
            <input
              type="date"
              value={draft().endDt?.slice(0, 10) ?? ""}
              min={draft().dt.slice(0, 10)}
              onInput={(e) => {
                const v = e.currentTarget.value;
                setDraft({
                  ...draft(),
                  endDt: v ? v + "T00:00:00" : undefined,
                });
              }}
              style={{
                ...inputStyle,
                border: datesOk()
                  ? "0.5px solid var(--border)"
                  : "1px solid var(--status-danger)",
              }}
            />
            <Show when={!datesOk()}>
              <div
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--status-danger)",
                  "margin-top": "2px",
                }}
              >
                结束日期不能早于开始日期
              </div>
            </Show>
          </Field>
          <Show when={!draft().allDay}>
            <Field label="时间">
              <input
                type="time"
                value={draft().tm}
                onInput={(e) =>
                  setDraft({ ...draft(), tm: e.currentTarget.value })
                }
                style={inputStyle}
              />
            </Field>
            <Field label="时长（分钟）">
              <input
                type="number"
                min="1"
                step="5"
                value={draft().dur ?? 30}
                onInput={(e) =>
                  setDraft({
                    ...draft(),
                    dur: Math.max(0, parseInt(e.currentTarget.value) || 0),
                  })
                }
                style={inputStyle}
              />
            </Field>
          </Show>
        </div>
        <Field label="地点">
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
        <Field label="视频链接">
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
        <Field label="提醒">
          <select
            value={draft().reminder === undefined ? "" : String(draft().reminder)}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setDraft({
                ...draft(),
                reminder: v === "" ? undefined : parseInt(v, 10),
              });
            }}
            style={inputStyle}
          >
            <option value="">不提醒</option>
            <option value="5">提前 5 分钟</option>
            <option value="15">提前 15 分钟</option>
            <option value="30">提前 30 分钟</option>
            <option value="60">提前 1 小时</option>
            <option value="1440">提前 1 天</option>
          </select>
          <div
            style={{
              "font-size": "var(--text-micro)",
              color: "var(--text-muted)",
              "margin-top": "2px",
            }}
          >
            到点会在通知中心提醒
          </div>
        </Field>
        <Field label="参会人">
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
                      color: selected()
                        ? "var(--palm)"
                        : "var(--text-secondary)",
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
        <Field label="颜色">
          <input
            type="color"
            value={draft().color}
            onInput={(e) =>
              setDraft({ ...draft(), color: e.currentTarget.value })
            }
            style={{
              width: "60px",
              height: "32px",
              padding: 0,
              border: "none",
            }}
          />
        </Field>
        <Field label="简介">
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

      <ConfirmDialog
        open={confirmingDelete()}
        title={`删除「${props.ev.title || "无标题"}」？`}
        body={
          props.ev.recurrenceRule
            ? "这是一个重复事件，将删除整个系列。此操作无法撤销。"
            : "此操作无法撤销。"
        }
        confirmLabel="删除"
        onConfirm={() => void props.onDelete?.()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
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

/** Colocated CSS for hover/keyboard states that inline styles can't
 *  express. Kept in the view (not base.css) because every selector is
 *  `cal-`-scoped to this file. */
const CALENDAR_CSS = `
.cal-day-label .cal-day-label-pencil { opacity: 0; transition: opacity 0.15s var(--ease-out); color: var(--text-muted); }
.cal-day-label:hover .cal-day-label-pencil, .cal-day-label:focus-visible .cal-day-label-pencil { opacity: 1; }
.cal-day-label:hover { background: var(--paper-mid); }
.cal-row-edit { opacity: 0; transition: opacity 0.15s var(--ease-out), background 0.15s var(--ease-out); }
.cal-row:hover .cal-row-edit, .cal-row:focus-within .cal-row-edit { opacity: 1; }
.cal-row-edit:hover { background: var(--paper-mid); color: var(--palm); }
@media (pointer: coarse) { .cal-row-edit { opacity: 1; } }
`;
