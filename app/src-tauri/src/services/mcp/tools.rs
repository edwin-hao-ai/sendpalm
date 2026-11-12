//! MCP tool surface — reads over the organized mailbox, writes audited into
//! `agent_audit` with session_id "mcp".
//!
//! v1 deliberately had no send: agents drafted, humans sent (spec 2026-11-03).
//! That is superseded — the product now targets fully agent-operated mail, so
//! `send_email` / `reply_email` / `forward_email` exist and really send. Three
//! guardrails come with them: every send is audited, all of them funnel through
//! one `services::outgoing::send` (no second SMTP path), and
//! Settings → Agent → 「允许 Agent 直接发信」 turns the whole capability off
//! (`SEND_DISABLED` on every call). Still no physical delete.

use sqlx::SqlitePool;

use crate::services::outgoing::{self, SendRequest};

use super::compose;

pub struct ToolDef {
    pub name: &'static str,
    pub description: &'static str,
    pub schema: serde_json::Value,
}

fn obj(properties: serde_json::Value, required: &[&str]) -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": properties,
        "required": required,
    })
}

fn string_prop(desc: &str) -> serde_json::Value {
    serde_json::json!({ "type": "string", "description": desc })
}

pub fn tool_defs() -> Vec<ToolDef> {
    vec![
        ToolDef {
            name: "list_messages",
            description: "列出邮件（不含正文）。可按 bucket、未读、发件人、时间范围过滤；返回按真实收件时间倒序，最多 50 封。",
            schema: obj(
                serde_json::json!({
                    "bucket": { "type": "string", "enum": ["imbox","feed","paperTrail","trash","spam"], "description": "按投递桶过滤" },
                    "unreadOnly": { "type": "boolean", "description": "只返回未读" },
                    "from": { "type": "string", "description": "发件人邮箱包含" },
                    "since": string_prop("ISO 时间，只返回此之后"),
                    "until": string_prop("ISO 时间，只返回此之前"),
                    "limit": { "type": "integer", "description": "默认 20，最多 50" },
                }),
                &[],
            ),
        },
        ToolDef {
            name: "get_message",
            description: "读取单封邮件全文（纯文本正文）。默认不返回 HTML。",
            schema: obj(serde_json::json!({ "id": string_prop("邮件 id") }), &["id"]),
        },
        ToolDef {
            name: "search_messages",
            description: "全文搜索邮件（主题与正文）。",
            schema: obj(
                serde_json::json!({ "query": string_prop("搜索词"), "limit": { "type": "integer" } }),
                &["query"],
            ),
        },
        ToolDef {
            name: "get_contact",
            description: "按邮箱或 id 查询联系人：身份、公司、阶段、历史统计。",
            schema: obj(
                serde_json::json!({ "email": string_prop("邮箱"), "id": string_prop("联系人 id") }),
                &[],
            ),
        },
        ToolDef {
            name: "list_events",
            description: "列出一段时间内的日历事件。",
            schema: obj(
                serde_json::json!({ "since": string_prop("ISO 日期/时间"), "until": string_prop("ISO 日期/时间") }),
                &["since", "until"],
            ),
        },
        ToolDef {
            name: "list_tasks",
            description: "列出未完成任务。",
            schema: obj(serde_json::json!({}), &[]),
        },
        ToolDef {
            name: "list_follow_ups",
            description: "列出待处理的跟进提醒。",
            schema: obj(serde_json::json!({}), &[]),
        },
        ToolDef {
            name: "create_draft",
            description: "创建邮件草稿（不会发送；用户在 SendPalm 中确认后才发出）。支持回复某封邮件。",
            schema: obj(
                serde_json::json!({
                    "to": string_prop("收件人邮箱"),
                    "subject": string_prop("主题"),
                    "body": string_prop("正文（纯文本）"),
                    "cc": { "type": "array", "items": { "type": "string" } },
                    "bcc": { "type": "array", "items": { "type": "string" } },
                    "inReplyTo": string_prop("被回复邮件 id（可选）"),
                }),
                &["to", "subject", "body"],
            ),
        },
        ToolDef {
            name: "create_task",
            description: "创建任务。",
            schema: obj(
                serde_json::json!({
                    "title": string_prop("任务标题"),
                    "notes": string_prop("备注"),
                    "due": string_prop("截止 ISO 时间"),
                    "priority": { "type": "string", "enum": ["low","normal","high"] },
                    "relatedMessageId": string_prop("关联邮件 id"),
                }),
                &["title"],
            ),
        },
        ToolDef {
            name: "create_follow_up",
            description: "为某封邮件创建跟进提醒。",
            schema: obj(
                serde_json::json!({
                    "messageId": string_prop("邮件 id"),
                    "dueAt": string_prop("提醒时间 ISO"),
                    "note": string_prop("备注"),
                }),
                &["messageId", "dueAt"],
            ),
        },
        ToolDef {
            name: "create_clip",
            description: "保存一段文字为 Clip（可关联邮件）。",
            schema: obj(
                serde_json::json!({
                    "text": string_prop("内容"),
                    "messageId": string_prop("关联邮件 id（可选）"),
                }),
                &["text"],
            ),
        },
        ToolDef {
            name: "approve_sender",
            description: "批准一个发件人：通过 Gate 并按 bucket 投递（默认 imbox）。",
            schema: obj(
                serde_json::json!({
                    "email": string_prop("发件人邮箱"),
                    "bucket": { "type": "string", "enum": ["imbox","feed","paperTrail"] },
                }),
                &["email"],
            ),
        },
        ToolDef {
            name: "block_sender",
            description: "屏蔽一个发件人（其邮件进入垃圾邮件）。",
            schema: obj(serde_json::json!({ "email": string_prop("发件人邮箱") }), &["email"]),
        },
        ToolDef {
            name: "send_email",
            description: "发送一封新邮件。会真的通过 SMTP 发出去，不可撤回。正文为纯文本；需要富文本时另给 htmlBody。",
            schema: obj(
                serde_json::json!({
                    "to": string_prop("收件人，多个用逗号分隔"),
                    "subject": string_prop("主题"),
                    "body": string_prop("纯文本正文"),
                    "htmlBody": string_prop("HTML 正文（可选）"),
                    "cc": string_prop("抄送，逗号分隔（可选）"),
                    "bcc": string_prop("密送，逗号分隔（可选）"),
                    "accountId": string_prop("从哪个账户发（可选，默认第一个/测试账户）"),
                    "inReplyTo": string_prop("被回复邮件的 Message-ID（可选）"),
                }),
                &["to", "subject", "body"],
            ),
        },
        ToolDef {
            name: "reply_email",
            description: "回复一封邮件。会真的发出去。收件人自动取原发件人（replyAll 时加上原收件人与抄送，并去掉你自己），主题自动加 Re:，正文默认带原文引用块，并设置 In-Reply-To。",
            schema: obj(
                serde_json::json!({
                    "messageId": string_prop("被回复的邮件 id"),
                    "body": string_prop("你的回复（纯文本，引用会自动附在下面）"),
                    "htmlBody": string_prop("HTML 正文（可选，不传则只发纯文本）"),
                    "replyAll": { "type": "boolean", "description": "回复全部（默认 false）" },
                    "cc": string_prop("额外抄送，逗号分隔（可选）"),
                    "accountId": string_prop("从哪个账户发（可选）"),
                }),
                &["messageId", "body"],
            ),
        },
        ToolDef {
            name: "forward_email",
            description: "转发一封邮件。会真的发出去。主题自动加 Fwd:，正文默认带原文引用块。附件当前不随转发（返回 attachmentsOmitted 告知数量）。",
            schema: obj(
                serde_json::json!({
                    "messageId": string_prop("被转发的邮件 id"),
                    "to": string_prop("收件人，多个用逗号分隔"),
                    "note": string_prop("附言（可选，放在引用之前）"),
                    "cc": string_prop("抄送，逗号分隔（可选）"),
                    "accountId": string_prop("从哪个账户发（可选）"),
                }),
                &["messageId", "to"],
            ),
        },
        ToolDef {
            name: "move_messages",
            description: "批量移动邮件到指定桶（一次最多 50 封；trash/spam 会带过期时间）。",
            schema: obj(
                serde_json::json!({
                    "ids": { "type": "array", "items": { "type": "string" }, "description": "邮件 id 列表，≤50" },
                    "bucket": { "type": "string", "enum": ["imbox","feed","paperTrail","trash","spam"] },
                }),
                &["ids", "bucket"],
            ),
        },
    ]
}

