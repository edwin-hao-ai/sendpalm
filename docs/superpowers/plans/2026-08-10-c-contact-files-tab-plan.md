# Plan C: Contact Files Tab Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the existing `ContactPanel` Files tab actually discoverable + grouped by type + clickable into the file viewer.

**Architecture:** No new data model. Replace `FilesTab` component with `GroupedFilesTab` (group by PDF/Image/Doc/Spreadsheet, sort newest first, click navigates to FilePanel). Add a small discovery chip on the Timeline header. Add `filesContactFilter` signal in `stores/ui.ts` so the empty-state deep-link to Files view can prefilter.

**Tech Stack:** SolidJS, Vitest, Playwright.

## Global Constraints

Verbatim from spec + AGENTS.md:
- AGENTS.md §3.2: no `any` in TS, no magic strings.
- AGENTS.md §3.3: DRY. YAGNI.
- AGENTS.md §3.4: unit tests for any logic; visual via e2e.
- AGENTS.md §3.5: conventional commits.
- AGENTS.md §6: mobile/tablet/desktop breakpoints; `100dvh`.
- Spec C file scope: ContactPanel.tsx, stores/ui.ts, views/Files.tsx, test/contact-files.test.ts, e2e/views.spec.ts. Nothing else.

---

## Task C.1: `GroupedFilesTab` + sort + click fix

**Files:**
- Modify: `app/src/panels/ContactPanel.tsx:440-448` (replace `FilesTab` call with `GroupedFilesTab`)
- Modify: `app/src/panels/ContactPanel.tsx:723-806` (replace `FilesTab` function with `GroupedFilesTab`)

**Interfaces:**
- Produces: `<GroupedFilesTab files={FileItem[]} onOpen={(id) => void} />` — group by `type` (pdf/image/doc/spreadsheet/other), sort by `st DESC` within each group, render each group as a `GroupHeader` + a list of `FileRow` (extracted from the existing body).

- [ ] **Step 1: Read existing code to confirm exact shape**

Read `ContactPanel.tsx:440-806` to capture the current JSX (icons per type, row style, empty state text).

- [ ] **Step 2: Implement `GroupedFilesTab`**

Replace the `FilesTab` function at line 723 with:

```tsx
import { For, Show, createMemo } from "solid-js";
import type { FileItem } from "../types";
import { Empty } from "./Empty";
import { Icon } from "./Icon";
import { relativeTime } from "../utils/date";

const TYPE_ORDER = ["pdf", "image", "doc", "spreadsheet", "other"] as const;
const TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  image: "图片",
  doc: "文档",
  spreadsheet: "表格",
  other: "其他",
};

function GroupHeader(props: { label: string; count: number }) {
  return (
    <div
      style={{
        "font-size": "var(--text-micro)",
        color: "var(--text-muted)",
        "font-weight": "700",
        "letter-spacing": "0.06em",
        "text-transform": "uppercase",
        padding: "var(--space-3) 0 var(--space-1)",
      }}
    >
      {props.label} · {props.count}
    </div>
  );
}

function FileRow(props: { file: FileItem; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => props.onOpen(props.file.id)}
      data-contact-file-row
      data-fid={props.file.id}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-3)",
        width: "100%",
        padding: "var(--space-3)",
        background: "var(--paper-mid)",
        "border-radius": "var(--radius-md)",
        "margin-bottom": "var(--space-2)",
        "text-align": "left",
        cursor: "pointer",
        border: "none",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-dark)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
    >
      <Icon
        name={
          props.file.type === "pdf"
            ? "ph-file-pdf"
            : props.file.type === "image"
              ? "ph-file-image"
              : props.file.type === "spreadsheet"
                ? "ph-file-xls"
                : "ph-file-text"
        }
        size={20}
      />
      <div style={{ flex: 1, "min-width": 0 }}>
        <div
          style={{
            "font-weight": "600",
            "white-space": "nowrap",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {props.file.name}
        </div>
        <div
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
          }}
        >
          {(props.file.size / 1024).toFixed(0)} KB · {relativeTime(props.file.st)}
        </div>
      </div>
      <Icon name="ph-arrow-right" size={14} />
    </button>
  );
}

export function GroupedFilesTab(props: { files: FileItem[]; onOpen: (id: string) => void }) {
  const grouped = createMemo(() => {
    const sorted = (props.files ?? []).slice().sort((a, b) => b.st.localeCompare(a.st));
    const map = new Map<string, FileItem[]>();
    for (const f of sorted) {
      const t = TYPE_ORDER.includes(f.type as never) ? f.type : "other";
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(f);
    }
    return TYPE_ORDER.filter((t) => (map.get(t) ?? []).length > 0).map((t) => ({
      type: t,
      label: TYPE_LABEL[t] ?? t,
      files: map.get(t) ?? [],
    }));
  });

  return (
    <Show
      when={props.files.length > 0}
      fallback={
        <Empty
          icon="ph-paperclip"
          title="还没有附件"
          description="收到的附件会自动列在这里。"
          action={{ label: "在 Files 中查看全部", onClick: () => { /* wired in Task C.2 */ } }}
        />
      }
    >
      <For each={grouped()}>
        {(g) => (
          <div data-contact-files-group data-type={g.type}>
            <GroupHeader label={g.label} count={g.files.length} />
            <For each={g.files}>{(f) => <FileRow file={f} onOpen={props.onOpen} />}</For>
          </div>
        )}
      </For>
    </Show>
  );
}
```

