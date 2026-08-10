# B. 公司去重 (Company 1NF — Independent Companies Table)

> Spec authored 2026-08-10. Status: Draft awaiting review. Independent of A (file↔message), C (contact attachments panel), D (brand + stream).

## 1. Goal

Replace the current string-equality grouping (`c.company || "(未分类)"`) in `app/src/views/Companies.tsx:39` with a real first-normal-form `companies` table. After this work:

1. `Companies` view groups contacts by `Company.id` (canonical), not by `Contact.company` (display name).
2. Aliases (e.g. "Feishu", "飞书", "Lark", "Lark Technologies") all roll up to one row.
3. Domain extraction runs at sync time (Gmail/Outlook return `From: …@feishu.cn` — easy) so two contacts with no name overlap but matching domains land in the same company.
4. Manual merge UI: user picks two companies, writes the canonical name + aliases, both are replaced by one row in the groups view.
5. No regressions to the existing Companies view's "people + comms + meetings" cards; data flows from one source of truth.

## 2. Non-Goals

- No fuzzy string matching of company names ("Feishu" vs "feishu" handled by case-insensitive match only; "Feishu" vs "Lark" handled by domain or by manual alias only).
- No new external lookup (Clearbit / Apollo / etc.). All signals are local.
- No automatic reverse-merge (split a company into two); that's a future need but YAGNI today.
- No UI changes to the per-company detail panel beyond what the dedup needs.

## 3. Background & Root Cause

`app/src/views/Companies.tsx:39` does `const key = c.company || "(未分类)";` — exact string match. The DB schema (`migrations/0001_init.sql:32`) defines `company TEXT NOT NULL DEFAULT ''`. No second column. No aliases. No canonicalization.

Symptoms in production:
- A contact with `company = "Feishu"` and a contact with `company = "飞书"` and a contact with `company = "Lark Technologies"` show as **three** companies in the view.
- The same contact written by two different senders (e.g. `support@feishu.cn` and `noreply@larksuite.com`) often lands in two different rows because the original IMAP `From:` parsing pulls a different display name each time.
- Manual edits via the Contacts panel write back to `Contact.company` directly, no dedup on save.

## 4. Architecture

### 4.1 New `companies` table (migration `0016_companies_table.sql`)

```sql
CREATE TABLE companies (
  id          TEXT PRIMARY KEY,         -- e.g. "co_<uuid>"
  name        TEXT NOT NULL,            -- canonical display name (e.g. "Feishu")
  domain      TEXT,                     -- primary email domain, e.g. "feishu.cn"
  aliases     TEXT NOT NULL DEFAULT '[]', -- JSON array of alternative strings
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  merged_into TEXT REFERENCES companies(id) ON DELETE SET NULL  -- when A merged into B
);
CREATE UNIQUE INDEX idx_companies_domain ON companies(domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_companies_name_lower ON companies(LOWER(name));

-- New FK on contacts (nullable; existing rows keep their string `company`)
ALTER TABLE contacts ADD COLUMN company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX idx_contacts_company_id ON contacts(company_id) WHERE company_id IS NOT NULL;
```

Backfill: for every existing `contacts.company != ''`, insert a row in `companies` (or reuse one whose `LOWER(name) = LOWER(c.company)`), set `contacts.company_id`. For each contact, also extract the domain from `emails_json[0].value` and set it on the new `Company.domain` if absent (idempotent — first writer wins).

### 4.2 Sync-time resolution

In `app/src-tauri/src/services/sync_loop.rs:1099-1113` (the `upsert_contact` call) add a helper `resolve_company_for_contact(c: &SyncContact) -> Option<String>` that:

1. Extracts the email domain from `c.email` (after `c.emails`).
2. `SELECT id FROM companies WHERE LOWER(name) = LOWER(c.company)` — case-insensitive match on display name.
3. If no hit, `SELECT id FROM companies WHERE domain = ?` — domain match.
4. If still no hit, `INSERT INTO companies (id, name, domain, …) VALUES (...)`.
5. Returns the resolved id, which is then bound to `contacts.company_id`.

