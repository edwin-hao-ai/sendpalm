/** LabelPicker — three-state mark computation and write-back semantics.
 *
 *  The picker shows each label as all / some / none across the target
 *  messages (a "some" state is the classic tri-state checkbox). Writing
 *  back must NOT touch "some" labels: they keep whatever each message
 *  already had. Label ids the label table no longer knows about are
 *  preserved on the message. */

import { describe, it, expect } from "vitest";
import { naturalLabelMarks, labelsForMessage } from "./LabelPicker";

describe("naturalLabelMarks", () => {
  it("marks a label all / some / none by coverage", () => {
    const targets = [
      { labels: ["a", "b"] },
      { labels: ["a"] },
      { labels: ["b", "c"] },
    ];
    const marks = naturalLabelMarks(targets, ["a", "b", "c", "d"]);
    expect(marks.get("a")).toBe("some");
    expect(marks.get("b")).toBe("some");
    expect(marks.get("c")).toBe("some");
    expect(marks.get("d")).toBe("none");
  });

  it("marks all when every target carries the label", () => {
    const targets = [{ labels: ["x"] }, { labels: ["x", "y"] }];
    const marks = naturalLabelMarks(targets, ["x", "y"]);
    expect(marks.get("x")).toBe("all");
    expect(marks.get("y")).toBe("some");
  });

  it("marks everything none for an empty target set", () => {
    const marks = naturalLabelMarks([], ["a", "b"]);
    expect(marks.get("a")).toBe("none");
    expect(marks.get("b")).toBe("none");
  });
});

describe("labelsForMessage", () => {
  it("adds 'all', removes 'none', keeps 'some' only when already owned", () => {
    const marks = new Map([
      ["all-label", "all" as const],
      ["some-label", "some" as const],
      ["none-label", "none" as const],
    ]);
    // Owns the some-label and the none-label before write-back.
    const out = labelsForMessage(["some-label", "none-label"], marks);
    expect(out).toContain("all-label");
    expect(out).toContain("some-label");
    expect(out).not.toContain("none-label");
  });

  it("does not add a 'some' label the message did not have", () => {
    const marks = new Map([["some-label", "some" as const]]);
    const out = labelsForMessage([], marks);
    expect(out).not.toContain("some-label");
  });

  it("preserves label ids the label table no longer knows about", () => {
    // A label row deleted from Settings while still attached to a
    // message must survive a picker write-back untouched.
    const marks = new Map([["known", "none" as const]]);
    const out = labelsForMessage(["known", "ghost-label"], marks);
    expect(out).toEqual(["ghost-label"]);
  });
});