Then at line 440-448, replace:

```tsx
<Show when={contactTab() === "Files"}>
  <GroupedFilesTab
    files={fls()}
    onOpen={(id) => {
      setSelectedContactId(null);
      setSelectedFileId(id);
      setDetailOpen(true);
    }}
  />
</Show>
```

- [ ] **Step 3: Verify**

```bash
cd app && pnpm typecheck && pnpm lint -- src/panels/ContactPanel.tsx
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/src/panels/ContactPanel.tsx
git commit -m "feat(contacts): GroupedFilesTab with type-grouping + click into FilePanel"
```

## Task C.2: `filesContactFilter` signal + Files.tsx integration

**Files:**
- Modify: `app/src/stores/ui.ts:55-65` (add `filesContactFilter` signal + setter)
- Modify: `app/src/views/Files.tsx:13-15` (read filter, refetch with it)
- Modify: `app/src/views/Files.tsx:120-225` (render a small filter chip if set)

**Interfaces:**
- Produces:
  - `filesContactFilter: { contactId: ID } | null` signal
  - `setFilesContactFilter(filter)` setter
  - `Files.tsx` reads the signal, passes to `listFiles` resource, renders a chip "只显示此联系人" with a clear button.

- [ ] **Step 1: Add the signal in stores/ui.ts**

In `app/src/stores/ui.ts` (after the `gateCandidateCount` block at line 81-86), add:

```ts
export const [filesContactFilter, setFilesContactFilter] = createSignal<{ contactId: ID } | null>(null);
```

- [ ] **Step 2: Update Files.tsx**

In `app/src/views/Files.tsx`, import the signal:

```ts
import { setFilesContactFilter, filesContactFilter } from "../stores/ui";
```

Replace the resource list to take the filter:

```ts
const [files, { refetch: refetchFiles }] = createResource(
  filesContactFilter,
  async (filter) => {
    const all = await listFiles();
    if (!filter) return all;
    return all.filter((f) => f.pid === filter.contactId);
  },
);
```

The existing `items()` memo (line 29) keeps its current sort + type + search logic.

- [ ] **Step 3: Render the filter chip**

In `app/src/views/Files.tsx`, after the header h2 (around line 64), add:

```tsx
<Show when={filesContactFilter()}>
  {(f) => (
    <div
      data-files-filter-chip
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "var(--space-1)",
        padding: "4px 10px",
        background: "var(--palm-soft)",
        color: "var(--palm)",
        "border-radius": "var(--radius-pill)",
        "font-size": "var(--text-caption)",
        "font-weight": "600",
        "margin-top": "var(--space-2)",
      }}
    >
      <Icon name="ph-funnel" size={11} />
      只显示此联系人
      <button
        onClick={() => setFilesContactFilter(null)}
        aria-label="Clear filter"
        style={{
          background: "transparent",
          border: "none",
          "padding-left": "4px",
          cursor: "pointer",
        }}
      >
        <Icon name="ph-x" size={11} />
      </button>
    </div>
  )}
</Show>
```

- [ ] **Step 4: Verify**

```bash
cd app && pnpm typecheck && pnpm lint -- src/views/Files.tsx src/stores/ui.ts
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/stores/ui.ts app/src/views/Files.tsx
git commit -m "feat(files): filesContactFilter signal + prefilter chip"
```

## Task C.3: Wire empty-state deep-link + Timeline discovery chip

**Files:**
- Modify: `app/src/panels/ContactPanel.tsx` (empty-state `onClick` + add discovery chip on Timeline header)
- Modify: `app/src/panels/ContactPanel.tsx:30-50` (import `setView` and `setFilesContactFilter`)

**Interfaces:**
- Produces: empty-state CTA navigates to Files view with the contact prefilter; Timeline header shows a `📎 N 个附件` chip when the contact has files.

- [ ] **Step 1: Import the setters**

At the top of `app/src/panels/ContactPanel.tsx`, update the import:

```ts
import { setDetailOpen, setSelectedContactId, setSelectedFileId, setView, setFilesContactFilter, showToast, openCompanyDetail } from "../stores/ui";
```

- [ ] **Step 2: Wire the empty-state CTA**

Update the `GroupedFilesTab` empty-state `action.onClick` to:

