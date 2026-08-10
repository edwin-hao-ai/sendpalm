/** Data store — wraps the Tauri SQL plugin and exposes typed queries.
 *
 * All queries return Promise. The store is the single source of truth at
 * runtime for any data that came from SQL; UI components read via signals.
 */

import Database from "@tauri-apps/plugin-sql";
import { IS_BROWSER } from "../services/tauri-shim";

// Browser-mode guard. When running outside Tauri in dev (pnpm dev / Playwright),
// the SQL plugin can't open the SQLite file. We lazily load a lightweight
// in-memory MockDb so tests can seed contacts/messages/events and observe UI
// changes. The dynamic import + DEV guard keeps the shim out of the production
// Tauri bundle.

async function loadMockDb(): Promise<Database> {
  const { MockDb } = await import("../services/mock-db");
  return new MockDb() as unknown as Database;
}
import type {
  Account,
  AgentAuditEntry,
  AgentDraft,
  AgentMemory,
  AgentSession,
  AgentTask,
  AppSettings,
  BundleConfig,
  CalendarEvent,
  Clip,
  Contact,
  ContactNote,
  Draft,
  FileItem,
  FollowUp,
  ID,
  Label,
  Message,
  Notification,
  ScheduledSend,
  Shortcut,
  Snippet,
  Sticky,
  Task,
} from "../types";
import { safeParse, safeStringify } from "../utils/id";
import { DEFAULT_SHORTCUTS } from "../utils/shortcut-defaults";

const DB_URL = "sqlite:sendpalm.db";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (IS_BROWSER() && import.meta.env.DEV) {
    return loadMockDb();
  }
  if (!dbPromise) dbPromise = Database.load(DB_URL);
  return dbPromise;
}

/* ── Full-text search index ───────────────────────────── */

export interface SearchResult {
  id: ID;
  kind: "message" | "contact" | "file" | "event";
  title: string;
  body: string;
}

async function indexEntity(
  id: ID,
  kind: SearchResult["kind"],
  title: string,
  body: string,
  date?: string,
): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM search_index WHERE id = $1", [id]);
  // Events encode their start date in the first line of body so LiveSearch
  // can jump to the right calendar day without an extra query.
  const storedBody = date ? `${date}\n${body}` : body;
  await db.execute(
    "INSERT INTO search_index (id, kind, title, body) VALUES ($1, $2, $3, $4)",
    [id, kind, title, storedBody],
  );
}

async function removeFromSearchIndex(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM search_index WHERE id = $1", [id]);
}

export async function backfillSearchIndex(): Promise<void> {
  const contacts = await listContacts();
  for (const c of contacts) {
    const emails = c.emails.map((e) => e.value).join(" ");
    await indexEntity(
      c.id,
      "contact",
      c.name,
      `${c.company} ${c.title} ${emails} ${c.notes}`,
    );
  }
  const messages = await listMessages();
  for (const m of messages) {
    await indexEntity(m.id, "message", m.subj, m.body);
  }
  const files = await listFiles();
  for (const f of files) {
    await indexEntity(
      f.id,
      "file",
      f.name,
      `${f.type} ${f.mime} ${f.sender ?? ""}`,
    );
  }
  const events = await listEvents();
  for (const e of events) {
    await indexEntity(
      e.id,
      "event",
      e.title,
      `${e.notes} ${e.brief} ${e.location ?? ""}`,
      e.dt,
    );
  }
}

export async function searchIndex(query: string): Promise<SearchResult[]> {
  const db = await getDb();
  const q = query.trim();
  if (!q) return [];
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT id, kind, title, body FROM search_index WHERE search_index MATCH $1 ORDER BY rank LIMIT 50",
    [q],
  );
  return rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as SearchResult["kind"],
    title: r.title as string,
    body: r.body as string,
  }));
}

/* ── Helpers ──────────────────────────────────────────── */

function rowToMessage(r: Record<string, unknown>): Message {
  return {
    id: r.id as string,
    pid: r.pid as string,
    subj: r.subj as string,
    prev: r.prev as string,
    body: r.body as string,
    bodyHtml: (r.body_html as string | null) ?? null,
    tm: r.tm as string,
    st: r.st as string,
    ac: r.ac as string,
    bucket: r.bucket as Message["bucket"],
    direction: (r.direction as Message["direction"]) ?? "in",
    unread: !!r.unread,
    labels: safeParse<ID[]>(r.labels_json as string, []),
    attachments: safeParse<ID[]>(r.attachments_json as string, []),
    trackers: safeParse<string[]>(r.trackers_json as string, []),
    replyLater: !!r.reply_later,
    setAside: !!r.set_aside,
    bubbleUpAt: (r.bubble_up_at as string | null) ?? null,
    remindAt: (r.remind_at as string | null) ?? null,
    deletedAt: (r.deleted_at as string | null) ?? null,
    to: (r.to_addr as string | undefined) ?? undefined,
    cc: safeParse<string[]>(r.cc_json as string, []),
    bcc: safeParse<string[]>(r.bcc_json as string, []),
    threadId: (r.thread_id as string | undefined) ?? undefined,
    calendarInvite: r.calendar_json
      ? safeParse<Message["calendarInvite"]>(r.calendar_json as string, null)
      : null,
  };
}

