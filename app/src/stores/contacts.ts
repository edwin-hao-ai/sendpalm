/** Shared contacts store — single source of truth for `Contact[]`
 * across all views.
 *
 * Before this store, every view (Agent, ContactPanel, Settings,
 * Compose, etc.) called `createResource(listContacts)` and
 * triggered its own SELECT. The ContactPanel alone pulled the
 * full list — including body_html-bearing rows for some flows —
 * just to find connections matching a single contact's company.
 *
 * Now all callers share one SolidJS store, kept fresh by a
 * single fetcher. Views can call `refetchContacts()` after a
 * mutation (e.g. from `upsertContact`), and the shared store
 * updates everywhere atomically.
 *
 * Pattern: module-level signal + a manual `refetchContacts` that
 * deduplicates in-flight requests. Mirrors the `appSettings`
 * pattern in `stores/ui.ts` (which keeps a SolidJS `createStore`
 * hydrated from `tauri-plugin-store`).
 */

import { createSignal } from "solid-js";
import { listContacts } from "./data";
import type { Contact } from "../types";

const [contacts, setContactsSignal] = createSignal<Contact[]>([]);

let inflight: Promise<Contact[]> | null = null;

export const contactsList = contacts;

/** Fetch the contact list once and cache the result. Concurrent
 *  callers share the same in-flight promise (so a page with 5
 *  views that all subscribe to contactsList only triggers one
 *  SQLite roundtrip). */
export async function refetchContacts(): Promise<Contact[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const list = await listContacts();
      setContactsSignal(list);
      return list;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Optimistic update — splice a single contact in or out of the
 *  shared list without a full refetch. Used by `upsertContact`
 *  callers that already know the new shape. */
export function patchContact(c: Contact) {
  setContactsSignal((prev) => {
    const idx = prev.findIndex((x) => x.id === c.id);
    if (idx < 0) return [c, ...prev];
    const next = prev.slice();
    next[idx] = c;
    return next;
  });
}

export function removeContact(id: string) {
  setContactsSignal((prev) => prev.filter((x) => x.id !== id));
}