async fn audit(pool: &SqlitePool, kind: &str, payload: &serde_json::Value) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO agent_audit (id, session_id, kind, message, payload, created_at) \
         VALUES ($1, 'mcp', $2, $3, $4, datetime('now'))",
    )
    .bind(format!("mcp_{}", uuid::Uuid::new_v4().simple()))
    .bind(kind)
    .bind(kind)
    .bind(payload.to_string())
    .execute(pool)
    .await
    .map_err(|e| format!("audit write: {e}"))?;
    Ok(())
}

fn arg<'a>(args: &'a serde_json::Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(|v| v.as_str()).filter(|s| !s.is_empty())
}

fn bad_request(msg: &str) -> Result<serde_json::Value, String> {
    Err(format!("INVALID_ARGUMENT: {msg}"))
}

/// Dispatch a tool call. Returns the JSON payload on success; errors are
/// strings prefixed INVALID_ARGUMENT (client-fixable) or a plain message.
pub async fn call_tool(
    pool: &SqlitePool,
    name: &str,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match name {
        "list_messages" => list_messages(pool, &args).await,
        "get_message" => get_message(pool, &args).await,
        "search_messages" => search_messages(pool, &args).await,
        "get_contact" => get_contact(pool, &args).await,
        "list_events" => list_events(pool, &args).await,
        "list_tasks" => list_tasks(pool).await,
        "list_follow_ups" => list_follow_ups(pool).await,
        "create_draft" => create_draft(pool, &args).await,
        "create_task" => create_task(pool, &args).await,
        "create_follow_up" => create_follow_up(pool, &args).await,
        "create_clip" => create_clip(pool, &args).await,
        "approve_sender" => approve_sender(pool, &args).await,
        "block_sender" => block_sender(pool, &args).await,
        "send_email" => send_email(pool, &args).await,
        "reply_email" => reply_email(pool, &args).await,
        "forward_email" => forward_email(pool, &args).await,
        "move_messages" => move_messages(pool, &args).await,
        other => Err(format!("unknown tool: {other}")),
    }
}

