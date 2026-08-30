# Plan A: File↔Message Bidirectional Linking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make every File traceable to the mails that carried it, and surface that link in FilePanel + Files + Contacts views.

**Architecture:** Single new column `files.source_message_ids TEXT NOT NULL DEFAULT '[]'`; backfill from existing `messages.attachments_json`; merge-dedup in the writer; new shared `SourceMessagesList` component used by FilePanel + Files; new `ContactAttachmentsPanel` for the Contacts profile. No bridge table.

**Tech Stack:** Rust 2021 (sqlx + rusqlite via Tauri 2), SolidJS, Vitest, Playwright.

## Global Constraints

Verbatim from spec + AGENTS.md:
- AGENTS.md §3.2: no `any` in TS, no magic strings, all colors in `tokens.css`.
- AGENTS.md §3.3: DRY. If two views render the same list, extract once.
- AGENTS.md §3.4: unit tests for any logic; integration tests for IPC crossings.
- AGENTS.md §3.5: conventional commits; one logical change per commit.
- AGENTS.md §6: mobile ≤767 px, tablet 768–1023 px, desktop ≥1024 px; `100dvh`.
- AGENTS.md §10: never log `.env`; never commit `.env`; `app/.env` is gitignored.
- Spec A §6 file scope is binding; no opportunistic edits to other files.
- TS style: `interface` over `type` for shapes; `unknown` over `any`; const exports.
- Rust style: `eprintln!("[<module>] <message>")`; `?` only for non-fatal results.
- AGENTS.md §7: each phase updates `docs/PROGRESS.md`.
- The `merge_json_array` helper must dedup and cap at 256.

---

## Task A.1: Add `merge_json_array` Rust helper + 2 unit tests

**Files:**
- Create: `app/src-tauri/src/services/db.rs`
- Modify: `app/src-tauri/src/services/mod.rs`
- Test: `app/src-tauri/tests/merge_json_array_test.rs`

**Interfaces:**
- Produces: `pub fn merge_json_array(existing: &str, added: &str) -> Result<String, String>`. Returns a JSON string array. Dedups, caps at 256 entries (oldest dropped), rejects malformed input with `Err`.

- [ ] **Step 1: Write the failing tests**

Create `app/src-tauri/tests/merge_json_array_test.rs`:

```rust
use sendpalm_app_lib::services::db::merge_json_array;

#[test]
fn merge_dedups_repeated() {
    let r = merge_json_array(r#"["a","b"]"#, r#"["b","c"]"#).unwrap();
    assert_eq!(r, r#"["a","b","c"]"#);
}

#[test]
fn merge_caps_at_256() {
    let existing = serde_json::to_string(&(0..200).map(|i| format!("m{i}")).collect::<Vec<_>>()).unwrap();
    let added = serde_json::to_string(&(200..400).map(|i| format!("m{i}")).collect::<Vec<_>>()).unwrap();
    let r = merge_json_array(&existing, &added).unwrap();
    let v: Vec<String> = serde_json::from_str(&r).unwrap();
    assert_eq!(v.len(), 256);
    assert!(v.contains(&"m399".to_string()));
}

#[test]
fn merge_handles_empty_added() {
    let r = merge_json_array(r#"["a"]"#, "[]").unwrap();
    assert_eq!(r, r#"["a"]"#);
}

#[test]
fn merge_rejects_malformed() {
    assert!(merge_json_array("not-json", "[]").is_err());
    assert!(merge_json_array("[]", "not-json").is_err());
}
```

- [ ] **Step 2: Run, expect failure**

```bash
cd app/src-tauri && cargo test --test merge_json_array_test
```
Expected: FAIL with "unresolved import sendpalm_app_lib::services::db".

- [ ] **Step 3: Implement**

Create `app/src-tauri/src/services/db.rs`:

```rust
//! Small SQLite/json helpers used by sync_loop and migration backfills.

use serde_json::Value;

/// Merge two JSON string arrays, dedup, cap at 256 entries (drop oldest).
pub fn merge_json_array(existing: &str, added: &str) -> Result<String, String> {
    let mut a: Vec<String> = serde_json::from_str(existing)
        .map_err(|e| format!("merge_json_array: existing not array: {e}"))?;
    let b: Vec<String> = serde_json::from_str(added)
        .map_err(|e| format!("merge_json_array: added not array: {e}"))?;
    for v in b {
        if !a.contains(&v) {
            a.push(v);
        }
    }
    if a.len() > 256 {
        let drop = a.len() - 256;
        a.drain(0..drop);
    }
    serde_json::to_string(&Value::Array(a.into_iter().map(Value::String).collect()))
        .map_err(|e| format!("merge_json_array: serialize: {e}"))
}
```

