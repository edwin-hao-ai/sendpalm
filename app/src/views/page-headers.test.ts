/** Structural audit — every top-level view must present its page title
 *  through the shared PageHeader primitive (one left-aligned H1). This is
 *  the guard that keeps the next view from inventing its own h2/centered
 *  title style again.
 *
 *  Excluded on purpose: Onboarding (intentionally centered focal flow —
 *  the empty-state/onboarding exception), and child surfaces that render
 *  inside a top-level view (PileBoard, FocusReply, ReadTogether open as
 *  full views though — they stay in the list). */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Vitest runs with cwd = app/ — resolve the views dir from there so the
// audit works under both node and jsdom environments.
const viewsDir = join(process.cwd(), "src/views");

const TOP_LEVEL_VIEWS = [
  "Gate",
  "ScreenerHistory",
  "Imbox",
  "Stream",
  "Records",
  "Trash",
  "Spam",
  "Contacts",
  "Companies",
  "Calendar",
  "Files",
  "Insights",
  "Drafts",
  "FollowUps",
  "Tasks",
  "Clips",
  "Folders",
  "Search",
  "Settings",
  "Agent",
  "FocusReply",
  "ReadTogether",
  "PileBoard",
] as const;

/** Views allowed a deliberately different composition. */
const EXCEPTIONS: Record<string, string> = {
  // Centered onboarding focal flow — the spec's explicit exception.
  Onboarding: "onboarding is an intentional centered focal flow",
};

/** Views living in a shared file (exported siblings). */
const VIEW_FILE: Record<string, string> = {
  ScreenerHistory: "Gate.tsx",
};

function viewSource(name: string): string {
  const candidates = [
    VIEW_FILE[name] ?? `${name}.tsx`,
    `${name}.ts`,
    "Gate.tsx", // sibling exports (ScreenerHistory)
  ];
  const tried = new Set<string>();
  for (const file of candidates) {
    if (tried.has(file)) continue;
    tried.add(file);
    try {
      return readFileSync(join(viewsDir, file), "utf8");
    } catch {
      /* try next */
    }
  }
  throw new Error(`view source not found for ${name}`);
}

describe("top-level views use the shared page header", () => {
  for (const name of TOP_LEVEL_VIEWS) {
    it(`${name} renders its title via PageHeader`, () => {
      const src = viewSource(name);
      expect(
        src.includes("<PageHeader"),
        `${name} must render its page title through <PageHeader> (one left-aligned H1)`,
      ).toBe(true);
    });
  }

  it("no top-level view file invents a raw <h1> outside PageHeader", () => {
    for (const name of TOP_LEVEL_VIEWS) {
      const src = viewSource(name);
      const rawH1 = src.match(/<h1[\s>]/g) ?? [];
      expect(
        rawH1.length,
        `${name} contains a raw <h1> — page titles must come from PageHeader`,
      ).toBe(0);
    }
  });

  it("documented exceptions stay the only centered views", () => {
    const files = readdirSync(viewsDir).filter((f) => /\.tsx$/.test(f));
    for (const file of files) {
      const base = file.replace(/\.tsx$/, "");
      if (TOP_LEVEL_VIEWS.includes(base as (typeof TOP_LEVEL_VIEWS)[number]))
        continue;
      if (EXCEPTIONS[base]) continue;
      if (base.endsWith(".test") || base.includes("-helpers")) continue;
      // Any other view file must not exist un-documented — adding a new
      // top-level view requires updating TOP_LEVEL_VIEWS above.
      expect(
        false,
        `${base} is a view file not covered by the page-header audit — add it to TOP_LEVEL_VIEWS or EXCEPTIONS`,
      ).toBe(true);
    }
  });
});