The helper is called **before** the `INSERT OR IGNORE INTO contacts` so the FK is satisfied.

### 4.3 Alias maintenance (two paths)

- **Auto**: when sync sees a contact whose `company` string doesn't match the resolved company's `name`, append to `companies.aliases` (idempotent — `json_each` to check).
- **Manual**: Settings → Companies → "合并" action (UI below) writes a `merged_into` row and updates all referencing `contacts.company_id` in one transaction.

### 4.4 UI: Companies view (rewrite)

`app/src/views/Companies.tsx`:

- Replace the `grouped()` memo (line 35) with one that groups by `c.company_id` first; falls back to the existing `(未分类)` bucket when `c.company_id IS NULL`.
- The section header now shows `Company.name`, with a small `(aliases: "Feishu", "Lark")` line under it if `aliases.length > 1`.
- "Merge" action: each company card gets a `…` button → "合并到 / 重命名" → modal with:
  - Search box of existing companies.
  - Or "Create new" form (name + domain).
  - On confirm: `POST /companies/:id/merge` Tauri command; updates the row + reassigns all `contacts.company_id`.

### 4.5 Component boundaries (DRY per AGENTS.md §3.3)

- New `<CompanyMergeModal />` in `app/src/components/CompanyMergeModal.tsx` (≤120 lines). Owns its own form state.
- New `<AliasChips />` in `app/src/components/AliasChips.tsx` (≤60 lines). Render-only.
- No new component for the section header; inline at `Companies.tsx:120` (saves a wrapper for one line of JSX).

### 4.6 Tauri command (one new)

`app/src-tauri/src/commands/companies.rs` (new module):

```rust
#[tauri::command]
pub async fn merge_companies(
    app: AppHandle,
    pool: tauri::State<SqlitePool>,
    source_id: String,
    target_id: String,
    new_aliases: Vec<String>,
) -> Result<String, String> { … }
```

Steps (one SQLite transaction):

1. `UPDATE contacts SET company_id = $target WHERE company_id = $source`
2. `UPDATE companies SET merged_into = $target, aliases = json_patch(companies.aliases, $new_aliases) WHERE id = $source`
3. `DELETE FROM companies WHERE id = $source`  — soft-delete via merged_into pointer, but the row stays for audit; the `WHERE id = $source` lookup now never returns a `merged_into IS NOT NULL` row.
4. Read-back: `SELECT * FROM companies WHERE id = $target` and return the canonical row.

## 5. Data Flow

```
IMAP sync → parser → upsert_contact
  └─> resolve_company_for_contact(contact)
        ├─> email domain match
        ├─> case-insensitive name match
        └─> INSERT INTO companies
  └─> INSERT OR IGNORE INTO contacts (…, company_id = resolved)
  └─> (post) UPDATE companies.aliases if contact.company != company.name

User clicks "合并" in Companies view
  └─> invoke("merge_companies", { source, target, aliases })
        └─> SQLite tx: reassign contacts + soft-delete source
        └─> return new canonical row
  └─> refetch() the Companies resource
```

## 6. Files

| File | Change | Section |
|---|---|---|
| `app/src-tauri/migrations/0016_companies_table.sql` | NEW | 4.1 |
| `app/src-tauri/src/lib.rs:97-100` | Register migration 16 | 4.1 |
| `app/src-tauri/src/services/sync_loop.rs:1099-1113` | Call `resolve_company_for_contact` before contact upsert | 4.2 |
| `app/src-tauri/src/services/companies.rs` | NEW: `resolve_company_for_contact` + `merge_companies` | 4.2, 4.6 |
| `app/src-tauri/src/commands/mod.rs` | re-export | 4.6 |
| `app/src-tauri/src/lib.rs:132-144` | Register `merge_companies` in `invoke_handler!` | 4.6 |
| `app/src/stores/data.ts` | Add `listCompanies()`, `getCompany(id)`, `mergeCompanies(src, tgt, aliases)` helpers | 4.3 |
| `app/src/types/index.ts:99-136` | Add `Company` interface + `Contact.companyId?: ID` | 4.5 |
| `app/src/components/CompanyMergeModal.tsx` | NEW | 4.5 |
| `app/src/components/AliasChips.tsx` | NEW | 4.5 |
| `app/src/views/Companies.tsx:35-60` | Rewrite `grouped()` to use `company_id` | 4.4 |
| `app/src/views/Companies.tsx:120-160` | Add merge button + AliasChips | 4.4 |
| `app/src/services/mock-db.ts` | Mirror `companies` table for browser-mode tests | 4.1 |
| `app/src-tauri/tests/companies_test.rs` | NEW: backfill + merge + dedup-by-domain unit tests | 8 |
| `app/src/test/companies.test.ts` | NEW: vitest cases for the merge modal | 8 |

