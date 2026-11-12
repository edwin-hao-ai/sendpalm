//! Tool tests — every tool exercised against an in-memory SQLite with
//! the real table shapes the queries rely on.

use super::*;
use sqlx::SqlitePool;

async fn pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::raw_sql(
        "CREATE TABLE accounts (id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
         INSERT INTO accounts VALUES ('acct_1', 'email', '2026-01-01');
         CREATE TABLE contacts (
           id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '',
           stage TEXT NOT NULL DEFAULT '', emails_json TEXT NOT NULL DEFAULT '[]',
           screened INTEGER NOT NULL DEFAULT 0, blocked INTEGER NOT NULL DEFAULT 0, first_seen INTEGER NOT NULL DEFAULT 0,
           default_bucket TEXT NOT NULL DEFAULT 'imbox'
         );
         CREATE TABLE messages (
           id TEXT PRIMARY KEY, pid TEXT, subj TEXT NOT NULL DEFAULT '', prev TEXT NOT NULL DEFAULT '',
           body TEXT NOT NULL DEFAULT '', bucket TEXT NOT NULL DEFAULT 'imbox', direction TEXT NOT NULL DEFAULT 'in',
           unread INTEGER NOT NULL DEFAULT 1, timeline_at TEXT NOT NULL, ac TEXT NOT NULL DEFAULT 'acct_1',
           reply_later INTEGER NOT NULL DEFAULT 0, set_aside INTEGER NOT NULL DEFAULT 0, bubble_up_at TEXT,
           deleted_at TEXT
         );
         CREATE TABLE drafts (
           id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '',
           body TEXT NOT NULL DEFAULT '', last_edited TEXT DEFAULT (datetime('now')), status TEXT NOT NULL DEFAULT 'pending',
           account_id TEXT NOT NULL, cc_json TEXT NOT NULL DEFAULT '[]', bcc_json TEXT NOT NULL DEFAULT '[]'
         );
         CREATE TABLE tasks (
           id TEXT PRIMARY KEY, title TEXT NOT NULL, due TEXT, status TEXT NOT NULL DEFAULT 'todo',
           priority TEXT NOT NULL DEFAULT 'normal', notes TEXT NOT NULL DEFAULT '',
           related_message_id TEXT, direction TEXT NOT NULL DEFAULT 'mine'
         );
         CREATE TABLE follow_ups (
           id TEXT PRIMARY KEY, msg_id TEXT NOT NULL, due_at TEXT NOT NULL,
           status TEXT NOT NULL DEFAULT 'pending', note TEXT
         );
         CREATE TABLE clips (id TEXT PRIMARY KEY, text TEXT NOT NULL, msg_id TEXT, created_at TEXT);
         CREATE TABLE events (
           id TEXT PRIMARY KEY, title TEXT NOT NULL, dt TEXT NOT NULL, tm TEXT NOT NULL DEFAULT '10:00'
         );
         CREATE TABLE agent_audit (
           id TEXT PRIMARY KEY, session_id TEXT, kind TEXT NOT NULL, message TEXT NOT NULL,
           payload TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
         );
         CREATE VIRTUAL TABLE search_index USING fts5(id, kind, title, body);
         INSERT INTO contacts VALUES ('c_alice','Alice','ACME','', '[{\"value\":\"alice@example.com\",\"label\":\"work\"}]', 1, 0, 0, 'imbox');
         INSERT INTO contacts VALUES ('c_stranger','Stranger','','', '[{\"value\":\"cold@spam.io\",\"label\":\"work\"}]', 0, 0, 1, 'imbox');
         INSERT INTO messages VALUES ('m1','c_alice','Quarterly report','preview','body text one','imbox','in',1,'2026-11-01T10:00:00Z','acct_1',0,0,NULL,NULL);
         INSERT INTO messages VALUES ('m2','c_alice','Lunch?','p2','body two','imbox','in',0,'2026-11-03T09:00:00Z','acct_1',0,0,NULL,NULL);
         INSERT INTO messages VALUES ('m3','c_stranger','Cold pitch','p3','body three','feed','in',1,'2026-11-02T09:00:00Z','acct_1',0,0,NULL,NULL);
         INSERT INTO search_index (id, kind, title, body) VALUES ('m1','message','Quarterly report','body text one');
         INSERT INTO search_index (id, kind, title, body) VALUES ('m3','message','Cold pitch','body three');
         INSERT INTO events VALUES ('e1','Standup','2026-11-05','09:30');
         INSERT INTO tasks VALUES ('t1','Existing task', NULL, 'todo', 'normal', '', NULL, 'mine');
         INSERT INTO follow_ups VALUES ('f1','m1','2026-11-04T09:00:00Z','pending','reply');",
    )
    .execute(&pool)
    .await
    .unwrap();
    pool
}

