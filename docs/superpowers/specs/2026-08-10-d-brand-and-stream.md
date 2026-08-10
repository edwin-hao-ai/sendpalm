# D. Brand Mark Refresh + Stream Reader Mode

> Spec authored 2026-08-10. Status: Draft awaiting review. Independent of A/B/C. Visual + UX pass; no data model changes.

## 1. Goal

Two distinct improvements:

1. **Brand mark**: the current `app/src/components/BrandMark.tsx` is a Phosphor `ph-leaf` (18px) + the wordmark "SendPalm" (18px, weight 700, `var(--text-primary)`). The user reports it as "很怪" — the prototype-v11 brand uses a more distinctive paper-plane-in-leaf mark. Refresh the brand mark to a custom SVG that combines leaf + paper-plane semantics, and ensure the lockup is consistent across topbar, splash, app icon, and wordmark file.

2. **Stream reader mode**: the current `app/src/views/Stream.tsx` renders each message as a one-line card (`subject + preview + from + time`); tapping opens the full message in `MessagePanel`. The user wants the HEY-style "read like a newspaper" experience — the message body renders inline beneath the header, with expand/collapse, so the Stream becomes a true reading view.

After this work:

- The SendPalm brand mark in the topbar, the splash overlay, and the wordmark file all use a **single consistent design** (custom SVG, no Phosphor dependency).
- The Stream view renders each feed message with a **collapsed header** (subject + from + time + small `Read` chevron) and an **expanded body** that shows `bodyHtml` rendered as sanitized HTML, similar to how `prototype-v11.js:2768-2820` does.
- An `expanded` toggle persists in the per-view state (so scrolling a list doesn't collapse already-read items).

## 2. Non-Goals

- No new icon font, no new asset pipeline. The SVG is inlined.
- No changes to the bottom tab bar (mobile Stream tab stays as a list link).
- No changes to `Records.tsx`, `Imbox.tsx`, or other views.
- No markdown rendering — `bodyHtml` is already stored on `Message` (data.ts:153, `m.bodyHtml`); we use it directly.
- No full sanitization library — a tiny allowlist (tags + attributes) is enough for our own-generated HTML.

## 3. Background & Root Cause

`app/src/views/Stream.tsx:78-117` renders each `Message` as an `<article>` with subject + 1-line `prev` (preview). The full body lives in `MessagePanel` (panels/MessagePanel.tsx:1080-1170), accessible only after tapping. For a "read newsletters slowly" bucket, that's 2 clicks per article and breaks the HEY "scroll the Stream like a paper" mental model.

The current `BrandMark` (components/BrandMark.tsx) uses Phosphor's generic `ph-leaf` icon. The current app icon (`app/src/assets/logo.svg`) is a custom paper-plane-on-leaf design. The two are visually inconsistent — a 18px Phosphor leaf next to a 256px custom SVG (splash) is jarring.

## 4. Architecture

### 4.1 New `BrandMarkSvg` component

Create `app/src/components/BrandMarkSvg.tsx` that renders a single inline SVG matching the splash icon (`app/src/assets/logo.svg:24-36` — paper-plane-on-leaf), at any size:

```tsx
export function BrandMarkSvg(props: { size: number; color?: string }) {
  const c = props.color ?? "var(--palm)";
  return (
    <svg
      data-brand-svg
      width={props.size}
      height={props.size}
      viewBox="0 0 256 256"
      style={{ color: c, "flex-shrink": 0, display: "inline-block" }}
      aria-hidden="true"
    >
      {/* mirror of app/src/assets/logo.svg:24-36 but sized via width/height attrs */}
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

Update `app/src/components/BrandMark.tsx`:

```tsx
import { BrandMarkSvg } from "./BrandMarkSvg";

export function BrandMark() {
  return (
    <div data-testid="brand-mark" style={{ display: "inline-flex", "align-items": "center", gap: "8px", "user-select": "none" }}>
      <BrandMarkSvg size={20} color="var(--palm)" />
      <span style={{ "font-family": "var(--font-display)", "font-weight": "700", "font-size": "18px", "letter-spacing": "-0.01em", color: "var(--text-primary)", "white-space": "nowrap" }}>
        SendPalm
      </span>
    </div>
  );
}
```

The splash overlay (`app/index.html:91-95`) keeps its current 112px logo — the new `BrandMarkSvg` is for in-app surfaces.

### 4.2 Stream reader mode

In `app/src/views/Stream.tsx`:

- Add an `expandedIds: Set<string>` signal (component-local state, not in `stores/ui` — too transient).
- Each `<article>` becomes a header row (click to expand/collapse); when `expandedIds.has(m.id)`, render a `<body>` block beneath it with the `m.bodyHtml` sanitized + rendered.
- Sanitization: tiny `sanitizeHtml(html: string): string` helper in `app/src/utils/sanitize.ts`:

```ts
const ALLOWED_TAGS = new Set(["p", "br", "b", "strong", "i", "em", "u", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "code", "pre", "img", "hr", "table", "thead", "tbody", "tr", "td", "th"]);
const ALLOWED_ATTRS = new Set(["href", "src", "alt", "title"]);

export function sanitizeHtml(input: string): string {
  // Drop <script>, <style>, on* handlers, javascript: URLs. Allowlist tag+attr.
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/javascript:/gi, "blocked:")
    .replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (m, slash, tag, attrs) => {
      const t = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(t)) return "";
      if (slash) return `</${t}>`;
      const clean = attrs.replace(/\s+([a-z0-9-]+)="([^"]*)"/gi, (_mm, name, value) => {
        if (!ALLOWED_ATTRS.has(name.toLowerCase())) return "";
        return ` ${name}="${value.replace(/"/g, "&quot;")}"`;
      });
      return `<${t}${clean}>`;
    });
}
```

- Render the sanitized HTML via SolidJS's `innerHTML` (SolidJS allows this on regular elements via a small wrapper):

```tsx
<div innerHTML={sanitizeHtml(m.bodyHtml ?? "")} data-stream-body />
```

- The expand/collapse button shows "Read" (chevron down) when collapsed and "Hide" (chevron up) when expanded.
- For HTML `bodyHtml` that is missing or empty, fall back to `m.body` (plain text) wrapped in `<p>`.

### 4.3 Component boundaries (DRY per AGENTS.md §3.3)

- New `BrandMarkSvg` (≤80 lines, pure markup). Used by `BrandMark` and the splash can later reuse it.
- New `sanitizeHtml` (≤50 lines) in `app/src/utils/sanitize.ts`. Pure function, no JSX.
- Stream reader rendering stays in `Stream.tsx` (file grows from 218 → ~320 lines; acceptable per AGENTS.md §3.3 unless it crosses 500).

## 5. Data Flow

```
User opens Stream
  └─> messages().filter(bucket === "feed").sort(st DESC)
       └─> For each: <article> with header (subject + from + time)
            └─> click → toggle expandedIds.has(id)
            └─> if expanded: <div innerHTML={sanitizeHtml(bodyHtml)} />