function rowToContact(r: Record<string, unknown>): Contact {
  return {
    id: r.id as string,
    firstName: r.first_name as string,
    lastName: r.last_name as string,
    nickname: r.nickname as string,
    name: r.name as string,
    company: r.company as string,
    title: r.title as string,
    emails: safeParse<Contact["emails"]>(r.emails_json as string, []),
    phones: safeParse<Contact["phones"]>(r.phones_json as string, []),
    stage: r.stage as Contact["stage"],
    labels: safeParse<string[]>(r.labels_json as string, []),
    topics: safeParse<string[]>(r.topics_json as string, []),
    notes: r.notes as string,
    avatar: r.avatar as string,
    photo: r.photo as string,
    health: r.health as number,
    sc: r.sc as number,
    scC: r.sc_c as string,
    scL: r.sc_l as string,
    lc: r.lc as string,
    grp: r.grp as Contact["grp"],
    trd: r.trd as Contact["trd"],
    pattern: r.pattern as string,
    accounts: safeParse<ID[]>(r.accounts_json as string, []),
    stageHistory: safeParse<Contact["stageHistory"]>(
      r.stage_history_json as string,
      [],
    ),
    firstContact: r.first_contact as string,
    milestones: safeParse<string[]>(r.milestones_json as string, []),
    merged: !!r.merged,
    blocked: !!r.blocked,
    notify: !!r.notify,
    firstSeen: !!r.first_seen,
    screened: !!r.screened,
    defaultBucket: r.default_bucket as Contact["defaultBucket"],
    autoLabel: safeParse<string[]>(r.auto_label_json as string, []),
    recycling: !!r.recycling,
    ch: safeParse<string[]>(r.ch_json as string, []),
  };
}

function rowToAccount(r: Record<string, unknown>): Account {
  const base = {
    id: r.id as string,
    label: r.label as string,
    displayName: r.display_name as string,
    status: r.status as Account["status"],
    synced: r.synced as number,
    total: r.total as number,
    privacy: r.privacy as Account["privacy"],
    color: r.color as string,
    avatar: r.avatar as string,
    lastSync: r.last_sync as string,
    error: (r.error as string | undefined) ?? undefined,
    workspace: (r.workspace as string | undefined) ?? undefined,
  };
  const t = r.type as string;
  const provider = r.provider as string;
  if (t === "email") {
    return {
      ...base,
      type: "email",
      provider: provider as Account["provider"],
      email: r.email as string,
      settings: safeParse<Account["settings"] & object>(
        r.settings_json as string,
        {} as Account["settings"] & object,
      ),
    } as Account;
  }
  if (t === "im") {
    return {
      ...base,
      type: "im",
      provider: provider as Account["provider"],
    } as Account;
  }
  return {
    ...base,
    type: "calendar",
    provider: provider as Account["provider"],
  } as Account;
}

function rowToFile(r: Record<string, unknown>): FileItem {
  return {
    id: r.id as string,
    pid: r.pid as string,
    name: r.name as string,
    type: r.type as FileItem["type"],
    mime: r.mime as string,
    size: r.size as number,
    url: (r.url as string | undefined) ?? undefined,
    content: (r.content as string | undefined) ?? undefined,
    st: r.st as string,
    sender: (r.sender as string | undefined) ?? undefined,
    thumbUrl: (r.thumb_url as string | undefined) ?? undefined,
    md: (r.md as string | undefined) ?? undefined,
    sourceMessageIds: safeParse<ID[]>(r.source_message_ids as string, []),
  };
}

function rowToEvent(r: Record<string, unknown>): CalendarEvent {
  return {
    id: r.id as string,
    title: r.title as string,
    dt: r.dt as string,
    endDt: (r.end_dt as string | undefined) ?? undefined,
    allDay: Boolean(r.all_day as number | undefined),
    tm: r.tm as string,
    dur: (r.dur as number | undefined) ?? undefined,
    pids: safeParse<ID[]>(r.pids_json as string, []),
    color: r.color as string,
    location: (r.location as string | undefined) ?? undefined,
    videoLink: (r.video_link as string | undefined) ?? undefined,
    reminder: (r.reminder as number | undefined) ?? undefined,
    agenda: safeParse<CalendarEvent["agenda"]>(r.agenda_json as string, []),
    notes: r.notes as string,
    brief: r.brief as string,
    actionItems: safeParse<CalendarEvent["actionItems"]>(
      r.action_items_json as string,
      [],
    ),
    materials: safeParse<CalendarEvent["materials"]>(
      r.materials_json as string,
      [],
    ),
    transcriptUrl: (r.transcript_url as string | undefined) ?? undefined,
    recordingUrl: (r.recording_url as string | undefined) ?? undefined,
    habit: !!r.habit,
    sometimeBucket:
      (r.sometime_bucket as CalendarEvent["sometimeBucket"]) ?? undefined,
    timeTrackingMs: (r.time_tracking_ms as number | undefined) ?? 0,
    photoUrl: (r.photo_url as string | undefined) ?? undefined,
    circled: !!r.circled,
    dayNote: (r.day_note as string | undefined) ?? undefined,
  };
}

function rowToTask(r: Record<string, unknown>): Task {
  return {
    id: r.id as string,
    title: r.title as string,
    due: (r.due as string | undefined) ?? undefined,
    status: r.status as Task["status"],
    priority: r.priority as Task["priority"],
    relatedContactId: (r.related_contact_id as string | undefined) ?? undefined,
    relatedEventId: (r.related_event_id as string | undefined) ?? undefined,
    notes: r.notes as string,
    createdAt: r.created_at as string,
  };
}

function rowToDraft(r: Record<string, unknown>): Draft {
  return {
    id: r.id as string,
    recipient: r.recipient as string,
    subject: r.subject as string,
    body: r.body as string,
    lastEdited: r.last_edited as string,
    status: r.status as Draft["status"],
    accountId: r.account_id as string,
    fromAlias: (r.from_alias as string | undefined) || undefined,
    cc: safeParse<string[]>(r.cc_json as string, []),
    bcc: safeParse<string[]>(r.bcc_json as string, []),
    attachments: safeParse<Draft["attachments"]>(
      r.attachments_json as string,
      [],
    ),
  };
}