/* ── Reads ─────────────────────────────────────────────────────────── */

async fn list_messages(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut sql = String::from(
        "SELECT id, pid, subj, bucket, direction, unread, timeline_at AS timelineAt, ac AS accountId \
         FROM messages WHERE 1=1",
    );
    let mut binds: Vec<String> = Vec::new();
    if let Some(b) = arg(args, "bucket") {
        sql.push_str(" AND bucket = ?");
        binds.push(b.to_string());
    }
    if args.get("unreadOnly").and_then(|v| v.as_bool()).unwrap_or(false) {
        sql.push_str(" AND unread = 1");
    }
    if let Some(f) = arg(args, "from") {
        sql.push_str(" AND pid IN (SELECT id FROM contacts WHERE emails_json LIKE ?)");
        binds.push(format!("%{f}%"));
    }
    if let Some(s) = arg(args, "since") {
        sql.push_str(" AND timeline_at >= ?");
        binds.push(s.to_string());
    }
    if let Some(u) = arg(args, "until") {
        sql.push_str(" AND timeline_at <= ?");
        binds.push(u.to_string());
    }
    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(20)
        .clamp(1, 50);
    sql.push_str(" ORDER BY timeline_at DESC LIMIT ?");
    binds.push(limit.to_string());

    let mut q = sqlx::query_as::<_, (String, String, String, String, String, i64, String, String)>(&sql);
    for b in &binds {
        q = q.bind(b);
    }
    let rows = q.fetch_all(pool).await.map_err(|e| format!("list_messages: {e}"))?;
    let out: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|(id, pid, subj, bucket, direction, unread, timeline_at, account_id)| {
            serde_json::json!({
                "id": id, "contactId": pid, "subject": subj, "bucket": bucket,
                "direction": direction, "unread": unread == 1,
                "timelineAt": timeline_at, "accountId": account_id,
            })
        })
        .collect();
    Ok(serde_json::Value::Array(out))
}