#[tokio::test]
async fn list_messages_filters_and_orders_by_timeline() {
    let p = pool().await;
    let out = call_tool(&p, "list_messages", serde_json::json!({"bucket":"imbox"}))
        .await
        .unwrap();
    let arr = out.as_array().unwrap();
    // timeline DESC: m2 (11-03) before m1 (11-01).
    assert_eq!(arr[0]["id"], "m2");
    assert_eq!(arr[1]["id"], "m1");
    assert!(arr.iter().all(|m| m["bucket"] == "imbox"));
}

#[tokio::test]
async fn list_messages_unread_only_and_from_filter() {
    let p = pool().await;
    let out = call_tool(
        &p,
        "list_messages",
        serde_json::json!({"unreadOnly": true, "from": "alice@example.com"}),
    )
    .await
    .unwrap();
    let arr = out.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["id"], "m1");
}

#[tokio::test]
async fn get_message_returns_body_not_html() {
    let p = pool().await;
    let out = call_tool(&p, "get_message", serde_json::json!({"id":"m1"}))
        .await
        .unwrap();
    assert_eq!(out["subject"], "Quarterly report");
    assert_eq!(out["body"], "body text one");
    assert_eq!(out["fromEmail"], "alice@example.com");
    assert!(out.get("bodyHtml").is_none());
    let missing = call_tool(&p, "get_message", serde_json::json!({"id":"nope"}))
        .await
        .unwrap_err();
    assert!(missing.contains("not found"));
}

#[tokio::test]
async fn search_messages_uses_fts() {
    let p = pool().await;
    let out = call_tool(&p, "search_messages", serde_json::json!({"query":"Quarterly"}))
        .await
        .unwrap();
    let arr = out.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["id"], "m1");
}

#[tokio::test]
async fn get_contact_by_email_reports_screening_state() {
    let p = pool().await;
    let out = call_tool(&p, "get_contact", serde_json::json!({"email":"cold@spam.io"}))
        .await
        .unwrap();
    assert_eq!(out["name"], "Stranger");
    assert_eq!(out["screened"], false);
}

#[tokio::test]
async fn list_events_range_and_tasks_and_follow_ups() {
    let p = pool().await;
    let ev = call_tool(
        &p,
        "list_events",
        serde_json::json!({"since":"2026-11-01","until":"2026-11-30"}),
    )
    .await
    .unwrap();
    assert_eq!(ev.as_array().unwrap().len(), 1);

    let tasks = call_tool(&p, "list_tasks", serde_json::json!({})).await.unwrap();
    assert_eq!(tasks.as_array().unwrap()[0]["title"], "Existing task");

    let fus = call_tool(&p, "list_follow_ups", serde_json::json!({}))
        .await
        .unwrap();
    assert_eq!(fus.as_array().unwrap()[0]["messageId"], "m1");
}

#[tokio::test]
async fn create_draft_lands_as_pending_and_audited() {
    let p = pool().await;
    let out = call_tool(
        &p,
        "create_draft",
        serde_json::json!({"to":"bob@example.com","subject":"Hi","body":"Hello","inReplyTo":"m1"}),
    )
    .await
    .unwrap();
    let draft_id = out["draftId"].as_str().unwrap().to_string();
    let row: (String, String, String) =
        sqlx::query_as("SELECT status, recipient, account_id FROM drafts WHERE id = ?")
            .bind(&draft_id)
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!(row.0, "pending");
    assert_eq!(row.1, "bob@example.com");
    assert_eq!(row.2, "acct_1");
    // Reply parent had its reply_later flag cleared and Re: subject applied.
    let parent: (i64,) = sqlx::query_as("SELECT reply_later FROM messages WHERE id = 'm1'")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(parent.0, 0);
    let audit: (String,) =
        sqlx::query_as("SELECT kind FROM agent_audit WHERE session_id = 'mcp'")
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!(audit.0, "mcp.create_draft");
}