function rowToAgentSession(r: Record<string, unknown>): AgentSession {
  return {
    id: r.id as string,
    kind: r.kind as AgentSession["kind"],
    title: r.title as string,
    context: r.context_json
      ? safeParse<AgentSession["context"]>(r.context_json as string, null)
      : null,
    createdAt: r.created_at as string,
  };
}

function rowToAgentTask(r: Record<string, unknown>): AgentTask {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    title: r.title as string,
    description: r.description as string,
    status: r.status as AgentTask["status"],
    steps: safeParse<AgentTask["steps"]>(r.steps_json as string, []),
    etaMs: (r.eta_ms as number | undefined) ?? undefined,
    confidence: (r.confidence as number | undefined) ?? undefined,
    trigger: (r.trigger as string | undefined) ?? undefined,
    createdAt: r.created_at as string,
  };
}

function rowToAgentDraft(r: Record<string, unknown>): AgentDraft {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    recipient: r.recipient as string,
    subject: r.subject as string,
    body: r.body as string,
    status: r.status as AgentDraft["status"],
    createdAt: r.created_at as string,
  };
}

function rowToAgentAudit(r: Record<string, unknown>): AgentAuditEntry {
  return {
    id: r.id as string,
    sessionId: (r.session_id as string | undefined) ?? undefined,
    kind: r.kind as string,
    message: r.message as string,
    payload: (r.payload as string | undefined) ?? undefined,
    createdAt: r.created_at as string,
    undoable: !!r.undoable,
  };
}

function rowToNotification(r: Record<string, unknown>): Notification {
  return {
    id: r.id as string,
    type: r.type as Notification["type"],
    title: r.title as string,
    body: r.body as string,
    ref: r.ref_json
      ? safeParse<Notification["ref"]>(r.ref_json as string, undefined)
      : undefined,
    read: !!r.read,
    createdAt: r.created_at as string,
  };
}

function rowToSnippet(r: Record<string, unknown>): Snippet {
  return {
    id: r.id as string,
    label: r.label as string,
    body: r.body as string,
    shortcut: (r.shortcut as string | undefined) ?? undefined,
  };
}

function rowToSticky(r: Record<string, unknown>): Sticky {
  return {
    id: r.id as string,
    msgId: r.msg_id as string,
    body: r.body as string,
    createdAt: r.created_at as string,
  };
}

function rowToContactNote(r: Record<string, unknown>): ContactNote {
  return {
    id: r.id as string,
    contactId: r.contact_id as string,
    body: r.body as string,
    pinned: !!r.pinned,
    createdAt: r.created_at as string,
  };
}

function rowToClip(r: Record<string, unknown>): Clip {
  return {
    id: r.id as string,
    text: r.text as string,
    msgId: (r.msg_id as string | undefined) ?? undefined,
    contactId: (r.contact_id as string | undefined) ?? undefined,
    createdAt: r.created_at as string,
  };
}

function rowToFollowUp(r: Record<string, unknown>): FollowUp {
  return {
    id: r.id as string,
    msgId: r.msg_id as string,
    dueAt: r.due_at as string,
    status: r.status as FollowUp["status"],
    note: (r.note as string | undefined) ?? undefined,
    surfacedAt: (r.surfaced_at as string | null) ?? null,
  };
}

function rowToScheduledSend(r: Record<string, unknown>): ScheduledSend {
  return {
    id: r.id as string,
    draftId: r.draft_id as string,
    accountId: r.account_id as string,
    scheduledAt: r.scheduled_at as string,
    status: r.status as ScheduledSend["status"],
  };
}

function rowToLabel(r: Record<string, unknown>): Label {
  return {
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
  };
}

function rowToShortcut(r: Record<string, unknown>): Shortcut {
  return {
    id: r.id as string,
    combo: r.combo as string,
    label: r.label as string,
    action: r.action as string,
    editable: !!r.editable,
  };
}

function rowToBundleConfig(r: Record<string, unknown>): BundleConfig {
  return {
    contactId: r.contact_id as string,
    enabled: !!r.enabled,
    label: (r.label as string | undefined) ?? undefined,
  };
}

/* ── Account CRUD ──────────────────────────────────────────── */

export async function listAccounts(): Promise<Account[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM accounts ORDER BY label",
  );
  return rows.map(rowToAccount);
}

export async function getAccount(id: ID): Promise<Account | null> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM accounts WHERE id = $1",
    [id],
  );
  return rows[0] ? rowToAccount(rows[0]) : null;
}

