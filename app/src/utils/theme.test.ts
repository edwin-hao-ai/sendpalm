/** Appearance helpers — alpha derivation and the choice lists. */

import { describe, expect, it } from "vitest";
import { ACCENT_CHOICES, DENSITY_LABEL, withAlpha } from "./theme";

describe("withAlpha", () => {
  it("appends an alpha byte to a 6-digit hex", () => {
    expect(withAlpha("#0a8f63", 0.1)).toBe("#0a8f631a");
    expect(withAlpha("#000000", 0)).toBe("#00000000");
    expect(withAlpha("#ffffff", 1)).toBe("#ffffffff");
  });

  it("accepts a hex without the leading #", () => {
    expect(withAlpha("2f6feb", 0.18)).toBe("#2f6feb2e");
  });

  it("falls back to the brand green for a corrupt value", () => {
    // A bad persisted setting must never make the UI transparent.
    expect(withAlpha("not-a-colour", 0.1)).toBe("#0a8f631a");
    expect(withAlpha("", 0.18)).toBe("#0a8f632e");
  });

  it("clamps out-of-range alpha", () => {
    expect(withAlpha("#0a8f63", 2)).toBe("#0a8f63ff");
    expect(withAlpha("#0a8f63", -1)).toBe("#0a8f6300");
  });
});

describe("choices", () => {
  it("offers three densities, standard included", () => {
    expect(Object.keys(DENSITY_LABEL)).toEqual([
      "compact",
      "standard",
      "comfortable",
    ]);
  });

  it("starts with the brand green so the default is a real option", () => {
    expect(ACCENT_CHOICES[0]?.value).toBe("#0a8f63");
    expect(ACCENT_CHOICES.length).toBeGreaterThanOrEqual(3);
  });
});
