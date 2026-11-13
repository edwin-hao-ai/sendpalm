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
  tm: string; // display timestamp string (UTC, legacy — do not show directly)
  st: ISODate; // compatibility ISO timestamp (sender date when known)
  /** Sender-declared date from the RFC 5322 `Date` header. Null/undefined when
   *  the header was missing or malformed — never fabricated. */
  sentAt?: ISODate | null;
  /** Sort key for every list query (`timeline_at = sent_at || received_at`).
   *  Carried on the row so pagination can use keyset cursors instead of
   *  OFFSET, which is O(offset) — 17 s at 100k rows. */
  timelineAt?: string;
  /** Mail server receipt time (`INTERNALDATE`). The trustworthy timeline value
   *  for Inbox ordering; null until fetched for legacy rows. */
  receivedAt?: ISODate | null;
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
  /** Mailing-list headers present (List-Id / List-Unsubscribe / List-Post)
   *  — a newsletter, not a person. Drives Gate hints and notification
   *  triage. */
  isNewsletter?: boolean;
  /** The sender's RFC 5322 Message-ID — replies set In-Reply-To to it so
   *  recipients' clients can thread the conversation. */
  rfcMessageId?: string;
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
  /** iTip METHOD (RFC 5546). REQUEST = new invite, CANCEL = organizer
   *  cancelled, REPLY = attendee response. Undefined is treated as
   *  implicit REQUEST (the most common case for emails that omit the
   *  VCALENDAR-level METHOD line). */
  method?: "REQUEST" | "CANCEL" | "REPLY" | "ADD" | "COUNTER" | "DECLINECOUNTER" | string;
  /** Organizer's email (mailto: stripped). Drives the iTip REPLY To: line. */
  organizer?: string;
  /** Attendee email list, mailto: stripped. For REPLY messages this is
   *  typically the single responder. */
  attendees?: string[];
  /** Per-attendee PARTSTAT extracted from ATTENDEE lines. For a REPLY
   *  message this carries the responder's choice (e.g. ACCEPTED). */
  attendeeResponses?: { email: string; partstat: string }[];
  /** SEQUENCE number — used to detect updates from the organizer. */
  sequence?: number;
}

/** RSVP partstat value (RFC 5545 §3.2.12). */
export type RsvpStatus = "ACCEPTED" | "DECLINED" | "TENTATIVE" | "NEEDS-ACTION" | "DELEGATED";

/** One row in the per-attendee response map. */
export interface AttendeeResponseEntry {
  partstat: RsvpStatus | string;
  /** ISO 8601 timestamp when the response was recorded. */
  at: string;
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
  // iCal/RSVP extension fields (M10 calendar invitation).
  icalUid?: string;
  icalMethod?: string;
  icalSequence?: number;
  organizerEmail?: string;
  /** Last RSVP the local user sent back to the organizer. */
  attendeeResponse?: RsvpStatus;
  attendeeResponseAt?: string;
  /** Per-attendee RSVP map for invites the user is organizing.
   *  Keyed by attendee email. Populated by the sync loop when an
   *  incoming REPLY message is processed. */
  attendeeResponses?: Record<string, AttendeeResponseEntry>;
  /** M11 — RRULE for recurring events (RFC 5545 §3.3.10). When
   *  present, the Calendar view expands occurrences locally
   *  inside a 90-day rolling window rather than rendering a
   *  single row. The raw string is stored verbatim so we can
   *  re-emit it unchanged in iTip REPLY messages. */
  recurrenceRule?: string;
  /** RDATE / EXDATE lists for non-RRULE additions / exceptions
   *  (parsed from the iCal body and stored as JSON for cheap
   *  re-parse on the frontend). */
  recurrenceDates?: string[];
  excludedDates?: string[];
  /** The original DTSTART;TZID=… value before we normalised it
   *  to UTC. The Calendar view uses this together with the
   *  stored VTIMEZONE blocks to render the event in the
   *  sender's local zone. */
  originalTzid?: string;
}

/* ── Task ──────────────────────────────────────────── */

