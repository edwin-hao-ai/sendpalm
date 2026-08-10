import { describe, it, expect, beforeEach } from "vitest";
import { MockDb, resetMockDb } from "./mock-db";

const db = new MockDb();

beforeEach(() => {
  resetMockDb();
});

describe("MockDb supports frontend data layer queries", () => {
  it("inserts and selects contacts", async () => {
    await db.execute(
      `INSERT INTO contacts (
        id, first_name, last_name, nickname, name, company, title,
        emails_json, phones_json, stage, labels_json, topics_json, notes,
        avatar, photo, health, sc, sc_c, sc_l, lc, grp, trd, pattern,
        accounts_json, stage_history_json, first_contact, milestones_json,
        merged, blocked, notify, first_seen, screened, default_bucket,
        auto_label_json, recycling, ch_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)`,
      [
        "ct-1",
        "E2E",
        "Sender",
        "",
        "E2E Sender",
        "SendPalm",
        "Tester",
        JSON.stringify([{ value: "sender@example.com", label: "work" }]),
        "[]",
        "explore",
        "[]",
        "[]",
        "",
        "",
        "",
        80,
        0,
        "",
        "",
        "",
        "",
        "stable",
        "",
        "[]",
        "[]",
        new Date().toISOString(),
        "[]",
        0,
        0,
        0,
        1,
        0,
        "imbox",
        "[]",
        0,
        "[]",
      ],
    );
    const rows = await db.select<Record<string, unknown>[]>(
      "SELECT * FROM contacts ORDER BY name",
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.name).toBe("E2E Sender");
    expect(rows[0]!.first_seen).toBe(1);
  });

  it("inserts messages and filters by bucket", async () => {
    await db.execute(
      `INSERT INTO messages (id, pid, subj, prev, body, body_html, tm, st, ac, bucket, direction, unread,
        labels_json, attachments_json, trackers_json, reply_later, set_aside, bubble_up_at, remind_at, deleted_at,
        to_addr, cc_json, bcc_json, thread_id, calendar_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
      [
        "msg-1",
        "ct-1",
        "Hello",
        "preview",
        "body",
        null,
        "10:00",
        new Date().toISOString(),
        "acct-1",
        "imbox",
        "in",
        1,
        "[]",
        "[]",
        "[]",
        0,
        0,
        null,
        null,
        null,
        null,
        "[]",
        "[]",
        null,
        null,
      ],
    );
    const rows = await db.select<Record<string, unknown>[]>(
      "SELECT * FROM messages WHERE bucket = $1 ORDER BY st DESC",
      ["imbox"],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.subj).toBe("Hello");
  });

  it("upserts contacts on conflict", async () => {
    await db.execute(
      `INSERT INTO contacts (
        id, first_name, last_name, nickname, name, company, title,
        emails_json, phones_json, stage, labels_json, topics_json, notes,
        avatar, photo, health, sc, sc_c, sc_l, lc, grp, trd, pattern,
        accounts_json, stage_history_json, first_contact, milestones_json,
        merged, blocked, notify, first_seen, screened, default_bucket,
        auto_label_json, recycling, ch_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)`,
      [
        "ct-1",
        "E2E",
        "Sender",
        "",
        "E2E Sender",
        "SendPalm",
        "Tester",
        JSON.stringify([{ value: "sender@example.com", label: "work" }]),
        "[]",
        "explore",
        "[]",
        "[]",
        "",
        "",
        "",
        80,
        0,
        "",
        "",
        "",
        "",
        "stable",
        "",
        "[]",
        "[]",
        new Date().toISOString(),
        "[]",
        0,
        0,
        0,
        1,
        0,
        "imbox",
        "[]",
        0,
        "[]",
      ],
    );
    await db.execute(
      `INSERT INTO contacts (
        id, first_name, last_name, nickname, name, company, title,
        emails_json, phones_json, stage, labels_json, topics_json, notes,
        avatar, photo, health, sc, sc_c, sc_l, lc, grp, trd, pattern,
        accounts_json, stage_history_json, first_contact, milestones_json,
        merged, blocked, notify, first_seen, screened, default_bucket,
        auto_label_json, recycling, ch_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)
      ON CONFLICT(id) DO UPDATE SET
        first_name=excluded.first_name, last_name=excluded.last_name,
        first_seen=excluded.first_seen, screened=excluded.screened`,
      [
        "ct-1",
        "E2E",
        "Sender",
        "",
        "E2E Sender",
        "SendPalm",
        "Tester",
        JSON.stringify([{ value: "sender@example.com", label: "work" }]),
        "[]",
        "explore",
        "[]",
        "[]",
        "",
        "",
        "",
        80,
        0,
        "",
        "",
        "",
        "",
        "stable",
        "",
        "[]",
        "[]",
        new Date().toISOString(),
        "[]",
        0,
        0,
        0,
        0,
        1,
        "imbox",
        "[]",
        0,
        "[]",
      ],
    );
    const rows = await db.select<Record<string, unknown>[]>(
      "SELECT * FROM contacts WHERE id = $1",
      ["ct-1"],
    );
    expect(rows[0]!.first_seen).toBe(0);
    expect(rows[0]!.screened).toBe(1);
  });

  it("updates message bucket", async () => {
    await db.execute(
      `INSERT INTO messages (id, pid, subj, prev, body, body_html, tm, st, ac, bucket, direction, unread,
        labels_json, attachments_json, trackers_json, reply_later, set_aside, bubble_up_at, remind_at, deleted_at,
        to_addr, cc_json, bcc_json, thread_id, calendar_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
      [
        "msg-1",
        "ct-1",
        "Hello",
        "preview",
        "body",
        null,
        "10:00",
        new Date().toISOString(),
        "acct-1",
        "imbox",
        "in",
        1,
        "[]",
        "[]",
        "[]",
        0,
        0,
        null,
        null,
        null,
        null,
        "[]",
        "[]",
        null,
        null,
      ],
    );
    await db.execute(
      "UPDATE messages SET bucket = $1, deleted_at = NULL WHERE id = $2",
      ["paperTrail", "msg-1"],
    );
    const rows = await db.select<Record<string, unknown>[]>(
      "SELECT * FROM messages WHERE id = $1",
      ["msg-1"],
    );
    expect(rows[0]!.bucket).toBe("paperTrail");
  });
});
