/// <reference types="node" />
/** Regression guard: every `var(--token)` used without a fallback must be
 *  defined somewhere in the app's own CSS or inline styles.
 *
 *  Why this exists: the 2026-09-22 visual audit found 11 design tokens
 *  (--accent, --accent-soft, --ruby, --bg-elevated, --ink-secondary,
 *  --space-7, --text-h5, …) referenced but never defined. An unresolved
 *  `var()` invalidates the whole declaration, which silently turned the
 *  primary Gate "批准到 Imbox" button into white-on-transparent (invisible)
 *  and blanked several count badges. This test fails the build if a token
 *  regresses to undefined.
 *
 *  `var(--x, fallback)` is intentionally allowed — an explicit fallback is
 *  a deliberate optional token.
 *
 *  The CSS is read from disk (not via a Vite import) because Vitest stubs
 *  CSS module imports to an empty string.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const DEF_RE = /(--[a-zA-Z0-9-]+)\s*:/g;
const USE_RE = /var\((--[a-zA-Z0-9-]+)\)/g;

describe("CSS design tokens", () => {
  it("defines every var() used without a fallback", () => {
    const files = walk(SRC).filter(
      (f) => /\.(css|ts|tsx)$/.test(f) && !f.includes(".test."),
    );

    const defined = new Set<string>();
    for (const file of files) {
      for (const m of readFileSync(file, "utf-8").matchAll(DEF_RE)) {
        if (m[1]) defined.add(m[1]);
      }
    }

    const missing = new Map<string, string[]>();
    for (const file of files) {
      readFileSync(file, "utf-8")
        .split("\n")
        .forEach((line, i) => {
          for (const m of line.matchAll(USE_RE)) {
            const key = m[1];
            if (!key || defined.has(key)) continue;
            const loc = `${file.slice(SRC.length + 1)}:${i + 1}`;
            missing.set(key, [...(missing.get(key) ?? []), loc]);
          }
        });
    }

    const report = [...missing.entries()]
      .map(([token, locs]) => `${token} → ${locs.slice(0, 4).join(", ")}`)
      .join("\n");

    expect(missing.size, `Undefined CSS tokens:\n${report}`).toBe(0);
  });
});