export async function upsertAccount(a: Account): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO accounts (
      id, type, provider, email, label, display_name, status, synced, total,
      privacy, color, avatar, last_sync, error, workspace, settings_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT(id) DO UPDATE SET
      type=excluded.type, provider=excluded.provider, email=excluded.email,
      label=excluded.label, display_name=excluded.display_name, status=excluded.status,
      synced=excluded.synced, total=excluded.total, privacy=excluded.privacy,
      color=excluded.color, avatar=excluded.avatar, last_sync=excluded.last_sync,
      error=excluded.error, workspace=excluded.workspace, settings_json=excluded.settings_json`,
    [
      a.id,
      a.type,
      a.provider,
      a.email ?? null,
      a.label,
      a.displayName,
      a.status,
      a.synced,
      a.total,
      a.privacy,
      a.color,
      a.avatar,
      a.lastSync,
      a.error ?? null,
      a.workspace ?? null,
      a.type === "email" ? safeStringify(a.settings) : null,
    ],
  );
}

export async function deleteAccount(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM accounts WHERE id = $1", [id]);
}

/* ── Contact CRUD ──────────────────────────────────────────── */

export async function listContacts(): Promise<Contact[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM contacts ORDER BY name",
  );
  return rows.map(rowToContact);
}

/** Count of contacts that still need screening at the Gate.
 *
 * Returns the number of rows in `contacts` where `first_seen=1 AND screened=0`.
 * This drives the Inbox empty-state copy: if there are no accounts we say
 * "add an account"; if there are unscreened contacts we say "open Gate";
 * otherwise we say "inbox is empty".
 */
export async function countGateCandidates(): Promise<number> {
  const db = await getDb();
  // Select id only — the MockDb that backs browser-mode tests does not
  // recognize `SELECT COUNT(*) AS cnt` (its tokenizer splits `(` so the
  // column is just `count` and the rows return `{ cnt: undefined }`).
  // Counting the returned ids is cheap and works on both SQLite and MockDb.
  const rows = await db.select<Array<{ id: ID }>>(
    "SELECT id FROM contacts WHERE first_seen = 1 AND screened = 0",
  );
  return rows.length;
}

export async function getContact(id: ID): Promise<Contact | null> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM contacts WHERE id = $1",
    [id],
  );
  return rows[0] ? rowToContact(rows[0]) : null;
}

export async function upsertContact(c: Contact): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO contacts (
      id, first_name, last_name, nickname, name, company, title,
      emails_json, phones_json, stage, labels_json, topics_json, notes,
      avatar, photo, health, sc, sc_c, sc_l, lc, grp, trd, pattern,
      accounts_json, stage_history_json, first_contact, milestones_json,
      merged, blocked, notify, first_seen, screened, default_bucket,
      auto_label_json, recycling, ch_json
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36
    )
    ON CONFLICT(id) DO UPDATE SET
      first_name=excluded.first_name, last_name=excluded.last_name,
      nickname=excluded.nickname, name=excluded.name, company=excluded.company,
      title=excluded.title, emails_json=excluded.emails_json,
      phones_json=excluded.phones_json, stage=excluded.stage,
      labels_json=excluded.labels_json, topics_json=excluded.topics_json,
      notes=excluded.notes, avatar=excluded.avatar, photo=excluded.photo,
      health=excluded.health, sc=excluded.sc, sc_c=excluded.sc_c,
      sc_l=excluded.sc_l, lc=excluded.lc, grp=excluded.grp, trd=excluded.trd,
      pattern=excluded.pattern, accounts_json=excluded.accounts_json,
      stage_history_json=excluded.stage_history_json,
      first_contact=excluded.first_contact, milestones_json=excluded.milestones_json,
      merged=excluded.merged, blocked=excluded.blocked, notify=excluded.notify,
      first_seen=excluded.first_seen, screened=excluded.screened,
      default_bucket=excluded.default_bucket,
      auto_label_json=excluded.auto_label_json, recycling=excluded.recycling,
      ch_json=excluded.ch_json`,
    [
      c.id,
      c.firstName,
      c.lastName,
      c.nickname,
      c.name,
      c.company,
      c.title,
      safeStringify(c.emails),
      safeStringify(c.phones),
      c.stage,
      safeStringify(c.labels),
      safeStringify(c.topics),
      c.notes,
      c.avatar,
      c.photo,
      c.health,
      c.sc,
      c.scC,
      c.scL,
      c.lc,
      c.grp,
      c.trd,
      c.pattern,
      safeStringify(c.accounts),
      safeStringify(c.stageHistory),
      c.firstContact,
      safeStringify(c.milestones),
      c.merged ? 1 : 0,
      c.blocked ? 1 : 0,
      c.notify ? 1 : 0,
      c.firstSeen ? 1 : 0,
      c.screened ? 1 : 0,
      c.defaultBucket,
      safeStringify(c.autoLabel),
      c.recycling ? 1 : 0,
      safeStringify(c.ch),
    ],
  );
  const emails = c.emails.map((e) => e.value).join(" ");
  await indexEntity(
    c.id,
    "contact",
    c.name,
    `${c.company} ${c.title} ${emails} ${c.notes}`,
  );
}

export async function deleteContact(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM contacts WHERE id = $1", [id]);
  await removeFromSearchIndex(id);
}

/* ── Message CRUD ──────────────────────────────────────────── */

export async function listMessages(): Promise<Message[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM messages ORDER BY st DESC",
  );
  return rows.map(rowToMessage);
}

export async function getMessage(id: ID): Promise<Message | null> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM messages WHERE id = $1",
    [id],
  );
  return rows[0] ? rowToMessage(rows[0]) : null;
}

