# A. 附件 ↔ 邮件双向链接 (File↔Message Bidirectional Linking)

> Spec authored 2026-08-10. Status: Draft awaiting review. Independent of brand, company-dedup, contact-attachments, and Stream redesign — this is the data foundation; the other three specs build on it.

## 1. Goal

Make every `FileItem` (currently sourced from `app/src-tauri/migrations/.../files`) traceable back to the exact mail(s) that carried it, and every `Contact` roll-up show all files exchanged with that contact. Concretely:

1. Opening a file in `FilePanel` shows a **"From mail"** list of all source messages, each a clickable row that jumps to the message detail.
2. The `Contacts` view's profile panel shows a **"Files"** section listing every attachment exchanged with that contact, grouped by file type.
3. The `Files` view's tile shows a small badge with the count of source messages when ≥ 1, and a chevron opens the same list.
4. The data model is single-source-of-truth (one column on `files`), migrated cleanly, no bridge table, and reverse-queriable from both directions in O(1) SQL.

## 2. Non-Goals

- No changes to the *attachment upload* flow on Compose (out-of-scope, already works in Task 1.5 chain).
- No changes to `Records.tsx` attachments rendering (it already groups files by message — we add the reverse).
- No de-dup of identical files (same SHA-256 from two different emails) — that's a future Files compaction spec, not this one.
- No `Company` view changes (handled by the B. Company Dedup spec).

## 3. Background & Root Cause

Today the relationship is one-way:

- `Message.attachments: ID[]` (data.ts:156) — each message knows its files.
- `FileItem.pid` (data.ts) — each file knows the *contact* it came from, but **not the message**.
- `Contact` has no attachments roll-up — only `messages.filter(pid=contact.id)` gives a count, never the files.

Effect: in `FilePanel` (panels/FilePanel.tsx:106-114) the only breadcrumb back to origin is `from {contact()?.name}`; in `Contacts.tsx` there's no attachments list at all (verified via `grep -n "attachments" app/src/views/Contacts.tsx` → 0 hits in the panel area).

## 4. Architecture

### 4.1 Schema change (one new column)

Add `source_message_ids TEXT NOT NULL DEFAULT '[]'` to `files`. JSON array of message ids. Nullable contact (`FileItem.pid` already nullable) is fine — a file from a sent-only stub still has its source.

A migration `0015_file_source_message_ids.sql`:

```sql
-- New column: every file now records the messages that carried it.
ALTER TABLE files ADD COLUMN source_message_ids TEXT NOT NULL DEFAULT '[]';
-- Backfill: for every existing message with non-empty `attachments_json`,
-- push the message id into every attached file's source_message_ids.
UPDATE files
   SET source_message_ids = (
     SELECT json_group_array(value)
       FROM (
         SELECT json_each.value AS value
           FROM messages, json_each(messages.attachments_json)
          WHERE json_each.value = files.id
            AND messages.deleted_at IS NULL
       )
   )
 WHERE EXISTS (
   SELECT 1
     FROM messages, json_each(messages.attachments_json)
    WHERE json_each.value = files.id
      AND messages.deleted_at IS NULL
 );
```

`0015_file_source_message_ids.sql` is registered in `lib.rs` next to the 14 existing migrations.

### 4.2 Write paths (Rust)

Two `INSERT INTO files` blocks exist (`sync_loop.rs:1100` for inbound mail, `sync_loop.rs:1153` for outbound). Both know the source `message_id` and need:

- **Inbound (1100)**: the message being inserted has `m.id`; bind `source_message_ids` = `serde_json::Value::Array(vec![m.id.into()])`.
- **Outbound (1153)**: same; the `draft_id` is the synthetic source (use the draft id; resolved later by the `messages.id` post-send).
- **Re-insert / dup-attach**: a file's `source_message_ids` must be **append-or-update**, not "overwrite with single id". The current `INSERT OR IGNORE` (line 1100 uses `INSERT INTO`) loses the previous attachments list. Switch to `ON CONFLICT(id) DO UPDATE SET source_message_ids = json_patch_merge(files.source_message_ids, excluded.source_message_ids)` — a tiny SQL helper `fn merge_json_array(existing TEXT, added TEXT) -> TEXT` in `services/db.rs` that returns the deduplicated union.
- **Attach-after-insert**: when a message gets a new attachment later (e.g. forwarded), `upsertMessage` already writes `attachments_json`; a new helper `addFileSourceMessage(fileId, messageId)` runs in the same TX so the two stay in sync.

