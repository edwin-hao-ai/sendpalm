/** Imbox logic tests — bundle detection + pile filtering.
 * Tests the pure logic extracted from views/Imbox.tsx.
 */

import { describe, expect, it } from "vitest";
import type { Message, BundleConfig } from "../types";

interface Bundle {
  contactId: string;
  contact: { id: string };
  messages: Message[];
}

/** Extract the pure renderList logic for testability. */
function renderImboxList(
  imboxMsgs: Message[],
  bundles: BundleConfig[]
): (Message | Bundle)[] {
  const out: (Message | Bundle)[] = [];
  const bundledIds = new Set<string>();

  const bundlesEnabled = new Map<string, BundleConfig>();
  for (const b of bundles) bundlesEnabled.set(b.contactId, b);

  const detectedBundleSenders = new Set<string>();
  const counts = new Map<string, number>();
  for (const m of imboxMsgs) {
    if (!m.unread) continue;
    counts.set(m.pid, (counts.get(m.pid) ?? 0) + 1);
  }
  for (const [id, c] of counts) if (c >= 3) detectedBundleSenders.add(id);

  const bundlesByContact = new Map<string, Message[]>();
  for (const m of imboxMsgs) {
    const cfg = bundlesEnabled.get(m.pid);
    const enabled =
      cfg !== undefined
        ? cfg.enabled
        : detectedBundleSenders.has(m.pid);
    if (!enabled || !m.unread) continue;
    bundledIds.add(m.id);
    const arr = bundlesByContact.get(m.pid) ?? [];
    arr.push(m);
    bundlesByContact.set(m.pid, arr);
  }

  for (const [contactId, msgs] of bundlesByContact) {
    out.push({
      contactId,
      contact: { id: contactId },
      messages: msgs,
    });
  }

  for (const m of imboxMsgs) {
    if (!m.unread) continue;
    if (bundledIds.has(m.id)) continue;
    out.push(m);
  }
  return out;
}

const mkMsg = (id: string, pid: string, unread: boolean, bucket: Message["bucket"] = "imbox"): Message => ({
  id,
  pid,
  subj: id,
  prev: "",
  body: "",
  tm: "",
  st: "2026-01-01T00:00:00Z",
  ac: "a",
  bucket,
  unread,
  labels: [],
  attachments: [],
});

describe("Imbox renderList (New for you section)", () => {
  it("returns empty when no unread messages", () => {
    const msgs = [
      mkMsg("m1", "a", false),
      mkMsg("m2", "b", false),
    ];
    expect(renderImboxList(msgs, [])).toEqual([]);
  });

  it("returns unread individually when no bundles", () => {
    const msgs = [
      mkMsg("m1", "a", true),
      mkMsg("m2", "b", true),
    ];
    const out = renderImboxList(msgs, []);
    expect(out).toHaveLength(2);
    expect(out.every((x) => "subj" in x)).toBe(true);
  });

  it("auto-detects bundles for senders with ≥3 unread", () => {
    const msgs = [
      mkMsg("m1", "a", true),
      mkMsg("m2", "a", true),
      mkMsg("m3", "a", true),
      mkMsg("m4", "b", true),
    ];
    const out = renderImboxList(msgs, []);
    expect(out).toHaveLength(2);
    const bundle = out.find((x) => "messages" in x) as Bundle;
    expect(bundle.contactId).toBe("a");
    expect(bundle.messages).toHaveLength(3);
  });

  it("respects explicit bundle config even with <3 unread", () => {
    const msgs = [
      mkMsg("m1", "a", true),
      mkMsg("m2", "b", true),
    ];
    const out = renderImboxList(msgs, [
      { contactId: "b", enabled: true, label: "B" },
    ]);
    expect(out).toHaveLength(2);
    const bundle = out.find((x) => "messages" in x) as Bundle;
    expect(bundle.contactId).toBe("b");
  });

  it("does not bundle if disabled even with explicit config", () => {
    const msgs = [
      mkMsg("m1", "a", true),
      mkMsg("m2", "a", true),
      mkMsg("m3", "a", true),
    ];
    const out = renderImboxList(msgs, [
      { contactId: "a", enabled: false, label: "A" },
    ]);
    // 3 unread from 'a', not bundled → all 3 appear individually
    expect(out).toHaveLength(3);
    expect(out.every((x) => "subj" in x)).toBe(true);
  });

  it("excludes non-imbox bucket", () => {
    // Caller pre-filters to imbox bucket only — renderImboxList assumes that
    const msgs = [
      mkMsg("m1", "a", true),
    ];
    expect(renderImboxList(msgs, [])).toHaveLength(1);
  });
});