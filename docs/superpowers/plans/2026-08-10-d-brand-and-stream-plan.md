# Plan D: Brand Refresh + Stream Reader Mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the Phosphor `ph-leaf` brand mark with a custom paper-plane-on-leaf SVG that matches the splash icon, and turn the Stream view into a HEY-style newspaper reader with inline HTML body expansion.

**Architecture:** New `<BrandMarkSvg>` component (inline SVG, color via `currentColor`); update `<BrandMark>` to use it. New `sanitizeHtml` helper in `app/src/utils/sanitize.ts` (allowlist tags+attrs, strip `script`/`style`/`on*`/`javascript:`). Update `Stream.tsx` to render each feed item with a collapsible header and an expanded HTML body via `innerHTML`.

**Tech Stack:** SolidJS, Vitest, Playwright. No new dependencies.

## Global Constraints

Verbatim from spec + AGENTS.md:
- AGENTS.md §3.2: no `any` in TS, no magic strings.
- AGENTS.md §3.3: DRY; BrandMarkSvg is a single source of truth for the mark.
- AGENTS.md §3.4: unit tests for the sanitizer; visual via e2e.
- AGENTS.md §3.5: conventional commits.
- AGENTS.md §6: mobile/tablet/desktop breakpoints; `100dvh`.
- Spec D §6 file scope: BrandMarkSvg.tsx, BrandMark.tsx, sanitize.ts, Stream.tsx, sanitize.test.ts, e2e/views.spec.ts. Nothing else.

---

## Task D.1: `BrandMarkSvg` + BrandMark swap

**Files:**
- Create: `app/src/components/BrandMarkSvg.tsx`
- Modify: `app/src/components/BrandMark.tsx`

**Interfaces:**
- Produces: `<BrandMarkSvg size={number} color?: string />` — inline SVG that uses `currentColor` so the caller controls color via CSS.

- [ ] **Step 1: Create BrandMarkSvg**

Create `app/src/components/BrandMarkSvg.tsx`:

```tsx
import type { JSX } from "solid-js";

export function BrandMarkSvg(props: { size: number; color?: string }) {
  return (
    <svg
      data-brand-svg
      width={props.size}
      height={props.size}
      viewBox="0 0 256 256"
      role="img"
      aria-label="SendPalm"
      style={{ color: props.color ?? "currentColor", "flex-shrink": 0, display: "inline-block" }}
    >
      <g transform="translate(128 134)">
        <path d="M-72 -28 L72 -28 L72 56 L-72 56 Z" fill="currentColor" fill-opacity="0.18" />
        <path d="M-72 -28 L0 28 L72 -28 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-opacity="0.45" />
        <path d="M-50 -4 L62 -36 L26 24 L8 6 L-50 -4 Z M8 6 L26 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <path d="M-66 14 L-44 14 M-66 24 L-50 24 M-66 34 L-56 34" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-opacity="0.55" />
      </g>
      <g transform="translate(178 70) rotate(20)">
        <path d="M0 30 Q20 10 50 -10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" stroke-opacity="0.8" />
        <path d="M50 -10 Q40 -22 30 -16 Q40 -10 50 -10 Z" fill="currentColor" />
        <path d="M40 -2  Q28 -10 22 -2  Q34 -2  40 -2 Z" fill="currentColor" transform="translate(0 4)" />
        <path d="M30 6   Q18 0   14 8    Q26 8   30 6 Z" fill="currentColor" transform="translate(0 8)" />
        <path d="M20 14  Q10 10  8 18    Q18 18  20 14 Z" fill="currentColor" transform="translate(0 12)" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: Update BrandMark**

In `app/src/components/BrandMark.tsx`, replace the import + body:

```tsx
import { BrandMarkSvg } from "./BrandMarkSvg";