export async function upsertMessage(m: Message): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO messages (
      id, pid, subj, prev, body, body_html, tm, st, ac, bucket, direction, unread,
      labels_json, attachments_json, trackers_json,
      reply_later, set_aside, bubble_up_at, remind_at, deleted_at,
      to_addr, cc_json, bcc_json, thread_id, calendar_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
    ON CONFLICT(id) DO UPDATE SET
      pid=excluded.pid, subj=excluded.subj, prev=excluded.prev,
      body=excluded.body, body_html=excluded.body_html, tm=excluded.tm, st=excluded.st,
      ac=excluded.ac, bucket=excluded.bucket, direction=excluded.direction, unread=excluded.unread,
      labels_json=excluded.labels_json, attachments_json=excluded.attachments_json,
      trackers_json=excluded.trackers_json,
      reply_later=excluded.reply_later, set_aside=excluded.set_aside,
      bubble_up_at=excluded.bubble_up_at, remind_at=excluded.remind_at,
      deleted_at=excluded.deleted_at,
      to_addr=excluded.to_addr, cc_json=excluded.cc_json, bcc_json=excluded.bcc_json,
      thread_id=excluded.thread_id, calendar_json=excluded.calendar_json`,
    [
      m.id,
      m.pid,
      m.subj,
      m.prev,
      m.body,
      m.bodyHtml ?? null,
      m.tm,
      m.st,
      m.ac,
      m.bucket,
      m.direction ?? "in",
      m.unread ? 1 : 0,
      safeStringify(m.labels),
      safeStringify(m.attachments),
      safeStringify(m.trackers ?? []),
      m.replyLater ? 1 : 0,
      m.setAside ? 1 : 0,
      m.bubbleUpAt ?? null,
      m.remindAt ?? null,
      m.deletedAt ?? null,
      m.to ?? null,
      safeStringify(m.cc ?? []),
      safeStringify(m.bcc ?? []),
      m.threadId ?? null,
      safeStringify(m.calendarInvite),
    ],
  );
  await indexEntity(m.id, "message", m.subj, m.body);
}

export async function deleteMessage(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM messages WHERE id = $1", [id]);
  await removeFromSearchIndex(id);
}

/** Move a message to a bucket and manage the trash/spam expiry timestamp.
 *  Clears workflow flags so a moved/archived message leaves triage piles. */
export async function moveMessageToBucket(
  id: ID,
  bucket: Message["bucket"],
): Promise<void> {
  const db = await getDb();
  if (bucket === "trash" || bucket === "spam") {
    await db.execute(
      "UPDATE messages SET bucket = $1, deleted_at = datetime('now'), reply_later = 0, set_aside = 0, bubble_up_at = NULL, remind_at = NULL WHERE id = $2",
      [bucket, id],
    );
  } else {
    await db.execute(
      "UPDATE messages SET bucket = $1, deleted_at = NULL, reply_later = 0, set_aside = 0, bubble_up_at = NULL, remind_at = NULL WHERE id = $2",
      [bucket, id],
    );
  }
}

export async function emptyTrash(): Promise<number> {
  const db = await getDb();
  // Keep the full-text index in sync before the rows disappear.
  await db.execute(
    "DELETE FROM search_index WHERE id IN (SELECT id FROM messages WHERE bucket = 'trash')",
  );
  const result = await db.execute(
    "DELETE FROM messages WHERE bucket = 'trash'",
  );
  return (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0;
}

export async function updateMessagesBucketByContact(
  contactId: ID,
  bucket: Message["bucket"],
): Promise<number> {
  const db = await getDb();
  const result =
    bucket === "trash" || bucket === "spam"
      ? await db.execute(
          "UPDATE messages SET bucket = $1, deleted_at = datetime('now') WHERE pid = $2",
          [bucket, contactId],
        )
      : await db.execute(
          "UPDATE messages SET bucket = $1, deleted_at = NULL WHERE pid = $2",
          [bucket, contactId],
        );
  return (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0;
}

/* ── Per-entity single-row getters ─────────────────────────── */

export async function getEvent(id: ID): Promise<CalendarEvent | null> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM events WHERE id = $1",
    [id],
  );
  return rows[0] ? rowToEvent(rows[0]) : null;
}

export async function getFile(id: ID): Promise<FileItem | null> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM files WHERE id = $1",
    [id],
  );
  return rows[0] ? rowToFile(rows[0]) : null;
}

export async function getTask(id: ID): Promise<Task | null> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM tasks WHERE id = $1",
    [id],
  );
  return rows[0] ? rowToTask(rows[0]) : null;
}

export async function getDraft(id: ID): Promise<Draft | null> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM drafts WHERE id = $1",
    [id],
  );
  return rows[0] ? rowToDraft(rows[0]) : null;
}

/* ── File CRUD ──────────────────────────────────────────── */

export async function listFiles(): Promise<FileItem[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM files ORDER BY st DESC",
  );
  return rows.map(rowToFile);
}

export async function listSourceMessages(fileId: ID): Promise<Message[]> {
  const db = await getDb();
  const rows = await db.select<Array<Record<string, unknown>>>(
    "SELECT m.* FROM messages m, json_each(m.attachments_json) " +
      "WHERE json_each.value = $1 AND m.deleted_at IS NULL ORDER BY m.tm DESC",
    [fileId],
  );
  return rows.map(rowToMessage);
}

export async function listContactAttachments(contactId: ID): Promise<FileItem[]> {
  const db = await getDb();
  const rows = await db.select<Array<Record<string, unknown>>>(
    "SELECT * FROM files WHERE pid = $1 ORDER BY st DESC",
    [contactId],
  );
  return rows.map(rowToFile);
}

export async function addFileSourceMessage(fileId: ID, messageId: ID): Promise<void> {
  const db = await getDb();
  const existing = (await db.select<Array<{ source_message_ids: string }>>(
    "SELECT source_message_ids FROM files WHERE id = $1",
    [fileId],
  ))[0]?.source_message_ids ?? "[]";
  const next = safeParse<string[]>(existing, []);
  if (!next.includes(messageId)) next.push(messageId);
  await db.execute("UPDATE files SET source_message_ids = $1 WHERE id = $2", [
    safeStringify(next),
    fileId,
  ]);
}

export async function upsertFile(f: FileItem): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO files (id,pid,name,type,mime,size,url,content,st,sender,thumb_url,md)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT(id) DO UPDATE SET
       pid=excluded.pid,name=excluded.name,type=excluded.type,
       mime=excluded.mime,size=excluded.size,url=excluded.url,
       content=excluded.content,st=excluded.st,sender=excluded.sender,
       thumb_url=excluded.thumb_url,md=excluded.md`,
    [
      f.id,
      f.pid,
      f.name,
      f.type,
      f.mime,
      f.size,
      f.url ?? null,
      f.content ?? null,
      f.st,
      f.sender ?? null,
      f.thumbUrl ?? null,
      f.md ?? null,
    ],
  );
  await indexEntity(
    f.id,
    "file",
    f.name,
    `${f.type} ${f.mime} ${f.sender ?? ""}`,
  );
}

export async function deleteFile(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM files WHERE id = $1", [id]);
  await removeFromSearchIndex(id);
}

/* ── Event CRUD ──────────────────────────────────────────── */

