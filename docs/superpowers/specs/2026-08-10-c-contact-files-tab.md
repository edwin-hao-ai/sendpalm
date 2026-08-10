# C. 联系人附件面板 (Contact Files Tab — Diagnose + Group + Polish)

> Spec authored 2026-08-10. Status: Draft awaiting review. Independent of A (file↔message) and B (company dedup), but A's data layer makes this spec easier. D (brand+stream) is independent.

## 1. Goal

The `ContactPanel` already has a `Files` tab (`app/src/panels/ContactPanel.tsx:58, 440-448, 723-806`) that filters `files.pid === contactId`. Users report "看不到附件" — investigate, group by type, polish the empty state, and ensure the file row click navigates correctly. After this work:

1. The `Files` tab in `ContactPanel` is **visible by default** when the contact has any file, even if the count is 0 (so users discover the tab).
2. Files are **grouped by type** (PDF / Image / Doc / Spreadsheet) with collapsible sections, mirroring `Files.tsx`.
3. The file row click closes the contact detail panel and opens `FilePanel` (the existing flow at `ContactPanel.tsx:444-446` already attempts this but doesn't set `setDetailOpen(true)` after the file click; verify or fix).
4. Empty state: "还没有附件" + "在 Files 中查看全部" link that closes the contact panel, navigates to the Files view, and applies a `pid = contactId` prefilter.
5. Files are sorted by `st DESC` within each type group (newest first).

## 2. Non-Goals

- No new data model. `FileItem.pid` is already the FK to `Contact.id`; no migration needed.
- No new shared component with `Files.tsx`; the two views use different layouts (tiles vs. grouped rows). The grouping logic is small enough to inline twice (per AGENTS.md §3.3 YAGNI).
- No changes to `Files.tsx` itself (A's SourceBadge is the only Files UI change this iteration).
- No file upload / drag-drop.

## 3. Background & Root Cause

`ContactPanel.tsx:101-103`:

```ts
const fls = createMemo(() =>
  (files() ?? []).filter((f) => f.pid === props.contactId),
);
```

This works **only if** the file was created with the right `pid`. Two known issues:

1. **outbound path**: `app/src-tauri/src/services/sync_loop.rs:1153-1166` writes `pid = contact_id` from the draft's `to` recipient. If the contact is unknown (e.g. an alias), `contact_id` may resolve to `(未分类)` and the file gets lost. Even when correct, the file's `pid` is the message-recipient contact, not always the same as the contact currently being viewed.
2. **Type filter & grouping**: the current `FilesTab` component (`ContactPanel.tsx:723-806`) shows a flat list; no PDF/Image/Doc grouping. Users with 50+ files see a wall.
3. **Empty state**: the current "暂无附件" message is small + same color as muted text; easy to miss.

The Tabs array at `ContactPanel.tsx:55-65` lists "Files" but the **default tab** is "Timeline" (line 416). Users have to manually click "Files" to discover the section.

## 4. Architecture

### 4.1 Default-tab decision (no UI store change)

In `ContactPanel`, add a small effect: if the current default `contactTab()` is "Timeline" and the contact has at least one file, leave the default as is (do not auto-switch — that would be a UX surprise on every contact open). Instead, when on the Timeline tab and `fls().length > 0`, render a small chip `📎 5 个附件` in the header that **switches to Files** on click. Discovery without surprise.

### 4.2 Grouped Files tab

Replace the existing `FilesTab` (ContactPanel.tsx:723-806) with `GroupedFilesTab`. Sort and group:

```ts
const grouped = createMemo(() => {
  const all = (fls() ?? []).slice().sort((a, b) => b.st.localeCompare(a.st));
  const map = new Map<FileItem["type"], FileItem[]>();
  for (const f of all) {
    if (!map.has(f.type)) map.set(f.type, []);
    map.get(f.type)!.push(f);
  }
  return [...map.entries()].sort(([a], [b]) =>
    TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b),
  );
});
```

`TYPE_ORDER = ["pdf", "image", "doc", "spreadsheet", "other"]`.

Each group renders a header (e.g. "PDF · 3"), then a list of `FileRow` (the existing 750-801 code, extracted to a local component). Click handler: call the existing `props.onOpen(fileId)` chain (the parent at `ContactPanel.tsx:443-447` already calls `setSelectedFileId(id)` but never `setDetailOpen(true)` — fix that).

### 4.3 Empty state with Files-view deep link

In the empty branch of `GroupedFilesTab`, render:

```tsx
<Empty
  icon="ph-paperclip"
  title="还没有附件"
  description="收到的附件会自动列在这里。"
  action={{
    label: "在 Files 中查看全部",
    onClick: () => {
      setSelectedContactId(null);
      setDetailOpen(false);
      setView("files");
      // Files.tsx already supports a `pid` prefilter via the search box; we
      // set the prefilter by also calling setFilesFilter({ contactId: c.id })
    },
  }}
/>
```

For the prefilter: add a signal `filesContactFilter: { contactId: string } | null` in `app/src/stores/ui.ts` (mirroring the existing `PeopleGroupBy` pattern at line 55). `Files.tsx` reads it and passes to the `listFiles` resource via a refetch effect.

## 5. Data Flow

```
ContactPanel opens for contact c
  └─> fls() = files().filter(f.pid === c.id)
  └─> If on Timeline + fls().length > 0, render "📎 N 个附件" chip
       └─> click → setContactTab("Files")
  └─> GroupedFilesTab renders grouped sorted by st DESC
       └─> FileRow click → setSelectedFileId(id) + setDetailOpen(true)
                            + setSelectedContactId(null)   // close ContactPanel
  └─> Empty branch → "在 Files 中查看全部" → setView("files") + setFilesContactFilter({ contactId: c.id })
       └─> Files.tsx: useRefreshEffect re-fetches with the filter
```

## 6. Files

| File | Change | Section |
|---|---|---|
| `app/src/panels/ContactPanel.tsx:55-65` | Add "Files" tab to default candidate | 4.1 |
| `app/src/panels/ContactPanel.tsx:440-448` | Replace `FilesTab` call with `GroupedFilesTab` | 4.2 |
| `app/src/panels/ContactPanel.tsx:723-806` | Replace `FilesTab` with `GroupedFilesTab` (group + sort + click) | 4.2 |
| `app/src/panels/ContactPanel.tsx:300-360` (header area) | Add `📎 N 个附件` chip | 4.1 |
| `app/src/stores/ui.ts:55-65` | Add `filesContactFilter` signal + setter | 4.3 |
| `app/src/views/Files.tsx:13-15` | Read `filesContactFilter`; pass to `listFiles` resource | 4.3 |
| `app/src/views/Files.tsx:120-225` | Render a small filter chip if `filesContactFilter` is set; offer "clear filter" | 4.3 |
| `app/src/test/contact-files.test.ts` | NEW: 2 vitest cases (group order, empty state) | 8 |

## 7. Error Handling

- **`filesContactFilter` references a deleted contact**: cleared on view unmount; the `Files` view shows a "no files" empty state for the missing contact. Acceptable.
- **A file has `pid === ""`** (no contact assigned by upstream bug): the existing filter `f.pid === c.id` skips it. The Files view at `Files.tsx:36-44` does NOT filter by `pid` so orphans still appear there. The contact's Files tab intentionally hides them.

## 8. Testing

| Test | Type | Verifies |
|---|---|---|
| `contact-files.test::grouped_files_sorted_by_type` | Vitest | PDF comes before Image, newest first within group |
| `contact-files.test::empty_state_renders_link` | Vitest | empty branch renders the deep-link action |
| `e2e/views.spec::contact_files_tab_groups_by_type` | Playwright | contact with mixed attachments shows 2 grouped sections |

## 9. Rollout

- One commit per concern:
  1. `GroupedFilesTab` + sort + click fix
  2. Discovery chip on Timeline
  3. `filesContactFilter` signal + Files.tsx integration

## 10. Risks & Open Questions

- **A's `source_message_ids` integration**: not blocking this spec; once A lands, the file row click can also show "from N mails" inline. Defer to a follow-up.
- **B's company merge**: if a contact's company is merged, files still keyed by `pid` are unaffected.

## 11. Definition of Done

- [ ] All commits conventional
- [ ] `cd app && pnpm test` green
- [ ] `pnpm typecheck` + `pnpm lint` clean
- [ ] Visual: contact with 5 mixed attachments shows grouped rows; empty contact shows deep-link
- [ ] `docs/PROGRESS.md` updated