export function BrandMark() {
  return (
    <div
      data-testid="brand-mark"
      style={{ display: "inline-flex", "align-items": "center", gap: "8px", "user-select": "none" }}
    >
      <BrandMarkSvg size={20} color="var(--palm)" />
      <span
        style={{
          "font-family": "var(--font-display)",
          "font-weight": "700",
          "font-size": "18px",
          "letter-spacing": "-0.01em",
          color: "var(--text-primary)",
          "white-space": "nowrap",
        }}
      >
        SendPalm
      </span>
    </div>
  );
}
```

(Remove the `import { Icon } from "./Icon";` line.)

- [ ] **Step 3: Verify**

```bash
cd app && pnpm typecheck && pnpm lint -- src/components/BrandMark.tsx src/components/BrandMarkSvg.tsx
```

- [ ] **Step 4: Commit**

```bash
git add app/src/components/BrandMark.tsx app/src/components/BrandMarkSvg.tsx
git commit -m "feat(brand): custom BrandMarkSvg replaces Phosphor ph-leaf"
```

## Task D.2: `sanitizeHtml` helper + 4 unit tests

**Files:**
- Create: `app/src/utils/sanitize.ts`
- Create: `app/src/test/sanitize.test.ts`

**Interfaces:**
- Produces: `export function sanitizeHtml(input: string): string`.

- [ ] **Step 1: Write the failing tests**

Create `app/src/test/sanitize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "../utils/sanitize";

describe("sanitizeHtml", () => {
  it("drops script blocks", () => {
    expect(sanitizeHtml("a<script>alert(1)</script>b")).toBe("ab");
  });
  it("drops on* handlers", () => {
    expect(sanitizeHtml('<a href="/x" onclick="bad()">go</a>')).toBe('<a href="/x">go</a>');
  });
  it("blocks javascript: urls", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a href="blocked:alert(1)">x</a>');
  });
  it("preserves allowlisted tags and basic attrs", () => {
    expect(sanitizeHtml("<p>hi <strong>there</strong></p>")).toBe("<p>hi <strong>there</strong></p>");
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
cd app && pnpm test -- sanitize.test.ts
```

- [ ] **Step 3: Implement**

Create `app/src/utils/sanitize.ts`:

```ts
const ALLOWED_TAGS = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "blockquote", "code", "pre", "img", "hr",
  "table", "thead", "tbody", "tr", "td", "th", "div", "span", "figure", "figcaption",
]);
const ALLOWED_ATTRS = new Set(["href", "src", "alt", "title", "class", "id"]);

export function sanitizeHtml(input: string): string {
  if (!input) return "";
  let out = input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "blocked:");
  out = out.replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (_m, slash: string, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return "";
    if (slash) return `</${t}>`;
    const clean = (attrs || "").replace(
      /\s+([a-z0-9-]+)\s*=\s*"([^"]*)"/gi,
      (_mm: string, name: string, value: string) => {
        if (!ALLOWED_ATTRS.has(name.toLowerCase())) return "";
        const safe = value.replace(/"/g, "&quot;");
        return ` ${name}="${safe}"`;
      },
    );
    return `<${t}${clean}>`;
  });
  return out;
}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd app && pnpm test -- sanitize.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/src/utils/sanitize.ts app/src/test/sanitize.test.ts
git commit -m "feat(utils): sanitizeHtml allowlist helper"
```

## Task D.3: Stream reader mode

**Files:**
- Modify: `app/src/views/Stream.tsx`

**Interfaces:**
- Produces: `Stream()` renders each feed message with a collapsible header and (when expanded) a sanitized HTML body block.

- [ ] **Step 1: Read Stream.tsx to know the current shape**

Already in plan context. The header is `<article>` at line 102; we wrap it with a toggle button + an inner body.

- [ ] **Step 2: Add state + reader rendering**

In `app/src/views/Stream.tsx`:

Add imports (line 2-13):

```ts
import { createSignal, For, Show, createMemo, createResource } from "solid-js";
import { sanitizeHtml } from "../utils/sanitize";
```

In `Stream()` (line 15-49), add the state:

```ts
const [expandedIds, setExpandedIds] = createSignal<Set<string>>(new Set());
const toggle = (id: string) => {
  const s = new Set(expandedIds());
  if (s.has(id)) s.delete(id);
  else s.add(id);
  setExpandedIds(s);
};
```

In the `<For each={items()}>{(m) => { ... }}</For>` body, wrap the existing `<article>` content. Replace the `<article ... onClick={() => open(m.id)}>` block (line 102) with:

```tsx
<article
  style={{
    "border-bottom": "0.5px solid var(--border)",
    background: expandedIds().has(m.id) ? "var(--paper-mid)" : "transparent",
    "border-radius": "var(--radius-lg)",
    transition: "background var(--duration-fast) var(--ease-out)",
  }}
