//! Schema upkeep that is too expensive to run inside the migration transaction.
//!
//! `Builder::build()` has not created a window yet when the SQL plugin applies
//! migrations, so anything that touches every row of `messages` looks like a
//! hang (migration 0032 rebuilt the search index over 4,515 messages and took
//! 74 s with nothing on screen). Those builds belong here: after the window
//! exists, on a background task, once.
//!
//! Everything in this module is idempotent and safe to run on every boot.

use sqlx::SqlitePool;
use std::time::Instant;

/// `(pid, timeline_at DESC, id, direction)` turns "the newest message from each
/// of these senders" into a covering index scan.
///
/// The Gate screener asks exactly that question for every unscreened sender.
/// Without this index SQLite reaches the table for `id` and `direction`, which
/// means one page fault per message — 3,810 rows over a mailbox whose rows
/// average 90 KB of HTML measured **5.9 s cold** before the two rows per
/// sender that the card actually needs could be picked.
const GATE_QUEUE_INDEX: &str = "idx_messages_pid_timeline";

const GATE_QUEUE_DDL: &str = "CREATE INDEX IF NOT EXISTS idx_messages_pid_timeline \
     ON messages(pid, timeline_at DESC, id, direction)";

async fn index_exists(pool: &SqlitePool, name: &str) -> bool {
    let found: Result<(i64,), sqlx::Error> =
        sqlx::query_as("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?")
            .bind(name)
            .fetch_one(pool)
            .await;
    matches!(found, Ok((n,)) if n > 0)
}

/// Build [`GATE_QUEUE_INDEX`] if it is missing.
///
/// Returns `true` when the index was built by this call. A fresh install has an
/// empty table so this is instant; an existing mailbox pays the build once.
pub async fn ensure_gate_queue_index(pool: &SqlitePool) -> bool {
    if index_exists(pool, GATE_QUEUE_INDEX).await {
        return false;
    }
    let started = Instant::now();
    match sqlx::query(GATE_QUEUE_DDL).execute(pool).await {
        Ok(_) => {
            eprintln!(
                "[sendpalm] built {GATE_QUEUE_INDEX} in {} ms",
                started.elapsed().as_millis()
            );
            true
        }
        // A failure is not fatal: the Gate query still returns the right rows,
        // just slowly, and the next boot retries.
        Err(e) => {
            eprintln!("[sendpalm] could not build {GATE_QUEUE_INDEX}: {e}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let p = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("memory db");
        sqlx::query(
            "CREATE TABLE messages (id TEXT PRIMARY KEY, pid TEXT, timeline_at TEXT, direction TEXT)",
        )
        .execute(&p)
        .await
        .expect("schema");
        p
    }

    #[tokio::test]
    async fn builds_the_index_once() {
        let p = pool().await;
        assert!(ensure_gate_queue_index(&p).await, "first call builds it");
        assert!(
            !ensure_gate_queue_index(&p).await,
            "second call must be a no-op — this runs on every boot"
        );
    }

    /// The whole point of the index is that the queue query stops reaching the
    /// table. If a future edit drops a column from it, this catches that.
    #[tokio::test]
    async fn queue_query_is_covering() {
        let p = pool().await;
        assert!(ensure_gate_queue_index(&p).await);
        let plan: Vec<(i64, i64, i64, String)> = sqlx::query_as(
            "EXPLAIN QUERY PLAN
             SELECT id, pid, direction FROM messages
              WHERE pid IN ('a', 'b') ORDER BY timeline_at DESC",
        )
        .fetch_all(&p)
        .await
        .expect("query plan");
        let text = plan
            .iter()
            .map(|(_, _, _, d)| d.as_str())
            .collect::<Vec<_>>()
            .join(" | ");
        assert!(
            text.contains("COVERING INDEX") && text.contains(GATE_QUEUE_INDEX),
            "Gate queue query is not covered by {GATE_QUEUE_INDEX}: {text}"
        );
    }
}
