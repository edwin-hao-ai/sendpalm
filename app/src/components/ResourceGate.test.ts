import { describe, it, expect } from "vitest";
import { isResourceEmpty } from "./ResourceGate";

describe("isResourceEmpty", () => {
  it("treats undefined as non-empty (loading path)", () => {
    expect(isResourceEmpty(undefined)).toBe(false);
    expect(isResourceEmpty<unknown>(null)).toBe(false);
  });

  it("treats empty array as empty", () => {
    expect(isResourceEmpty([])).toBe(true);
    expect(isResourceEmpty<string[]>([])).toBe(true);
  });

  it("treats non-empty array as non-empty", () => {
    expect(isResourceEmpty([1, 2, 3])).toBe(false);
    expect(isResourceEmpty(["a"])).toBe(false);
  });

  it("treats non-array data as non-empty by default", () => {
    expect(isResourceEmpty({ id: 1 })).toBe(false);
    expect(isResourceEmpty(42)).toBe(false);
    expect(isResourceEmpty("hello")).toBe(false);
  });

  it("honours a custom isEmpty predicate", () => {
    const isUserEmpty = (u: { name: string }) => u.name === "";
    expect(isResourceEmpty({ name: "" }, isUserEmpty)).toBe(true);
    expect(isResourceEmpty({ name: "Alice" }, isUserEmpty)).toBe(false);
  });

  it("custom isEmpty on undefined returns false (still loading)", () => {
    const isUserEmpty = (u: { name: string }) => u.name === "";
    expect(isResourceEmpty(undefined, isUserEmpty)).toBe(false);
  });

  it("custom isEmpty on empty array still uses the predicate", () => {
    // The predicate is the override; Array.isArray check is bypassed when
    // isEmpty is supplied.
    const alwaysEmpty = () => true;
    expect(isResourceEmpty([], alwaysEmpty)).toBe(true);
    expect(isResourceEmpty([1, 2], alwaysEmpty)).toBe(true);
  });
});