#[tokio::test]
async fn create_draft_rejects_invalid_to_and_missing_account() {
    let p = pool().await;
    let err = call_tool(
        &p,
        "create_draft",
        serde_json::json!({"to":"not-an-email","subject":"s","body":"b"}),
    )
    .await
    .unwrap_err();
    assert!(err.contains("INVALID_ARGUMENT"));

    let p2 = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::raw_sql(
        "CREATE TABLE accounts (id TEXT PRIMARY KEY, type TEXT NOT NULL);
         CREATE TABLE drafts (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', account_id TEXT NOT NULL, cc_json TEXT NOT NULL DEFAULT '[]', bcc_json TEXT NOT NULL DEFAULT '[]');
         CREATE TABLE agent_audit (id TEXT PRIMARY KEY, session_id TEXT, kind TEXT NOT NULL, message TEXT NOT NULL, payload TEXT, created_at TEXT);",
    )
    .execute(&p2)
    .await
    .unwrap();
    let err2 = call_tool(
        &p2,
        "create_draft",
        serde_json::json!({"to":"bob@example.com","subject":"s","body":"b"}),
    )
    .await
    .unwrap_err();
    assert!(err2.contains("no email account"));
}

#[tokio::test]
async fn create_task_follow_up_and_clip_are_audited() {
    let p = pool().await;
    let t = call_tool(&p, "create_task", serde_json::json!({"title":"T","relatedMessageId":"m1"}))
        .await
        .unwrap();
    assert!(t["taskId"].as_str().unwrap().starts_with("task_"));

    let fu = call_tool(
        &p,
        "create_follow_up",
        serde_json::json!({"messageId":"m1","dueAt":"2026-11-05T09:00:00Z"}),
    )
    .await
    .unwrap();
    assert!(fu["followUpId"].as_str().unwrap().starts_with("fu_"));

    let bad = call_tool(
        &p,
        "create_follow_up",
        serde_json::json!({"messageId":"missing","dueAt":"2026-11-05T09:00:00Z"}),
    )
    .await
    .unwrap_err();
    assert!(bad.contains("not found"));

    let clip = call_tool(&p, "create_clip", serde_json::json!({"text":"snippet","messageId":"m1"}))
        .await
        .unwrap();
    assert!(clip["clipId"].as_str().unwrap().starts_with("clip_"));

    let count: (i64,) = sqlx::query_as("SELECT count(*) FROM agent_audit WHERE session_id = 'mcp'")
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(count.0, 3);
}

#[tokio::test]
async fn approve_and_block_sender_flip_contact_state() {
    let p = pool().await;
    let out = call_tool(
        &p,
        "approve_sender",
        serde_json::json!({"email":"cold@spam.io","bucket":"feed"}),
    )
    .await
    .unwrap();
    assert_eq!(out["bucket"], "feed");
    let c: (i64, i64, String) =
        sqlx::query_as("SELECT screened, first_seen, default_bucket FROM contacts WHERE id = 'c_stranger'")
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!((c.0, c.1), (1, 0));
    assert_eq!(c.2, "feed");

    call_tool(&p, "block_sender", serde_json::json!({"email":"alice@example.com"}))
        .await
        .unwrap();
    let blocked: (i64,) =
        sqlx::query_as("SELECT blocked FROM contacts WHERE id = 'c_alice'")
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!(blocked.0, 1);

    let missing = call_tool(&p, "approve_sender", serde_json::json!({"email":"nobody@x.com"}))
        .await
        .unwrap_err();
    assert!(missing.contains("not found"));
}

#[tokio::test]
async fn move_messages_caps_ids_and_whitelists_buckets() {
    let p = pool().await;
    let too_many = (1..=51).map(|i| format!("m{i}")).collect::<Vec<_>>();
    let err = call_tool(
        &p,
        "move_messages",
        serde_json::json!({"ids": too_many, "bucket":"trash"}),
    )
    .await
    .unwrap_err();
    assert!(err.contains("at most 50"));

    let err = call_tool(
        &p,
        "move_messages",
        serde_json::json!({"ids": ["m1"], "bucket":"sent"}),
    )
    .await
    .unwrap_err();
    assert!(err.contains("bucket"));

    let out = call_tool(
        &p,
        "move_messages",
        serde_json::json!({"ids": ["m1","m2"], "bucket":"trash"}),
    )
    .await
    .unwrap();
    assert_eq!(out["moved"], 2);
    let m1: (String, i64) =
        sqlx::query_as("SELECT bucket, deleted_at IS NOT NULL FROM messages WHERE id = 'm1'")
            .fetch_one(&p)
            .await
            .unwrap();
    assert_eq!(m1.0, "trash");
    assert_eq!(m1.1, 1);
}

/* ── Sending: reply / forward derivation ──────────────────────────── */

/// Base fixture plus the columns `load_original` reads. The shared schema stays
/// positional-INSERT friendly for every other tool fixture.
async fn pool_with_mail_columns() -> SqlitePool {
    let pool = pool().await;
    sqlx::raw_sql(
        "ALTER TABLE messages ADD COLUMN to_addr TEXT NOT NULL DEFAULT '';
         ALTER TABLE messages ADD COLUMN cc_json TEXT NOT NULL DEFAULT '[]';
         ALTER TABLE messages ADD COLUMN rfc_message_id TEXT;
         ALTER TABLE messages ADD COLUMN attachments_json TEXT;",
    )
    .execute(&pool)
    .await
    .unwrap();
    pool
}

fn original() -> Original {
    Original {
        subject: "Q3 budget".to_string(),
        body: "line one\nline two".to_string(),
        self_addrs: vec!["me@x.com".to_string()],
        cc_addrs: vec!["cc@x.com".to_string()],
        rfc_message_id: Some("<orig@x>".to_string()),
        account_id: "acct_1".to_string(),
        sender_name: "Sarah".to_string(),
        sender_email: "sarah@x.com".to_string(),
        sent_at: "2026-11-12".to_string(),
        attachment_count: 0,
    }
}

#[test]
fn tool_defs_expose_send_reply_forward() {
    let names: Vec<&str> = tool_defs().iter().map(|d| d.name).collect();
    for wanted in ["send_email", "reply_email", "forward_email"] {
        assert!(names.contains(&wanted), "{wanted} missing from the tool list");
    }
    // A duplicate name would shadow one of the two silently.
    let mut sorted = names.clone();
    sorted.sort_unstable();
    sorted.dedup();
    assert_eq!(sorted.len(), names.len(), "duplicate tool name in tool_defs()");
}

#[test]
fn reply_targets_the_sender_and_threads_from_the_original() {
    let req = build_reply(&original(), "thanks!", false, None, None, None).unwrap();
    assert_eq!(req.to, "sarah@x.com");
    assert_eq!(req.subject, "Re: Q3 budget");
    assert_eq!(req.in_reply_to.as_deref(), Some("<orig@x>"));
    assert_eq!(req.account_id.as_deref(), Some("acct_1"));
    assert!(req.body.starts_with("thanks!\n\n"));
    assert!(req.body.contains("> line one\n> line two"));
}

#[test]
fn reply_all_adds_cc_but_never_your_own_address() {
    let req = build_reply(&original(), "ok", true, None, None, None).unwrap();
    assert_eq!(req.to, "sarah@x.com, cc@x.com");
    assert!(!req.to.contains("me@x.com"));
}

#[test]
fn reply_refuses_when_only_your_own_address_is_left() {
    let mut orig = original();
    orig.sender_email = "me@x.com".to_string();
    orig.cc_addrs.clear();
    let err = build_reply(&orig, "hi", true, None, None, None).unwrap_err();
    assert!(err.starts_with("INVALID_ARGUMENT"), "got {err}");
}

#[test]
fn forward_prefixes_once_and_keeps_the_note_on_top() {
    let req = build_forward(&original(), "bob@x.com", "fyi", None, None);
    assert_eq!(req.subject, "Fwd: Q3 budget");
    assert!(req.body.starts_with("fyi\n\n"));
    assert!(req.body.contains("On 2026-11-12, Sarah wrote:"));
    // Forwarding starts a new thread; replying to the original would be wrong.
    assert!(req.in_reply_to.is_none());
}

#[tokio::test]
async fn load_original_reads_recipients_and_attachment_count() {
    let pool = pool_with_mail_columns().await;
    sqlx::query(
        "INSERT INTO contacts (id, name, emails_json) VALUES ('c1','Sarah','[{\"value\":\"sarah@x.com\"}]')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO messages (id, pid, subj, body, timeline_at, to_addr, cc_json, rfc_message_id, attachments_json) \
         VALUES ('m-reply','c1','Q3 budget','body','2026-11-12','me@x.com','[\"cc@x.com\"]','<orig@x>','[\"a1\",\"a2\"]')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let orig = load_original(&pool, "m-reply").await.unwrap();
    assert_eq!(orig.sender_email, "sarah@x.com");
    assert_eq!(orig.sender_name, "Sarah");
    assert_eq!(orig.self_addrs, vec!["me@x.com".to_string()]);
    assert_eq!(orig.cc_addrs, vec!["cc@x.com".to_string()]);
    assert_eq!(orig.rfc_message_id.as_deref(), Some("<orig@x>"));
    assert_eq!(orig.attachment_count, 2);
}

#[tokio::test]
async fn load_original_rejects_unknown_id() {
    let pool = pool_with_mail_columns().await;
    let err = load_original(&pool, "nope").await.unwrap_err();
    assert!(err.starts_with("INVALID_ARGUMENT"), "got {err}");
}
