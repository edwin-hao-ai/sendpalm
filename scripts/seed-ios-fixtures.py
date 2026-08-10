#!/usr/bin/env python3
"""Seed realistic fixture data into the iOS simulator DB for UI workflow validation."""

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else None
if not DB_PATH:
    print("Usage: seed-ios-fixtures.py <path-to-sendpalm.db>", file=sys.stderr)
    sys.exit(1)

DB_PATH = Path(DB_PATH)
APP_DATA_DIR = DB_PATH.parent
ATTACHMENTS_DIR = APP_DATA_DIR / "attachments"
ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

ACCOUNT_ID = "acct_edwinhao_sendpalm_com"
NOW = datetime.now(timezone.utc)
TODAY = NOW.strftime("%Y-%m-%d")
TODAY_TIME = NOW.strftime("%Y-%m-%d %H:%M")
TODAY_RFC = NOW.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

# Contacts
CONTACTS = [
    {
        "id": "cnt_feishu_team",
        "first_name": "Feishu",
        "last_name": "Team",
        "name": "Feishu Team",
        "company": "Lark",
        "emails_json": json.dumps(["noreply@feishu.cn"]),
        "stage": "lead",
        "first_seen": 0,
        "screened": 1,
        "default_bucket": "imbox",
    },
    {
        "id": "cnt_product_hunt",
        "first_name": "Product",
        "last_name": "Hunt",
        "name": "Product Hunt",
        "company": "Product Hunt",
        "emails_json": json.dumps(["daily@producthunt.com"]),
        "stage": "customer",
        "first_seen": 1,
        "screened": 1,
        "default_bucket": "feed",
    },
    {
        "id": "cnt_edwin_self",
        "first_name": "Edwin",
        "last_name": "Hao",
        "name": "Edwin Hao",
        "company": "SendPalm",
        "emails_json": json.dumps(["edwinhao@sendpalm.com"]),
        "stage": "customer",
        "first_seen": 1,
        "screened": 1,
        "default_bucket": "paperTrail",
    },
]

# Files (attachments) to create on disk + DB
FILES = [
    {
        "id": "att_q4_report",
        "pid": "cnt_feishu_team",
        "name": "Q4_Report.pdf",
        "type": "pdf",
        "mime": "application/pdf",
        "content": b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n114\n%%EOF",
    },
    {
        "id": "att_design_png",
        "pid": "cnt_product_hunt",
        "name": "Design_Mock.png",
        "type": "image",
        "mime": "image/png",
        "content": b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82",
    },
]

# Calendar invite payload for one message
INVITE = {
    "uid": "evt-2026-08-05-review",
    "summary": "Q3 Product Review",
    "dtstart": f"{TODAY}T10:00:00.000Z",
    "dtend": f"{TODAY}T11:00:00.000Z",
    "location": "Conference Room A",
    "description": "Please join the Q3 review.",
}

MESSAGES = [
    {
        "id": "imap_acct_edwinhao_sendpalm_com_INBOX_1001",
        "pid": "cnt_feishu_team",
        "subj": "Your Feishu account is ready",
        "prev": "Welcome to Feishu. Your account edwinhao@sendpalm.com has been activated.",
        "body": "Welcome to Feishu.\n\nYour account edwinhao@sendpalm.com has been activated and is ready to use.\n\nBest,\nFeishu Team",
        "bucket": "imbox",
        "unread": 1,
        "attachments_json": json.dumps(["att_q4_report"]),
    },
    {
        "id": "imap_acct_edwinhao_sendpalm_com_INBOX_1002",
        "pid": "cnt_product_hunt",
        "subj": "Product Hunt Daily: New launches",
        "prev": "Here are today's top launches on Product Hunt.",
        "body": "Here are today's top launches on Product Hunt.\n\n1. SendPalm - A calm email workspace\n2. ...",
        "bucket": "feed",
        "unread": 1,
        "attachments_json": json.dumps(["att_design_png"]),
    },
    {
        "id": "imap_acct_edwinhao_sendpalm_com_INBOX_1003",
        "pid": "cnt_feishu_team",
        "subj": "Invitation: Q3 Product Review",
        "prev": "You are invited to Q3 Product Review on Aug 5, 2026.",
        "body": "Hi Edwin,\n\nYou are invited to the Q3 Product Review.\n\nTime: Aug 5, 2026 10:00-11:00 UTC\nLocation: Conference Room A\n\nPlease let us know if you can make it.",
        "bucket": "imbox",
        "unread": 0,
        "calendar_json": json.dumps(INVITE),
    },
    {
        "id": "imap_acct_edwinhao_sendpalm_com_INBOX_1004",
        "pid": "cnt_edwin_self",
        "subj": "Sent: Welcome to the team",
        "prev": "Welcome to the team!",
        "body": "Welcome to the team!\n\n-Edwin",
        "bucket": "paperTrail",
        "unread": 0,
        "direction": "out",
    },
    {
        "id": "imap_acct_edwinhao_sendpalm_com_INBOX_1005",
        "pid": "cnt_product_hunt",
        "subj": "Reply Later: Collaboration opportunity",
        "prev": "We would love to collaborate with SendPalm.",
        "body": "Hi Edwin,\n\nWe would love to collaborate with SendPalm on a joint launch.\n\nCan we schedule a call?\n\nThanks,\nProduct Hunt Team",
        "bucket": "imbox",
        "unread": 1,
        "reply_later": 1,
    },
    {
        "id": "imap_acct_edwinhao_sendpalm_com_INBOX_1006",
        "pid": "cnt_feishu_team",
        "subj": "Set Aside: Security update",
        "prev": "Important security update for your Feishu account.",
        "body": "Important security update for your Feishu account.\n\nPlease review the attached guidelines.",
        "bucket": "imbox",
        "unread": 0,
        "set_aside": 1,
    },
]