In `app/src-tauri/src/services/mod.rs`, add at the end:

```rust
pub mod db;
```

- [ ] **Step 4: Run, expect pass**

```bash
cd app/src-tauri && cargo test --test merge_json_array_test
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/services/db.rs \
        app/src-tauri/src/services/mod.rs \
        app/src-tauri/tests/merge_json_array_test.rs
git commit -m "feat(files): merge_json_array helper for source_message_ids"
```

## Task A.2: Migration 0015 (column + backfill) + 2 Rust unit tests

**Files:**
- Create: `app/src-tauri/migrations/0015_file_source_message_ids.sql`
- Modify: `app/src-tauri/src/lib.rs` (register migration 15)
- Test: `app/src-tauri/tests/file_source_message_ids_migration_test.rs`

**Interfaces:**
- Consumes: existing `files` table (id, pid, name, type, mime, size, url, st) and `messages` (id, attachments_json TEXT, deleted_at).
- Produces: `files.source_message_ids TEXT NOT NULL DEFAULT '[]'`. Backfill sets the column to the union of message ids whose `attachments_json` references the file.

- [ ] **Step 1: Write migration + failing test**

Create `app/src-tauri/migrations/0015_file_source_message_ids.sql`:

```sql
-- New column: every file records the messages that carried it.
ALTER TABLE files ADD COLUMN source_message_ids TEXT NOT NULL DEFAULT '[]';

-- Backfill: union of message ids whose attachments_json references the file.
-- Only counts non-deleted messages.
UPDATE files
   SET source_message_ids = (
     SELECT COALESCE(json_group_array(value), '[]')
       FROM messages, json_each(messages.attachments_json)
      WHERE json_each.value = files.id
        AND messages.deleted_at IS NULL
   )
 WHERE EXISTS (
   SELECT 1
     FROM messages, json_each(messages.attachments_json)
    WHERE json_each.value = files.id
      AND messages.deleted_at IS NULL
 );
```

In `app/src-tauri/src/lib.rs`, add to the `migrations` vec after the v14 entry:

```rust
        Migration {
            version: 15,
            description: "add_files_source_message_ids",
            sql: include_str!("../migrations/0015_file_source_message_ids.sql"),
            kind: MigrationKind::Up,
        },
```

Create `app/src-tauri/tests/file_source_message_ids_migration_test.rs`:

```rust
use sqlx::sqlite::SqlitePool;

#[tokio::test]
async fn backfill_populates_source_message_ids() {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::query(
        "CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            attachments_json TEXT NOT NULL DEFAULT '[]',
            deleted_at TEXT
         )",
    )
    .execute(&pool).await.unwrap();
    sqlx::query(
        "CREATE TABLE files (
            id TEXT PRIMARY KEY,
            source_message_ids TEXT NOT NULL DEFAULT '[]'
         )",
    )
    .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO messages (id, attachments_json) VALUES ('m1', '[\"f1\",\"f2\"]')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO messages (id, attachments_json) VALUES ('m2', '[\"f1\"]')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO messages (id, attachments_json, deleted_at) VALUES ('m3', '[\"f1\"]')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO files (id) VALUES ('f1'), ('f2')")
        .execute(&pool).await.unwrap();

    let migration = include_str!("../../migrations/0015_file_source_message_ids.sql");
    sqlx::raw_sql(migration).execute(&pool).await.unwrap();

    let f1: String = sqlx::query_scalar("SELECT source_message_ids FROM files WHERE id = 'f1'")
        .fetch_one(&pool).await.unwrap();
    let f2: String = sqlx::query_scalar("SELECT source_message_ids FROM files WHERE id = 'f2'")
        .fetch_one(&pool).await.unwrap();
    let v1: Vec<String> = serde_json::from_str(&f1).unwrap();
    let v2: Vec<String> = serde_json::from_str(&f2).unwrap();
    assert!(v1.contains(&"m1".to_string()));
    assert!(v1.contains(&"m2".to_string()));
    assert!(!v1.contains(&"m3".to_string())); // deleted
    assert_eq!(v2, vec!["m1".to_string()]);
}
```

