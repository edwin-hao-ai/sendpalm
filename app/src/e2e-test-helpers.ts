/** Test helpers exposed in browser mode for Playwright E2E.
 *
 * These helpers let tests seed and inspect the local data store through the
 * same frontend data layer the UI uses. They are only attached to `window`
 * when `IS_BROWSER()` is true, so they have no effect in the Tauri build.
 */

import { IS_BROWSER } from "./services/tauri-shim";
import type { CalendarEvent, Contact, FileItem, Message } from "./types";
import {
  upsertContact,
  upsertMessage,
  upsertEvent,
  upsertFile,
  listContacts,
  listMessages,
  listEvents,
  resetAllData,
} from "./stores/data";
import { bumpRefreshTick } from "./stores/ui";

interface SeedPayload {
  contacts?: Contact[];
  messages?: Message[];
  events?: CalendarEvent[];
  files?: FileItem[];
}

interface E2EHelpers {
  resetData: () => Promise<void>;
  seedContact: (c: Contact) => Promise<void>;
  seedMessage: (m: Message) => Promise<void>;
  seedEvent: (e: CalendarEvent) => Promise<void>;
  seedFile: (f: FileItem) => Promise<void>;
  listContacts: () => Promise<Contact[]>;
  listMessages: () => Promise<Message[]>;
  listEvents: () => Promise<CalendarEvent[]>;
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
  for (const c of payload.contacts ?? []) await upsertContact(c);
  for (const m of payload.messages ?? []) await upsertMessage(m);
  for (const e of payload.events ?? []) await upsertEvent(e);
  for (const f of payload.files ?? []) await upsertFile(f);
  // Bump the global refresh tick so any createResource that already
  // fired with empty data refetches now that the seed has landed.
  // Without this, view state and resource cache race the seed.
  bumpRefreshTick();
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
    seedContact: upsertContact,
    seedMessage: upsertMessage,
    seedEvent: upsertEvent,
    seedFile: upsertFile,
    listContacts,
    listMessages,
    listEvents,
    __seedReady: seedPromise,
  };

  // Kick off seeding without blocking module evaluation so the UI can paint.
  void seedPromise;
}