export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "normal" | "high";
export type TaskDirection = "mine" | "theirs";
export type TaskExtractionRunState = "queued" | "processing" | "pending_review" | "no_tasks" | "failed" | "reviewed" | "skipped";
export interface TaskExtractionRun {
  sourceMessageId: ID;
  state: TaskExtractionRunState;
  mode: "automatic" | "manual";
  createdAt: ISODate;
  updatedAt: ISODate;
}
export type TaskSuggestionDirection = TaskDirection | "unclear";
export type TaskSuggestionStatus = "pending" | "accepted" | "dismissed";
export interface TaskSuggestion {
  id: ID;
  sourceMessageId: ID;
  relatedContactId?: ID;
  title: string;
  notes: string;
  due?: ISODate;
  priority: TaskPriority;
  direction: TaskSuggestionDirection;
  status: TaskSuggestionStatus;
  acceptedTaskId?: ID;
  createdAt: ISODate;
}

export interface Task {
  id: ID;
  title: string;
  due?: ISODate;
  status: TaskStatus;
  priority: TaskPriority;
  relatedContactId?: ID;
  relatedEventId?: ID;
  relatedMessageId?: ID;
  direction?: TaskDirection;
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
  /** Rendered HTML body. Captured at save time so a scheduled send keeps
   *  formatting without re-deriving it in Rust. */
  htmlBody?: string;
  /** RFC Message-ID this draft replies to. Kept on the draft so a reply
   *  scheduled (or reopened and then scheduled) still threads. */
  inReplyTo?: string;
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
    theme: "light" | "dark";
    /** List density. `standard` is the default and the layout the rest of
     *  the design was tuned against. */
    density?: "compact" | "standard" | "comfortable";
    /** Accent colour (hex). Drives `--palm` and its soft/glow derivatives. */
    accent?: string;
    notifications: {
      desktop: boolean;
      digest: boolean;
      /** Play the OS sound with the banner. */
      sound: boolean;
      quietHoursEnabled: boolean;
      quietHoursStart: string;
      quietHoursEnd: string;
      /** Ping for mail from a sender the Gate has not screened yet. */
      firstSenders?: boolean;
      /** True once the user has seen (and acted on or dismissed) the
       *  first-run notification prompt. Stops the prompt reappearing. */
      permissionPrompted?: boolean;
    };
    /** True once the Gate how-to banner has been dismissed. */
    gateGuideSeen?: boolean;
    security: {
      /** Lock the UI on launch until the PIN is entered. */
      appLock: boolean;
      /** Salt + obfuscated PIN/recovery digests. A local access barrier,
       *  not disk encryption — see services/app-lock.ts. */
      pinSalt?: string;
      pinHash?: string;
      recoveryHash?: string;
    };
    syncAndStorage: {
      /** Per-file attachment cap for outbound mail. Providers commonly
       *  reject messages past ~25MB. */
      maxAttachmentMb: number;
    };
    /** Background & launch behavior (tray). Always present after
     *  `loadAppSettings` normalization — direct access is safe. */
    background: {
      /** Close button hides to tray instead of quitting (default on). */
      closeToTray: boolean;
      launchAtLogin: boolean;
      /** Unread count on the tray icon (macOS title / menu header). */
      showUnreadBadge: boolean;
      /** Keep the local Agent gateway running in the background. */
      keepGateway: boolean;
    };
  };
  agent: {
    autoExtractTasks: boolean;
    taskExtractionEnabledAt: ISODate | null;
    /** Whether MCP tools may send/reply/forward. Consumed by the Rust side
     *  (`services::outgoing::agent_send_allowed`), so it must be written to
     *  the preferences file, not only held in memory. */
    allowAgentSend: boolean;
    memoryEditable: boolean;
    /** OpenAI-compatible LLM config. Empty strings mean "use
     *  default provider" — the user can leave apiKey blank for
     *  local Ollama, or fill in OpenAI / OpenRouter / Anthropic-via-
     *  gateway. baseUrl defaults to OpenAI's endpoint when blank. */
    llm: {
      baseUrl: string;
      apiKey: string;
      model: string;
      temperature: number;
      maxTokens: number;
      /** System prompt prepended to every chat call. Empty = no system prompt. */
      systemPrompt: string;
    };
  };
  shortcuts: Record<string, string>;
}

/* ── Helpers ──────────────────────────────────────────── */

export type WithRequired<T, K extends keyof T> = T & {
  [P in K]-?: NonNullable<T[P]>;
};
