/** SendPalm canonical data model — barrel export.
 *
 * Mirrors `D.*` from `prototype-data.js` of prototype-v11.38.
 * Each top-level entity has a matching SQLite table (see src-tauri schema).
 *
 * Conventions:
 * - All IDs are strings.
 * - All timestamps are ISO 8601 strings; helpers in utils/date.ts parse them.
 * - Booleans are explicit (no truthy coercion).
 * - Arrays default to `[]` not `null`.
 * - Optional fields are explicit `T | null` not `T | undefined` when stored.
 */

export type ID = string;
export type ISODate = string;

/* ── Account ──────────────────────────────────────────── */

export type AccountType = "email" | "im" | "calendar";
export type EmailProvider = "gmail" | "outlook" | "imap" | "fastmail";
export type IMProvider = "slack" | "wechat" | "telegram" | "imessage";
export type CalendarProvider = "google" | "apple" | "outlook";

export type AccountPrivacy = "unified" | "isolated";

export interface AccountSyncFolder {
  name: string;
  enabled: boolean;
}

export interface VacationResponder {
  enabled: boolean;
  subject: string;
  body: string;
}

export interface AccountSettings {
  aliases: string[];
  signature: string;
  replyTo: string;
  defaultFrom: string;
  syncFolders: AccountSyncFolder[];
  syncFrequency: "5min" | "15min" | "30min" | "1h" | "manual";
  autoBcc: boolean;
  autoBccAddress: string;
  vacationResponder: VacationResponder;
}

interface AccountBase {
  id: ID;
  type: AccountType;
  email?: string;
  label: string;
  displayName: string;
  status: "connected" | "syncing" | "error" | "disconnected";
  synced: number;
  total: number;
  privacy: AccountPrivacy;
  color: string;
  avatar: string;
  lastSync: string;
  error?: string;
  workspace?: string;
  settings?: AccountSettings;
}

export type Account =
  | (AccountBase & {
      type: "email";
      provider: EmailProvider;
      email: string;
      settings: AccountSettings;
    })
  | (AccountBase & { type: "im"; provider: IMProvider })
  | (AccountBase & { type: "calendar"; provider: CalendarProvider });

/* ── Contact ──────────────────────────────────────────── */

export type ContactStage =
  "explore" | "build" | "active" | "maintain" | "cold" | "rekindle";

export type ContactGroup = "active" | "risk" | "cold" | "";

export interface ContactEmail {
  value: string;
  label: string;
}

export interface ContactPhone {
  value: string;
  label: string;
}

export interface ContactStageHistoryEntry {
  stage: ContactStage;
  date: ISODate;
}

export interface Contact {
  id: ID;
  firstName: string;
  lastName: string;
  nickname: string;
  name: string;
  company: string;
  title: string;
  emails: ContactEmail[];
  phones: ContactPhone[];
  stage: ContactStage;
  labels: string[];
  topics: string[];
  notes: string;
  avatar: string;
  photo: string;
  health: number; // 0–100
  sc: number;
  scC: string;
  scL: string;
  lc: string; // last contact (display string)
  grp: ContactGroup;
  trd: "up" | "dn" | "stable";
  pattern: string;
  accounts: ID[];
  stageHistory: ContactStageHistoryEntry[];
  firstContact: ISODate;
  milestones: string[];
  merged: boolean;
  blocked: boolean;
  notify: boolean;
  firstSeen: boolean;
  screened: boolean;
  defaultBucket: "imbox" | "feed" | "paperTrail" | "trash" | "spam";
  autoLabel: string[];
  recycling: boolean;
  ch: string[];
}

/* ── Message ──────────────────────────────────────────── */

export type MessageBucket = "imbox" | "feed" | "paperTrail" | "trash" | "spam";

