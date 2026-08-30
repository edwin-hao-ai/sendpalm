# Plan B: Company 1NF Dedup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace string-equality grouping with a real `companies` table. Aliases + domain extraction at sync time. Manual merge UI.

**Architecture:** New `companies` table with FK from `contacts.company_id`; sync-time resolver picks canonical id by domain → case-insensitive name → INSERT. `merge_companies` Tauri command does a single-transaction merge. UI: `<AliasChips />`, `<CompanyMergeModal />`, rewritten `Companies` view.

**Tech Stack:** Rust 2021 + sqlx, SolidJS, Vitest, Playwright.

## Global Constraints

Verbatim from spec + AGENTS.md:
- AGENTS.md §3.2: no `any` in TS, no magic strings.
- AGENTS.md §3.3: DRY. Components ≤120 lines.
- AGENTS.md §3.4: unit tests for any logic; integration tests for IPC.
- AGENTS.md §3.5: conventional commits; one logical change per commit.
- AGENTS.md §6: mobile ≤767 px, tablet 768–1023 px, desktop ≥1024 px; `100dvh`.
- Spec B §6 file scope is binding; no opportunistic edits.
- Domain wins over name (resolve_company_for_contact § 4.2).
- `merged_into` is the soft-delete pointer; the row stays for audit; `WHERE merged_into IS NULL` in the picker.
- All Rust tx in `merge_companies` must rollback on any step failure.
- TS: use `interface` for shapes; const exports; barrel `types/index.ts`.

---

## Task B.1: Migration 0016 + Rust `resolve_company_for_contact` (2 unit tests)

**Files:**
- Create: `app/src-tauri/migrations/0016_companies_table.sql`
- Modify: `app/src-tauri/src/lib.rs` (register migration 16)
- Create: `app/src-tauri/src/services/companies.rs`
- Modify: `app/src-tauri/src/services/mod.rs` (register)
- Test: `app/src-tauri/tests/companies_resolve_test.rs`

**Interfaces:**
- Produces:
  - `pub async fn resolve_company_for_contact(pool: &SqlitePool, contact: &ResolveContact) -> Result<Option<String>, String>` where `ResolveContact { name, company, email, existing_company_id }`. Returns the canonical `companies.id`, creating one if no match.
  - `pub async fn auto_alias_if_needed(pool: &SqlitePool, company_id: &str, alias: &str) -> Result<(), String>` — appends `alias` to `companies.aliases` if absent (idempotent).

- [ ] **Step 1: Write the migration**

Create `app/src-tauri/migrations/0016_companies_table.sql`:

```sql
CREATE TABLE companies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  domain      TEXT,
  aliases     TEXT NOT NULL DEFAULT '[]',
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  merged_into TEXT REFERENCES companies(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX idx_companies_domain ON companies(domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_companies_name_lower ON companies(LOWER(name));

ALTER TABLE contacts ADD COLUMN company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX idx_contacts_company_id ON contacts(company_id) WHERE company_id IS NOT NULL;

-- Backfill: existing contacts with non-empty company string → new companies row.
INSERT INTO companies (id, name, domain, created_at, updated_at)
  SELECT
    'co_' || substr(md5(LOWER(c.company)), 1, 12) AS id,
    c.company AS name,
    (SELECT LOWER(value) FROM contacts, json_each(contacts.emails_json) WHERE contacts.id = c.id LIMIT 1) AS domain,
    datetime('now') AS created_at,
    datetime('now') AS updated_at
  FROM (SELECT DISTINCT company, id FROM contacts WHERE company != '' AND company IS NOT NULL) c
  ON CONFLICT (LOWER(name)) DO NOTHING;

-- Assign company_id back to contacts.
UPDATE contacts
   SET company_id = (SELECT id FROM companies WHERE LOWER(companies.name) = LOWER(contacts.company) LIMIT 1)
 WHERE company_id IS NULL AND company != '';
```