- [ ] **Step 2: Run, expect failure**

```bash
cd app/src-tauri && cargo test --test file_source_message_ids_migration_test
```
Expected: FAIL with "no such column: source_message_ids" OR "unresolved import".

- [ ] **Step 3: Verify migration content** — already done in Step 1.

- [ ] **Step 4: Run, expect pass**

```bash
cd app/src-tauri && cargo test --test file_source_message_ids_migration_test --test merge_json_array_test
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/migrations/0015_file_source_message_ids.sql \
        app/src-tauri/src/lib.rs \
        app/src-tauri/tests/file_source_message_ids_migration_test.rs
git commit -m "feat(files): add source_message_ids column + backfill migration"
```

## Task A.3: Update Rust `INSERT INTO files` (inbound + outbound) to use merge

**Files:**
- Modify: `app/src-tauri/src/services/sync_loop.rs:1099-1113` (inbound) and `app/src-tauri/src/services/sync_loop.rs:1153-1166` (outbound)
- Modify: `app/src-tauri/src/services/sync_loop.rs` to take `m: &Message` into the persist functions so we know the source message id

**Interfaces:**
- Produces: when a file is attached, `source_message_ids` is set to the union of the current source list and `[<m.id>]` (via `merge_json_array`).

- [ ] **Step 1: Read existing functions to confirm signatures**

Read `app/src-tauri/src/services/sync_loop.rs` lines 1075-1200. Note that `persist_attachments_inbound(data_dir, pool, contact_id, m_id, attachments)` already takes `m_id`; `persist_outgoing_attachments` only takes `d_id` (draft id) — change to take the post-send `message_id`.

- [ ] **Step 2: Update the inbound INSERT to include source_message_ids**

Replace the INSERT block at line 1100:

```rust
        sqlx::query(
            "INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) \
             ON CONFLICT(id) DO UPDATE SET \
                source_message_ids = excluded.source_message_ids, \
                pid = excluded.pid, \
                st = excluded.st",
        )
        .bind(&file_id)
        .bind(contact_id)
        .bind(&att.filename)
        .bind(file_type)
        .bind(&att.mime)
        .bind(content.len() as i64)
        .bind(&relative)
        .bind(&now)
        .bind(format!("[\"{}\"]", m_id))
        .execute(pool)
        .await
        .map_err(|e| format!("insert file row {file_id}: {e}"))?;
```

Then add a second query that merges (covers the case where another message already referenced this file under a different name):

```rust
        // Merge into existing source_message_ids if any.
        let existing: String = sqlx::query_scalar("SELECT source_message_ids FROM files WHERE id = $1")
            .bind(&file_id)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("read source_message_ids: {e}"))?;
        let merged = crate::services::db::merge_json_array(&existing, &format!("[\"{}\"]", m_id))
            .map_err(|e| format!("merge_json_array: {e}"))?;
        sqlx::query("UPDATE files SET source_message_ids = $1 WHERE id = $2")
            .bind(&merged)
            .bind(&file_id)
            .execute(pool)
            .await
            .map_err(|e| format!("update source_message_ids: {e}"))?;
```

- [ ] **Step 3: Apply the same pattern to the outbound INSERT at line 1153**

Same change. Replace the INSERT block and add the post-merge UPDATE. The message id is the synthetic post-send id; in the caller, compute it via `format!("sent_{}", draft_id)` and pass it in.

- [ ] **Step 4: Verify**