### 4.3 Read paths (TS)

Three new helpers in `app/src/stores/data.ts`:

- `listSourceMessages(fileId: ID): Promise<Message[]>` — `SELECT m.* FROM messages m, json_each(m.attachments_json) WHERE json_each.value = $1 AND m.deleted_at IS NULL ORDER BY m.tm DESC`.
- `listContactAttachments(contactId: ID): Promise<FileItem[]>` — `SELECT * FROM files WHERE pid = $1 ORDER BY st DESC`. (Already trivially queryable from `FileItem.pid`; not new column needed. The product gap is purely UI.)
- `backfillFileSourceIds(fileId: ID, messageIds: ID[])` — the inverse of the helper, used by the migration test.

### 4.4 UI

**`panels/FilePanel.tsx`** — after the existing Copy/Open/Download row, add a "From mail" section:

- Title: `来自邮件 · N` (Chinese mirror of the existing "附件 · N" header in MessagePanel).
- Empty state: `该文件不是邮件附件` (covers locally-imported files).
- List rows: each is a small `<button>` showing `from {contactName} · {relativeTime}` and the message subject. Clicking it calls `setView("imbox")` and `setSelectedMessageId(messageId)`, mirroring the existing `setDetailOpen(true)` pattern in `MessagePanel`.
- Cap at 10 rows; if more, render "显示全部 N 封" link that opens a search-by-file-id prefill.

**`app/src/views/Contacts.tsx`** — the right-hand profile panel needs an "Attachments" section. Per the existing pattern in Records (`filesByMsg`), group by type: PDF / Image / Doc / Spreadsheet. Each row is a `<button>` that opens `FilePanel` via the existing `setSelectedFileId(fileId)` / `setDetailOpen(true)` flow. Empty state: "还没有附件". Cap at 8 rows per type with "在 Files 中查看全部" link to `setView("files")` with a pre-applied contact filter.

**`app/src/views/Files.tsx`** — file tile:

- Add a `SourceBadge` (a small `var(--palm)` pill in the bottom-right of the icon area) rendering `→ N` (where N is `source_message_ids.length`). Hidden when N=0.
- Add a chevron `Icon name="ph-arrow-square-out"` next to the badge, opening the same `FilePanel` (already wired). The badge itself does **not** need a click handler — it's a visual hint.

### 4.5 Component boundaries (DRY per AGENTS.md §3.3)

- New shared component `SourceMessagesList` in `app/src/components/SourceMessagesList.tsx` (≤80 lines). Consumed by both `FilePanel` and the Files tile.
- New shared component `ContactAttachmentsPanel` in `app/src/components/ContactAttachmentsPanel.tsx` (≤80 lines). Consumed only by `Contacts.tsx`. If `<120 lines` shared with Files, **don't extract** (YAGNI).
- New TS type `FileItem.sourceMessageIds: ID[]` in `app/src/types/index.ts`.

## 5. Data Flow

```
Inbound mail sync (sync_loop.rs:insert_message)
  └─> persist_attachments(...)
        └─> For each parsed attachment:
              - write file bytes to data_dir/attachments/<fid>/
              - INSERT INTO files (..., source_message_ids = '["<m.id>"]')
              - (on conflict) merge with existing list

Compose send (sync_loop.rs:persist_outgoing_attachments)
  └─> For each draft attachment:
        - same path, source_message_ids = '["<sent_message_id>"]'
        - merge on conflict

FilePanel read
  └─> listSourceMessages(fileId) → SourceMessagesList
        └─> row click → setView("imbox") + setSelectedMessageId(id)

Contacts profile panel read
  └─> listContactAttachments(contactId) → ContactAttachmentsPanel
        └─> row click → setSelectedFileId(id) + setDetailOpen(true)

Files tile read
  └─> SourceBadge shows N from FileItem.sourceMessageIds
```

## 6. Files