Register migration 16 in `app/src-tauri/src/lib.rs` (after the v15 entry).

- [ ] **Step 2: Write the failing test**

Create `app/src-tauri/tests/companies_resolve_test.rs`:

```rust
use sendpalm_app_lib::services::companies::resolve_company_for_contact;
use sendpalm_app_lib::services::companies::ResolveContact;
use sqlx::sqlite::SqlitePool;

async fn setup() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::query(
        "CREATE TABLE companies (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT,
            aliases TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            merged_into TEXT
         )",
    )
    .execute(&pool).await.unwrap();
    sqlx::query(
        "CREATE TABLE contacts (
            id TEXT PRIMARY KEY, company TEXT NOT NULL DEFAULT '', company_id TEXT
         )",
    )
    .execute(&pool).await.unwrap();
    pool
}

#[tokio::test]
async fn resolve_creates_new_when_no_match() {
    let pool = setup().await;
    let id = resolve_company_for_contact(
        &pool,
        &ResolveContact {
            name: "Alice".to_string(),
            company: "Feishu".to_string(),
            email: Some("alice@feishu.cn".to_string()),
            existing_company_id: None,
        },
    )
    .await
    .unwrap();
    let id = id.expect("should resolve");
    let domain: Option<String> = sqlx::query_scalar("SELECT domain FROM companies WHERE id = $1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(domain, Some("feishu.cn".to_string()));
}

#[tokio::test]
async fn resolve_by_domain_wins_over_name() {
    let pool = setup().await;
    // Seed company "Lark" with domain "feishu.cn"
    sqlx::query(
        "INSERT INTO companies (id, name, domain, created_at, updated_at) VALUES ('co_lark', 'Lark', 'feishu.cn', datetime('now'), datetime('now'))",
    )
    .execute(&pool).await.unwrap();
    // Contact claims company="Feishu" but email is @feishu.cn — domain wins
    let id = resolve_company_for_contact(
        &pool,
        &ResolveContact {
            name: "Alice".to_string(),
            company: "Feishu".to_string(),
            email: Some("alice@feishu.cn".to_string()),
            existing_company_id: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(id, Some("co_lark".to_string()));
}

#[tokio::test]
async fn resolve_returns_existing_company_id() {
    let pool = setup().await;
    sqlx::query(
        "INSERT INTO companies (id, name, domain, created_at, updated_at) VALUES ('co_x', 'Feishu', 'feishu.cn', datetime('now'), datetime('now'))",
    )
    .execute(&pool).await.unwrap();
    let id = resolve_company_for_contact(
        &pool,
        &ResolveContact {
            name: "Bob".to_string(),
            company: "Feishu".to_string(),
            email: Some("bob@feishu.cn".to_string()),
            existing_company_id: Some("co_x".to_string()),
        },
    )
    .await
    .unwrap();
    assert_eq!(id, Some("co_x".to_string()));
}
```

- [ ] **Step 3: Run, expect failure**

```bash
cd app/src-tauri && cargo test --test companies_resolve_test
```
Expected: FAIL with "unresolved import".

- [ ] **Step 4: Implement**

Create `app/src-tauri/src/services/companies.rs`:

