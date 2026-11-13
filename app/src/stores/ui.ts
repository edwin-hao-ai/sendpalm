/** UI store — SolidJS signals for ephemeral app state.
 *
 * Anything in this file should be derivable from SQL on next boot.
 * Persistent state lives in the tauri-plugin-store (see data.ts APP_SETTINGS_KEY).
 */

import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { ALL_ACCOUNTS } from "../utils/accounts";
import type { AgentMemory, AppSettings, Draft, ID, Message } from "../types";

export type ViewName =
  | "screener"
  | "screenerHistory"
  | "imbox"
  | "feed"
  | "paperTrail"
  | "trash"
  | "spam"
  | "contacts"
  | "companies"
  | "calendar"
  | "files"
  | "insights"
  | "drafts"
  | "followUps"
  | "tasks"
  | "clips"
  | "search"
  | "settings"
  | "agent"
  | "focusReply"
  | "readTogether"
  | "replyLater"
  | "setAside"
  | "bubbleUp"
  | "folders"
  | "onboarding";

export type ContactTab =
  | "Timeline"
  | "Notes"
  | "Files"
  | "Tasks"
  | "Follow-ups"
  | "Clips"
  | "Insights"
  | "Network"
  | "Calendar";
export type SettingsTab =
  | "profile"
  | "accounts"
  | "preferences"
  | "agent"
  | "labels"
  | "snippets"
  | "data"
  | "shortcuts";

export type PeopleFilter = "all" | "active" | "followup" | "cold";
export type PeopleGroupBy = "all" | "company";

export const [view, setView] = createSignal<ViewName>("imbox");
export const [previousView, setPreviousView] = createSignal<ViewName | null>(
  null,
);

/** Per-view sort mode for list views (Imbox and friends).
 *  Defaults to "newest" — prototype-v11.js:442 (`const sort = f.sort || 'newest'`).
 *  The user can flip to "oldest" or "most_relevant" from the More Filters modal.
 *  Lives in a plain signal (not persisted to disk) so it resets to default per
 *  session — matches the prototype, which keeps filters in-memory too.
 */
import { DEFAULT_SORT, type SortMode } from "../utils/sort-imbox";

const SORTABLE_VIEWS = new Set<ViewName>([
  "imbox",
  "feed",
  "paperTrail",
  "trash",
  "spam",
  "replyLater",
  "setAside",
  "bubbleUp",
]);

export const [sortMode, setSortMode] = createSignal<
  Record<string, SortMode>
>({});

export function getSortMode(viewName: ViewName): SortMode {
  if (!SORTABLE_VIEWS.has(viewName)) return DEFAULT_SORT;
  return sortMode()[viewName] ?? DEFAULT_SORT;
}

export function updateSortMode(viewName: ViewName, mode: SortMode): void {
  setSortMode((prev) => ({ ...prev, [viewName]: mode }));
}

/** Which mailbox the mail views are scoped to. `ALL_ACCOUNTS` ("all") is the
 *  merged inbox, which is the default and the hot path. Session-scoped on
 *  purpose, matching `sortMode`: switching accounts is a reading decision,
 *  not a preference worth persisting, and a persisted value would strand a
 *  user in one mailbox after they delete it.
 *
 *  The value is an account id or `ALL_ACCOUNTS`; `resolveAccountFilter`
 *  degrades unknown ids back to the merged view. */
export const [activeAccountId, setActiveAccountId] = createSignal<string>(
  ALL_ACCOUNTS,
);


/** A "create new <thing>" request that survives the navigation that has to
 *  happen first. The ⌘K palette cannot open a view's creation modal directly:
 *  views are lazy-loaded and their modals are local signals, so the palette
 *  records the intent here and the target view consumes it the moment it
 *  mounts (or immediately, if it is already mounted). Cleared by the
 *  consumer so a second visit doesn't re-open the modal. */
export type CreateIntent = "contact" | "task" | "event";

export const [pendingCreate, setPendingCreate] = createSignal<CreateIntent | null>(
  null,
);

/** Queue a create intent and navigate. Returns nothing — the view opens its
 *  own modal. */
export function requestCreate(kind: CreateIntent, route: ViewName): void {
  setPendingCreate(kind);
  setView(route);
}

