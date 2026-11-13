//! Metadata-only date backfill.
//!
//! Legacy rows synced before the sent/received split have no server receipt
//! time. This module repairs them with a bounded, restartable pass per
//! account/folder that fetches ONLY `(UID ENVELOPE INTERNALDATE)` — never
//! message bodies — and updates `messages.sent_at` / `received_at` /
//! `timeline_at` for rows already present locally.
//!
//! The backfill cursor lives in `app_kv` under its own key and must never
//! touch the normal folder sync cursors.

use chrono::{DateTime, Utc};
use futures::Future;
use sqlx::SqlitePool;

/// One row of date metadata for a single UID.
#[derive(Debug, Clone, PartialEq)]
pub struct DateMetadataRow {
    pub uid: u32,
    pub sent_at: Option<DateTime<Utc>>,
    pub received_at: Option<DateTime<Utc>>,
}

/// Maximum UIDs requested per backfill pass — same chunk size as the sync
/// loop so one repair round is cheap even on 4k-message mailboxes.
pub const BACKFILL_CHUNK: u32 = 200;

fn state_key(account_id: &str, folder: &str) -> String {
    format!("date_backfill::{account_id}::{folder}")
}

fn message_id(account_id: &str, folder: &str, uid: u32) -> String {
    let folder_slug = folder.replace(['/', ' '], "_");
    format!("imap_{account_id}_{folder_slug}_{uid}")
}

/// Fetch `(start..=end)` date metadata rows from the injected fetcher and
/// apply them to already-local message rows. Bounded, restartable, and
/// idempotent: rows with a `received_at` value are never rewritten, UIDs
/// with no local row are skipped, and the cursor is persisted after every
/// chunk so a restart resumes instead of redoing work.
///
/// `synced_last_uid` is the folder's normal sync cursor — the backfill only
/// covers messages the sync loop has already stored locally, and it never
/// reads or writes the sync cursor itself.
pub async fn run_date_backfill<F, Fut>(
    pool: &SqlitePool,
    account_id: &str,
    folder: &str,
    synced_last_uid: u32,
    uid_validity: u32,
    mut fetch: F,
) -> Result<u32, String>
where
    F: FnMut(u32, u32) -> Fut,
    Fut: Future<Output = Result<Vec<DateMetadataRow>, String>>,
{
    if synced_last_uid == 0 {
        return Ok(0);
    }
    let key = state_key(account_id, folder);
    let (mut cursor, stored_uv) = load_backfill_cursor(pool, &key).await?;
    if stored_uv != uid_validity {
        // UIDVALIDITY changed → previous UIDs no longer refer to the same
        // messages. Restart the repair pass; the sync cursor is untouched.
        cursor = 0;
    }
    if cursor >= synced_last_uid {
        return Ok(0);
    }

    let mut updated_total = 0u32;
    loop {
        let start = cursor.saturating_add(1).max(1);
        let end = cursor.saturating_add(BACKFILL_CHUNK);
        let rows = fetch(start, end).await?;
        for row in &rows {
            let mid = message_id(account_id, folder, row.uid);
            // Only rows still missing their server date are updated
            // (`received_at IS NULL`), so the pass is idempotent and a
            // re-fetched envelope can never clobber a newer value.
            let result = sqlx::query(
                "UPDATE messages \
                 SET received_at = $2, \
                     sent_at = COALESCE($3, sent_at), \
                     timeline_at = CASE \
                       WHEN $2 IS NOT NULL THEN $2 \
                       ELSE COALESCE($3, timeline_at) \
                     END \
                 WHERE id = $1 AND received_at IS NULL",
            )
            .bind(&mid)
            .bind(row.received_at.map(|d| d.to_rfc3339()))
            .bind(row.sent_at.map(|d| d.to_rfc3339()))
            .execute(pool)
            .await
            .map_err(|e| format!("backfill date uid={}: {e}", row.uid))?;
            updated_total += result.rows_affected() as u32;
        }
        cursor = end.min(synced_last_uid);
        save_backfill_cursor(pool, &key, cursor, uid_validity).await?;
        if cursor >= synced_last_uid {
            break;
        }
    }
    Ok(updated_total)
}

async fn load_backfill_cursor(pool: &SqlitePool, key: &str) -> Result<(u32, u32), String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM app_kv WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("load backfill cursor {key}: {e}"))?;
    let Some((json,)) = row else {
        return Ok((0, 0));
    };
    let value: serde_json::Value = serde_json::from_str(&json).unwrap_or_default();
    let cursor = value.get("cursor").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let uid_validity = value.get("uid_validity").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    Ok((cursor, uid_validity))
}