| File | Change | Section |
|---|---|---|
| `app/src-tauri/migrations/0015_file_source_message_ids.sql` | NEW | 4.1 |
| `app/src-tauri/src/lib.rs:97-100` | Register migration 15 | 4.1 |
| `app/src-tauri/src/services/sync_loop.rs:1100-1113` | Add `source_message_ids` to inbound INSERT + ON CONFLICT merge | 4.2 |
| `app/src-tauri/src/services/sync_loop.rs:1153-1166` | Same for outbound INSERT | 4.2 |
| `app/src-tauri/src/services/db.rs` | NEW `merge_json_array` helper (or inline if file doesn't exist) | 4.2 |
| `app/src/stores/data.ts` | Add `listSourceMessages`, `listContactAttachments`, `addFileSourceMessage` + extend `rowToFile` to parse `source_message_ids` | 4.3 |
| `app/src/types/index.ts` | Add `FileItem.sourceMessageIds: ID[]` | 4.5 |
| `app/src/components/SourceMessagesList.tsx` | NEW (shared by FilePanel + Files) | 4.5 |
| `app/src/components/ContactAttachmentsPanel.tsx` | NEW (Contacts only) | 4.5 |
| `app/src/panels/FilePanel.tsx:55-189` | Insert `<SourceMessagesList />` after the action row | 4.4 |
| `app/src/views/Contacts.tsx` | Add `<ContactAttachmentsPanel />` to the profile section | 4.4 |
| `app/src/views/Files.tsx:120-225` | Add `<SourceBadge />` to each tile | 4.4 |
| `app/src/services/mock-db.ts` | Mirror column for browser-mode tests | 4.3 |
| `app/src-tauri/tests/file_source_message_ids_test.rs` | NEW: backfill + merge unit tests | 8 |
| `app/src/test/file-source-messages.test.ts` | NEW: 3 vitest cases for `listSourceMessages` | 8 |

## 7. Error Handling

- **Backfill on existing DB**: idempotent (`UPDATE … SET …` no-ops on empty `source_message_ids`).
- **Merge helper**: deduplicates by `id`; never grows unbounded (capped at 256 ids; drop oldest beyond cap).
- **UI**: missing contact name (sender was deleted) → render `from —` (current FilePanel behavior, preserved).
- **Empty contact attachments**: explicit empty state, not a hidden section.
- **Orphaned files** (no source message and no contact): keep, just hide the badge.

## 8. Testing

| Test | Type | Verifies |
|---|---|---|
| `file_source_message_ids_test::migration_adds_column` | Rust unit | `0015` runs, column exists, default `[]` |
| `file_source_message_ids_test::backfill_existing` | Rust unit | existing files get union of message ids that reference them |
| `file_source_message_ids_test::merge_json_array_dedups` | Rust unit | merge helper collapses duplicates |
| `file_source_message_ids_test::merge_caps_at_256` | Rust unit | cap holds |
| `file-source-messages.test::listSourceMessages_ordered_by_time` | Vitest | ORDER BY m.tm DESC, deleted_at filter |
| `file-source-messages.test::listContactAttachments_returns_all` | Vitest | no cap on returned set |
| `file-source-messages.test::addFileSourceMessage_idempotent` | Vitest | adding same id twice keeps one entry |
| `e2e/views.spec::file_panel_shows_source_messages` | Playwright | new section is visible, click navigates to imbox |

## 9. Rollout

- One commit per concern:
  1. Migration + Rust write paths (4.1 + 4.2)
  2. TS read helpers + mock-db mirror (4.3)
  3. SourceMessagesList + FilePanel (4.4)
  4. ContactAttachmentsPanel + Contacts (4.4)
  5. Files tile SourceBadge (4.4)
- Each commit is independently testable; types added in step 2 are optional (the read helpers can return `Message[]` typed via existing `Message` type).

## 10. Risks & Open Questions

- **Merge semantics**: a file attached to a forwarded chain can appear 3+ times; merge helper uses `json_patch_merge` (PostgreSQL semantics) via a custom Rust function — verify the helper handles the `[]` → append → `["a", "b"]` → append "a" → still `["a", "b"]` idempotently.
- **Size of column**: a JSON array of message ids is small; no need to migrate to a bridge table.
- **iOS bundle / `unpkg` icon script** (in `index.html`): untouched.

## 11. Definition of Done

- [ ] Migration runs cleanly on a real DB with existing files; no data loss
- [ ] `pnpm typecheck` + `pnpm lint` clean
- [ ] `cd app/src-tauri && cargo test` green (incl. new unit tests)
- [ ] `pnpm test` green (incl. new vitest cases)
- [ ] `pnpm e2e` green (incl. new file-panel assertion)
- [ ] Visual diff: file panel shows "From mail" list; contact profile shows Attachments section; Files tiles show `→ N` badge
- [ ] No new TODOs without commit-body justification
- [ ] Conventional commit per concern
- [ ] `docs/PROGRESS.md` updated per phase
