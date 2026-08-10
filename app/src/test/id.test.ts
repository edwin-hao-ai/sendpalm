/** ID + JSON helpers tests. */

import { describe, expect, it } from "vitest";
import {
  uid,
  safeParse,
  safeStringify,
  clone,
  arrayBufferToBase64,
} from "../utils/id";

describe("uid", () => {
  it("returns unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uid()));
    expect(ids.size).toBe(100);
  });

  it("uses prefix when given", () => {
    const id = uid("test");
    expect(id).toMatch(/^test_/);
  });
});

describe("safeParse", () => {
  it("parses valid JSON", () => {
    expect(safeParse<{ a: number }>('{"a":1}', { a: 0 })).toEqual({ a: 1 });
  });
  it("returns fallback for invalid JSON", () => {
    expect(safeParse("not-json", { x: 1 })).toEqual({ x: 1 });
  });
  it("returns fallback for empty string", () => {
    expect(safeParse("", null)).toBe(null);
  });
  it("returns fallback for null", () => {
    expect(safeParse(null, [])).toEqual([]);
  });
});

describe("safeStringify", () => {
  it("round-trips", () => {
    const obj = { a: 1, b: [2, 3] };
    expect(JSON.parse(safeStringify(obj))).toEqual(obj);
  });
  it("handles null as 'null'", () => {
    expect(safeStringify(null)).toBe("null");
  });
});

describe("clone", () => {
  it("deep clones", () => {
    const a = { x: 1, y: { z: 2 } };
    const b = clone(a);
    b.y.z = 99;
    expect(a.y.z).toBe(2);
  });

  it("handles arrays", () => {
    const a = [1, 2, [3, 4]];
    const b = clone(a);
    b[2] = [99];
    expect(a[2]).toEqual([3, 4]);
  });
});

describe("arrayBufferToBase64", () => {
  it("encodes text to base64", () => {
    const buf = new TextEncoder().encode("hello").buffer;
    expect(arrayBufferToBase64(buf)).toBe("aGVsbG8=");
  });

  it("encodes binary larger than the chunk size", () => {
    const bytes = new Uint8Array(3000).map((_, i) => i % 256);
    const encoded = arrayBufferToBase64(bytes.buffer);
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(atob(encoded).length).toBe(3000);
  });
});