```rust
//! Company resolution + dedup helpers.

use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Default)]
pub struct ResolveContact {
    pub name: String,
    pub company: String,
    pub email: Option<String>,
    pub existing_company_id: Option<String>,
}

fn domain_of(email: Option<&str>) -> Option<String> {
    let email = email?;
    let at = email.find('@')?;
    Some(email[at + 1..].to_lowercase())
}

fn new_company_id() -> String {
    format!("co_{}", Uuid::new_v4().simple())
}

/// Resolve a canonical company id for a contact. Domain wins, then
/// case-insensitive name, then INSERT.
pub async fn resolve_company_for_contact(
    pool: &SqlitePool,
    contact: &ResolveContact,
) -> Result<Option<String>, String> {
    if contact.company.trim().is_empty() {
        return Ok(contact.existing_company_id.clone());
    }
    if let Some(existing) = &contact.existing_company_id {
        return Ok(Some(existing.clone()));
    }
    let domain = domain_of(contact.email.as_deref());

    // 1. Domain match
    if let Some(d) = &domain {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM companies WHERE domain = $1 AND merged_into IS NULL LIMIT 1",
        )
        .bind(d)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("resolve domain: {e}"))?;
        if let Some((id,)) = row {
            return Ok(Some(id));
        }
    }
    // 2. Case-insensitive name match
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM companies WHERE LOWER(name) = LOWER($1) AND merged_into IS NULL LIMIT 1",
    )
    .bind(&contact.company)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("resolve name: {e}"))?;
    if let Some((id,)) = row {
        return Ok(Some(id));
    }
    // 3. INSERT
    let id = new_company_id();
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO companies (id, name, domain, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(&id)
    .bind(&contact.company)
    .bind(domain.as_deref())
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("insert company: {e}"))?;
    Ok(Some(id))
}

/// Idempotently append `alias` to the company's `aliases` JSON array.
pub async fn auto_alias_if_needed(
    pool: &SqlitePool,
    company_id: &str,
    alias: &str,
) -> Result<(), String> {
    let aliases_raw: String = sqlx::query_scalar("SELECT aliases FROM companies WHERE id = $1")
        .bind(company_id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("read aliases: {e}"))?;
    let mut aliases: Vec<String> = serde_json::from_str(&aliases_raw).unwrap_or_default();
    if !aliases.iter().any(|a| a == alias) {
        aliases.push(alias.to_string());
        let next = serde_json::to_string(&aliases).map_err(|e| format!("serialize: {e}"))?;
        sqlx::query("UPDATE companies SET aliases = $1, updated_at = $2 WHERE id = $3")
            .bind(next)
            .bind(Utc::now().to_rfc3339())
            .bind(company_id)
            .execute(pool)
            .await
            .map_err(|e| format!("update aliases: {e}"))?;
    }
    Ok(())
}
```

In `app/src-tauri/src/services/mod.rs`, add at the end:

```rust
pub mod companies;
```

- [ ] **Step 5: Run, expect pass**

```bash
cd app/src-tauri && cargo test --test companies_resolve_test
```
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add app/src-tauri/migrations/0016_companies_table.sql \
        app/src-tauri/src/lib.rs \
        app/src-tauri/src/services/companies.rs \
        app/src-tauri/src/services/mod.rs \
        app/src-tauri/tests/companies_resolve_test.rs
git commit -m "feat(companies): 1NF companies table + resolve_company_for_contact"
```

## Task B.2: Wire resolver into sync_loop (inbound contact upsert)

**Files:**
- Modify: `app/src-tauri/src/services/sync_loop.rs:1099-1113` (the contact upsert + auto_alias)

**Interfaces:**
- Consumes: existing `upsert_contact` flow.
- Produces: every `INSERT OR IGNORE INTO contacts` resolves the company id via `resolve_company_for_contact` and binds it; if `contact.company` differs from the resolved company's name, calls `auto_alias_if_needed`.

- [ ] **Step 1: Read existing contact upsert and the surrounding function signature**

Read `app/src-tauri/src/services/sync_loop.rs:1075-1170` to find the `INSERT INTO contacts` block and the function signature.

- [ ] **Step 2: Add the resolve + alias calls before the INSERT**

Add the call right before the `INSERT INTO contacts`:

```rust
        // Resolve company_id (1NF) before insert.
        let mut resolved_company_id: Option<String> = None;
        if !contact.company.trim().is_empty() {
            let resolved = crate::services::companies::resolve_company_for_contact(
                pool,
                &crate::services::companies::ResolveContact {
                    name: contact.name.clone(),
                    company: contact.company.clone(),
                    email: contact.email.clone(),
                    existing_company_id: None,
                },
            )
            .await?;
            if let Some(id) = resolved.clone() {
                resolved_company_id = Some(id.clone());
                let _ = crate::services::companies::auto_alias_if_needed(pool, &id, &contact.company).await;
            }
        }