/** Consumer side: run `open` once for the matching intent, then clear it. */
export function consumeCreateIntent(kind: CreateIntent): boolean {
  if (pendingCreate() !== kind) return false;
  setPendingCreate(null);
  return true;
}

/** "Open the Agent panel with this message as context" — set by the message
 *  panel, consumed by `AgentPanel`.
 *
 *  The message panel used to call `useAgent()` itself, only to run
 *  `newSession` + `sendChat`. `useAgent()` eagerly creates four resources
 *  (`agent_sessions` / `agent_tasks` / `agent_drafts` / `agent_audit`), so
 *  merely opening a message pulled those whole tables across the IPC bridge —
 *  twice, because the panel had its own instance (AGENTS §11.7). An intent
 *  keeps the hook in the one component that actually renders agent data.
 */
export interface AgentIntent {
  messageId: ID;
  /** Prompt to send once the session is open, e.g. 「请总结这封邮件」. */
  prompt?: string;
}
export const [pendingAgentIntent, setPendingAgentIntent] =
  createSignal<AgentIntent | null>(null);

/** Consumer side: returns the pending intent once, then clears it. */
export function consumeAgentIntent(): AgentIntent | null {
  const intent = pendingAgentIntent();
  if (intent) setPendingAgentIntent(null);
  return intent;
}

/** The detail panel is a stack, not a switch.
 *
 *  Opening a mail from a contact's history used to *replace* the contact, so
 *  返回 closed the panel and dropped the reader on the contacts list — the
 *  contact they were reading was gone. Every "open this from that" action now
 *  remembers what was open first, and 返回 restores it.
 */
export type PanelRef =
  | { kind: "message"; id: ID }
  | { kind: "contact"; id: ID }
  | { kind: "company"; id: string }
  | { kind: "file"; id: ID }
  | { kind: "meeting"; id: ID }
  | { kind: "task"; id: ID }
  | { kind: "draft"; id: ID };

const [panelStack, setPanelStack] = createSignal<PanelRef[]>([]);

/** What the panel is showing right now, if anything. */
function currentPanelRef(): PanelRef | null {
  if (selectedMessageId()) return { kind: "message", id: selectedMessageId()! };
  if (selectedContactId()) return { kind: "contact", id: selectedContactId()! };
  if (selectedCompanyName())
    return { kind: "company", id: selectedCompanyName()! };
  if (selectedFileId()) return { kind: "file", id: selectedFileId()! };
  if (selectedMeetingId()) return { kind: "meeting", id: selectedMeetingId()! };
  if (selectedTaskId()) return { kind: "task", id: selectedTaskId()! };
  if (selectedDraftId()) return { kind: "draft", id: selectedDraftId()! };
  return null;
}

/** Call before replacing the panel's subject, so 返回 can come back. */
export function rememberCurrentPanel(): void {
  const current = currentPanelRef();
  if (!current) return;
  setPanelStack((stack) => [...stack.slice(-9), current]);
}

/** Put the previous subject back. Returns false when there is none. */
export function restorePreviousPanel(): boolean {
  const stack = panelStack();
  const previous = stack[stack.length - 1];
  if (!previous) return false;
  setPanelStack(stack.slice(0, -1));
  setSelectedMessageId(null);
  setSelectedContactId(null);
  setSelectedCompanyName(null);
  setSelectedFileId(null);
  setSelectedMeetingId(null);
  setSelectedTaskId(null);
  setSelectedDraftId(null);
  switch (previous.kind) {
    case "message":
      setSelectedMessageId(previous.id);
      break;
    case "contact":
      setSelectedContactId(previous.id);
      break;
    case "company":
      setSelectedCompanyName(previous.id);
      break;
    case "file":
      setSelectedFileId(previous.id);
      break;
    case "meeting":
      setSelectedMeetingId(previous.id);
      break;
    case "task":
      setSelectedTaskId(previous.id);
      break;
    case "draft":
      setSelectedDraftId(previous.id);
      break;
  }
  setDetailOpen(true);
  return true;
}

/** Leaving the panel on purpose clears the stack. */
export function clearPanelHistory(): void {
  setPanelStack([]);
}

export const [selectedContactId, setSelectedContactId] =
  createSignal<ID | null>(null);
export const [selectedMessageId, setSelectedMessageId] =
  createSignal<ID | null>(null);
export const [selectedMeetingId, setSelectedMeetingId] =
  createSignal<ID | null>(null);
