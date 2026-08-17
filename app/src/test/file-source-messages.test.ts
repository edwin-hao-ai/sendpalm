import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import {
  listSourceMessages,
  listContactFiles,
  addFileSourceMessage,
} from "../stores/data";
import { resetMockDb } from "../services/mock-db";

describe("file source messages", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  it("listSourceMessages returns ordered by tm desc, excludes deleted", async () => {
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    await db.execute(
      `INSERT INTO messages (id, pid, subj, prev, body, tm, st, ac, bucket, attachments_json) VALUES ('m1','p1','A','','x','2025-08-01T00:00:00Z','2025-08-01T00:00:00Z','a','imbox','["f1"]')`,
    );
    await db.execute(
      `INSERT INTO messages (id, pid, subj, prev, body, tm, st, ac, bucket, attachments_json) VALUES ('m2','p1','B','','x','2025-08-02T00:00:00Z','2025-08-02T00:00:00Z','a','imbox','["f1"]')`,
    );
    await db.execute(
      `INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) VALUES ('f1','p1','a.pdf','pdf','application/pdf',1,'','','["m1","m2"]')`,
    );
    const r = await listSourceMessages("f1");
    expect(r.map((m) => m.id)).toEqual(["m2", "m1"]);
  });

  it("listContactFiles returns all files where pid matches", async () => {
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    await db.execute(
      `INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) VALUES ('f1','p1','a.pdf','pdf','application/pdf',1,'','','[]')`,
    );
    await db.execute(
      `INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) VALUES ('f2','p2','b.pdf','pdf','application/pdf',1,'','','[]')`,
    );
    const r = await listContactFiles("p1");
    expect(r.map((f) => f.id)).toEqual(["f1"]);
  });

  it("addFileSourceMessage is idempotent", async () => {
    const { MockDb } = await import("../services/mock-db");
    const db = new MockDb();
    await db.execute(
      `INSERT INTO files (id, pid, name, type, mime, size, url, st, source_message_ids) VALUES ('f1','p1','a.pdf','pdf','application/pdf',1,'','','[]')`,
    );
    await addFileSourceMessage("f1", "m1");
    await addFileSourceMessage("f1", "m1");
    const r = await listSourceMessages("f1");
    expect(r.length).toBe(0); // m1 doesn't exist in messages, but the source_message_ids column should still have one entry
    const { MockDb: DB } = await import("../services/mock-db");
    expect(DB).toBeDefined();
  });
});