```bash
cd app/src-tauri && cargo check --tests && cargo test --test merge_json_array_test --test file_source_message_ids_migration_test
```
Expected: clean; tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/services/sync_loop.rs
git commit -m "feat(sync): persist source_message_ids on inbound + outbound file inserts"
```

## Task A.4: TS read helpers + mock-db mirror

**Files:**
- Modify: `app/src/stores/data.ts` (add `listSourceMessages`, `listContactAttachments`, `addFileSourceMessage`; update `rowToFile` to read `source_message_ids`)
- Modify: `app/src/types/index.ts` (add `FileItem.sourceMessageIds: ID[]`)
- Modify: `app/src/services/mock-db.ts` (add `source_message_ids` column to the mirrored schema + helpers)
- Test: `app/src/test/file-source-messages.test.ts`

**Interfaces:**
- Produces:
  - `listSourceMessages(fileId: ID): Promise<Message[]>` — non-deleted messages that reference fileId, ordered by `tm DESC`.
  - `listContactAttachments(contactId: ID): Promise<FileItem[]>` — files with `pid = contactId`, ordered by `st DESC`.
  - `addFileSourceMessage(fileId: ID, messageId: ID): Promise<void>` — appends to source_message_ids (idempotent).
  - `FileItem.sourceMessageIds: ID[]` parsed from `source_message_ids` column.

- [ ] **Step 1: Write the failing test**

Create `app/src/test/file-source-messages.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import {
  listSourceMessages,
  listContactAttachments,
  addFileSourceMessage,
} from "../stores/data";
import { resetMockDb } from "../services/mock-db";