export const [selectedFileId, setSelectedFileId] = createSignal<ID | null>(
  null,
);
export const [selectedTaskId, setSelectedTaskId] = createSignal<ID | null>(
  null,
);
export const [selectedDraftId, setSelectedDraftId] = createSignal<ID | null>(
  null,
);
export const [selectedCompanyName, setSelectedCompanyName] = createSignal<
  string | null
>(null);

/** Global refresh counter. Backend sync events bump this so list views can
 * re-fetch their resources and show new mail immediately. */
export const [refreshTick, setRefreshTick] = createSignal(0);
export function bumpRefreshTick(): void {
  setRefreshTick((n) => n + 1);
}

/** Lightweight refresh signal for "data changed but don't clear the active
 *  view's scroll position". Used by sync events and single-row actions so
 *  sidebar counters / pile slices update without re-rendering the main list. */
export const [softRefreshTick, setSoftRefreshTick] = createSignal(0);
export function bumpSoftRefreshTick(): void {
  setSoftRefreshTick((n) => n + 1);
}

/** Aggregate-count refresh: only the badges that are SQL `COUNT(*)`s listen to
 *  this (sidebar rows, account tabs, the 30-day header).
 *
 *  A full soft tick is wrong for "the user read one message": it also refetches
 *  piles, the contact map and every other view's resources, which made the
 *  list behind the reading pane re-render on every open (measured 59 queries
 *  and a visible flash). Reading one row changes one integer in two counts and
 *  nothing else.
 */
export const [countsTick, setCountsTick] = createSignal(0);
export function bumpCountsTick(): void {
  setCountsTick((n) => n + 1);
}

/** Live count of contacts that still need Gate screening.
 * Populated by `InboxEmptyState` from the `countGateCandidates` resource
 * (re-fetched on every `refreshTick`). Exposed so other surfaces — topbar
 * Gate badge, sidebar counter, notification sheet — can read the value
 * without spinning up their own resource. */
export const [gateCandidateCount, setGateCandidateCount] = createSignal(0);

export const [contactTab, setContactTab] = createSignal<ContactTab>("Timeline");
/** Most severe sync issue across accounts, as an error code:
 *  missing_credentials | auth_failed | network | sync_failed | null.
 *  Drives the Imbox banner and Topbar copy — a changed password, a dead
 *  network, and a server outage must tell the user different things. */
export type MailSyncIssue =
  | "missing_credentials"
  /** The keychain has an entry this binary may not read (re-signed build,
   *  dismissed macOS prompt). Same fix as missing — try again — but a very
   *  different message from "you never set a password". */
  | "credentials_unreadable"
  | "auth_failed"
  | "network"
  | "sync_failed"
  | null;
export const [mailSyncIssue, setMailSyncIssue] = createSignal<MailSyncIssue>(
  null,
);
/** @deprecated use mailSyncIssue() — kept for one release of call sites. */
export const mailCredentialsNeeded = () =>
  mailSyncIssue() === "missing_credentials" ||
  mailSyncIssue() === "credentials_unreadable" ||
  mailSyncIssue() === "auth_failed";

export const [settingsTab, setSettingsTab] =
  createSignal<SettingsTab>("profile");
export const [peopleFilter, setPeopleFilter] =
  createSignal<PeopleFilter>("all");
export const [peopleGroupBy, setPeopleGroupBy] =
  createSignal<PeopleGroupBy>("all");

export const [detailOpen, setDetailOpen] = createSignal(false);
export const [agentPanelOpen, setAgentPanelOpen] = createSignal(false);

export const [detailPanelWidth, setDetailPanelWidth] = createSignal(440);
export const [agentPanelWidth, setAgentPanelWidth] = createSignal(340);

export interface ComposeContext {
  mode: "new" | "reply" | "replyAll" | "forward";
  originalMsg?: Message;
  draft?: Draft;
  to?: string;
  subject?: string;
}
export const [composeContext, setComposeContext] = createSignal<ComposeContext>(
  {
    mode: "new",
  },
);
export const [composeOpen, setComposeOpen] = createSignal(false);
export const [composeMinimized, setComposeMinimized] = createSignal(false);

export const [searchOpen, setSearchOpen] = createSignal(false);
export const [searchQuery, setSearchQuery] = createSignal("");
export const [searchFilter, setSearchFilter] = createSignal<
  "all" | "people" | "messages" | "files" | "views"
