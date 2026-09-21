import { describe, it, expect } from "vitest";
import { autoLabelNames, followUpStatusLabel } from "./ContactPanel";
import type { Contact, Label } from "../types";

function contactWith(autoLabel: string[]): Contact {
  return { autoLabel } as unknown as Contact;
}

function label(id: string, name: string): Label {
  return { id, name } as unknown as Label;
}

describe("autoLabelNames", () => {
  it("returns an empty string when the contact has no autofile labels", () => {
    expect(autoLabelNames(contactWith([]), [label("l1", "账单")])).toBe("");
  });

  it("joins resolved label names in contact order", () => {
    expect(
      autoLabelNames(contactWith(["l2", "l1"]), [
        label("l1", "账单"),
        label("l2", "订阅"),
      ]),
    ).toBe("订阅, 账单");
  });

  it("drops ids that no longer match a label", () => {
    expect(autoLabelNames(contactWith(["gone", "l1"]), [label("l1", "账单")])).toBe(
      "账单",
    );
  });

  it("tolerates an unresolved label resource", () => {
    expect(autoLabelNames(contactWith(["l1"]), undefined)).toBe("");
  });
});

describe("followUpStatusLabel", () => {
  it("maps internal statuses to user-facing Chinese labels", () => {
    expect(followUpStatusLabel("todo")).toBe("待跟进");
    expect(followUpStatusLabel("wait")).toBe("等待中");
    expect(followUpStatusLabel("done")).toBe("已完成");
  });
});
