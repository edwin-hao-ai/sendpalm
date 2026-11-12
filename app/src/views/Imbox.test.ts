import { describe, it, expect } from "vitest";
import { dateBucket, bucketLabel } from "../utils/date";
import { RECENT_UNREAD_CAP } from "../stores/data";
import type { Item } from "./Imbox-helpers";
import {
  groupItemsByDate,
  isImboxListMessage,
  olderUnread,
  readTotal,
} from "./Imbox-helpers";

const today = new Date("2026-08-18T14:00:00Z");

function iso(daysAgo: number, hour = 12): string {
  const d = new Date(today);
  d.setDate(today.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function msgItem(id: string, daysAgo: number) {
  return {
    id,
    pid: "p1",
    subj: "hi",
    prev: "",
    body: "",
    bodyHtml: null,
    tm: iso(daysAgo),
    st: iso(daysAgo),
    ac: "",
    bucket: "imbox" as const,
    direction: "in" as const,
    unread: true,
    labels: [],
    attachments: [],
    trackers: [],
    replyLater: false,
    setAside: false,
    bubbleUpAt: null,
    remindAt: null,
    deletedAt: null,
  };
}

describe("groupItemsByDate", () => {
  it("groups items into date buckets without mutating the items", () => {
    // Regression guard for the previous `Object.assign(item, { _flatIdx })`
    // pattern in Imbox's DateGroupedList. Mutating the SolidJS-tracked
    // message broke reactivity downstream (any createMemo reading the
    // item saw a different identity on every regroup).
    const items: Item[] = [
      msgItem("a", 0),
      msgItem("b", 1),
      msgItem("c", 5),
    ];
    const groups = groupItemsByDate(items, undefined, today);

    // The original item references must be preserved — each item must
    // appear in exactly one group, with the same object identity it had
    // going in. No copying, no re-wrapping.
    const flat: Item[] = groups.flatMap((g) => g.items);
    expect(flat).toHaveLength(items.length);
    for (let i = 0; i < items.length; i++) {
      expect(flat[i]).toBe(items[i]);
    }

    // No item should have a `_flatIdx` property — the old field that the
    // mutation attached.
    for (const it of flat) {
      expect((it as { _flatIdx?: number })._flatIdx).toBeUndefined();
    }
  });

  it("emits a `startIdx` per group so the caller can compute global indices", () => {
    // The Imbox j/k cursor uses a single global index across the whole
    // list (not per-group). The group metadata must carry the offset
    // where each group starts in the flat list.
    const items: Item[] = [
      msgItem("a", 0),
      msgItem("b", 0),
      msgItem("c", 5),
      msgItem("d", 30),
    ];
    const groups = groupItemsByDate(items, undefined, today);

    // First group's startIdx must be 0.
    expect(groups[0]!.startIdx).toBe(0);
    // Subsequent groups must accumulate the previous group's length.
    let running = 0;
    for (const g of groups) {
      expect(g.startIdx).toBe(running);
      running += g.items.length;
    }
  });

  it("produces correct global index when caller adds localIdx to startIdx", () => {
    // Simulates the <For each={group.items}>{(item, localIdx) => children(item, group.startIdx + localIdx())}</For>
    // pattern from DateGroupedList. Verifies the global index is contiguous
    // and never duplicates.
    const items: Item[] = [
      msgItem("a", 0),
      msgItem("b", 0),
      msgItem("c", 5),
      msgItem("d", 30),
      msgItem("e", 30),
    ];
    const groups = groupItemsByDate(items, undefined, today);
    const seen = new Set<number>();
    for (const g of groups) {
      g.items.forEach((_it, localIdx) => {
        const globalIdx = g.startIdx + localIdx;
        expect(seen.has(globalIdx)).toBe(false);
        seen.add(globalIdx);
      });
    }
    expect(seen.size).toBe(items.length);
  });

  it("buckets items by the same dateBucket + bucketLabel rules as the UI", () => {
    // Sanity: the group keys are exactly the labels the user sees
    // (今天 / 昨天 / 本周早些 / 本月早些 / 1月 etc.).
    const items: Item[] = [
      msgItem("a", 0),
      msgItem("b", 1),
      msgItem("c", 5),
      msgItem("d", 90),
    ];
    const groups = groupItemsByDate(items, undefined, today);
    expect(groups.map((g) => g.label)).toEqual([
      bucketLabel(dateBucket(stOf(items[0]!), today)),
      bucketLabel(dateBucket(stOf(items[1]!), today)),
      bucketLabel(dateBucket(stOf(items[2]!), today)),
      bucketLabel(dateBucket(stOf(items[3]!), today)),
    ]);
  });
});

describe("groupItemsByDate — mail date integrity", () => {
  it("groups by server receipt time, not the sender-declared date", () => {
    // Sent a week ago but only arrived today — belongs in 今天.
    const item = {
      ...msgItem("late", 7),
      receivedAt: iso(0),
    };
    const groups = groupItemsByDate([item], undefined, today);
    expect(groups[0]?.label).toBe("今天");
    expect(groups[0]?.items[0]).toBe(item);
  });

  it("groups a bundle by its newest message's receipt time", () => {
    const older = { ...msgItem("b1", 9), receivedAt: iso(9) };
    const newer = { ...msgItem("b2", 0), receivedAt: iso(0) };
    const bundle: Item = {
      contactId: "p1",
      contact: {} as never,
      messages: [newer, older],
    };
    const groups = groupItemsByDate([bundle], undefined, today);
    expect(groups[0]?.label).toBe("今天");
  });

  it("draws day boundaries in the profile timezone", () => {
    // 2026-08-17T22:00:00Z = 2026-08-18T06:00 Shanghai — "today" in
    // Shanghai at 14:00 UTC, already "yesterday" in UTC.
    const item = {
      ...msgItem("tz", 0),
      st: "2026-08-17T22:00:00Z",
      receivedAt: "2026-08-17T22:00:00Z",
    };
    const shanghai = groupItemsByDate([item], "Asia/Shanghai", today);
    expect(shanghai[0]?.label).toBe("今天");
    const utc = groupItemsByDate([item], "UTC", today);
    expect(utc[0]?.label).toBe("昨天");
  });
});

describe("isImboxListMessage", () => {  const base = { setAside: false, replyLater: false, bubbleUpAt: null };

  it("keeps a plain message in the list", () => {
    expect(isImboxListMessage(base)).toBe(true);
  });

  it("drops reply-later messages", () => {
    expect(isImboxListMessage({ ...base, replyLater: true })).toBe(false);
  });

  it("drops set-aside messages", () => {
    expect(isImboxListMessage({ ...base, setAside: true })).toBe(false);
  });

  it("drops bubbled-up reminders even when the time is in the future", () => {
    expect(
      isImboxListMessage({ ...base, bubbleUpAt: "2030-01-01T09:00:00.000Z" }),
    ).toBe(false);
  });

  it("keeps a message whose bubbleUpAt was cleared", () => {
    expect(isImboxListMessage({ ...base, bubbleUpAt: null })).toBe(true);
  });
});

/** Unwrap a date-string from the union type that `Item` resolves to.
 *  The Imbox feed renders single messages OR bundles (3+ from one
 *  sender); in tests we only exercise the single-message case. */
function stOf(item: Item): string {
  if ("messages" in item) return item.messages[0]!.st;
  return item.st;
}

describe("olderUnread / readTotal", () => {
  // 合并列表后头部要同时说「最近 30 天 N 封待读 · 更早 M 封未读 · 已读 K ·
  // 总数 T」。这三个数字来自两次查询和一个相减，任何一侧算错都会让用户
  // 看到一个和自己的列表对不上的头。

  it("subtracts the recent window from the unread total", () => {
    expect(olderUnread(5, 8)).toBe(3);
  });

  it("clamps to zero when the recent count exceeds the total", () => {
    // 两个计数来自两次查询，同步写入时可能短暂不一致。
    expect(olderUnread(9, 8)).toBe(0);
  });

  it("says nothing when the recent count is capped", () => {
    // 上线之后两个数字不再对应，减法就是猜。
    expect(olderUnread(RECENT_UNREAD_CAP, 5000)).toBe(0);
  });

  it("says nothing when the unread total itself is capped", () => {
    // 全量未读也是 LIMIT 限幅查出来的：3,762 封未读只会返回 2000，
    // 减 5 得到的 1995 是个精确到个位的假数字。两侧都要挡。
    expect(olderUnread(5, RECENT_UNREAD_CAP)).toBe(0);
  });

  it("derives the read total", () => {
    expect(readTotal(8, 56)).toBe(48);
  });

  it("never returns a negative read total", () => {
    expect(readTotal(60, 56)).toBe(0);
  });
});