async fn get_message(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let id = arg(args, "id").ok_or_else(|| "INVALID_ARGUMENT: id required".to_string())?;
    let row: Option<(String, String, String, String, i64, String)> =
        sqlx::query_as(
            "SELECT pid, subj, prev, body, unread, timeline_at AS timeline_at \
             FROM messages WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("get_message: {e}"))?;
    let Some((pid, subj, prev, body, unread, timeline_at)) = row else {
        return bad_request("message not found");
    };
    let from: Option<(String, String)> = sqlx::query_as(
        "SELECT name, emails_json FROM contacts WHERE id = ?",
    )
    .bind(&pid)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("get_message contact: {e}"))?;
    let (from_name, from_email) = from
        .map(|(n, e)| {
            let email = serde_json::from_str::<Vec<serde_json::Value>>(&e)
                .ok()
                .and_then(|arr| arr.into_iter().next())
                .and_then(|v| v.get("value").and_then(|x| x.as_str()).map(|s| s.to_string()))
                .unwrap_or_default();
            (n, email)
        })
        .unwrap_or_default();
    Ok(serde_json::json!({
        "id": id,
        "subject": subj,
        "preview": prev,
        "body": body,
        "unread": unread == 1,
        "timelineAt": timeline_at,
        "fromName": from_name,
        "fromEmail": from_email,
    }))
}

async fn search_messages(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let query = arg(args, "query")
        .ok_or_else(|| "INVALID_ARGUMENT: query required".to_string())?;
    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(20)
        .clamp(1, 50);
    let rows = sqlx::query_as::<_, (String, String)>(
        "SELECT m.id, m.subj FROM search_index si \
         JOIN messages m ON m.id = si.id \
         WHERE search_index MATCH ? ORDER BY rank LIMIT ?",
    )
    .bind(query)
    .bind(limit as i64)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("search_messages: {e}"))?;
    Ok(serde_json::Value::Array(
        rows.into_iter()
            .map(|(id, subj)| serde_json::json!({ "id": id, "subject": subj }))
            .collect(),
    ))
}

async fn get_contact(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let row: Option<(String, String, String, String, i64, i64)> = if let Some(email) = arg(args, "email") {
        sqlx::query_as(
            "SELECT id, name, company, stage, screened, blocked FROM contacts WHERE emails_json LIKE ? LIMIT 1",
        )
        .bind(format!("%{email}%"))
        .fetch_optional(pool)
        .await
    } else if let Some(id) = arg(args, "id") {
        sqlx::query_as(
            "SELECT id, name, company, stage, screened, blocked FROM contacts WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    } else {
        return bad_request("email or id required");
    }
    .map_err(|e| format!("get_contact: {e}"))?;
    let Some((id, name, company, stage, screened, blocked)) = row else {
        return Ok(serde_json::Value::Null);
    };
    Ok(serde_json::json!({
        "id": id, "name": name, "company": company, "stage": stage,
        "screened": screened == 1, "blocked": blocked == 1,
    }))
}

async fn list_events(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let (Some(since), Some(until)) = (arg(args, "since"), arg(args, "until"))
    else {
        return bad_request("since and until required");
    };
    let rows = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id, title, dt, tm FROM events WHERE dt >= ? AND dt <= ? ORDER BY dt, tm LIMIT 100",
    )
    .bind(since.get(..10).unwrap_or(since))
    .bind(until.get(..10).unwrap_or(until))
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list_events: {e}"))?;
    Ok(serde_json::Value::Array(
        rows.into_iter()
            .map(|(id, title, dt, tm)| serde_json::json!({ "id": id, "title": title, "date": dt, "time": tm }))
            .collect(),
    ))
}

async fn list_tasks(pool: &SqlitePool) -> Result<serde_json::Value, String> {
    let rows = sqlx::query_as::<_, (String, String, Option<String>, String)>(
        "SELECT id, title, due, status FROM tasks WHERE status != 'done' ORDER BY due IS NULL, due LIMIT 100",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list_tasks: {e}"))?;
    Ok(serde_json::Value::Array(
        rows.into_iter()
            .map(|(id, title, due, status)| serde_json::json!({ "id": id, "title": title, "due": due, "status": status }))
            .collect(),
    ))
}

async fn list_follow_ups(pool: &SqlitePool) -> Result<serde_json::Value, String> {
    let rows = sqlx::query_as::<_, (String, String, String, Option<String>)>(
        "SELECT f.id, f.msg_id, f.due_at, f.note FROM follow_ups f \
         WHERE f.status IN ('pending','todo') ORDER BY f.due_at LIMIT 100",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list_follow_ups: {e}"))?;
    Ok(serde_json::Value::Array(
        rows.into_iter()
            .map(|(id, msg_id, due_at, note)| serde_json::json!({ "id": id, "messageId": msg_id, "dueAt": due_at, "note": note }))
            .collect(),
    ))
}

/* ── Writes (draft-first, audited) ─────────────────────────────────── */

fn basic_email_ok(s: &str) -> bool {
    let Some((local, domain)) = s.split_once('@') else { return false };
    !local.is_empty() && domain.contains('.') && !domain.ends_with('.')
}

async fn first_account_id(pool: &SqlitePool) -> Result<String, String> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT id FROM accounts WHERE type = 'email' LIMIT 1")
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("account lookup: {e}"))?;
    row.map(|(id,)| id)
        .ok_or_else(|| "no email account configured in SendPalm".to_string())
}

