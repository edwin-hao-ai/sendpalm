/** UI store — SolidJS signals for ephemeral app state.
 *
 * Anything in this file should be derivable from SQL on next boot.
 * Persistent state lives in the tauri-plugin-store (see data.ts APP_SETTINGS_KEY).
 */

import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
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
  | "clips"
  | "search"
  | "settings"
  | "agent"
  | "focusReply"
  | "readTogether"
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

/** Live count of contacts that still need Gate screening.
 * Populated by `InboxEmptyState` from the `countGateCandidates` resource
 * (re-fetched on every `refreshTick`). Exposed so other surfaces — topbar
 * Gate badge, sidebar counter, notification sheet — can read the value
 * without spinning up their own resource. */
export const [gateCandidateCount, setGateCandidateCount] = createSignal(0);

export const [contactTab, setContactTab] = createSignal<ContactTab>("Timeline");
export const [settingsTab, setSettingsTab] =
  createSignal<SettingsTab>("profile");
export const [peopleFilter, setPeopleFilter] =
  createSignal<PeopleFilter>("all");
export const [peopleGroupBy, setPeopleGroupBy] =
  createSignal<PeopleGroupBy>("all");

export const [detailOpen, setDetailOpen] = createSignal(false);
export const [agentPanelOpen, setAgentPanelOpen] = createSignal(false);

export const [detailPanelWidth, setDetailPanelWidth] = createSignal(380);
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
    notifications: {
      desktop: true,
      digest: false,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    },
    security: {
      appLock: false,
      screenshotAllowed: true,
      clipboardSync: true,
    },
    syncAndStorage: {
      autoDownloadAttachments: true,
      maxAttachmentMb: 25,
    },
  },
  agent: {
    autoDraft: false,
    autoSummarize: true,
    memoryEditable: true,
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
}
export const [toasts, setToasts] = createSignal<Toast[]>([]);

let toastSeq = 0;
export function showToast(t: Omit<Toast, "id">) {
  const id = `t_${++toastSeq}`;
  const ttl = t.ttlMs ?? 4000;
  setToasts((xs) => [...xs, { id, ...t }]);
  if (ttl > 0) {
    setTimeout(() => dismissToast(id), ttl);
  }
  return id;
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