EVENTS = [
    {
        "id": "evt_q3_review",
        "title": "Q3 Product Review",
        "dt": TODAY,
        "tm": "10:00",
        "dur": 60,
        "pids_json": json.dumps(["cnt_feishu_team"]),
        "location": "Conference Room A",
        "notes": "Please join the Q3 review.",
    },
    {
        "id": "evt_design_sync",
        "title": "Design Sync",
        "dt": TODAY,
        "tm": "14:00",
        "dur": 30,
        "pids_json": json.dumps(["cnt_product_hunt"]),
        "location": "Zoom",
        "notes": "Review new mockups.",
    },
]

FOLLOW_UPS = [
    {
        "id": "fu_001",
        "msg_id": "imap_acct_edwinhao_sendpalm_com_INBOX_1005",
        "due_at": (NOW + timedelta(days=2)).isoformat(),
        "status": "pending",
        "note": "Reply to collaboration offer",
    },
]

TASKS = [
    {
        "id": "task_001",
        "title": "Review Q4 report",
        "due": (NOW + timedelta(days=1)).strftime("%Y-%m-%d"),
        "status": "todo",
        "priority": "high",
        "related_contact_id": "cnt_feishu_team",
    },
]


def seed():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    # Ensure account exists
    cur.execute(
        """INSERT OR IGNORE INTO accounts
        (id, type, provider, email, label, display_name, status, synced, total, privacy, color, avatar, last_sync)
        VALUES (?, 'email', 'feishu', 'edwinhao@sendpalm.com', 'Work', 'Edwin Hao', 'connected', 6, 6, 'unified', '#0A8F63', '', ?)
        """,
        (ACCOUNT_ID, TODAY_RFC),
    )

    # Contacts
    for c in CONTACTS:
        cur.execute(
            """INSERT OR REPLACE INTO contacts
            (id, first_name, last_name, nickname, name, company, emails_json, stage, first_seen, screened, default_bucket)
            VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?)
            """,
            (c["id"], c["first_name"], c["last_name"], c["name"], c["company"], c["emails_json"], c["stage"], c["first_seen"], c["screened"], c["default_bucket"]),
        )

    # Files on disk + DB
    for f in FILES:
        file_dir = ATTACHMENTS_DIR / f["id"]
        file_dir.mkdir(parents=True, exist_ok=True)
        file_path = file_dir / f["name"]
        file_path.write_bytes(f["content"])
        relative = f"attachments/{f['id']}/{f['name']}"
        cur.execute(
            """INSERT OR REPLACE INTO files
            (id, pid, name, type, mime, size, url, st, sender)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (f["id"], f["pid"], f["name"], f["type"], f["mime"], len(f["content"]), relative, TODAY_RFC, "sender@example.com"),
        )

    # Messages
    for m in MESSAGES:
        direction = m.get("direction", "in")
        calendar_json = m.get("calendar_json")
        cur.execute(
            """INSERT OR REPLACE INTO messages
            (id, pid, subj, prev, body, tm, st, ac, bucket, unread, labels_json, attachments_json, trackers_json,
             reply_later, set_aside, to_addr, cc_json, bcc_json, thread_id, calendar_json, direction)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, '[]', ?, ?, 'edwinhao@sendpalm.com', '[]', '[]', '', ?, ?)
            """,
            (
                m["id"], m["pid"], m["subj"], m["prev"], m["body"], TODAY_TIME, TODAY_RFC,
                ACCOUNT_ID, m["bucket"], m["unread"], m.get("attachments_json", "[]"),
                m.get("reply_later", 0), m.get("set_aside", 0), calendar_json, direction,
            ),
        )

    # Events
    for e in EVENTS:
        cur.execute(
            """INSERT OR REPLACE INTO events
            (id, title, dt, tm, dur, pids_json, color, location, notes)
            VALUES (?, ?, ?, ?, ?, ?, '#0A8F63', ?, ?)
            """,
            (e["id"], e["title"], e["dt"], e["tm"], e["dur"], e["pids_json"], e["location"], e["notes"]),
        )

    # Follow-ups
    for fu in FOLLOW_UPS:
        cur.execute(
            """INSERT OR REPLACE INTO follow_ups (id, msg_id, due_at, status, note)
            VALUES (?, ?, ?, ?, ?)
            """,
            (fu["id"], fu["msg_id"], fu["due_at"], fu["status"], fu["note"]),
        )

    # Tasks
    for t in TASKS:
        cur.execute(
            """INSERT OR REPLACE INTO tasks (id, title, due, status, priority, related_contact_id, notes)
            VALUES (?, ?, ?, ?, ?, ?, '')
            """,
            (t["id"], t["title"], t["due"], t["status"], t["priority"], t["related_contact_id"]),
        )

    # Rebuild search index for messages
    cur.execute("DELETE FROM search_index WHERE kind = 'message'")
    cur.execute(
        """INSERT INTO search_index (id, kind, title, body)
        SELECT id, 'message', subj, body FROM messages
        """
    )

    conn.commit()
    conn.close()
    print(f"Seeded {len(CONTACTS)} contacts, {len(MESSAGES)} messages, {len(EVENTS)} events, {len(FILES)} files.")
    print(f"Attachments written to {ATTACHMENTS_DIR}")


if __name__ == "__main__":
    seed()