BrandMark render
  └─> <BrandMarkSvg size={20} color="var(--palm)" /> + "SendPalm" wordmark
       (replaces the current Phosphor ph-leaf)
```

## 6. Files

| File | Change | Section |
|---|---|---|
| `app/src/components/BrandMarkSvg.tsx` | NEW | 4.1 |
| `app/src/components/BrandMark.tsx` | Use `BrandMarkSvg` instead of `ph-leaf` Icon | 4.1 |
| `app/src/utils/sanitize.ts` | NEW: `sanitizeHtml` | 4.2 |
| `app/src/views/Stream.tsx` | Add `expandedIds` + reader rendering | 4.2 |
| `app/src/test/sanitize.test.ts` | NEW: 4 cases (script strip, allowed, javascript:, attribute allowlist) | 8 |
| `app/e2e/views.spec.ts` | Assert Stream reader expand works | 8 |

## 7. Error Handling

- `bodyHtml` containing inline images (`<img src="https://...">`): allowed; the email parser already uploaded these to the local attachments dir per Task 1.5/Phase 1's M10 chain. If the URL is `cid:…` and unresolved, the `<img>` shows a broken image — acceptable; users can tap the message to open in `MessagePanel`.
- `expandedIds` reset on view unmount: acceptable. The Stream is a transient list.
- `sanitizeHtml` returns `""` for empty input → renders an empty div → user sees just the header. Acceptable.

## 8. Testing

| Test | Type | Verifies |
|---|---|---|
| `sanitize.test::drops_script` | Vitest | `<script>` content removed |
| `sanitize.test::drops_on_handlers` | Vitest | `onclick` removed |
| `sanitize.test::blocks_javascript_url` | Vitest | `href="javascript:..."` becomes `href="blocked:..."` |
| `sanitize.test::allowlist_attrs` | Vitest | unknown attrs (e.g. `onmouseover`) stripped |
| `e2e/views.spec::stream_reader_expand` | Playwright | click row → body renders |

## 9. Rollout

- One commit per concern:
  1. `BrandMarkSvg` + BrandMark swap
  2. `sanitizeHtml` + tests
  3. Stream reader mode wiring

## 10. Risks & Open Questions

- **`sanitizeHtml` is regex-only**: covers the most common XSS vectors (script, on*, javascript:). For bulletproof safety a proper DOM-based sanitizer (DOMPurify) is preferred; defer that to a future "web-render" hardening spec.
- **Email HTML complexity**: some newsletters use `<style>` blocks; we strip them. The user will lose custom typography. Acceptable v1.

## 11. Definition of Done

- [ ] All commits conventional
- [ ] `pnpm test` green
- [ ] `pnpm typecheck` + `pnpm lint` clean
- [ ] Visual: topbar uses the new paper-plane mark; Stream tap expands HTML body
- [ ] `docs/PROGRESS.md` updated
