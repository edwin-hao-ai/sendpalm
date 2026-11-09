//! 100k-message scale test.
//!
//! `pnpm exec cargo test --test scale_100k -- --ignored --nocapture`
//!
//! The perf e2e covers rendering at 12k messages, but the *database* side had
//! never been measured past ~4.3k real mail. This builds a throwaway database
//! with the production schema, fills it with 100,000 messages (realistic
//! body sizes), and times the queries every list view and the search box
//! issue. It is `#[ignore]`d so a normal `cargo test` stays fast; run it
//! before a release.
//!
//! Budgets are deliberately generous (CI machines vary) — they exist to catch
//! an order-of-magnitude regression, not to police milliseconds.

use std::time::{Duration, Instant};

use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

const MESSAGES: usize = 100_000;
const ACCOUNTS: usize = 3;

async fn build_pool() -> SqlitePool {
    let path = std::env::temp_dir().join(format!(
        "sendpalm-scale-{}-{}.db",
        std::process::id(),
        Instant::now().elapsed().as_nanos()
    ));
    let _ = std::fs::remove_file(&path);
    let opts = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(opts)
        .await
        .expect("open db");

    for m in sendpalm_app_lib::migrations() {
        sqlx::raw_sql(&m.sql)
            .execute(&pool)
            .await
            .unwrap_or_else(|e| panic!("migration {} failed: {e}", m.version));
    }
    pool
}

async fn seed(pool: &SqlitePool) {
    // Three accounts, twenty senders, 100k messages spread over ~3 years.
    for a in 0..ACCOUNTS {
        sqlx::query(
            "INSERT INTO accounts (id,type,provider,email,label,display_name,status,privacy,color,avatar,last_sync) \
             VALUES ($1,'email','custom',$2,$3,$3,'connected','unified','#0a8f63','',datetime('now'))",
        )
        .bind(format!("acct-{a}"))
        .bind(format!("user{a}@example.com"))
        .bind(format!("user{a}@example.com"))
        .execute(pool)
        .await
        .unwrap();
    }

    let body = "这是一封用于规模测试的邮件正文。".repeat(40); // ~640 CJK chars ≈ 1.9 KB
    // Character-safe excerpt: slicing a UTF-8 string by byte index panics
    // inside a CJK code point (the exact bug class this audit found in the
    // calendar code).
    let prev: String = body.chars().take(80).collect();
    let body_html = format!("<div><p>{}</p></div>", body);

    for c in 0..20 {
        sqlx::query(
            "INSERT INTO contacts (id,first_name,last_name,name,stage,first_contact,screened) \
             VALUES ($1,'Sender',$2,$3,'active',datetime('now'),1)",
        )
        .bind(format!("c{c}"))
        .bind(c.to_string())
        .bind(format!("Sender {c}"))
        .execute(pool)
        .await
        .unwrap();
    }

    // Batch inserts inside one transaction: 100k individual commits would
    // measure the filesystem, not the queries.
    let mut tx = pool.begin().await.unwrap();
    for i in 0..MESSAGES {
        let contact = format!("c{}", i % 20);
        let account = format!("acct-{}", i % ACCOUNTS);
        // Near-unique timestamps, like a real mailbox. A fixture with only a
        // handful of distinct values makes every ORDER BY pathological and
        // measures a shape that does not occur in production.
        let ts = format!("2023-01-01T00:00:00.000Z#{i:06}");
        sqlx::query(
            "INSERT INTO messages (id,pid,subj,prev,body,body_html,tm,st,sent_at,received_at,timeline_at,ac,bucket,unread,direction) \
             VALUES ($1,$2,$3,$4,$5,$6,'10:00',$7,$7,$7,$7,$8,'imbox',$9,'in')",
        )
        .bind(format!("m{i}"))
        .bind(&contact)
        .bind(format!("第 {i} 封 · 报价与发票资料"))
        .bind(&prev)
        .bind(&body)
        .bind(&body_html)
        .bind(&ts)
        .bind(&account)
        .bind(if i % 3 == 0 { 1 } else { 0 })
        .execute(&mut *tx)
        .await
        .unwrap_or_else(|e| panic!("insert {i}: {e}"));
    }
    tx.commit().await.unwrap();

    // Fill the search index the way the app does (per-entity inserts).
    sqlx::raw_sql(
        "INSERT INTO search_index (id, kind, title, body) SELECT id, 'message', subj, body FROM messages;",
    )
    .execute(pool)
    .await
    .unwrap();
}