## 7. Error Handling

- **Orphan contacts** (`company_id IS NULL`): keep showing under `(未分类)`. The migration leaves them alone; future sync auto-resolves if domain present.
- **Domain collision** (e.g. `feishu.cn` already maps to Company A; new contact claims `company = "Lark"` from same domain): new contact still gets `Company A.company_id` (domain wins), and the alias `"Lark"` is appended to Company A.aliases. This is the intended behavior — domain is the more reliable signal.
- **Self-merge** (`source == target`): `merge_companies` returns `Err("cannot merge into self")` early.
- **Cycle** (A merged into B, then user picks C → A's source row): blocked because source rows are excluded by `WHERE merged_into IS NULL` in the picker.
- **Tx failure** (any step in 4.6 fails): `BEGIN`/`ROLLBACK` ensures no partial state.

## 8. Testing

| Test | Type | Verifies |
|---|---|---|
| `companies_test::migration_creates_table` | Rust unit | `companies` exists; FK on `contacts.company_id` |
| `companies_test::backfill_groups_existing` | Rust unit | existing contacts with `company = "Feishu"` land under one row |
| `companies_test::resolve_by_domain_wins_over_name` | Rust unit | "Lark" + @feishu.cn → Feishu company |
| `companies_test::resolve_creates_new_when_no_match` | Rust unit | unique email domain + name → INSERT |
| `companies_test::merge_reassigns_contacts` | Rust unit | tx: contacts moved, source soft-deleted |
| `companies_test::merge_self_rejected` | Rust unit | source == target → Err |
| `companies_test::aliases_deduped` | Rust unit | repeated alias string doesn't grow array |
| `companies.test::listCompanies_groups_by_id` | Vitest | resource groups by FK, falls back to (未分类) |
| `companies.test::mergeCompanies_calls_ipc` | Vitest | invokes `merge_companies` with correct args |
| `e2e/views.spec::companies_show_alias_chips` | Playwright | aliases render when length > 1 |

## 9. Rollout

- One commit per concern:
  1. Migration + `companies` table backfill (4.1)
  2. Sync-time resolver (4.2)
  3. `merge_companies` Tauri command (4.6)
  4. TS read helpers + mock-db mirror
  5. `Companies.tsx` rewrite + `CompanyMergeModal` + `AliasChips`

## 10. Risks & Open Questions

- **Backfill determinism**: existing contacts with `company = "Feishu"` and `company = "feishu"` (different case) merge into one company via `LOWER(name)`. No risk of duplicates; the UNIQUE index is on `LOWER(name)`.
- **Many small companies** (10+ contacts each): the section view scales by `people.length DESC`; no UI pagination needed at <100 companies.
- **Rename with no merge** (single company, user wants to change its name): handled by a separate `renameCompany(id, newName)` command (out of scope here; future `Settings → Companies` follow-up).
- **iOS bundle / `unpkg` icon script** (in `index.html`): untouched.

## 11. Definition of Done

- [ ] Migration runs cleanly on existing DB; no data loss
- [ ] `pnpm typecheck` + `pnpm lint` clean
- [ ] `cd app/src-tauri && cargo test` green
- [ ] `pnpm test` green
- [ ] `pnpm e2e` green
- [ ] Visual: existing companies merge; "Feishu" + "Lark" appear as one company with alias chips; merge modal works
- [ ] No new TODOs without commit-body justification
- [ ] Conventional commit per concern
- [ ] `docs/PROGRESS.md` updated per phase