>
  <button
    onClick={() => toggle(m.id)}
    data-stream-row
    data-mid={m.id}
    style={{
      display: "flex",
      "align-items": "center",
      gap: "var(--space-3)",
      width: "100%",
      padding: "var(--space-5) var(--space-4)",
      background: "transparent",
      "text-align": "left",
      border: "none",
      cursor: "pointer",
    }}
  >
    {/* existing header content (from contact avatar through time) */}
    {/* add a chevron at the end */}
    <Icon name={expandedIds().has(m.id) ? "ph-caret-up" : "ph-caret-down"} size={14} />
  </button>
  <Show when={expandedIds().has(m.id)}>
    <div
      data-stream-body
      data-mid={m.id}
      style={{
        padding: "0 var(--space-5) var(--space-5) var(--space-5)",
        "font-size": "var(--text-body)",
        "line-height": 1.7,
        color: "var(--text-primary)",
        "max-width": "640px",
      }}
      innerHTML={sanitizeHtml(m.bodyHtml ?? (m.body ? `<p>${m.body}</p>` : ""))}
    />
  </Show>
</article>
```

Keep the existing header inner content (avatar, subject, from, time) inside the new `<button>`. The existing `SwipeActions` wrapper stays.

- [ ] **Step 3: Verify**

```bash
cd app && pnpm typecheck && pnpm lint -- src/views/Stream.tsx
```

- [ ] **Step 4: Commit**

```bash
git add app/src/views/Stream.tsx
git commit -m "feat(stream): HEY-style inline expand reader with sanitized HTML body"
```

## Task D.4: e2e + PROGRESS

**Files:**
- Modify: `app/e2e/views.spec.ts` (assert Stream expand)
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Add the e2e**

```ts
test("stream reader expands body inline", async ({ page }) => {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor();
  await page.locator("[data-nav='Stream']").first().click();
  const row = page.locator("[data-stream-row]").first();
  await row.click();
  await expect(page.locator("[data-stream-body]").first()).toBeVisible({ timeout: 5000 });
});
```

- [ ] **Step 2: Add Phase D PROGRESS entry**

```markdown
### Phase D — Brand refresh + stream reader mode (2026-08-10)

- New `<BrandMarkSvg />` SVG component (paper-plane-on-leaf, `currentColor` aware)
- `<BrandMark />` updated to use the custom mark; matches splash icon
- `sanitizeHtml` allowlist helper (script/style/on*/javascript: stripped; tags+attrs allowlisted)
- Stream view now expands the message body inline; HEY-style reading experience
- Tests: sanitize (4), e2e (1)
```

- [ ] **Step 3: Commit**

```bash
git add app/e2e/views.spec.ts docs/PROGRESS.md
git commit -m "test: stream reader expand + PROGRESS phase D"
```

---

## Definition of Done (Phase D)

- [ ] All commits conventional
- [ ] `pnpm test` green; e2e green (best effort)
- [ ] `pnpm typecheck` + `pnpm lint` clean
- [ ] Visual: topbar uses custom paper-plane; Stream tap expands HTML body
- [ ] `docs/PROGRESS.md` updated