async fn save_backfill_cursor(
    pool: &SqlitePool,
    key: &str,
    cursor: u32,
    uid_validity: u32,
) -> Result<(), String> {
    let json = serde_json::json!({
        "cursor": cursor,
        "uid_validity": uid_validity,
    });
    sqlx::query(
        "INSERT INTO app_kv (key, value, updated_at) VALUES ($1, $2, datetime('now')) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key)
    .bind(json.to_string())
    .execute(pool)
    .await
    .map_err(|e| format!("save backfill cursor {key}: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn fresh_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(
            "CREATE TABLE app_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
             CREATE TABLE messages (
               id TEXT PRIMARY KEY,
               bucket TEXT NOT NULL DEFAULT 'imbox',
               st TEXT NOT NULL,
               tm TEXT NOT NULL DEFAULT '',
               sent_at TEXT,
               received_at TEXT,
               timeline_at TEXT NOT NULL DEFAULT ''
             );
             INSERT INTO messages (id, st, timeline_at) VALUES
               ('imap_acct1_INBOX_1', '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z'),
               ('imap_acct1_INBOX_2', '2026-01-02T10:00:00Z', '2026-01-02T10:00:00Z'),
               ('imap_acct1_INBOX_3', '2026-01-03T10:00:00Z', '2026-01-03T10:00:00Z'),
               ('local_note', '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z');",
        )
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    fn ts(s: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc)
    }

    fn row(uid: u32, sent: &str, received: &str) -> DateMetadataRow {
        DateMetadataRow {
            uid,
            sent_at: Some(ts(sent)),
            received_at: Some(ts(received)),
        }
    }

    async fn run(
        pool: &SqlitePool,
        synced_last_uid: u32,
        uid_validity: u32,
        fetch: impl FnMut(u32, u32) -> futures::future::Ready<Result<Vec<DateMetadataRow>, String>>,
    ) -> Result<u32, String> {
        run_date_backfill(pool, "acct1", "INBOX", synced_last_uid, uid_validity, fetch).await
    }

    #[tokio::test]
    async fn repairs_existing_rows_and_ignores_local_rows() {
        let pool = fresh_pool().await;
        let updated = run(&pool, 3, 9, |_start, _end| {
            futures::future::ok(vec![
                row(1, "2026-01-01T10:00:00Z", "2026-01-01T10:00:05Z"),
                row(3, "2026-01-03T10:00:00Z", "2026-01-03T10:00:09Z"),
            ])
        })
        .await
        .unwrap();
        assert_eq!(updated, 2);

        let m1: (Option<String>, Option<String>, String) = sqlx::query_as(
            "SELECT sent_at, received_at, timeline_at FROM messages WHERE id='imap_acct1_INBOX_1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(m1.0.as_deref(), Some("2026-01-01T10:00:00+00:00"));
        assert_eq!(m1.1.as_deref(), Some("2026-01-01T10:00:05+00:00"));
        // Timeline now follows the real receipt time.
        assert_eq!(m1.2, "2026-01-01T10:00:05+00:00");

        // UID 2 was not returned by the server — stays legacy, untouched.
        let m2: Option<String> =
            sqlx::query_scalar("SELECT received_at FROM messages WHERE id='imap_acct1_INBOX_2'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(m2, None);

        // Non-IMAP rows are never touched.
        let local: Option<String> =
            sqlx::query_scalar("SELECT received_at FROM messages WHERE id='local_note'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(local, None);
    }

    #[tokio::test]
    async fn empty_chunks_advance_cursor_to_synced_last_uid() {
        let pool = fresh_pool().await;
        let updated = run(&pool, 450, 9, |_start, _end| futures::future::ok(vec![]))
            .await
            .unwrap();
        assert_eq!(updated, 0);
        // Cursor persisted past the synced watermark → next pass is a no-op.
        let (cursor, uv): (u64, u64) = sqlx::query_as(
            "SELECT json_extract(value,'$.cursor'), json_extract(value,'$.uid_validity') \
             FROM app_kv WHERE key='date_backfill::acct1::INBOX'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(cursor >= 450, "cursor must reach the synced watermark");
        assert_eq!(uv, 9);
    }

    #[tokio::test]
    async fn second_run_is_idempotent() {
        let pool = fresh_pool().await;
        let fetch = |_: u32, _: u32| {
            futures::future::ok(vec![row(
                1,
                "2026-01-01T10:00:00Z",
                "2026-01-01T10:00:05Z",
            )])
        };
        let first = run(&pool, 3, 9, fetch).await.unwrap();
        assert_eq!(first, 1);
        let second = run(&pool, 3, 9, fetch).await.unwrap();
        assert_eq!(second, 0, "re-running must not rewrite the same rows");
    }

    #[tokio::test]
    async fn uid_validity_change_resets_only_the_backfill_cursor() {
        let pool = fresh_pool().await;
        // Pretend a previous run made progress under an older UIDVALIDITY.
        sqlx::query(
            "INSERT INTO app_kv (key, value, updated_at) VALUES (
               'date_backfill::acct1::INBOX',
               '{\"cursor\": 500, \"uid_validity\": 3}', 'now')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let updated = run(&pool, 3, 9, |start, _end| {
            assert_eq!(start, 1, "cursor must reset to the beginning");
            futures::future::ok(vec![row(
                1,
                "2026-01-01T10:00:00Z",
                "2026-01-01T10:00:05Z",
            )])
        })
        .await
        .unwrap();
        assert_eq!(updated, 1);
    }

    #[tokio::test]
    async fn already_dated_rows_are_not_overwritten() {
        let pool = fresh_pool().await;
        sqlx::query(
            "UPDATE messages SET sent_at='2026-01-02T10:00:00+00:00',
                    received_at='2026-01-02T10:00:03+00:00',
                    timeline_at='2026-01-02T10:00:03+00:00'
             WHERE id='imap_acct1_INBOX_2'",
        )
        .execute(&pool)
        .await
        .unwrap();
        let updated = run(&pool, 3, 9, |_s, _e| {
            futures::future::ok(vec![row(
                2,
                "2099-01-02T10:00:00Z",
                "2099-01-02T10:00:03Z",
            )])
        })
        .await
        .unwrap();
        assert_eq!(updated, 0, "existing server dates must win");
        let received: String =
            sqlx::query_scalar("SELECT received_at FROM messages WHERE id='imap_acct1_INBOX_2'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(received, "2026-01-02T10:00:03+00:00");
    }

    #[tokio::test]
    async fn rows_without_local_match_are_skipped() {
        let pool = fresh_pool().await;
        let updated = run(&pool, 3, 9, |_s, _e| {
            futures::future::ok(vec![row(
                999,
                "2026-01-01T10:00:00Z",
                "2026-01-01T10:00:05Z",
            )])
        })
        .await
        .unwrap();
        assert_eq!(updated, 0);
    }
}