```

Add `company_id` to the INSERT column list and the bind list. Use the existing column order in your source.

- [ ] **Step 3: Run, expect pass**

```bash
cd app/src-tauri && cargo check --tests && cargo test --test companies_resolve_test
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/services/sync_loop.rs
git commit -m "feat(sync): resolve Company.id + auto-alias on contact upsert"
```

## Task B.3: Tauri command `merge_companies` + 3 unit tests

**Files:**
- Create: `app/src-tauri/src/commands/companies.rs`
- Modify: `app/src-tauri/src/commands/mod.rs` (re-export)
- Modify: `app/src-tauri/src/lib.rs` (register in `invoke_handler!`)
- Test: `app/src-tauri/tests/companies_merge_test.rs`

**Interfaces:**
- Produces: `#[tauri::command] pub async fn merge_companies(app, pool, source_id, target_id, new_aliases: Vec<String>) -> Result<Company, String>`.

- [ ] **Step 1: Write the failing tests**

Create `app/src-tauri/tests/companies_merge_test.rs`:

```rust
use sendpalm_app_lib::commands::companies::merge_companies_impl;
use sqlx::sqlite::SqlitePool;

async fn setup() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::query(
        "CREATE TABLE companies (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT,
            aliases TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            merged_into TEXT
         )",
    )
    .execute(&pool).await.unwrap();
    sqlx::query(
        "CREATE TABLE contacts (
            id TEXT PRIMARY KEY, company_id TEXT
         )",
    )
    .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO companies (id, name, created_at, updated_at) VALUES ('a','A', datetime('now'), datetime('now'))").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO companies (id, name, created_at, updated_at) VALUES ('b','B', datetime('now'), datetime('now'))").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO contacts (id, company_id) VALUES ('c1','a'),('c2','a')").execute(&pool).await.unwrap();
    pool
}

#[tokio::test]
async fn merge_reassigns_contacts_and_soft_deletes_source() {
    let pool = setup().await;
    let row = merge_companies_impl(&pool, "a", "b", vec!["AA".to_string()]).await.unwrap();
    assert_eq!(row.id, "b");
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM contacts WHERE company_id = 'b'").fetch_one(&pool).await.unwrap();
    assert_eq!(n, 2);
    let a: Option<String> = sqlx::query_scalar("SELECT merged_into FROM companies WHERE id = 'a'").fetch_one(&pool).await.unwrap();
    assert_eq!(a, Some("b".to_string()));
}

#[tokio::test]
async fn merge_self_rejected() {
    let pool = setup().await;
    let r = merge_companies_impl(&pool, "a", "a", vec![]).await;
    assert!(r.is_err());
}

#[tokio::test]
async fn merge_dedups_aliases() {
    let pool = setup().await;
    sqlx::query("UPDATE companies SET aliases = '[\"A\",\"AA\"]' WHERE id = 'a'").execute(&pool).await.unwrap();
    merge_companies_impl(&pool, "a", "b", vec!["AA".to_string(), "AAA".to_string()]).await.unwrap();
    let aliases: String = sqlx::query_scalar("SELECT aliases FROM companies WHERE id = 'b'").fetch_one(&pool).await.unwrap();
    let v: Vec<String> = serde_json::from_str(&aliases).unwrap();
    assert!(v.contains(&"A".to_string()));
    assert!(v.contains(&"AA".to_string()));
    assert!(v.contains(&"AAA".to_string()));
}
```

- [ ] **Step 2: Run, expect failure**

```bash
cd app/src-tauri && cargo test --test companies_merge_test
```
Expected: FAIL with "unresolved import".

- [ ] **Step 3: Implement**

Create `app/src-tauri/src/commands/companies.rs`:

