import { describe, it, expect } from 'vitest';
import { expandOccurrences, describeRRule } from './calendar-occurrences';
import type { CalendarEvent } from '../types';

function master(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
      id: "evt-1",
      title: "Standup",
      dt: "2026-01-05T09:00:00",
      tm: "09:00",
      pids: [],
      color: "#0A8F63",
      agenda: [],
      notes: "",
      brief: "",
      actionItems: [],
      materials: [],
      ...overrides,
    };
  }

  describe("expandOccurrences", () => {
    it("master alone when no recurrence", () => {
      const occ = expandOccurrences(master(), "2026-01-01", "2026-12-31");
      expect(occ.length).toBe(1);
      expect(occ[0]!.isMaster).toBe(true);
    });

    it("DAILY count yields N+1 occurrences including master", () => {
      const occ = expandOccurrences(
        master({ recurrenceRule: "FREQ=DAILY;COUNT=5" }),
        "2026-01-01",
        "2026-12-31",
      );
      expect(occ.length).toBe(5);
      expect(occ[0]!.isMaster).toBe(true);
      expect(occ[4]!.start).toBe("2026-01-09T09:00:00");
    });

    it("WEEKLY with BYDAY fills in the in-between days", () => {
      // Master Mon Jan 5; MO/WE/FR; INTERVAL=1; COUNT=6
      const occ = expandOccurrences(
        master({ recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6" }),
        "2026-01-01",
        "2026-12-31",
      );
      expect(occ.length).toBe(6);
      // First three are the same week: Mon Jan 5, Wed Jan 7, Fri Jan 9.
      expect(occ[0]!.start).toBe("2026-01-05T09:00:00");
      expect(occ[1]!.start).toBe("2026-01-07T09:00:00");
      expect(occ[2]!.start).toBe("2026-01-09T09:00:00");
    });

    it("EXDATE drops specific occurrences", () => {
      const occ = expandOccurrences(
        master({
          recurrenceRule: "FREQ=DAILY;COUNT=5",
          excludedDates: ["2026-01-07", "2026-01-08"],
        }),
        "2026-01-01",
        "2026-12-31",
      );
      expect(occ.map((o) => o.start)).toEqual([
        "2026-01-05T09:00:00",
        "2026-01-06T09:00:00",
        "2026-01-09T09:00:00",
      ]);
    });

    it("window cuts off occurrences before/after", () => {
      const occ = expandOccurrences(
        master({ recurrenceRule: "FREQ=DAILY;COUNT=30" }),
        "2026-01-10",
        "2026-01-15",
      );
      // Master Jan 5, daily Jan 6..Jan 9 are before the window.
      // Window starts Jan 10: that's day n=5, +5 days from master.
      expect(occ[0]!.start).toBe("2026-01-10T09:00:00");
      expect(occ[occ.length - 1]!.start).toBe("2026-01-15T09:00:00");
    });

    it("MONTHLY lands on the master's day-of-month", () => {
      const occ = expandOccurrences(
        master({ recurrenceRule: "FREQ=MONTHLY;COUNT=3" }),
        "2026-01-01",
        "2026-12-31",
      );
      expect(occ.map((o) => o.start.slice(0, 10))).toEqual([
        "2026-01-05",
        "2026-02-05",
        "2026-03-05",
      ]);
    });

    it("YEARLY steps by 365 days", () => {
      const occ = expandOccurrences(
        master({ recurrenceRule: "FREQ=YEARLY;COUNT=2" }),
        "2026-01-01",
        "2028-12-31",
      );
      expect(occ.map((o) => o.start.slice(0, 10))).toEqual([
        "2026-01-05",
        "2027-01-05",
      ]);
    });

    it("UNKNOWN FREQ falls back to master only", () => {
      const occ = expandOccurrences(
        master({ recurrenceRule: "FREQ=SECONDLY;COUNT=10" }),
        "2026-01-01",
        "2026-12-31",
      );
      expect(occ.length).toBe(1);
      expect(occ[0]!.isMaster).toBe(true);
    });
  });

  describe("describeRRule", () => {
    it("renders a human label", () => {
      expect(describeRRule("FREQ=WEEKLY;BYDAY=MO,WE,FR")).toBe("每周 周一/周三/周五");
    });
    it("renders interval > 1", () => {
      expect(describeRRule("FREQ=MONTHLY;INTERVAL=2")).toBe("每 2 月");
    });
    it("returns null on unknown freq", () => {
      expect(describeRRule("FREQ=SECONDLY;COUNT=5")).toBeNull();
    });
  });