export interface Message {
  id: ID;
  pid: ID; // contact id (from)
  subj: string;
  prev: string;
  body: string;
  bodyHtml?: string | null;
  tm: string; // display timestamp string
  st: ISODate; // ISO timestamp for sorting
  ac: ID; // account id
  bucket: MessageBucket;
  direction?: "in" | "out";
  unread: boolean;
  labels: ID[];
  attachments: ID[]; // file ids
  trackers?: string[]; // tracker urls detected
  // Workflow state — per-message
  replyLater?: boolean;
  setAside?: boolean;
  bubbleUpAt?: ISODate | null;
  remindAt?: ISODate | null;
  // Meta
  to?: string;
  cc?: string[];
  bcc?: string[];
  threadId?: ID;
  /** When the message was moved to trash/spam. Used for 30-day expiry. */
  deletedAt?: ISODate | null;
  /** Parsed iCalendar VEVENT, if this message is a meeting invite. */
  calendarInvite?: IcalEvent | null;
}

export interface IcalEvent {
  uid?: string;
  summary: string;
  dtstart?: string;
  dtstartTzid?: string;
  dtend?: string;
  dtendTzid?: string;
  location?: string;
  description?: string;
}

/* ── File ──────────────────────────────────────────── */

export type FileType = "pdf" | "image" | "doc" | "spreadsheet" | "other";

export interface FileItem {
  id: ID;
  pid: ID; // contact id
  name: string;
  type: FileType;
  mime: string;
  size: number; // bytes
  url?: string; // blob url or http url
  content?: string; // text extract / markdown
  st: ISODate;
  sender?: string;
  thumbUrl?: string;
  md?: string; // markdown extract
  sourceMessageIds: ID[];
}

/* ── Event (Meeting) ──────────────────────────────────────── */

export interface AgendaItem {
  id: ID;
  body: string;
}

export interface ActionItem {
  id: ID;
  title: string;
  owner?: ID; // contact id
  due?: ISODate;
  done: boolean;
}

export interface MeetingMaterial {
  fileId: ID;
  label?: string;
}

export interface CalendarEvent {
  id: ID;
  title: string;
  dt: ISODate;
  endDt?: ISODate; // multi-day events: inclusive end date
  allDay?: boolean;
  tm: string;
  dur?: number; // minutes
  pids: ID[]; // attendee contact ids
  color: string;
  location?: string;
  videoLink?: string;
  reminder?: number; // minutes before
  agenda: AgendaItem[];
  notes: string;
  brief: string; // auto-generated
  actionItems: ActionItem[];
  materials: MeetingMaterial[];
  transcriptUrl?: string;
  recordingUrl?: string;
  // Habit / sometime / tracking extensions
  habit?: boolean;
  sometimeBucket?: "someday" | "maybe";
  timeTrackingMs?: number;
  photoUrl?: string;
  circled?: boolean;
  dayNote?: string;
}

/* ── Task ──────────────────────────────────────────── */

export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "normal" | "high";

export interface Task {
  id: ID;
  title: string;
  due?: ISODate;
  status: TaskStatus;
  priority: TaskPriority;
  relatedContactId?: ID;
  relatedEventId?: ID;
  notes: string;
  createdAt: ISODate;
}

/* ── Draft ──────────────────────────────────────────── */

export type DraftStatus =
  "pending" | "approved" | "sent" | "edited" | "discarded";

export interface DraftAttachment {
  id: ID;
  name: string;
  size: number;
  mime: string;
  dataBase64: string;
}

export interface Draft {
  id: ID;
  recipient: string;
  subject: string;
  body: string;
  lastEdited: ISODate;
  status: DraftStatus;
  accountId: ID;
  fromAlias?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: DraftAttachment[];
}

/* ── Agent ──────────────────────────────────────────── */

export type AgentSessionKind =
  "freeform" | "message" | "contact" | "event" | "file";

export interface AgentSession {
  id: ID;
  kind: AgentSessionKind;
  title: string;
  context: { type: string; ref: ID } | null;
  createdAt: ISODate;
}

export type AgentTaskStatus = "todo" | "doing" | "done" | "error";

export interface AgentTaskStep {
  id: ID;
  label: string;
  done: boolean;
}