```rust
use sqlx::SqlitePool;
use tauri::AppHandle;

#[derive(Debug, Clone, serde::Serialize)]
pub struct CompanyRow {
    pub id: String,
    pub name: String,
    pub domain: Option<String>,
    pub aliases: Vec<String>,
    pub notes: String,
}

/// Test seam + the production command body. Single transaction:
/// 1. Reassign contacts
/// 2. Append dedup'd aliases
/// 3. Soft-delete source (set merged_into)
/// 4. Return canonical target row
pub async fn merge_companies_impl(
    pool: &SqlitePool,
    source_id: &str,
    target_id: &str,
    new_aliases: Vec<String>,
) -> Result<CompanyRow, String> {
    if source_id == target_id {
        return Err("cannot merge into self".to_string());
    }

    let mut tx = pool.begin().await.map_err(|e| format!("tx begin: {e}"))?;

    // 1. Reassign contacts.
    sqlx::query("UPDATE contacts SET company_id = $1 WHERE company_id = $2")
        .bind(target_id)
        .bind(source_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("reassign: {e}"))?;

    // 2. Append aliases (dedup).
    let existing: String = sqlx::query_scalar("SELECT aliases FROM companies WHERE id = $1")
        .bind(target_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("read target aliases: {e}"))?;
    let source: String = sqlx::query_scalar("SELECT aliases FROM companies WHERE id = $1")
        .bind(source_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("read source aliases: {e}"))?;
    let source_name: String = sqlx::query_scalar("SELECT name FROM companies WHERE id = $1")
        .bind(source_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("read source name: {e}"))?;
    let mut aliases: Vec<String> = serde_json::from_str(&existing).unwrap_or_default();
    for a in serde_json::from_str::<Vec<String>>(&source).unwrap_or_default() {
        if !aliases.contains(&a) {
            aliases.push(a);
        }
    }
    for a in new_aliases {
        if !aliases.contains(&a) {
            aliases.push(a);
        }
    }
    if !aliases.contains(&source_name) {
        aliases.push(source_name);
    }
    let next = serde_json::to_string(&aliases).map_err(|e| format!("serialize: {e}"))?;
    sqlx::query("UPDATE companies SET aliases = $1 WHERE id = $2")
        .bind(&next)
        .bind(target_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("update aliases: {e}"))?;

    // 3. Soft-delete source.
    sqlx::query("UPDATE companies SET merged_into = $1 WHERE id = $2")
        .bind(target_id)
        .bind(source_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("soft-delete source: {e}"))?;

    // 4. Read back target.
    let row: (String, String, Option<String>, String, String) = sqlx::query_as(
        "SELECT id, name, domain, aliases, notes FROM companies WHERE id = $1",
    )
    .bind(target_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| format!("read target: {e}"))?;
    tx.commit().await.map_err(|e| format!("tx commit: {e}"))?;

    Ok(CompanyRow {
        id: row.0,
        name: row.1,
        domain: row.2,
        aliases: serde_json::from_str(&row.3).unwrap_or_default(),
        notes: row.4,
    })
}

#[tauri::command]
pub async fn merge_companies(
    _app: AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    source_id: String,
    target_id: String,
    new_aliases: Vec<String>,
) -> Result<CompanyRow, String> {
    merge_companies_impl(pool.inner(), &source_id, &target_id, new_aliases).await
}
```

In `app/src-tauri/src/commands/mod.rs`, add `pub mod companies;`.

In `app/src-tauri/src/lib.rs`, add `commands::companies::merge_companies` to the `invoke_handler!` macro.

- [ ] **Step 4: Run, expect pass**

```bash
cd app/src-tauri && cargo test --test companies_merge_test --test companies_resolve_test
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/commands/companies.rs \
        app/src-tauri/src/commands/mod.rs \
        app/src-tauri/src/lib.rs \
        app/src-tauri/tests/companies_merge_test.rs
git commit -m "feat(companies): merge_companies Tauri command + tx"
```

## Task B.4: TS types, helpers, mock-db mirror