async fn create_draft(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let to = arg(args, "to").ok_or_else(|| "INVALID_ARGUMENT: to required".to_string())?;
    if !basic_email_ok(to) {
        return bad_request("invalid to address");
    }
    let subject = arg(args, "subject").unwrap_or("");
    let body = arg(args, "body").unwrap_or("");
    let account_id = first_account_id(pool).await?;
    let id = format!("draft_{}", uuid::Uuid::new_v4().simple());
    let cc = args.get("cc").cloned().unwrap_or(serde_json::json!([]));
    let bcc = args.get("bcc").cloned().unwrap_or(serde_json::json!([]));
    let mut subject = subject.to_string();
    if let Some(in_reply_to) = arg(args, "inReplyTo") {
        sqlx::query("UPDATE messages SET reply_later = 0 WHERE id = ?")
            .bind(in_reply_to)
            .execute(pool)
            .await
            .map_err(|e| format!("create_draft: {e}"))?;
        if !subject.starts_with("Re:") {
            let parent: Option<(String,)> =
                sqlx::query_as("SELECT subj FROM messages WHERE id = ?")
                    .bind(in_reply_to)
                    .fetch_optional(pool)
                    .await
                    .map_err(|e| format!("create_draft: {e}"))?;
            if let Some((parent_subj,)) = parent {
                subject = format!("Re: {parent_subj}");
            }
        }
    }
    sqlx::query(
        "INSERT INTO drafts (id, recipient, subject, body, status, account_id, cc_json, bcc_json) \
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)",
    )
    .bind(&id)
    .bind(to)
    .bind(&subject)
    .bind(body)
    .bind(&account_id)
    .bind(cc.to_string())
    .bind(bcc.to_string())
    .execute(pool)
    .await
    .map_err(|e| format!("create_draft: {e}"))?;
    audit(pool, "mcp.create_draft", &serde_json::json!({ "id": id, "to": to, "subject": subject })).await?;
    Ok(serde_json::json!({ "draftId": id, "status": "draft" }))
}

async fn create_task(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let title = arg(args, "title")
        .ok_or_else(|| "INVALID_ARGUMENT: title required".to_string())?;
    let id = format!("task_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
        "INSERT INTO tasks (id, title, due, status, priority, notes, related_message_id, direction) \
         VALUES (?, ?, ?, 'todo', ?, ?, ?, 'mine')",
    )
    .bind(&id)
    .bind(title)
    .bind(arg(args, "due"))
    .bind(arg(args, "priority").unwrap_or("normal"))
    .bind(arg(args, "notes").unwrap_or(""))
    .bind(arg(args, "relatedMessageId"))
    .execute(pool)
    .await
    .map_err(|e| format!("create_task: {e}"))?;
    audit(pool, "mcp.create_task", &serde_json::json!({ "id": id, "title": title })).await?;
    Ok(serde_json::json!({ "taskId": id }))
}

async fn create_follow_up(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let (Some(message_id), Some(due_at)) = (arg(args, "messageId"), arg(args, "dueAt"))
    else {
        return bad_request("messageId and dueAt required");
    };
    let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM messages WHERE id = ?")
        .bind(message_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("create_follow_up: {e}"))?;
    if exists.is_none() {
        return bad_request("message not found");
    }
    let id = format!("fu_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
        "INSERT INTO follow_ups (id, msg_id, due_at, status, note) VALUES (?, ?, ?, 'pending', ?)",
    )
    .bind(&id)
    .bind(message_id)
    .bind(due_at)
    .bind(arg(args, "note"))
    .execute(pool)
    .await
    .map_err(|e| format!("create_follow_up: {e}"))?;
    audit(pool, "mcp.create_follow_up", &serde_json::json!({ "id": id, "messageId": message_id })).await?;
    Ok(serde_json::json!({ "followUpId": id }))
}

