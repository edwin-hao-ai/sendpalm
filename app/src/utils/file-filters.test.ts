/** Unit tests for app/src/utils/file-filters.ts (applyFileFilters). */

import { describe, expect, test } from "vitest";
import { applyFileFilters, type FileFilterState } from "./file-filters";
import type { FileItem } from "../types";

const ALL: FileItem[] = [
  {
    id: "f_pdf",
    pid: "c_alice",
    name: "report.pdf",
    type: "pdf",
    mime: "application/pdf",
    size: 2_000_000, // ~2 MB
    st: "2026-08-15T10:00:00Z",
    sourceMessageIds: [],
  },
  {
    id: "f_img",
    pid: "c_bob",
    name: "logo.png",
    type: "image",
    mime: "image/png",
    size: 50_000, // 50 KB
    st: "2026-08-18T10:00:00Z",
    sourceMessageIds: [],
  },
  {
    id: "f_doc",
    pid: "c_alice",
    name: "notes.docx",
    type: "doc",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 80_000,
    st: "2026-07-01T10:00:00Z",
    sourceMessageIds: [],
  },
  {
    id: "f_xls",
    pid: "c_carol",
    name: "budget.xlsx",
    type: "spreadsheet",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 150_000,
    st: "2026-08-10T10:00:00Z",
    sourceMessageIds: [],
  },
];

const EMPTY: FileFilterState = {
  type: "all",
  query: "",
  dateFrom: "",
  dateTo: "",
  senderId: "",
  sizeMinKb: "",
  sizeMaxKb: "",
};

describe("applyFileFilters", () => {
  test("empty filters return everything sorted desc by timestamp", () => {
    const out = applyFileFilters(ALL, EMPTY);
    expect(out.map((f) => f.id)).toEqual([
      "f_img",
      "f_pdf",
      "f_xls",
      "f_doc",
    ]);
  });

  test("type filter narrows by file type", () => {
    const out = applyFileFilters(ALL, { ...EMPTY, type: "pdf" });
    expect(out.map((f) => f.id)).toEqual(["f_pdf"]);
  });

  test("query is case-insensitive substring on name", () => {
    const out = applyFileFilters(ALL, { ...EMPTY, query: "REPORT" });
    expect(out.map((f) => f.id)).toEqual(["f_pdf"]);
  });

  test("dateFrom is inclusive lower bound", () => {
    const out = applyFileFilters(ALL, { ...EMPTY, dateFrom: "2026-08-12" });
    expect(out.map((f) => f.id)).toEqual(["f_img", "f_pdf"]);
  });

  test("dateTo is inclusive upper bound (includes the to-date itself)", () => {
    // Use a dateFrom as well so we don't accidentally include files
    // that legitimately fall before the window.
    const out = applyFileFilters(ALL, {
      ...EMPTY,
      dateFrom: "2026-08-01",
      dateTo: "2026-08-10",
    });
    // budget.xlsx is on 2026-08-10 — must still be included.
    expect(out.map((f) => f.id)).toEqual(["f_xls"]);
  });

  test("date range (both bounds) intersect correctly", () => {
    const out = applyFileFilters(ALL, {
      ...EMPTY,
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });
    expect(out.map((f) => f.id)).toEqual(["f_img", "f_pdf", "f_xls"]);
  });

  test("senderId filter narrows by pid", () => {
    const out = applyFileFilters(ALL, { ...EMPTY, senderId: "c_alice" });
    expect(out.map((f) => f.id)).toEqual(["f_pdf", "f_doc"]);
  });

  test("sizeMinKb / sizeMaxKb filter inclusive by bytes", () => {
    // budget.xlsx is 150 KB → expect it in [100, 200].
    const out = applyFileFilters(ALL, {
      ...EMPTY,
      sizeMinKb: "100",
      sizeMaxKb: "200",
    });
    expect(out.map((f) => f.id)).toEqual(["f_xls"]);
  });

  test("size only min works (no max)", () => {
    const out = applyFileFilters(ALL, { ...EMPTY, sizeMinKb: "100" });
    expect(out.map((f) => f.id)).toEqual(["f_pdf", "f_xls"]);
  });

  test("size only max works (no min)", () => {
    const out = applyFileFilters(ALL, { ...EMPTY, sizeMaxKb: "100" });
    expect(out.map((f) => f.id)).toEqual(["f_img", "f_doc"]);
  });

  test("all filters stack", () => {
    const out = applyFileFilters(ALL, {
      type: "all",
      query: "",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      senderId: "c_alice",
      sizeMinKb: "",
      sizeMaxKb: "",
    });
    expect(out.map((f) => f.id)).toEqual(["f_pdf"]);
  });

  test("input array is not mutated", () => {
    const before = ALL.map((f) => f.id);
    applyFileFilters(ALL, { ...EMPTY, type: "pdf" });
    expect(ALL.map((f) => f.id)).toEqual(before);
  });
});
