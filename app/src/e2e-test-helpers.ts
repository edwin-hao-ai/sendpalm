/** Test helpers exposed in browser mode for Playwright E2E.
 *
 * These helpers let tests seed and inspect the local data store through the
 * same frontend data layer the UI uses. They are only attached to `window`
 * when `IS_BROWSER()` is true, so they have no effect in the Tauri build.
 */

import { IS_BROWSER } from "./services/tauri-shim";
import { issuedQueries, setQueryDelay } from "./services/mock-db";
import type {
  Account,
  AgentDraft,
  AgentSession,
  CalendarEvent,
  Contact,
  FileItem,
  Message,
  Notification,
} from "./types";
import {
  upsertAccount,
  upsertContact,
  upsertMessage,
  upsertEvent,
  upsertFile,
  upsertNotification,
  listContacts,
  listMessages,
  listEvents,
  resetAllData,
  getDb,
  upsertAgentSession,
  upsertAgentDraft,
} from "./stores/data";
import { bumpRefreshTick, bumpSoftRefreshTick } from "./stores/ui";

interface SeedPayload {
  accounts?: Account[];
  contacts?: Contact[];
  messages?: Message[];
  events?: CalendarEvent[];
  files?: FileItem[];
  /** Agent conversations. Needed because `agent_drafts` is a separate table
   *  from `drafts`, and the approve→草稿箱 path has to be exercised end to
   *  end. */
  agentSessions?: AgentSession[];
  agentDrafts?: AgentDraft[];
}

interface E2EHelpers {
  resetData: () => Promise<void>;
  seedAccount: (a: Account) => Promise<void>;
  seedContact: (c: Contact) => Promise<void>;
  seedMessage: (m: Message) => Promise<void>;
  seedEvent: (e: CalendarEvent) => Promise<void>;
  seedFile: (f: FileItem) => Promise<void>;
  seedAgentSession: (x: AgentSession) => Promise<void>;
  seedAgentDraft: (x: AgentDraft) => Promise<void>;
  /** Seed a notification and refresh the surfaces that count them (the
   *  topbar badge), which a raw INSERT would not do. */
  seedNotification: (n: Notification) => Promise<void>;
  listContacts: () => Promise<Contact[]>;
  listMessages: () => Promise<Message[]>;
  listEvents: () => Promise<CalendarEvent[]>;
  /** Every SELECT issued since the last reset, oldest first. Lets a test
   *  assert that an interaction did NOT re-query a list. */
  queries: () => string[];
  /** Make every query take `ms`, so a loading state is observable. An
   *  in-memory double resolves in a microtask; a real mailbox does not, and
   *  "no skeleton" bugs are invisible without that wait. */
  delayQueries: (ms: number) => void;
  /**
   * Test-only escape hatch: returns the underlying Database
   * connection so a test can run arbitrary SQL (e.g. write
   * columns the JS upsertEvent wrapper doesn't cover, like
   * `recurrence_rule` for the calendar RRULE tests).
   * Browser mode only — the Tauri build never attaches this.
   */
  __internals: {
    getDb: () => Promise<{
      execute: (q: string, p?: unknown[]) => Promise<unknown>;
    }>;
  };
  /** Resolves once the auto-seed from sessionStorage has been applied. */
  __seedReady: Promise<void>;
}

declare global {
  interface Window {
    __sendpalmE2E?: E2EHelpers;
  }
}

const SEED_KEY = "__sendpalm_e2e_seed";

async function applySeed(payload: SeedPayload): Promise<void> {
  for (const a of payload.accounts ?? []) await upsertAccount(a);
  for (const c of payload.contacts ?? []) await upsertContact(c);
  for (const m of payload.messages ?? []) await upsertMessage(m);
  for (const e of payload.events ?? []) await upsertEvent(e);
  for (const f of payload.files ?? []) await upsertFile(f);
  for (const s of payload.agentSessions ?? []) await upsertAgentSession(s);
  for (const d of payload.agentDrafts ?? []) await upsertAgentDraft(d);
  // Bump the global refresh ticks so any createResource that already fired
  // with empty data refetches now that the seed has landed. Both ticks: views
  // that only listen to the soft tick (the topbar sync badge, counters) would
  // otherwise stay on the pre-seed snapshot, and a test that then clicks them
  // exercises a different state than it thinks.
  bumpRefreshTick();
  bumpSoftRefreshTick();
}

if (IS_BROWSER() && typeof window !== "undefined") {
  // Auto-seed from sessionStorage when the app boots. This lets Playwright
  // inject test fixtures before any SolidJS resources fetch.
  const raw = sessionStorage.getItem(SEED_KEY);
  const seedPromise: Promise<void> = raw
    ? (async () => {
        try {
          const payload = JSON.parse(raw) as SeedPayload;
          await applySeed(payload);
        } catch {
          /* ignore malformed seed */
        }
        sessionStorage.removeItem(SEED_KEY);
      })()
    : Promise.resolve();

  window.__sendpalmE2E = {
    resetData: resetAllData,
    delayQueries: setQueryDelay,
    queries: () => issuedQueries.slice(),
    seedAccount: upsertAccount,
    seedContact: upsertContact,
    seedMessage: upsertMessage,
    seedEvent: upsertEvent,
    seedFile: upsertFile,
    seedAgentSession: upsertAgentSession,
    seedAgentDraft: upsertAgentDraft,
    seedNotification: async (n: Notification) => {
      await upsertNotification(n);
      bumpSoftRefreshTick();
    },
    listContacts,
    listMessages,
    listEvents,
    __internals: {
      getDb: async () => {
        const db = await getDb();
        return {
          execute: (q: string, p?: unknown[]) => db.execute(q, p),
        };
      },
    },
    __seedReady: seedPromise,
  };

  // Kick off seeding without blocking module evaluation so the UI can paint.
  void seedPromise;
}
