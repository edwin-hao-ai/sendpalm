import { describe, expect, it } from "vitest";
import { fileMatchesQuery } from "./Files";
import type { FileItem } from "../types";

function makeFile(name: string, pid = "p1"): FileItem {
  return {
    id: `f-${name}`,
    pid,
    name,
    type: "pdf",
    mime: "application/pdf",
    size: 1024,
    st: "2026-09-01T00:00:00.000Z",
    sourceMessageIds: [],
  };
}

describe("fileMatchesQuery", () => {
  it("matches by file name, case-insensitive", () => {
    expect(fileMatchesQuery(makeFile("Quarterly-Report.pdf"), "quarterly")).toBe(
      true,
    );
    expect(fileMatchesQuery(makeFile("Quarterly-Report.pdf"), "REPORT.PDF")).toBe(
      true,
    );
  });

  it("matches by sender name, case-insensitive", () => {
    const f = makeFile("invoice.pdf");
    expect(fileMatchesQuery(f, "alice", "Alice Wang")).toBe(true);
    expect(fileMatchesQuery(f, "wang", "Alice Wang")).toBe(true);
  });

  it("rejects when neither name nor sender matches", () => {
    const f = makeFile("invoice.pdf");
    expect(fileMatchesQuery(f, "zzz", "Alice Wang")).toBe(false);
  });

  it("matches everything on an empty or blank query", () => {
    const f = makeFile("invoice.pdf");
    expect(fileMatchesQuery(f, "")).toBe(true);
    expect(fileMatchesQuery(f, "   ")).toBe(true);
  });

  it("tolerates a missing sender name", () => {
    const f = makeFile("invoice.pdf");
    expect(fileMatchesQuery(f, "alice", undefined)).toBe(false);
    expect(fileMatchesQuery(f, "invoice", undefined)).toBe(true);
  });
});
