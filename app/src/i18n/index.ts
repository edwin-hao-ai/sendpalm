/** ARCH-1: minimal i18n infrastructure.
 *
 * Most of the SendPalm UI is currently Chinese-only. This module
 * is the smallest viable scaffold to add a second language
 * without rewriting every component:
 *
 *   1. `t(key, fallback, vars?)` — returns the localized string
 *      for the active locale, falling back to `fallback` (which
 *      is the current hard-coded Chinese) when no translation
 *      is registered.
 *   2. `setLocale(locale)` — flips the active locale and
 *      persists to the prefs file.
 *   3. `defineTranslation(locale, dict)` — registers a
 *      dictionary for a locale. The translation system is
 *      intentionally opt-in: callers can migrate one view at a
 *      time without a flag day.
 *
 * Why not a full i18n framework (i18next, lingui, etc.):
 *   - Adds a heavy dependency for a feature the user hasn't
 *     asked for yet.
 *   - SendPalm's text density (HEY-style two-word buttons)
 *     makes a 200-key dictionary reasonable to maintain in
 *     code; we don't need ICU MessageFormat.
 *   - The active locale is just one signal; we can swap to a
 *     full framework later without touching call sites.
 *
 * Locale support is intentionally narrow: `zh-CN` (default,
 * unchanged) and `en-US` (proof-of-concept, partial). Adding
 * a new language is a single `defineTranslation("fr-FR", {...})`
 * call followed by a Settings UI selector (the latter is
 * deferred to a follow-up commit).
 */

import { createSignal, type Accessor } from "solid-js";

export type Locale = "zh-CN" | "en-US";

const DEFAULT_LOCALE: Locale = "zh-CN";

const [locale, setLocaleSignal] = createSignal<Locale>(DEFAULT_LOCALE);

export const activeLocale: Accessor<Locale> = locale;

const dictionaries: Partial<Record<Locale, Record<string, string>>> = {
  "en-US": {
    "imbox.heading": "Imbox",
    "imbox.empty.title": "Imbox is for messages that need you",
    "imbox.empty.body":
      "Important conversations land here. Nothing? Wait for your next check-in.",
    "imbox.tab.new": "New for you",
    "imbox.tab.seen": "Previously seen",
    "gate.heading": "Screener",
    "gate.empty.title": "Inbox is clean",
    "gate.empty.body": "No first-time senders to review right now.",
    "calendar.heading": "Calendar",
    "contacts.heading": "Contacts",
    "files.heading": "Files",
    "settings.heading": "Settings",
    "settings.preferences.theme": "Dark mode",
    "settings.preferences.theme.hint":
      "Switches the entire app to a low-light palette. The choice persists across restarts.",
    "common.close": "Close",
    "common.clear": "Clear",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.loading": "Loading…",
    "common.error.title": "Something went wrong",
    "common.error.retry": "Retry",
  },
};

/** Register or extend a locale dictionary. Useful at app start
 *  to load translations from a JSON file, or at runtime for
 *  dev-mode hot-reload. */
export function defineTranslation(
  loc: Locale,
  dict: Record<string, string>,
) {
  dictionaries[loc] = { ...(dictionaries[loc] ?? {}), ...dict };
}

/** Lookup a translation. Returns `fallback` when the key is
 *  missing in the active locale — this is the common case
 *  for the (still mostly Chinese) UI and is the design
 *  intent: every existing call site stays in Chinese until
 *  a translator adds an entry. */
export function t(
  key: string,
  fallback: string,
  vars?: Record<string, string | number>,
): string {
  const dict = dictionaries[locale()];
  const raw = dict?.[key] ?? fallback;
  if (!vars) return raw;
  // Single-pass {{name}} interpolation. Not a templating engine
  // — just enough for plurals / dynamic counts.
  return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v === undefined ? `{{${k}}}` : String(v);
  });
}

/** Flip the active locale. The signal triggers any `createMemo`
 *  that read `activeLocale()` to re-run, which re-renders the
 *  translated strings. Persistence to the prefs file is the
 *  caller's job (see `bootstrap.ts`). */
export function setLocale(loc: Locale) {
  setLocaleSignal(loc);
}
