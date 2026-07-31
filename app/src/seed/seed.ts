/** Seed demo data on first run — mirrors prototype-data.js D.* exactly. */

import {
  upsertAccount,
  upsertAgentSession,
  upsertAgentTask,
  upsertAgentDraft,
  upsertBundleConfig,
  upsertClip,
  upsertContact,
  upsertContactNote,
  upsertDraft,
  upsertEvent,
  upsertFile,
  upsertFollowUp,
  upsertLabel,
  upsertMessage,
  upsertNotification,
  upsertScheduledSend,
  upsertShortcut,
  upsertSnippet,
  upsertSticky,
  upsertTask,
} from "../stores/data";
import { getDb } from "../stores/data";
import { DEMO_ACCOUNTS, DEMO_AGENT_DRAFTS, DEMO_AGENT_SESSIONS, DEMO_AGENT_TASKS, DEMO_BUNDLE_CONFIGS, DEMO_CLIPS, DEMO_CONTACT_NOTES, DEMO_CONTACTS, DEMO_DRAFTS, DEMO_EVENTS, DEMO_FILES, DEMO_FOLLOW_UPS, DEMO_LABELS, DEMO_MESSAGES, DEMO_NOTIFICATIONS, DEMO_SCHEDULED_SENDS, DEMO_SHORTCUTS, DEMO_SNIPPETS, DEMO_STICKIES, DEMO_TASKS } from "./demo";

export async function seedIfEmpty() {
  const db = await getDb();
  const result = await db.select<{ c: number }[]>("SELECT COUNT(*) as c FROM contacts");
  if ((result[0]?.c ?? 0) > 0) return; // already seeded

  for (const c of DEMO_CONTACTS) await upsertContact(c);
  for (const a of DEMO_ACCOUNTS) await upsertAccount(a);
  for (const m of DEMO_MESSAGES) await upsertMessage(m);
  for (const f of DEMO_FILES) await upsertFile(f);
  for (const e of DEMO_EVENTS) await upsertEvent(e);
  for (const t of DEMO_TASKS) await upsertTask(t);
  for (const d of DEMO_DRAFTS) await upsertDraft(d);
  for (const s of DEMO_SNIPPETS) await upsertSnippet(s);
  for (const s of DEMO_STICKIES) await upsertSticky(s);
  for (const n of DEMO_CONTACT_NOTES) await upsertContactNote(n);
  for (const c of DEMO_CLIPS) await upsertClip(c);
  for (const f of DEMO_FOLLOW_UPS) await upsertFollowUp(f);
  for (const s of DEMO_SCHEDULED_SENDS) await upsertScheduledSend(s);
  for (const l of DEMO_LABELS) await upsertLabel(l);
  for (const s of DEMO_SHORTCUTS) await upsertShortcut(s);
  for (const b of DEMO_BUNDLE_CONFIGS) await upsertBundleConfig(b);
  for (const n of DEMO_NOTIFICATIONS) await upsertNotification(n);
  for (const s of DEMO_AGENT_SESSIONS) await upsertAgentSession(s);
  for (const t of DEMO_AGENT_TASKS) await upsertAgentTask(t);
  for (const d of DEMO_AGENT_DRAFTS) await upsertAgentDraft(d);
}