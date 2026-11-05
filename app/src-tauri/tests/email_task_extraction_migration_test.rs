use sqlx::sqlite::SqlitePoolOptions;

#[tokio::test]
async fn migration_preserves_legacy_tasks_checks_state_and_cascades_deleted_sources() {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::raw_sql("PRAGMA foreign_keys=ON;
      CREATE TABLE contacts (id TEXT PRIMARY KEY);
      CREATE TABLE messages (id TEXT PRIMARY KEY);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL);
      INSERT INTO tasks VALUES ('legacy','Existing task');
      INSERT INTO messages VALUES ('m');")
        .execute(&pool).await.unwrap();
    sqlx::raw_sql(include_str!("../migrations/0024_email_task_extraction.sql"))
        .execute(&pool).await.unwrap();
    let legacy: (Option<String>, Option<String>) = sqlx::query_as("SELECT related_message_id,direction FROM tasks WHERE id='legacy'").fetch_one(&pool).await.unwrap();
    assert_eq!(legacy, (None, None));
    sqlx::query("INSERT INTO tasks (id,title,related_message_id,direction) VALUES ('linked','Linked task','m','mine')").execute(&pool).await.unwrap();
    assert!(sqlx::query("UPDATE tasks SET direction='unclear'").execute(&pool).await.is_err());
    for state in ["queued", "processing", "pending_review", "no_tasks", "failed", "reviewed", "skipped"] {
        sqlx::query("INSERT INTO task_extraction_runs VALUES ('m',?,'automatic','now','now') ON CONFLICT(source_message_id) DO UPDATE SET state=excluded.state").bind(state).execute(&pool).await.unwrap();
    }
    assert!(sqlx::query("UPDATE task_extraction_runs SET state='invalid'").execute(&pool).await.is_err());
    assert!(sqlx::query("INSERT INTO task_extraction_runs VALUES ('m','queued','manual','now','now')").execute(&pool).await.is_err());
    sqlx::query("INSERT INTO task_suggestions (id,source_message_id,title,priority,direction,status,created_at) VALUES ('s','m','Report','normal','unclear','pending','now')").execute(&pool).await.unwrap();
    assert!(sqlx::query("UPDATE task_suggestions SET status='todo'").execute(&pool).await.is_err());
    sqlx::query("DELETE FROM messages WHERE id='m'").execute(&pool).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM task_suggestions").fetch_one(&pool).await.unwrap();
    assert_eq!(count, 0);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM task_extraction_runs").fetch_one(&pool).await.unwrap();
    assert_eq!(count, 0);
    let source: Option<String> = sqlx::query_scalar("SELECT related_message_id FROM tasks WHERE id='linked'").fetch_one(&pool).await.unwrap();
    assert_eq!(source, None);
}