async fn create_clip(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let text = arg(args, "text")
        .ok_or_else(|| "INVALID_ARGUMENT: text required".to_string())?;
    let id = format!("clip_{}", uuid::Uuid::new_v4().simple());
    sqlx::query("INSERT INTO clips (id, text, msg_id, created_at) VALUES (?, ?, ?, datetime('now'))")
        .bind(&id)
        .bind(text)
        .bind(arg(args, "messageId"))
        .execute(pool)
        .await
        .map_err(|e| format!("create_clip: {e}"))?;
    audit(pool, "mcp.create_clip", &serde_json::json!({ "id": id })).await?;
    Ok(serde_json::json!({ "clipId": id }))
}

async fn approve_sender(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let email = arg(args, "email")
        .ok_or_else(|| "INVALID_ARGUMENT: email required".to_string())?;
    let bucket = arg(args, "bucket").unwrap_or("imbox");
    let res = sqlx::query(
        "UPDATE contacts SET screened = 1, first_seen = 0, default_bucket = ? \
         WHERE emails_json LIKE ?",
    )
    .bind(bucket)
    .bind(format!("%{email}%"))
    .execute(pool)
    .await
    .map_err(|e| format!("approve_sender: {e}"))?;
    if res.rows_affected() == 0 {
        return bad_request("sender not found");
    }
    audit(pool, "mcp.approve_sender", &serde_json::json!({ "email": email, "bucket": bucket })).await?;
    Ok(serde_json::json!({ "approved": email, "bucket": bucket }))
}

async fn block_sender(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let email = arg(args, "email")
        .ok_or_else(|| "INVALID_ARGUMENT: email required".to_string())?;
    let res = sqlx::query(
        "UPDATE contacts SET blocked = 1, screened = 1, first_seen = 0 WHERE emails_json LIKE ?",
    )
    .bind(format!("%{email}%"))
    .execute(pool)
    .await
    .map_err(|e| format!("block_sender: {e}"))?;
    if res.rows_affected() == 0 {
        return bad_request("sender not found");
    }
    audit(pool, "mcp.block_sender", &serde_json::json!({ "email": email })).await?;
    Ok(serde_json::json!({ "blocked": email }))
}

const MOVE_BUCKETS: [&str; 5] = ["imbox", "feed", "paperTrail", "trash", "spam"];

async fn move_messages(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let ids: Vec<String> = args
        .get("ids")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    let bucket = arg(args, "bucket").unwrap_or("");
    if ids.is_empty() {
        return bad_request("ids required");
    }
    if ids.len() > 50 {
        return bad_request("at most 50 messages per call");
    }
    if !MOVE_BUCKETS.contains(&bucket) {
        return bad_request("bucket must be one of imbox/feed/paperTrail/trash/spam");
    }
    let deleted_at = match bucket {
        "trash" | "spam" => chrono::Utc::now().to_rfc3339(),
        _ => String::new(),
    };
    let mut moved = 0u64;
    for id in &ids {
        let res = sqlx::query(
            "UPDATE messages SET bucket = ?, deleted_at = NULLIF(?, ''), \
             reply_later = 0, set_aside = 0, bubble_up_at = NULL WHERE id = ?",
        )
        .bind(bucket)
        .bind(&deleted_at)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("move_messages: {e}"))?;
        moved += res.rows_affected();
    }
    audit(
        pool,
        "mcp.move_messages",
        &serde_json::json!({ "count": moved, "bucket": bucket }),
    )
    .await?;
    Ok(serde_json::json!({ "moved": moved, "bucket": bucket }))
}

/* ── Sending ────────────────────────────────────────────────────────── */

/// Everything a reply or forward needs from the stored original.
#[derive(Debug)]
struct Original {
    subject: String,
    body: String,
    /// The account's own addresses (an inbound mail was addressed to us).
    self_addrs: Vec<String>,
    cc_addrs: Vec<String>,
    rfc_message_id: Option<String>,
    account_id: String,
    sender_name: String,
    sender_email: String,
    sent_at: String,
    attachment_count: usize,
}