>("all");

export const [commandPaletteOpen, setCommandPaletteOpen] = createSignal(false);
export const [commandPaletteQuery, setCommandPaletteQuery] = createSignal("");

export const [notificationsOpen, setNotificationsOpen] = createSignal(false);

export const [calendarView, setCalendarView] = createSignal<
  "day" | "week" | "year"
>("day");
export const [calendarFilter, setCalendarFilter] = createSignal<
  "all" | "meetings" | "sometime" | "habits" | "tracking"
>("all");
export const [calendarSelected, setCalendarSelected] = createSignal(new Date());
// A timestamp that, when set, asks the Calendar view to recenter on this date
// (e.g. after adding an event from a meeting-invite email).
export const [calendarJumpTo, setCalendarJumpTo] = createSignal<number>(0);
export const [calendarWeekStart, setCalendarWeekStart] = createSignal<Date>(
  ((): Date => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  })(),
);
export const [calendarYearAnchor, setCalendarYearAnchor] = createSignal(
  new Date(),
);

export const [onboardingStep, setOnboardingStep] = createSignal<number | null>(
  null,
);
export const [onboardingCompleted, setOnboardingCompleted] =
  createSignal(false);

export const [helpOpen, setHelpOpen] = createSignal(false);

/** ErrorLog panel visibility. Lives here (not inside ErrorLog.tsx) so the
 *  topbar avatar menu can open the panel too. */
export const [errorLogOpen, setErrorLogOpen] = createSignal(false);

export const [loading, setLoading] = createSignal(true);
export const [error, setError] = createSignal<string | null>(null);

/* Cursor index for keyboard nav (j/k) in lists */
export const [cursorIndex, setCursorIndex] = createSignal(-1);
export const [selectedIds, setSelectedIds] = createSignal<Set<ID>>(new Set());

/* App settings — mirrored from tauri-plugin-store */
export const [appSettings, setAppSettings] = createStore<AppSettings>({
  profile: {
    displayName: "Edwin Hao",
    avatar: "",
    timezone: "Asia/Shanghai",
    language: "zh-CN",
    signature: "Best,\nEdwin",
  },
  preferences: {
    theme: "light",
    density: "standard",
    accent: "#0a8f63",
    notifications: {
      desktop: true,
      digest: false,
      sound: true,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      // Off by default: the Gate is a screener. Turning it on means "tell me
      // when a stranger writes" — newsletters stay silent either way.
      firstSenders: false,
      permissionPrompted: false,
    },
    gateGuideSeen: false,
    security: { appLock: false },
    syncAndStorage: {
      maxAttachmentMb: 25,
    },
    background: {
      closeToTray: true,
      launchAtLogin: false,
      showUnreadBadge: true,
      keepGateway: true,
    },
  },
  agent: {
    autoExtractTasks: false,
    taskExtractionEnabledAt: null,
    /** Agents may send mail through the MCP gateway. Default on: the whole
     *  point of the gateway is agent-operated mail; turning it off is the
     *  deliberate act. Read by `services::outgoing::agent_send_allowed`. */
    allowAgentSend: true,
    memoryEditable: true,
    llm: {
      baseUrl: "",
      apiKey: "",
      model: "",
      temperature: 0.2,
      maxTokens: 1024,
      systemPrompt:
        "You are SendPalm's email assistant. Reply concisely in " +
        "the same language the user wrote in. When asked to draft a " +
        "reply, output a single ready-to-send message body (no " +
        '"Subject:" line, no "On [date]…" preamble).',
    },
  },
  shortcuts: {},
});

/* Agent memory */
export const [agentMemory, setAgentMemory] = createStore<AgentMemory>({
  global: {},
  contacts: {},
});

/* Toast queue */
export type ToastKind = "info" | "success" | "warning" | "error";
export interface Toast {
  id: ID;
  message: string;
  kind: ToastKind;
  action?: { label: string; run: () => void | Promise<void> };
  ttlMs?: number;
  /** How many identical messages collapsed into this one. Shown as ×N. */
  repeat?: number;
}

/** Hard ceiling on visible toasts. Error toasts never auto-dismiss, so a
 *  failing background loop could otherwise stack them until the screen was
 *  unusable — the opposite of what a notification is for. */
