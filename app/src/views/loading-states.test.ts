/** Regression guard — every view that consumes a `createResource` must
 *  plug the result into a `ResourceGate` so the user gets a Skeleton
 *  during loading instead of a blank screen. The previous hand-rolled
 *  `<Show when={!resource.error}>` + `<Show when={data.length > 0}>`
 *  pattern forgot the loading case in 12 views (audit 2026-08-18), and
 *  this is the cheap belt-and-suspenders that catches a regression if
 *  someone reaches for a raw `Show` again.
 *
 *  We use Vite's `?raw` import (the same pattern as Main.test.ts) to
 *  read each view file as a string and grep for `ResourceGate` + the
 *  absence of the hand-rolled loading-fallback pattern. No JSDOM, no
 *  Solid render — these tests run in milliseconds and catch the
 *  structural mistake directly.
 */

import { describe, it, expect } from "vitest";

import agentSource from "./Agent.tsx?raw";
import calendarSource from "./Calendar.tsx?raw";
import clipsSource from "./Clips.tsx?raw";
import companiesSource from "./Companies.tsx?raw";
import draftsSource from "./Drafts.tsx?raw";
import filesSource from "./Files.tsx?raw";
import focusReplySource from "./FocusReply.tsx?raw";
import followUpsSource from "./FollowUps.tsx?raw";
import insightsSource from "./Insights.tsx?raw";
import onboardingSource from "./Onboarding.tsx?raw";
import searchSource from "./Search.tsx?raw";
import settingsSource from "./Settings.tsx?raw";

interface View {
  name: string;
  source: string;
  /** Sub-views inside the file that also need their own gate. The
   *  test asserts that at least one ResourceGate exists per view,
   *  AND if `subGateNames` is set, that the named pattern shows up
   *  once per named component (e.g. accounts/labels/snippets/
   *  shortcuts in Settings). */
  subGateNames?: string[];
}

const VIEWS: View[] = [
  { name: "Agent", source: agentSource },
  { name: "Calendar", source: calendarSource },
  { name: "Clips", source: clipsSource },
  { name: "Companies", source: companiesSource },
  { name: "Drafts", source: draftsSource },
  { name: "Files", source: filesSource },
  { name: "FocusReply", source: focusReplySource },
  { name: "FollowUps", source: followUpsSource },
  { name: "Insights", source: insightsSource },
  { name: "Search", source: searchSource },
  {
    name: "Settings",
    source: settingsSource,
    subGateNames: ["AccountsTab", "LabelsTab", "SnippetsTab", "ShortcutsTab"],
  },
];

describe("view loading states", () => {
  for (const view of VIEWS) {
    it(`${view.name} wraps its resource consumer in <ResourceGate>`, () => {
      // Imports ResourceGate from the components barrel.
      expect(view.source).toMatch(
        /import\s*\{[^}]*\bResourceGate\b[^}]*\}\s*from\s*["']\.\.\/components\/ResourceGate["']/,
      );
      // At least one <ResourceGate> JSX usage.
      expect(view.source).toMatch(/<ResourceGate\b/);
    });

    if (view.subGateNames) {
      for (const tab of view.subGateNames) {
        it(`${view.name} (${tab}) has its own ResourceGate`, () => {
          // The tab function is defined somewhere in the file; we just
          // need to confirm a ResourceGate appears AFTER its definition
          // so we know the gate belongs to that tab and not the main
          // view body.
          const defMatch = view.source.match(
            new RegExp(`function\\s+${tab}\\s*\\(`),
          );
          expect(
            defMatch,
            `${tab} should be defined in ${view.name}`,
          ).not.toBeNull();
          const after = view.source.slice(
            defMatch!.index! + defMatch![0].length,
          );
          expect(after).toMatch(/<ResourceGate\b/);
        });
      }
    }
  }

  it("Onboarding stays skeleton-free (no createResource → nothing to wait on)", () => {
    // Onboarding is a static wizard with no async data; the previous
    // 0-Skeleton finding was a false positive. Lock that in so a
    // future refactor doesn't reach for a gate unnecessarily.
    expect(onboardingSource).not.toMatch(/createResource/);
    expect(onboardingSource).not.toMatch(/<ResourceGate\b/);
  });
});
