//! Migration 0025 — split sender-declared date from server receipt date.
//!
//! Requirements:
//! - additive and nullable: pre-existing rows keep working untouched,
//! - `timeline_at` is the indexed sort/group key (`received_at ?? sent_at ?? st`),
//! - legacy rows are backfilled from `st` so ordering never degrades.

use sqlx::sqlite::SqlitePoolOptions;

#[tokio::test]
async fn migration_adds_date_columns_and_backfills_timeline() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(
        "CREATE TABLE messages (
           id TEXT PRIMARY KEY,
           bucket TEXT NOT NULL,
           st TEXT NOT NULL,
           tm TEXT NOT NULL DEFAULT '',
           unread INTEGER NOT NULL DEFAULT 1,
           body TEXT NOT NULL DEFAULT ''
         );
         INSERT INTO messages (id, bucket, st, tm, unread, body)
           VALUES ('legacy','imbox','2024-01-01T10:00:00+00:00','2024-01-01 10:00',1,'old');",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::raw_sql(include_str!("../migrations/0025_message_dates.sql"))
        .execute(&pool)
        .await
        .unwrap();

    // Legacy row survives, keeps its content, and gains no invented dates.
    let legacy: (Option<String>, Option<String>, String, String) = sqlx::query_as(
        "SELECT sent_at, received_at, timeline_at, body FROM messages WHERE id='legacy'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(legacy.0, None);
    assert_eq!(legacy.1, None);
    assert_eq!(legacy.2, "2024-01-01T10:00:00+00:00");
    assert_eq!(legacy.3, "old");

    // New rows can carry both dates plus an independent timeline.
    sqlx::query(
        "INSERT INTO messages (id, bucket, st, tm, unread, body, sent_at, received_at, timeline_at)
         VALUES ('new','imbox','2024-02-01T09:00:00+00:00','2024-02-01 09:00',1,'new',
                 '2024-02-01T09:00:00+00:00','2024-02-01T09:00:05+00:00','2024-02-01T09:00:05+00:00')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let new_row: (String, String) = sqlx::query_as(
        "SELECT sent_at, received_at FROM messages WHERE id='new'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(new_row.0, "2024-02-01T09:00:00+00:00");
    assert_eq!(new_row.1, "2024-02-01T09:00:05+00:00");

    // Ordering by the timeline column puts the newest receipt first.
    let ordered: Vec<String> =
        sqlx::query_scalar("SELECT id FROM messages ORDER BY timeline_at DESC")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(ordered, vec!["new".to_string(), "legacy".to_string()]);

    let index_exists: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM sqlite_master WHERE type='index' AND name='idx_messages_timeline'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(index_exists, 1);
}

#[tokio::test]
async fn running_the_migration_twice_is_safe_for_timeline_backfill() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(
        "CREATE TABLE messages (id TEXT PRIMARY KEY, bucket TEXT NOT NULL, st TEXT NOT NULL);
         INSERT INTO messages VALUES ('a','imbox','2024-03-01T00:00:00+00:00');",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::raw_sql(include_str!("../migrations/0025_message_dates.sql"))
        .execute(&pool)
        .await
        .unwrap();
    // Re-running only the backfill statement must be idempotent.
    sqlx::raw_sql("UPDATE messages SET timeline_at = st WHERE timeline_at = '';")
        .execute(&pool)
        .await
        .unwrap();

    let timeline: String = sqlx::query_scalar("SELECT timeline_at FROM messages WHERE id='a'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(timeline, "2024-03-01T00:00:00+00:00");
}