const MAX_TOASTS = 4;
export const [toasts, setToasts] = createSignal<Toast[]>([]);

/** ARCH-4: persistent error log — every `kind: "error"` toast
 *  that auto-dismisses is also recorded here so the user can
 *  scroll back through what went wrong. A topbar bell icon
 *  (`ErrorLogButton`) shows the unread count; the panel
 *  (`ErrorLogPanel`) lists everything with timestamp + source.
 *
 *  The log is in-memory only (deliberate — errors that survive
 *  a restart would be noise; the IMAP sync loop logs the
 *  same events to disk in `tauri-plugin-store` if needed).
 *
 *  Cap: 200 entries. We trim FIFO when the cap is hit. */
export interface ErrorLogEntry {
  id: ID;
  message: string;
  /** Free-form source tag — "sync", "smtp", "imap", "vault",
   *  "agent", "compose", "favicon", etc. — useful for filtering. */
  source: string;
  at: number;
  /** Optional technical detail (e.g. the underlying error
   *  string the user wouldn't normally see). */
  detail?: string;
}
const ERROR_LOG_CAP = 200;
export const [errorLog, setErrorLog] = createSignal<ErrorLogEntry[]>([]);
let errorSeq = 0;
export function recordError(
  source: string,
  message: string,
  detail?: string,
): ErrorLogEntry {
  const entry: ErrorLogEntry = {
    id: `err_${++errorSeq}`,
    source,
    message,
    detail,
    at: Date.now(),
  };
  setErrorLog((xs) => {
    const next = xs.length >= ERROR_LOG_CAP ? xs.slice(1) : xs.slice();
    next.push(entry);
    return next;
  });
  return entry;
}
export function clearErrorLog() {
  setErrorLog([]);
}

/** Marker the ErrorLogButton uses when the user opens the panel
 *  — once shown, errors that arrive afterwards are not "unread",
 *  but the count stays accurate. We don't gate the badge on
 *  unread because the user may want to see the full history. */
export const [errorLogOpenedAt, setErrorLogOpened] = createSignal<number>(0);

let toastSeq = 0;
export function showToast(t: Omit<Toast, "id"> & { source?: string; detail?: string }) {
  const id = `t_${++toastSeq}`;
  // Error toasts are persistent by default: a failure the user never saw
  // is a failure they can't act on. They still land in the error log, and
  // the user dismisses them manually (or the caller opts into a TTL).
  const ttl = t.ttlMs ?? (t.kind === "error" ? 0 : 4000);

  // ARCH-4: every error toast is also recorded in the persistent
  // error log so the user can scroll back through transient
  // failures after the toast auto-dismisses. The `source` tag
  // is best-effort; callers that need accurate source should
  // call `recordError` directly. Default source: "toast".
  if (t.kind === "error") {
    recordError(t.source ?? "toast", t.message, t.detail);
  }
  let finalId = id;
  setToasts((xs) => {
    // Collapse an identical message that is still on screen instead of
    // stacking a second copy (and a second permanent error card).
    const twin = xs.find(
      (x) => x.kind === t.kind && x.message === t.message,
    );
    if (twin) {
      finalId = twin.id;
      return xs.map((x) =>
        x.id === twin.id
          ? { ...x, repeat: (x.repeat ?? 1) + 1, action: t.action ?? x.action }
          : x,
      );
    }
    const next = [...xs, { id, ...t, repeat: 1 }];
    // Drop the oldest entries past the cap, never the one just added.
    return next.length > MAX_TOASTS
      ? next.slice(next.length - MAX_TOASTS)
      : next;
  });
  if (ttl > 0) {
    setTimeout(() => dismissToast(finalId), ttl);
  }
  return finalId;
}
export function dismissToast(id: ID) {
  setToasts((xs) => xs.filter((t) => t.id !== id));
}

export const [unreadNotificationCount, setUnreadNotificationCount] =
  createSignal(0);

/** Open the company drill-down panel, clearing any other selected detail. */
export function openCompanyDetail(name: string) {
  setSelectedContactId(null);
  setSelectedMessageId(null);
  setSelectedMeetingId(null);
  setSelectedFileId(null);
  setSelectedTaskId(null);
  setSelectedDraftId(null);
  setSelectedCompanyName(name);
  setDetailOpen(true);
}