export async function listEvents(): Promise<CalendarEvent[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM events ORDER BY dt ASC",
  );
  return rows.map(rowToEvent);
}

export async function upsertEvent(e: CalendarEvent): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO events (
      id, title, dt, end_dt, all_day, tm, dur, pids_json, color, location, video_link, reminder,
      agenda_json, notes, brief, action_items_json, materials_json,
      transcript_url, recording_url, habit, sometime_bucket, time_tracking_ms,
      photo_url, circled, day_note
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, dt=excluded.dt, end_dt=excluded.end_dt, all_day=excluded.all_day,
      tm=excluded.tm, dur=excluded.dur,
      pids_json=excluded.pids_json, color=excluded.color, location=excluded.location,
      video_link=excluded.video_link, reminder=excluded.reminder,
      agenda_json=excluded.agenda_json, notes=excluded.notes, brief=excluded.brief,
      action_items_json=excluded.action_items_json, materials_json=excluded.materials_json,
      transcript_url=excluded.transcript_url, recording_url=excluded.recording_url,
      habit=excluded.habit, sometime_bucket=excluded.sometime_bucket,
      time_tracking_ms=excluded.time_tracking_ms, photo_url=excluded.photo_url,
      circled=excluded.circled, day_note=excluded.day_note`,
    [
      e.id,
      e.title,
      e.dt,
      e.endDt ?? null,
      e.allDay ? 1 : 0,
      e.tm,
      e.dur ?? null,
      safeStringify(e.pids),
      e.color,
      e.location ?? null,
      e.videoLink ?? null,
      e.reminder ?? null,
      safeStringify(e.agenda),
      e.notes,
      e.brief,
      safeStringify(e.actionItems),
      safeStringify(e.materials),
      e.transcriptUrl ?? null,
      e.recordingUrl ?? null,
      e.habit ? 1 : 0,
      e.sometimeBucket ?? null,
      e.timeTrackingMs ?? 0,
      e.photoUrl ?? null,
      e.circled ? 1 : 0,
      e.dayNote ?? null,
    ],
  );
  await indexEntity(
    e.id,
    "event",
    e.title,
    `${e.notes} ${e.brief} ${e.location ?? ""}`,
    e.dt,
  );
}

export async function deleteEvent(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM events WHERE id = $1", [id]);
  await removeFromSearchIndex(id);
}

/* ── Task CRUD ──────────────────────────────────────────── */

export async function listTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM tasks ORDER BY created_at DESC",
  );
  return rows.map(rowToTask);
}

export async function upsertTask(t: Task): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO tasks (id,title,due,status,priority,related_contact_id,related_event_id,notes,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, due=excluded.due, status=excluded.status,
       priority=excluded.priority, related_contact_id=excluded.related_contact_id,
       related_event_id=excluded.related_event_id, notes=excluded.notes`,
    [
      t.id,
      t.title,
      t.due ?? null,
      t.status,
      t.priority,
      t.relatedContactId ?? null,
      t.relatedEventId ?? null,
      t.notes,
      t.createdAt,
    ],
  );
}

export async function deleteTask(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
}

/* ── Draft CRUD ──────────────────────────────────────────── */

export async function listDrafts(): Promise<Draft[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM drafts ORDER BY last_edited DESC",
  );
  return rows.map(rowToDraft);
}

export async function upsertDraft(d: Draft): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO drafts (id,recipient,subject,body,last_edited,status,account_id,from_alias,cc_json,bcc_json,attachments_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(id) DO UPDATE SET
       recipient=excluded.recipient, subject=excluded.subject, body=excluded.body,
       last_edited=excluded.last_edited, status=excluded.status,
       account_id=excluded.account_id, from_alias=excluded.from_alias,
       cc_json=excluded.cc_json, bcc_json=excluded.bcc_json,
       attachments_json=excluded.attachments_json`,
    [
      d.id,
      d.recipient,
      d.subject,
      d.body,
      d.lastEdited,
      d.status,
      d.accountId,
      d.fromAlias ?? null,
      safeStringify(d.cc ?? []),
      safeStringify(d.bcc ?? []),
      safeStringify(d.attachments ?? []),
    ],
  );
}

export async function deleteDraft(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM drafts WHERE id = $1", [id]);
}

/* ── Agent ──────────────────────────────────────────── */

export async function listAgentSessions(): Promise<AgentSession[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM agent_sessions ORDER BY created_at DESC",
  );
  return rows.map(rowToAgentSession);
}

export async function upsertAgentSession(s: AgentSession): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO agent_sessions (id,kind,title,context_json,created_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title, context_json=excluded.context_json`,
    [
      s.id,
      s.kind,
      s.title,
      s.context ? safeStringify(s.context) : null,
      s.createdAt,
    ],
  );
}

export async function deleteAgentSession(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM agent_sessions WHERE id = $1", [id]);
}

export async function listAgentTasks(sessionId?: ID): Promise<AgentTask[]> {
  const db = await getDb();
  const rows = sessionId
    ? await db.select<Record<string, unknown>[]>(
        "SELECT * FROM agent_tasks WHERE session_id = $1 ORDER BY created_at DESC",
        [sessionId],
      )
    : await db.select<Record<string, unknown>[]>(
        "SELECT * FROM agent_tasks ORDER BY created_at DESC",
      );
  return rows.map(rowToAgentTask);
}