**Files:**
- Modify: `app/src/types/index.ts` (add `Company` interface; add `Contact.companyId?: ID`)
- Modify: `app/src/stores/data.ts` (add `listCompanies`, `getCompany`, `mergeCompanies`)
- Modify: `app/src/services/mock-db.ts` (mirror `companies` table)
- Test: `app/src/test/companies.test.ts`

**Interfaces:**
- Produces:
  - `Company { id, name, domain?, aliases, notes }`
  - `listCompanies(): Promise<Company[]>` — `WHERE merged_into IS NULL` (excludes soft-deleted), ordered by `name ASC`.
  - `getCompany(id): Promise<Company | null>`
  - `mergeCompanies(sourceId, targetId, newAliases): Promise<Company>` — invokes `merge_companies` IPC.

- [ ] **Step 1: Write the failing test**

Create `app/src/test/companies.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import { listCompanies, getCompany } from "../stores/data";
import { resetMockDb } from "../services/mock-db";

describe("companies data helpers", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  it("listCompanies excludes merged_into rows", async () => {
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    await db.execute(`INSERT INTO companies (id, name, created_at, updated_at) VALUES ('a','A','','')`);
    await db.execute(`INSERT INTO companies (id, name, created_at, updated_at, merged_into) VALUES ('b','B','','','a')`);
    const r = await listCompanies();
    expect(r.map((c) => c.id).sort()).toEqual(["a"]);
  });

  it("getCompany returns null for missing", async () => {
    const r = await getCompany("missing");
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
cd app && pnpm test -- companies.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

In `app/src/types/index.ts` (after the `Contact` interface, around line 136), add:

```ts
export interface Company {
  id: ID;
  name: string;
  domain: string | null;
  aliases: string[];
  notes: string;
}
```

In the existing `Contact` interface, add `companyId?: ID;`.

In `app/src/stores/data.ts`, add at the end:

```ts
export async function listCompanies(): Promise<Company[]> {
  const db = await getDb();
  const rows = await db.select<Array<Record<string, unknown>>>(
    "SELECT * FROM companies WHERE merged_into IS NULL ORDER BY name ASC",
  );
  return rows.map(rowToCompany);
}

export async function getCompany(id: ID): Promise<Company | null> {
  const db = await getDb();
  const rows = await db.select<Array<Record<string, unknown>>>(
    "SELECT * FROM companies WHERE id = $1",
    [id],
  );
  return rows[0] ? rowToCompany(rows[0]) : null;
}

function rowToCompany(r: Record<string, unknown>): Company {
  return {
    id: r.id as string,
    name: r.name as string,
    domain: (r.domain as string | null) ?? null,
    aliases: safeParse<string[]>(r.aliases as string, []),
    notes: (r.notes as string) ?? "",
  };
}

export async function mergeCompanies(
  sourceId: ID,
  targetId: ID,
  newAliases: string[],
): Promise<Company> {
  const { invoke } = await import("@tauri-apps/api/core");
  const row = await invoke<Company>("merge_companies", {
    sourceId,
    targetId,
    newAliases,
  });
  return row;
}
```

In `app/src/services/mock-db.ts`, find the schema-mirror table list and add:

```ts
companies: {
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT,
  aliases TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  merged_into TEXT,
},
```

- [ ] **Step 4: Run, expect pass**

```bash
cd app && pnpm test -- companies.test.ts
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src/types/index.ts \
        app/src/stores/data.ts \
        app/src/services/mock-db.ts \
        app/src/test/companies.test.ts
git commit -m "feat(data): listCompanies/getCompany/mergeCompanies + Company type"
```

## Task B.5: `AliasChips` + `CompanyMergeModal` + rewrite `Companies` view

**Files:**
- Create: `app/src/components/AliasChips.tsx`
- Create: `app/src/components/CompanyMergeModal.tsx`
- Modify: `app/src/views/Companies.tsx` (rewrite `grouped()` + add merge UI)
- Test: `app/e2e/views.spec.ts` (alias chips render)

**Interfaces:**
- Produces:
  - `<AliasChips aliases={string[]} />` — small chips under a company name; collapsed if `aliases.length <= 1`.
  - `<CompanyMergeModal source={Company} onClose={fn} onMerged={fn} />` — search box for target company + "create new" form.

- [ ] **Step 1: Create AliasChips**

```tsx
import { For, Show } from "solid-js";

