//! Migration 0029 — imap identity columns + round-trip.

#[tokio::test]
async fn imap_identity_columns_roundtrip() {
    let pool = sqlx::sqlite::SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::raw_sql(
        "CREATE TABLE messages (id TEXT PRIMARY KEY, st TEXT NOT NULL, timeline_at TEXT NOT NULL DEFAULT '');
         INSERT INTO messages VALUES ('m1','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::raw_sql(include_str!("../migrations/0029_imap_identity.sql"))
        .execute(&pool)
        .await
        .unwrap();

    // Legacy row: no identity → flag sync is a no-op for it.
    let anon: (Option<String>, Option<i64>) =
        sqlx::query_as("SELECT imap_folder, imap_uid FROM messages WHERE id='m1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(anon, (None, None));

    // New sync row carries its server identity.
    sqlx::query(
        "INSERT INTO messages (id, st, timeline_at, imap_folder, imap_uid)
         VALUES ('m2','2026-01-02T00:00:00Z','2026-01-02T00:00:00Z','INBOX',42)",
    )
    .execute(&pool)
    .await
    .unwrap();
    let identified: (String, i64) =
        sqlx::query_as("SELECT imap_folder, imap_uid FROM messages WHERE id='m2'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(identified, ("INBOX".to_string(), 42));
}