export async function upsertAgentTask(t: AgentTask): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO agent_tasks (id,session_id,title,description,status,steps_json,eta_ms,confidence,trigger,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT(id) DO UPDATE SET
       session_id=excluded.session_id, title=excluded.title, description=excluded.description,
       status=excluded.status, steps_json=excluded.steps_json, eta_ms=excluded.eta_ms,
       confidence=excluded.confidence, trigger=excluded.trigger`,
    [
      t.id,
      t.sessionId,
      t.title,
      t.description,
      t.status,
      safeStringify(t.steps),
      t.etaMs ?? null,
      t.confidence ?? null,
      t.trigger ?? null,
      t.createdAt,
    ],
  );
}

export async function deleteAgentTask(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM agent_tasks WHERE id = $1", [id]);
}

export async function listAgentDrafts(sessionId?: ID): Promise<AgentDraft[]> {
  const db = await getDb();
  const rows = sessionId
    ? await db.select<Record<string, unknown>[]>(
        "SELECT * FROM agent_drafts WHERE session_id = $1 ORDER BY created_at DESC",
        [sessionId],
      )
    : await db.select<Record<string, unknown>[]>(
        "SELECT * FROM agent_drafts ORDER BY created_at DESC",
      );
  return rows.map(rowToAgentDraft);
}

export async function upsertAgentDraft(d: AgentDraft): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO agent_drafts (id,session_id,recipient,subject,body,status,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(id) DO UPDATE SET
       session_id=excluded.session_id, recipient=excluded.recipient,
       subject=excluded.subject, body=excluded.body, status=excluded.status`,
    [d.id, d.sessionId, d.recipient, d.subject, d.body, d.status, d.createdAt],
  );
}

export async function deleteAgentDraft(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM agent_drafts WHERE id = $1", [id]);
}

export async function listAgentAudit(): Promise<AgentAuditEntry[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM agent_audit ORDER BY created_at DESC",
  );
  return rows.map(rowToAgentAudit);
}

export async function appendAgentAudit(entry: AgentAuditEntry): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO agent_audit (id,session_id,kind,message,payload,created_at,undoable)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(id) DO UPDATE SET
       session_id=excluded.session_id, kind=excluded.kind,
       message=excluded.message, payload=excluded.payload,
       undoable=excluded.undoable`,
    [
      entry.id,
      entry.sessionId ?? null,
      entry.kind,
      entry.message,
      entry.payload ?? null,
      entry.createdAt,
      entry.undoable ? 1 : 0,
    ],
  );
}

export const upsertAgentAudit = appendAgentAudit;
export const deleteAgentAudit = async (id: ID): Promise<void> => {
  const db = await getDb();
  await db.execute("DELETE FROM agent_audit WHERE id = $1", [id]);
};

export async function clearAgentAudit(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM agent_audit");
}

/* ── Notifications ──────────────────────────────────────────── */

export async function listNotifications(): Promise<Notification[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM notifications ORDER BY created_at DESC",
  );
  return rows.map(rowToNotification);
}

export async function countUnreadNotifications(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT COUNT(*) AS cnt FROM notifications WHERE read = 0",
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function upsertNotification(n: Notification): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO notifications (id,type,title,body,ref_json,read,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(id) DO UPDATE SET
       type=excluded.type, title=excluded.title, body=excluded.body,
       ref_json=excluded.ref_json, read=excluded.read`,
    [
      n.id,
      n.type,
      n.title,
      n.body,
      n.ref ? safeStringify(n.ref) : null,
      n.read ? 1 : 0,
      n.createdAt,
    ],
  );
}

export async function markAllNotificationsRead(): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE notifications SET read = 1 WHERE read = 0");
}

export async function deleteNotification(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM notifications WHERE id = $1", [id]);
}

/* ── Snippets ──────────────────────────────────────────── */

export async function listSnippets(): Promise<Snippet[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM snippets ORDER BY label",
  );
  return rows.map(rowToSnippet);
}

export async function upsertSnippet(s: Snippet): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO snippets (id,label,body,shortcut)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT(id) DO UPDATE SET label=excluded.label, body=excluded.body, shortcut=excluded.shortcut`,
    [s.id, s.label, s.body, s.shortcut ?? null],
  );
}

export async function deleteSnippet(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM snippets WHERE id = $1", [id]);
}

/* ── Stickies ──────────────────────────────────────────── */

export async function listStickies(): Promise<Sticky[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM stickies ORDER BY created_at DESC",
  );
  return rows.map(rowToSticky);
}

export async function upsertSticky(s: Sticky): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO stickies (id,msg_id,body,created_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT(id) DO UPDATE SET msg_id=excluded.msg_id, body=excluded.body`,
    [s.id, s.msgId, s.body, s.createdAt],
  );
}

export async function deleteSticky(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM stickies WHERE id = $1", [id]);
}

/* ── Contact notes ──────────────────────────────────────────── */

export async function listContactNotes(contactId?: ID): Promise<ContactNote[]> {
  const db = await getDb();
  const rows = contactId
    ? await db.select<Record<string, unknown>[]>(
        "SELECT * FROM contact_notes WHERE contact_id = $1 ORDER BY pinned DESC, created_at DESC",
        [contactId],
      )
    : await db.select<Record<string, unknown>[]>(
        "SELECT * FROM contact_notes ORDER BY created_at DESC",
      );
  return rows.map(rowToContactNote);
}

export async function upsertContactNote(n: ContactNote): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO contact_notes (id,contact_id,body,pinned,created_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(id) DO UPDATE SET
       contact_id=excluded.contact_id, body=excluded.body, pinned=excluded.pinned`,
    [n.id, n.contactId, n.body, n.pinned ? 1 : 0, n.createdAt],
  );
}

export async function deleteContactNote(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM contact_notes WHERE id = $1", [id]);
}

/* ── Clips ──────────────────────────────────────────── */

export async function listClips(): Promise<Clip[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM clips ORDER BY created_at DESC",
  );
  return rows.map(rowToClip);
}

export async function upsertClip(c: Clip): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO clips (id,text,msg_id,contact_id,created_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(id) DO UPDATE SET text=excluded.text, msg_id=excluded.msg_id, contact_id=excluded.contact_id`,
    [c.id, c.text, c.msgId ?? null, c.contactId ?? null, c.createdAt],
  );
}

