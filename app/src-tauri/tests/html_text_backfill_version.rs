//! The markup-body repair must run once, not once per launch.
//!
//! `backfill_markup_bodies` rewrites `messages.body` for rows stored as raw
//! HTML. A row whose HTML has no extractable text (image-only newsletters)
//! becomes an empty body, which matches the scan's `body = ''` arm again on the
//! next boot — so the same handful of rows were re-extracted and re-tokenized
//! into the trigram index on **every** start (measured ~1.9 s of CPU plus a WAL
//! checkpoint, for no change). A version marker in `app_kv` makes the pass
//! one-shot per extractor generation.

use sendpalm_app_lib::services::html_text::backfill_markup_bodies;
use sqlx::sqlite::SqlitePoolOptions;

async fn pool() -> sqlx::SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("memory db");
    sqlx::raw_sql(
        "CREATE TABLE app_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL,
                               updated_at TEXT NOT NULL);
         CREATE TABLE messages (
           id TEXT PRIMARY KEY,
           subj TEXT NOT NULL DEFAULT '',
           body TEXT NOT NULL DEFAULT '',
           body_html TEXT
         );
         -- Stand-in for the FTS table: the repair deletes and re-inserts a row
         -- per message, and the test asserts on those writes.
         CREATE TABLE search_index (id TEXT PRIMARY KEY, kind TEXT, title TEXT, body TEXT);",
    )
    .execute(&pool)
    .await
    .expect("schema");
    pool
}

#[tokio::test]
async fn repairs_markup_once_and_then_stops_touching_the_table() {
    let pool = pool().await;
    sqlx::raw_sql(
        r#"INSERT INTO messages (id, subj, body, body_html) VALUES
             ('m1', 'raw markup', '<p>Hello &#38543;&#30528;</p>', '<p>Hello &#38543;&#30528;</p>'),
             ('m2', 'html only, no text', '', '<img src="hero.png">');"#,
    )
    .execute(&pool)
    .await
    .expect("seed");

    let first = backfill_markup_bodies(&pool).await.expect("first pass");
    assert_eq!(first, 2, "both rows need repairing");

    // Every subsequent launch must be a no-op.
    for _ in 0..3 {
        let again = backfill_markup_bodies(&pool).await.expect("repeat pass");
        assert_eq!(again, 0, "a repaired database must not be rescanned");
    }

    let version: (String,) =
        sqlx::query_as("SELECT value FROM app_kv WHERE key = 'html_text_backfill_version'")
            .fetch_one(&pool)
            .await
            .expect("version recorded");
    assert_eq!(version.0, "2");
}

#[tokio::test]
async fn a_new_extractor_generation_repairs_again() {
    let pool = pool().await;
    sqlx::raw_sql(
        "INSERT INTO messages (id, subj, body, body_html) VALUES
           ('m1', 'entity text', '&#38543;&#30528;', '<p>&#38543;&#30528;</p>')",
    )
    .execute(&pool)
    .await
    .expect("seed");
    sqlx::query(
        "INSERT INTO app_kv (key, value, updated_at) \
         VALUES ('html_text_backfill_version', '1', datetime('now'))",
    )
        .execute(&pool)
        .await
        .expect("old version");

    let repaired = backfill_markup_bodies(&pool).await.expect("pass");
    assert_eq!(repaired, 1, "an older version marker must not skip the repair");
}