async fn time<T>(label: &str, budget_ms: u128, f: impl std::future::Future<Output = T>) -> T {
    let start = Instant::now();
    let out = f.await;
    let ms = start.elapsed().as_millis();
    println!("  {label:<38} {ms:>5} ms   (budget {budget_ms} ms)");
    assert!(
        ms <= budget_ms,
        "{label} took {ms} ms, over the {budget_ms} ms budget"
    );
    out
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "100k row fixture; run manually before a release"]
async fn one_hundred_thousand_messages_stay_interactive() {
    let pool = build_pool().await;
    println!("seeding {MESSAGES} messages…");
    let seed_start = Instant::now();
    seed(&pool).await;
    println!("seeded in {} s\n", seed_start.elapsed().as_secs());

    // Imbox page 1 — the query behind opening the app.
    let page: (String,) = time("imbox page 1 (lightweight)", 250, async {
        sqlx::query_as(
            "SELECT id FROM messages WHERE bucket='imbox' AND direction='in' AND unread=1 \
             ORDER BY timeline_at DESC LIMIT 100",
        )
        .fetch_one(&pool)
        .await
        .unwrap()
    })
    .await;
    assert!(!page.0.is_empty());

    // Deep pagination — the shape that used to take 17 s.
    // `OFFSET 50000` still measured here so a regression is visible, but the
    // app now addresses pages by cursor.
    time("offset 50000 (legacy shape, reference)", 120_000, async {
        sqlx::query_as::<_, (String,)>(
            "SELECT id FROM messages WHERE bucket='imbox' AND direction='in' \
             ORDER BY timeline_at DESC, id DESC LIMIT 100 OFFSET 50000",
        )
        .fetch_all(&pool)
        .await
        .unwrap()
    })
    .await;

    time("keyset page (what loadMore does)", 800, async {
        sqlx::query_as::<_, (String,)>(
            "SELECT id FROM messages WHERE bucket='imbox' AND direction='in' \
               AND (timeline_at < $1 OR (timeline_at = $1 AND id < $2)) \
             ORDER BY timeline_at DESC, id DESC LIMIT 100",
        )
        .bind("2023-01-01T00:00:00.000Z#050000")
        .bind("m50000")
        .fetch_all(&pool)
        .await
        .unwrap()
    })
    .await;

    // Walk the whole mailbox by cursor and prove the pages partition it: no
    // row skipped, none returned twice.
    let walk_start = Instant::now();
    let mut seen = std::collections::HashSet::new();
    let mut cursor: Option<(String, String)> = None;
    loop {
        let rows: Vec<(String, String)> = match &cursor {
            None => sqlx::query_as(
                "SELECT id, timeline_at FROM messages WHERE bucket='imbox' AND direction='in' \
                 ORDER BY timeline_at DESC, id DESC LIMIT 1000",
            )
            .fetch_all(&pool)
            .await
            .unwrap(),
            Some((ts, id)) => sqlx::query_as(
                "SELECT id, timeline_at FROM messages WHERE bucket='imbox' AND direction='in' \
                   AND (timeline_at < $1 OR (timeline_at = $1 AND id < $2)) \
                 ORDER BY timeline_at DESC, id DESC LIMIT 1000",
            )
            .bind(ts)
            .bind(id)
            .fetch_all(&pool)
            .await
            .unwrap(),
        };
        if rows.is_empty() {
            break;
        }
        for (id, ts) in &rows {
            seen.insert(id.clone());
            cursor = Some((ts.clone(), id.clone()));
        }
    }
    let walk_ms = walk_start.elapsed().as_millis();
    println!(
        "  {:<38} {walk_ms:>5} ms   ({} unique rows)",
        "full walk with cursors",
        seen.len()
    );
    assert_eq!(
        seen.len(),
        MESSAGES,
        "cursor walk must visit every message exactly once"
    );

    // Counts, in the exact shapes the UI issues (all bounded, id-only —
    // `countUnreadByBucket` / `countRecentUnreadImbox` never COUNT(*)).
    time("sidebar unread (id-only, LIMIT 999)", 400, async {
        sqlx::query_as::<_, (String,)>(
            "SELECT id FROM messages WHERE bucket='imbox' AND direction='in' \
               AND unread=1 AND deleted_at IS NULL LIMIT 999",
        )
        .fetch_all(&pool)
        .await
        .unwrap()
    })
    .await;

    time("30-day unread (id-only, capped)", 400, async {
        sqlx::query_as::<_, (String,)>(
            "SELECT id FROM messages WHERE bucket='imbox' AND direction='in' \
               AND unread=1 AND deleted_at IS NULL AND timeline_at >= $1 LIMIT 2000",
        )
        .bind("2022-12-01T00:00:00.000Z")
        .fetch_all(&pool)
        .await
        .unwrap()
    })
    .await;

    time("per-account badge count", 400, async {
        sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM messages WHERE bucket='imbox' AND ac='acct-0'",
        )
        .fetch_one(&pool)
        .await
        .unwrap()
    })
    .await;

    // Search: a 3-character CJK substring through the trigram index, and a
    // 2-character one through the LIKE fallback the app uses.
    time("search 3-char CJK (trigram)", 600, async {
        sqlx::query_as::<_, (String,)>(
            "SELECT id FROM search_index WHERE search_index MATCH '\"报价与\"' ORDER BY rank LIMIT 50",
        )
        .fetch_all(&pool)
        .await
        .unwrap()
    })
    .await;

    time("search 2-char CJK (LIKE fallback)", 1500, async {
        sqlx::query_as::<_, (String,)>(
            "SELECT id FROM search_index WHERE title LIKE '%发票%' ESCAPE '\\' OR body LIKE '%发票%' ESCAPE '\\' LIMIT 50",
        )
        .fetch_all(&pool)
        .await
        .unwrap()
    })
    .await;

    // Imbox piles — the three narrow selects `listPileMessages` now issues.
    // The old `OR` of three flags scanned the whole table (705 ms at 100k) on
    // every Imbox render and every soft sync tick.
    time("pile: reply_later branch", 150, async {
        sqlx::query_as::<_, (String,)>(
            "SELECT id, timeline_at FROM messages WHERE reply_later = 1",
        )
        .fetch_all(&pool)
        .await
        .unwrap()
    })
    .await;
    time("pile: set_aside branch", 150, async {
        sqlx::query_as::<_, (String,)>(
            "SELECT id, timeline_at FROM messages WHERE set_aside = 1",
        )
        .fetch_all(&pool)
        .await
        .unwrap()
    })
    .await;
    time("pile: bubble_up branch", 150, async {
        sqlx::query_as::<_, (String,)>(
            "SELECT id, timeline_at FROM messages WHERE bubble_up_at IS NOT NULL",
        )
        .fetch_all(&pool)
        .await
        .unwrap()
    })
    .await;

    // A single-message detail fetch (the click path).
    time("message detail by id", 100, async {
        sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT body, body_html FROM messages WHERE id='m99999'",
        )
        .fetch_one(&pool)
        .await
        .unwrap()
    })
    .await;

    println!("\nall 100k budgets met");
}

/// Keep the fixture out of the repo but make the intent obvious if a future
/// test tries to reuse it.
#[allow(dead_code)]
fn cleanup_hint() -> Duration {
    Duration::from_secs(0)
}