fn addr_list(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Gate for the whole send capability. Settings → Agent writes
/// `app_settings.agent.allowAgentSend`; absent means allowed.
fn ensure_send_allowed() -> Result<(), String> {
    let dir = crate::services::sync_loop::db_path()
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "SEND_DISABLED: app data dir unavailable".to_string())?;
    if outgoing::agent_send_allowed(&dir) {
        Ok(())
    } else {
        Err("SEND_DISABLED: 设置 → Agent → 「允许 Agent 直接发信」已关闭。请改用 create_draft，由用户在 SendPalm 中发出。".to_string())
    }
}

fn flag(args: &serde_json::Value, key: &str) -> bool {
    args.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

async fn load_original(pool: &SqlitePool, id: &str) -> Result<Original, String> {
    let row: Option<(
        String,
        String,
        String,
        String,
        Option<String>,
        String,
        String,
        String,
        Option<String>,
    )> = sqlx::query_as(
        "SELECT subj, COALESCE(body,''), COALESCE(to_addr,''), COALESCE(cc_json,'[]'), \
                rfc_message_id, COALESCE(ac,''), COALESCE(pid,''), \
                COALESCE(timeline_at, ''), attachments_json \
           FROM messages WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("load message: {e}"))?;
    let Some((subject, body, to_addr, cc_json, rfc_message_id, account_id, pid, sent_at, att_json)) =
        row
    else {
        return Err("INVALID_ARGUMENT: message not found".to_string());
    };

    let sender: Option<(String, String)> =
        sqlx::query_as("SELECT name, emails_json FROM contacts WHERE id = ?")
            .bind(&pid)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("load contact: {e}"))?;
    let (sender_name, sender_email) = sender
        .map(|(n, e)| {
            let first = serde_json::from_str::<Vec<serde_json::Value>>(&e)
                .ok()
                .and_then(|arr| arr.into_iter().next())
                .and_then(|v| {
                    v.get("value")
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            (n, first)
        })
        .unwrap_or_default();

    let cc_addrs = serde_json::from_str::<Vec<String>>(&cc_json).unwrap_or_default();
    let attachment_count = att_json
        .as_deref()
        .and_then(|s| serde_json::from_str::<Vec<serde_json::Value>>(s).ok())
        .map(|v| v.len())
        .unwrap_or(0);

    Ok(Original {
        subject,
        body,
        self_addrs: addr_list(&to_addr),
        cc_addrs,
        rfc_message_id,
        account_id,
        sender_name,
        sender_email,
        sent_at,
        attachment_count,
    })
}

async fn send_email(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    ensure_send_allowed()?;
    let to = arg(args, "to").ok_or_else(|| "INVALID_ARGUMENT: to required".to_string())?;
    let subject =
        arg(args, "subject").ok_or_else(|| "INVALID_ARGUMENT: subject required".to_string())?;
    let body = arg(args, "body").ok_or_else(|| "INVALID_ARGUMENT: body required".to_string())?;

    let out = outgoing::send(SendRequest {
        to: to.to_string(),
        subject: subject.to_string(),
        body: body.to_string(),
        html_body: arg(args, "htmlBody").map(|s| s.to_string()),
        cc: arg(args, "cc").map(|s| s.to_string()),
        bcc: arg(args, "bcc").map(|s| s.to_string()),
        account_id: arg(args, "accountId").map(|s| s.to_string()),
        from_override: None,
        in_reply_to: arg(args, "inReplyTo").map(|s| s.to_string()),
        attachments: Vec::new(),
    })
    .await
    .map_err(|e| format!("send failed: {e}"))?;

    audit(
        pool,
        "mcp.send_email",
        &serde_json::json!({ "to": to, "subject": subject, "messageId": out.message_id }),
    )
    .await?;

    Ok(serde_json::json!({
        "ok": true,
        "sent": true,
        "messageId": out.message_id,
        "localMessageId": out.local_message_id,
    }))
}

/// The reply that *would* be sent. Pure so it can be tested without SMTP —
/// wrong recipients are the failure mode that matters here.
fn build_reply(
    orig: &Original,
    body: &str,
    reply_all: bool,
    html_body: Option<String>,
    extra_cc: Option<String>,
    account_id: Option<String>,
) -> Result<SendRequest, String> {
    let recipients = compose::reply_recipients(
        &orig.sender_email,
        &orig.self_addrs,
        &orig.cc_addrs,
        &orig.self_addrs,
        reply_all,
    );
    if recipients.is_empty() {
        return Err(
            "INVALID_ARGUMENT: could not derive a recipient (only your own address is involved)"
                .to_string(),
        );
    }
    Ok(SendRequest {
        to: recipients.join(", "),
        subject: compose::reply_subject(&orig.subject),
        body: compose::quoted_body(body, &orig.body, &orig.sender_name, &orig.sent_at),
        html_body,
        cc: extra_cc,
        bcc: None,
        account_id: account_id.or_else(|| Some(orig.account_id.clone()).filter(|s| !s.is_empty())),
        from_override: None,
        in_reply_to: orig.rfc_message_id.clone(),
        attachments: Vec::new(),
    })
}

async fn reply_email(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    ensure_send_allowed()?;
    let id = arg(args, "messageId")
        .ok_or_else(|| "INVALID_ARGUMENT: messageId required".to_string())?;
    let body = arg(args, "body").ok_or_else(|| "INVALID_ARGUMENT: body required".to_string())?;
    let orig = load_original(pool, id).await?;

    let req = build_reply(
        &orig,
        body,
        flag(args, "replyAll"),
        arg(args, "htmlBody").map(|s| s.to_string()),
        arg(args, "cc").map(|s| s.to_string()),
        arg(args, "accountId").map(|s| s.to_string()),
    )?;
    let recipients = addr_list(&req.to);
    let subject = req.subject.clone();
    let out = outgoing::send(req)
        .await
        .map_err(|e| format!("reply failed: {e}"))?;

    audit(
        pool,
        "mcp.reply_email",
        &serde_json::json!({
            "inReplyTo": id, "to": recipients, "subject": subject,
            "replyAll": flag(args, "replyAll"), "messageId": out.message_id,
        }),
    )
    .await?;

    Ok(serde_json::json!({
        "ok": true,
        "sent": true,
        "to": recipients,
        "subject": subject,
        "messageId": out.message_id,
        "localMessageId": out.local_message_id,
    }))
}

fn build_forward(
    orig: &Original,
    to: &str,
    note: &str,
    extra_cc: Option<String>,
    account_id: Option<String>,
) -> SendRequest {
    SendRequest {
        to: to.to_string(),
        subject: compose::forward_subject(&orig.subject),
        body: compose::quoted_body(note, &orig.body, &orig.sender_name, &orig.sent_at),
        html_body: None,
        cc: extra_cc,
        bcc: None,
        account_id: account_id.or_else(|| Some(orig.account_id.clone()).filter(|s| !s.is_empty())),
        from_override: None,
        in_reply_to: None,
        attachments: Vec::new(),
    }
}

async fn forward_email(
    pool: &SqlitePool,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    ensure_send_allowed()?;
    let id = arg(args, "messageId")
        .ok_or_else(|| "INVALID_ARGUMENT: messageId required".to_string())?;
    let to = arg(args, "to").ok_or_else(|| "INVALID_ARGUMENT: to required".to_string())?;
    let orig = load_original(pool, id).await?;

    let req = build_forward(
        &orig,
        to,
        arg(args, "note").unwrap_or_default(),
        arg(args, "cc").map(|s| s.to_string()),
        arg(args, "accountId").map(|s| s.to_string()),
    );
    let subject = req.subject.clone();
    let out = outgoing::send(req)
        .await
        .map_err(|e| format!("forward failed: {e}"))?;

    audit(
        pool,
        "mcp.forward_email",
        &serde_json::json!({
            "forwarded": id, "to": to, "subject": subject,
            "attachmentsOmitted": orig.attachment_count, "messageId": out.message_id,
        }),
    )
    .await?;

    Ok(serde_json::json!({
        "ok": true,
        "sent": true,
        "subject": subject,
        "messageId": out.message_id,
        "localMessageId": out.local_message_id,
        // 附件目前不随转发（本地只存远程 URL，没有字节可带）。说清楚，别让
        // agent 以为整封邮件都转过去了。
        "attachmentsOmitted": orig.attachment_count,
        "attachmentsNote": if orig.attachment_count > 0 {
            "原邮件有没有随转发携带的附件，请在 SendPalm 中转发或先下载后手动附上。"
        } else {
            ""
        },
    }))
}

#[cfg(test)]
mod tests;
