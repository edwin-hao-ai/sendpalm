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
            id TEXT PRIMARY KEY
         )",
    )
    .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO messages (id, attachments_json) VALUES ('m1', '[\"f1\",\"f2\"]')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO messages (id, attachments_json) VALUES ('m2', '[\"f1\"]')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO messages (id, attachments_json, deleted_at) VALUES ('m3', '[\"f1\"]', '2026-01-01T00:00:00Z')")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO files (id) VALUES ('f1'), ('f2')")
        .execute(&pool).await.unwrap();

    let migration = include_str!("../migrations/0015_file_source_message_ids.sql");
    sqlx::raw_sql(migration).execute(&pool).await.unwrap();

    let f1: String = sqlx::query_scalar("SELECT source_message_ids FROM files WHERE id = 'f1'")
        .fetch_one(&pool).await.unwrap();
    let f2: String = sqlx::query_scalar("SELECT source_message_ids FROM files WHERE id = 'f2'")
        .fetch_one(&pool).await.unwrap();
    let v1: Vec<String> = serde_json::from_str(&f1).unwrap();
    let v2: Vec<String> = serde_json::from_str(&f2).unwrap();
    assert!(v1.contains(&"m1".to_string()));
    assert!(v1.contains(&"m2".to_string()));
    assert!(!v1.contains(&"m3".to_string()));
    assert_eq!(v2, vec!["m1".to_string()]);
}