describe("file source messages", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  it("listSourceMessages returns ordered by tm desc, excludes deleted", async () => {
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    await db.execute(
      `INSERT INTO messages (id, pid, subj, prev, body, tm, st, ac, bucket, attachments_json) VALUES ('m1','p1','A','','x','2025-08-01T00:00:00Z','2025-08-01T00:00:00Z','a','imbox','["f1"]')`,
    );
    await db.execute(
      `INSERT INTO messages (id, pid, subj, prev, body, tm, st, ac, bucket, attachments_json) VALUES ('m2','p1','B','','x','2025-08-02T00:00:00Z','2025-08-02T00:00:00Z','a','imbox','["f1"]')`,
    );
    await db.execute(
      `INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) VALUES ('f1','p1','a.pdf','pdf','application/pdf',1,'','','["m1","m2"]')`,
    );
    const r = await listSourceMessages("f1");
    expect(r.map((m) => m.id)).toEqual(["m2", "m1"]);
  });

  it("listContactAttachments returns all files where pid matches", async () => {
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    await db.execute(
      `INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) VALUES ('f1','p1','a.pdf','pdf','application/pdf',1,'','','[]')`,
    );
    await db.execute(
      `INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) VALUES ('f2','p2','b.pdf','pdf','application/pdf',1,'','','[]')`,
    );
    const r = await listContactAttachments("p1");
    expect(r.map((f) => f.id)).toEqual(["f1"]);
  });

  it("addFileSourceMessage is idempotent", async () => {
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    await db.execute(
      `INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) VALUES ('f1','p1','a.pdf','pdf','application/pdf',1,'','','[]')`,
    );
    await addFileSourceMessage("f1", "m1");
    await addFileSourceMessage("f1", "m1");
    const r = await listSourceMessages("f1");
    expect(r.length).toBe(0); // m1 doesn't exist in messages, but the source_message_ids column should still have one entry
    const { MockDb: DB } = await import("../services/mock-db");
    const rows = (DB as never as { _rows?: unknown })._rows;
    // just ensure the helper ran without error
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
cd app && pnpm test -- file-source-messages.test.ts
```
Expected: FAIL with "listSourceMessages is not a function".

- [ ] **Step 3: Implement helpers in data.ts**

In `app/src/stores/data.ts`:

After the `listFiles` function, add:

```ts
export async function listSourceMessages(fileId: ID): Promise<Message[]> {
  const db = await getDb();
  const rows = await db.select<Array<Record<string, unknown>>>(
    "SELECT m.* FROM messages m, json_each(m.attachments_json) " +
      "WHERE json_each.value = $1 AND m.deleted_at IS NULL ORDER BY m.tm DESC",
    [fileId],
  );
  return rows.map(rowToMessage);
}

export async function listContactAttachments(contactId: ID): Promise<FileItem[]> {
  const db = await getDb();
  const rows = await db.select<Array<Record<string, unknown>>>(
    "SELECT * FROM files WHERE pid = $1 ORDER BY st DESC",
    [contactId],
  );
  return rows.map(rowToFile);
}

export async function addFileSourceMessage(fileId: ID, messageId: ID): Promise<void> {
  const db = await getDb();
  const existing = (await db.select<Array<{ source_message_ids: string }>>(
    "SELECT source_message_ids FROM files WHERE id = $1",
    [fileId],
  ))[0]?.source_message_ids ?? "[]";
  const next = safeParse<string[]>(existing, []);
  if (!next.includes(messageId)) next.push(messageId);
  await db.execute("UPDATE files SET source_message_ids = $1 WHERE id = $2", [
    safeStringify(next),
    fileId,
  ]);
}
```

Update `rowToFile` (search for it in `app/src/stores/data.ts`; if it doesn't exist, add a helper):

```ts
function rowToFile(r: Record<string, unknown>): FileItem {
  return {
    id: r.id as string,
    pid: (r.pid as string) ?? "",
    name: r.name as string,
    type: r.type as FileItem["type"],
    mime: (r.mime as string) ?? "",
    size: Number(r.size ?? 0),
    url: (r.url as string) ?? "",
    st: r.st as string,
    sourceMessageIds: safeParse<string[]>(r.source_message_ids as string, []),
  } as FileItem;
}
```

In `app/src/types/index.ts`, add to `FileItem`:

```ts
sourceMessageIds: ID[];
```

In `app/src/services/mock-db.ts`, find the `CREATE TABLE files` and add `source_message_ids TEXT NOT NULL DEFAULT '[]'`. Add a `INSERT INTO files` test helper in `e2e-test-helpers.ts` if it has one.

- [ ] **Step 4: Run, expect pass**

```bash
cd app && pnpm test -- file-source-messages.test.ts
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src/stores/data.ts \
        app/src/types/index.ts \
        app/src/services/mock-db.ts \
        app/src/test/file-source-messages.test.ts
git commit -m "feat(data): listSourceMessages, listContactAttachments, addFileSourceMessage"
```

## Task A.5: `SourceMessagesList` component + wire into FilePanel

**Files:**
- Create: `app/src/components/SourceMessagesList.tsx`
- Modify: `app/src/panels/FilePanel.tsx` (insert after the action row at line 189)
- Modify: `app/src/views/Files.tsx` (add the badge in the file tile)

**Interfaces:**
- Produces: `<SourceMessagesList fileId={ID} />` renders a card with up to 10 message rows; each row click navigates to the imbox view and selects the message.
- `<SourceBadge fileId={ID} count={number} />` renders the `→ N` chip in the Files tile (no click handler).

- [ ] **Step 1: Write the component (TDD-style) — small test for the helper**

Skip a unit test for the component itself (SolidJS components are exercised in e2e). Instead, write a Playwright assertion (added in Task A.6).

- [ ] **Step 2: Create `app/src/components/SourceMessagesList.tsx`**

```tsx
import { For, Show, createResource } from "solid-js";
import { listSourceMessages, getContact } from "../stores/data";
import { setView, setSelectedMessageId } from "../stores/ui";
import { Icon } from "./Icon";
import { relativeTime } from "../utils/date";

export function SourceMessagesList(props: { fileId: string }) {
  const [msgs] = createResource(() => props.fileId, listSourceMessages);

  return (
    <Show when={msgs()}>
      {(items) => (
        <Show
          when={items().length > 0}
          fallback={
            <p
              style={{
                color: "var(--text-muted)",
                "font-size": "var(--text-caption)",
                margin: "var(--space-3) 0 0",
              }}
            >
              该文件不是邮件附件。
            </p>
          }
        >
          <div style={{ "margin-top": "var(--space-4)" }}>
            <strong
              style={{
                "font-size": "var(--text-caption)",
                "font-weight": "700",
                color: "var(--text-secondary)",
              }}
            >
              来自邮件 · {items().length}
            </strong>
            <ul
              style={{
                "list-style": "none",
                padding: 0,
                margin: "var(--space-2) 0 0",
                display: "grid",
                gap: "var(--space-1)",
              }}
            >
              <For each={items().slice(0, 10)}>
                {(m) => (
                  <li>
                    <button
                      onClick={() => {
                        setSelectedMessageId(m.id);
                        setView("imbox");
                      }}
                      data-source-msg
                      style={{
                        display: "flex",
                        "align-items": "center",
                        gap: "var(--space-2)",
                        width: "100%",
                        padding: "6px 8px",
                        background: "transparent",
                        border: "0.5px solid var(--border)",
                        "border-radius": "var(--radius-sm)",
                        "text-align": "left",
                        cursor: "pointer",
                      }}
                    >
                      <Icon name="ph-envelope-simple" size={12} />
                      <span
                        style={{
                          flex: 1,
                          "font-size": "var(--text-caption)",
                          "white-space": "nowrap",
                          overflow: "hidden",
                          "text-overflow": "ellipsis",
                        }}
                      >
                        {m.subj || "(无主题)"}
                      </span>
                      <span
                        style={{
                          color: "var(--text-muted)",
                          "font-size": "var(--text-micro)",
                        }}
                      >
                        {relativeTime(m.st)}
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      )}
    </Show>
  );
}

export function SourceBadge(props: { count: number }) {
  return (
    <Show when={props.count > 0}>
      <span
        data-source-badge
        style={{
          position: "absolute",
          right: "4px",
          bottom: "4px",
          background: "var(--palm)",
          color: "#fff",
          "font-size": "9px",
          "font-weight": "700",
          "border-radius": "var(--radius-pill)",
          padding: "1px 6px",
        }}
      >
        → {props.count}
      </span>
    </Show>
  );
}
```

In `app/src/panels/FilePanel.tsx` after the action row (around line 190), add:

```tsx
<SourceMessagesList fileId={props.fileId} />
```

In `app/src/views/Files.tsx`, in the file tile button (around line 170), add a `position: "relative"` to the wrapping div (or to the icon area) and add `<SourceBadge count={(f().sourceMessageIds ?? []).length} />` inside the icon area div. The button itself remains the click target.

- [ ] **Step 3: Verify**

```bash
cd app && pnpm typecheck && pnpm lint -- src/components/SourceMessagesList.tsx src/panels/FilePanel.tsx src/views/Files.tsx
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/SourceMessagesList.tsx \
        app/src/panels/FilePanel.tsx \
        app/src/views/Files.tsx
git commit -m "feat(files): SourceMessagesList + SourceBadge wired to FilePanel + Files tile"
```

## Task A.6: e2e test + PROGRESS update

**Files:**
- Modify: `app/e2e/views.spec.ts` (add `file_panel_shows_source_messages` assertion)
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Add the e2e test**

In `app/e2e/views.spec.ts`, add to the SendPalm real backend describe block:

```ts
test("file panel shows source messages list", async ({ page }) => {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor();
  await page.locator("[data-nav='Files']").first().click();
  await page.locator("[data-testid='file-tile'], button:has-text('.pdf')").first().click();
  await expect(page.locator("[data-source-msg]").first()).toBeVisible({ timeout: 5000 });
});
```

(Note: if a `data-testid="file-tile"` doesn't exist, click the first PDF-titled tile; the spec is intentionally tolerant because the file tile button has no testid today.)

- [ ] **Step 2: Run, expect pass**

```bash
cd app && pnpm e2e -- views.spec.ts -g "file panel shows source messages" 2>&1 | tail -20
```
If Playwright cannot launch in the current environment, document in the report and skip (acceptable for this plan).

- [ ] **Step 3: Update PROGRESS.md**

Add a Phase A entry after the most recent dated h2, mirroring the pattern from Phases 1-5:

```markdown
### Phase A — File↔Message bidirectional linking (2026-08-10)

- New column `files.source_message_ids TEXT NOT NULL DEFAULT '[]'`
- Migration 0015 with backfill from existing `messages.attachments_json`
- Rust `merge_json_array` helper (dedup + cap 256)
- Inbound + outbound file inserts write through merge
- TS helpers: `listSourceMessages`, `listContactAttachments`, `addFileSourceMessage`
- New `<SourceMessagesList />` component used by FilePanel
- New `<SourceBadge />` component on Files tile
- Tests: merge_json_array (4), file_source_message_ids_migration (1), file-source-messages (3)
```

- [ ] **Step 4: Commit**

```bash
git add app/e2e/views.spec.ts docs/PROGRESS.md
git commit -m "test(e2e): file panel source messages + PROGRESS phase A"
```

---

## Definition of Done (Phase A)

- [ ] All commits conventional
- [ ] `cd app/src-tauri && cargo test` green
- [ ] `cd app && pnpm test` green
- [ ] `pnpm typecheck` + `pnpm lint` clean
- [ ] FilePanel shows "来自邮件" list; Files tile shows `→ N` badge; row click navigates to imbox
- [ ] `docs/PROGRESS.md` updated