export async function deleteClip(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM clips WHERE id = $1", [id]);
}

/* ── Follow-ups ──────────────────────────────────────────── */

export async function listFollowUps(): Promise<FollowUp[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM follow_ups ORDER BY due_at ASC",
  );
  return rows.map(rowToFollowUp);
}

export async function upsertFollowUp(f: FollowUp): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO follow_ups (id,msg_id,due_at,status,note,surfaced_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT(id) DO UPDATE SET
       msg_id=excluded.msg_id, due_at=excluded.due_at, status=excluded.status,
       note=excluded.note, surfaced_at=excluded.surfaced_at`,
    [f.id, f.msgId, f.dueAt, f.status, f.note ?? null, f.surfacedAt ?? null],
  );
}

export async function deleteFollowUp(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM follow_ups WHERE id = $1", [id]);
}

/* ── Scheduled sends ──────────────────────────────────────────── */

export async function listScheduledSends(): Promise<ScheduledSend[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM scheduled_sends ORDER BY scheduled_at ASC",
  );
  return rows.map(rowToScheduledSend);
}

export async function upsertScheduledSend(s: ScheduledSend): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO scheduled_sends (id,draft_id,account_id,scheduled_at,status)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(id) DO UPDATE SET
       draft_id=excluded.draft_id, account_id=excluded.account_id,
       scheduled_at=excluded.scheduled_at, status=excluded.status`,
    [s.id, s.draftId, s.accountId, s.scheduledAt, s.status],
  );
}

export async function deleteScheduledSend(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM scheduled_sends WHERE id = $1", [id]);
}

/* ── Labels ──────────────────────────────────────────── */

export async function listLabels(): Promise<Label[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM labels ORDER BY name",
  );
  return rows.map(rowToLabel);
}

export async function upsertLabel(l: Label): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO labels (id,name,color)
     VALUES ($1,$2,$3)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color`,
    [l.id, l.name, l.color],
  );
}

export async function deleteLabel(id: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM labels WHERE id = $1", [id]);
}

/* ── Shortcuts ──────────────────────────────────────────── */

export async function listShortcuts(): Promise<Shortcut[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM shortcuts ORDER BY action",
  );
  return rows.map(rowToShortcut);
}

export async function upsertShortcut(s: Shortcut): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO shortcuts (id,combo,label,action,editable)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(id) DO UPDATE SET
       combo=excluded.combo, label=excluded.label, action=excluded.action, editable=excluded.editable`,
    [s.id, s.combo, s.label, s.action, s.editable ? 1 : 0],
  );
}

export async function ensureDefaultShortcuts(): Promise<void> {
  const db = await getDb();
  const row = await db.select<Record<string, unknown>[]>(
    "SELECT COUNT(*) as cnt FROM shortcuts",
  );
  const cnt = (row[0]?.cnt as number) ?? 0;
  if (cnt > 0) return;
  await resetShortcuts();
}

export async function resetShortcuts(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM shortcuts");
  for (const s of DEFAULT_SHORTCUTS) {
    await upsertShortcut(s);
  }
}

/* ── Bundle configs ──────────────────────────────────────────── */

export async function listBundleConfigs(): Promise<BundleConfig[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    "SELECT * FROM bundle_configs",
  );
  return rows.map(rowToBundleConfig);
}

export async function upsertBundleConfig(b: BundleConfig): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO bundle_configs (contact_id,enabled,label)
     VALUES ($1,$2,$3)
     ON CONFLICT(contact_id) DO UPDATE SET enabled=excluded.enabled, label=excluded.label`,
    [b.contactId, b.enabled ? 1 : 0, b.label ?? null],
  );
}

export async function deleteBundleConfig(contactId: ID): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM bundle_configs WHERE contact_id = $1", [
    contactId,
  ]);
}

/* ── Reset all data (Settings → Data) ────────────────────── */

export async function resetAllData(): Promise<void> {
  const db = await getDb();
  // Order matters because of foreign keys.
  for (const table of [
    "agent_audit",
    "agent_drafts",
    "agent_tasks",
    "agent_sessions",
    "notifications",
    "snippets",
    "stickies",
    "contact_notes",
    "clips",
    "follow_ups",
    "scheduled_sends",
    "labels",
    "shortcuts",
    "bundle_configs",
    "drafts",
    "tasks",
    "events",
    "files",
    "messages",
    "contacts",
    "accounts",
  ]) {
    await db.execute(`DELETE FROM ${table}`);
  }
}

/* ── Agent memory — stored in tauri-plugin-store, not SQL ── */

export const AGENT_MEMORY_KEY = "agent_memory";

export async function loadAgentMemory(
  store: import("@tauri-apps/plugin-store").Store,
): Promise<AgentMemory> {
  const v = await store.get<AgentMemory>(AGENT_MEMORY_KEY);
  return v ?? { global: {}, contacts: {} };
}

export async function saveAgentMemory(
  store: import("@tauri-apps/plugin-store").Store,
  memory: AgentMemory,
): Promise<void> {
  await store.set(AGENT_MEMORY_KEY, memory);
  await store.save();
}

/* ── App settings — stored in tauri-plugin-store ─────────── */

export const APP_SETTINGS_KEY = "app_settings";

export async function loadAppSettings(
  store: import("@tauri-apps/plugin-store").Store,
): Promise<AppSettings> {
  const v = await store.get<AppSettings>(APP_SETTINGS_KEY);
  return (
    v ?? {
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
    }
  );
}

export async function saveAppSettings(
  store: import("@tauri-apps/plugin-store").Store,
  s: AppSettings,
): Promise<void> {
  await store.set(APP_SETTINGS_KEY, s);
  await store.save();
}