export interface AgentTask {
  id: ID;
  sessionId: ID;
  title: string;
  description: string;
  status: AgentTaskStatus;
  steps: AgentTaskStep[];
  etaMs?: number;
  confidence?: number; // 0–100
  trigger?: string;
  createdAt: ISODate;
}

export interface AgentDraft {
  id: ID;
  sessionId: ID;
  recipient: string;
  subject: string;
  body: string;
  status: DraftStatus;
  createdAt: ISODate;
}

export interface AgentMemoryEntry {
  key: string;
  value: string;
  updatedAt: ISODate;
}

export interface AgentMemory {
  global: Record<string, string>;
  contacts: Record<ID, string>;
}

export interface AgentAuditEntry {
  id: ID;
  sessionId?: ID;
  kind: string;
  message: string;
  payload?: string;
  createdAt: ISODate;
  undoable: boolean;
}

/* ── Notification ──────────────────────────────────────────── */

export type NotificationType =
  | "followup"
  | "agent"
  | "draft"
  | "relationship"
  | "schedule"
  | "system"
  | "surfaced"
  | "mail";

export interface Notification {
  id: ID;
  type: NotificationType;
  title: string;
  body: string;
  ref?: { type: string; id: ID };
  read: boolean;
  createdAt: ISODate;
}

/* ── Snippet ──────────────────────────────────────────── */

export interface Snippet {
  id: ID;
  label: string;
  body: string;
  shortcut?: string;
}

/* ── Sticky ──────────────────────────────────────────── */

export interface Sticky {
  id: ID;
  msgId: ID;
  body: string;
  createdAt: ISODate;
}

/* ── ContactNote ──────────────────────────────────────────── */

export interface ContactNote {
  id: ID;
  contactId: ID;
  body: string;
  pinned: boolean;
  createdAt: ISODate;
}

/* ── Clip ──────────────────────────────────────────── */

export interface Clip {
  id: ID;
  text: string;
  msgId?: ID;
  contactId?: ID;
  createdAt: ISODate;
}

/* ── Follow-up ──────────────────────────────────────────── */

export type FollowUpStatus = "pending" | "todo" | "wait" | "done" | "cancelled";

export interface FollowUp {
  id: ID;
  msgId: ID;
  dueAt: ISODate;
  status: FollowUpStatus;
  note?: string;
  surfacedAt?: ISODate | null;
}

/* ── ScheduledSend ──────────────────────────────────────────── */

export type ScheduledSendStatus = "scheduled" | "sent" | "cancelled";

export interface ScheduledSend {
  id: ID;
  draftId: ID;
  accountId: ID;
  scheduledAt: ISODate;
  status: ScheduledSendStatus;
}

/* ── Label ──────────────────────────────────────────── */

export interface Label {
  id: ID;
  name: string;
  color: string;
}

/* ── Shortcut ──────────────────────────────────────────── */

export interface Shortcut {
  id: ID;
  combo: string;
  label: string;
  action: string;
  editable: boolean;
}

/* ── Bundle config ──────────────────────────────────────────── */

export interface BundleConfig {
  contactId: ID;
  enabled: boolean;
  label?: string;
}

/* ── App settings (mirrors D.appSettings in prototype) ────────── */

export interface AppSettings {
  profile: {
    displayName: string;
    avatar: string;
    timezone: string;
    language: string;
    signature: string;
  };
  preferences: {
    notifications: {
      desktop: boolean;
      digest: boolean;
      quietHoursEnabled: boolean;
      quietHoursStart: string;
      quietHoursEnd: string;
    };
    security: {
      appLock: boolean;
      screenshotAllowed: boolean;
      clipboardSync: boolean;
    };
    syncAndStorage: {
      autoDownloadAttachments: boolean;
      maxAttachmentMb: number;
    };
  };
  agent: {
    autoDraft: boolean;
    autoSummarize: boolean;
    memoryEditable: boolean;
  };
  shortcuts: Record<string, string>;
}

/* ── Helpers ──────────────────────────────────────────── */

export type WithRequired<T, K extends keyof T> = T & {
  [P in K]-?: NonNullable<T[P]>;
};