export function AliasChips(props: { aliases: string[] }) {
  return (
    <Show when={props.aliases.length > 1}>
      <div
        data-alias-chips
        style={{
          display: "flex",
          "flex-wrap": "wrap",
          gap: "4px",
          "margin-top": "2px",
        }}
      >
        <For each={props.aliases.slice(0, 5)}>
          {(a) => (
            <span
              style={{
                background: "var(--paper-mid)",
                color: "var(--text-secondary)",
                "font-size": "var(--text-micro)",
                padding: "1px 6px",
                "border-radius": "var(--radius-pill)",
              }}
            >
              {a}
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}
```

- [ ] **Step 2: Create CompanyMergeModal**

```tsx
import { For, Show, createResource, createSignal } from "solid-js";
import { listCompanies, mergeCompanies } from "../stores/data";
import { Icon } from "./Icon";

export function CompanyMergeModal(props: {
  source: { id: string; name: string; aliases: string[] };
  onClose: () => void;
  onMerged: (newId: string) => void;
}) {
  const [allCompanies] = createResource(listCompanies);
  const [q, setQ] = createSignal("");
  const [targetId, setTargetId] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const matches = () =>
    (allCompanies() ?? [])
      .filter((c) => c.id !== props.source.id)
      .filter((c) =>
        q().trim() ? c.name.toLowerCase().includes(q().toLowerCase()) : true,
      );

  const confirm = async () => {
    const tid = targetId();
    if (!tid) return;
    setBusy(true);
    try {
      const row = await mergeCompanies(props.source.id, tid, [props.source.name]);
      props.onMerged(row.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-merge-modal
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": 9999,
      }}
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper-light)",
          padding: "var(--space-5)",
          "border-radius": "var(--radius-lg)",
          "min-width": "420px",
          "max-width": "560px",
        }}
      >
        <h3 style={{ "margin-top": 0 }}>合并到 / 重新命名</h3>
        <p style={{ color: "var(--text-secondary)" }}>
          把 <strong>{props.source.name}</strong> 合并到：
        </p>
        <input
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
          placeholder="搜索公司…"
          data-merge-search
          style={{
            width: "100%",
            padding: "8px 12px",
            "border-radius": "var(--radius-pill)",
            border: "0.5px solid var(--border)",
            "margin-bottom": "var(--space-2)",
          }}
        />
        <div
          style={{
            "max-height": "240px",
            "overflow-y": "auto",
            display: "grid",
            gap: "4px",
          }}
        >
          <For each={matches()}>
            {(c) => (
              <button
                data-merge-target
                data-cid={c.id}
                onClick={() => setTargetId(c.id)}
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "6px 10px",
                  background:
                    targetId() === c.id ? "var(--palm-soft)" : "transparent",
                  border: "0.5px solid var(--border)",
                  "border-radius": "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                <span>{c.name}</span>
                <Show when={targetId() === c.id}>
                  <Icon name="ph-check" size={14} />
                </Show>
              </button>
            )}
          </For>
        </div>
        <div
          style={{
            display: "flex",
            "justify-content": "flex-end",
            gap: "var(--space-2)",
            "margin-top": "var(--space-3)",
          }}
        >
          <button
            onClick={props.onClose}
            style={{
              padding: "6px 12px",
              "border-radius": "var(--radius-pill)",
              border: "0.5px solid var(--border)",
            }}
          >
            取消
          </button>
          <button
            onClick={confirm}
            disabled={!targetId() || busy()}
            data-merge-confirm
            style={{
              padding: "6px 12px",
              "border-radius": "var(--radius-pill)",
              background: "var(--palm)",
              color: "#fff",
              opacity: !targetId() || busy() ? 0.5 : 1,
            }}
          >
            确认合并
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite Companies.tsx**

In `app/src/views/Companies.tsx`:

- Replace the `grouped()` memo to group by `c.companyId` first, falling back to `(未分类)` when null.
- Use `<AliasChips aliases={...} />` under each company name.
- Add a `…` button on each company card that opens `<CompanyMergeModal />` with that company as `source`.
- The modal's `onMerged` callback triggers a refetch of the resource and closes the modal.

Pseudo (final shape, ~30 lines of new code):

```tsx
import { listCompanies, listContacts, listMessages, listEvents, listFiles } from "../stores/data";
import { AliasChips } from "../components/AliasChips";
import { CompanyMergeModal } from "../components/CompanyMergeModal";

const [companies] = createResource(listCompanies);

const grouped = createMemo(() => {
  const list = contacts() ?? [];
  const byId = new Map<string, { company: Company; people: Contact[] }>();
  for (const c of list) {
    if (!c.companyId) continue;
    const co = (companies() ?? []).find((x) => x.id === c.companyId);
    if (!co) continue;
    if (!byId.has(co.id)) byId.set(co.id, { company: co, people: [] });
    byId.get(co.id)!.people.push(c);
  }
  return [...byId.values()]
    .map(({ company, people }) => ({
      company,
      people,
      msgCount: people.reduce((acc, p) => acc + (messages() ?? []).filter((m) => m.pid === p.id).length, 0),
      // ... (eventCount, fileCount similarly)
    }))
    .sort((a, b) => b.people.length - a.people.length);
});
```

Wire the merge button + state in the JSX.

- [ ] **Step 4: Verify**

```bash
cd app && pnpm typecheck && pnpm lint -- src/components/AliasChips.tsx src/components/CompanyMergeModal.tsx src/views/Companies.tsx
```

- [ ] **Step 5: Commit**

```bash
git add app/src/components/AliasChips.tsx \
        app/src/components/CompanyMergeModal.tsx \
        app/src/views/Companies.tsx
git commit -m "feat(companies): AliasChips + CompanyMergeModal + rewrite Companies view"
```

## Task B.6: e2e + PROGRESS

**Files:**
- Modify: `app/e2e/views.spec.ts` (assert alias chips render)
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Add the e2e test**

```ts
test("companies view shows alias chips", async ({ page }) => {
  await page.goto("/");
  await page.locator("body.app-ready").waitFor();
  await page.locator("[data-nav='Companies']").first().click();
  await expect(page.locator("[data-alias-chips]").first()).toBeVisible({ timeout: 5000 });
});
```

- [ ] **Step 2: Add Phase B PROGRESS entry**

```markdown
### Phase B — Company 1NF dedup (2026-08-10)

- New `companies` table with FK `contacts.company_id`
- Migration 0016 with backfill from existing `Contact.company` strings
- Sync-time resolver: domain > case-insensitive name > INSERT
- Auto-alias on sync when contact.company != company.name
- `merge_companies` Tauri command (single-tx reassign + soft-delete source)
- AliasChips + CompanyMergeModal + rewritten Companies view
- Tests: companies_resolve (3), companies_merge (3), companies (2), e2e (1)
```

- [ ] **Step 3: Commit**

```bash
git add app/e2e/views.spec.ts docs/PROGRESS.md
git commit -m "test(e2e): companies alias chips + PROGRESS phase B"
```

---

## Definition of Done (Phase B)

- [ ] All commits conventional
- [ ] `cd app/src-tauri && cargo test` green
- [ ] `cd app && pnpm test` green
- [ ] `pnpm typecheck` + `pnpm lint` clean
- [ ] Visual: Feishu + Lark appear as one company with chips; merge modal works
- [ ] `docs/PROGRESS.md` updated