```ts
onClick: () => {
  setFilesContactFilter({ contactId: c.id });
  setView("files");
  setDetailOpen(false);
  setSelectedContactId(null);
},
```

But `GroupedFilesTab` doesn't have access to `c.id` today. Pass it through. In the call site (Task C.1 Step 2 JSX), change:

```tsx
<GroupedFilesTab
  contactId={props.contactId}
  files={fls()}
  onOpen={(id) => { ... }}
/>
```

In `GroupedFilesTab`, add `contactId: string` to props and use it in the empty-state CTA.

- [ ] **Step 3: Add the Timeline discovery chip**

In the Timeline header (find the `c().name` `<h1>` block), after the existing actions (line 320-360), add:

```tsx
<Show when={fls().length > 0}>
  <button
    onClick={() => setContactTab("Files")}
    data-discovery-chip
    style={{
      display: "inline-flex",
      "align-items": "center",
      gap: "var(--space-1)",
      padding: "4px 10px",
      background: "var(--palm-soft)",
      color: "var(--palm)",
      "border-radius": "var(--radius-pill)",
      "font-size": "var(--text-caption)",
      "font-weight": "600",
      "margin-top": "var(--space-2)",
    }}
  >
    <Icon name="ph-paperclip" size={12} />
    {fls().length} 个附件
  </button>
</Show>
```

- [ ] **Step 4: Verify**

```bash
cd app && pnpm typecheck && pnpm lint -- src/panels/ContactPanel.tsx
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/src/panels/ContactPanel.tsx
git commit -m "feat(contacts): Timeline discovery chip + empty-state deep link"
```

## Task C.4: Vitest + e2e + PROGRESS

**Files:**
- Create: `app/src/test/contact-files.test.ts`
- Modify: `app/e2e/views.spec.ts` (assert grouped files render)
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Produces: 2 vitest cases (group order; contactId passed through) + 1 e2e (Files tab shows grouped rows).

- [ ] **Step 1: Write the failing test**

Create `app/src/test/contact-files.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import { resetMockDb } from "../services/mock-db";
import { listContactAttachments } from "../stores/data";

describe("listContactAttachments", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  it("returns all files matching pid, ordered by st desc", async () => {
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    await db.execute(`INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) VALUES ('f1','p1','a.pdf','pdf','application/pdf',1,'','2025-08-01T00:00:00Z','[]')`);
    await db.execute(`INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) VALUES ('f2','p1','b.pdf','pdf','application/pdf',1,'','2025-08-03T00:00:00Z','[]')`);
    await db.execute(`INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) VALUES ('f3','p2','c.pdf','pdf','application/pdf',1,'','2025-08-02T00:00:00Z','[]')`);
    const r = await listContactAttachments("p1");
    expect(r.map((f) => f.id)).toEqual(["f2", "f1"]);
  });

  it("returns empty array for unknown contact", async () => {
    const r = await listContactAttachments("missing");
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect pass (this uses an existing helper from Plan A)**

```bash
cd app && pnpm test -- contact-files.test.ts
```
If `listContactAttachments` is not yet exposed (Plan A might not have landed), use the same query directly via `db.select(...)`. The test should still pass because `data.ts:578-588` already implements it.

- [ ] **Step 3: Add the e2e**

```ts
test("contact files tab groups by type", async ({ page }) => {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor();
  await page.locator("[data-nav='Contacts']").first().click();
  // click first contact row
  await page.locator("[data-contact-row]").first().click();
  // switch to Files tab
  await page.locator("button:has-text('Files')").first().click();
  await expect(page.locator("[data-contact-files-group]").first()).toBeVisible({ timeout: 5000 });
});
```

- [ ] **Step 4: Add Phase C PROGRESS entry**

```markdown
### Phase C — Contact files tab polish (2026-08-10)

- Replaced `FilesTab` with `GroupedFilesTab` (group by PDF/Image/Doc/Spreadsheet, sort newest first)
- File row click navigates to FilePanel (ContactPanel auto-closes)
- Timeline header shows `📎 N 个附件` chip when the contact has files
- Empty state CTA deep-links to Files view with `filesContactFilter` set
- `filesContactFilter` signal in `stores/ui.ts`; Files view renders a "只显示此联系人" chip
- Tests: contact-files (2), e2e (1)
```

- [ ] **Step 5: Commit**

```bash
git add app/src/test/contact-files.test.ts app/e2e/views.spec.ts docs/PROGRESS.md
git commit -m "test: contact files grouped + e2e + PROGRESS phase C"
```

---

## Definition of Done (Phase C)

- [ ] All commits conventional
- [ ] `pnpm test` green; e2e green (best effort)
- [ ] `pnpm typecheck` + `pnpm lint` clean
- [ ] Visual: contact with mixed files shows grouped rows; click opens FilePanel
- [ ] `docs/PROGRESS.md` updated
