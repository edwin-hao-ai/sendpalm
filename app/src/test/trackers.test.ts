/** Tracker detection tests. */

import { describe, expect, it } from "vitest";
import { detectTrackers, trackerSummary } from "../utils/trackers";

describe("detectTrackers", () => {
  it("returns empty for clean text", () => {
    expect(detectTrackers("Hello, this is a clean message.")).toEqual([]);
  });

  it("detects utm parameters", () => {
    const r = detectTrackers("Visit https://example.com/?utm_source=newsletter");
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((t) => t.type === "utm_")).toBe(true);
  });

  it("detects tracking pixels", () => {
    const r = detectTrackers("<img src='https://x.com/track.gif'>");
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((t) => t.type === "tracking pixel")).toBe(true);
  });

  it("detects Mailchimp", () => {
    const r = detectTrackers("https://list-manage1.com/track/click");
    expect(r.some((t) => t.type === "mailchimp")).toBe(true);
  });

  it("detects Sendgrid", () => {
    const r = detectTrackers("https://url1234.sendgrid.net/c/abc");
    expect(r.some((t) => t.type === "sendgrid")).toBe(true);
  });

  it("detects Mixpanel", () => {
    const r = detectTrackers("https://api.mixpanel.com/track?data=eyJldmVudCI6ImJyb3dzZSJ9");
    expect(r.some((t) => t.type === "mixpanel")).toBe(true);
  });

  it("returns multiple types for mixed payload", () => {
    const r = detectTrackers("https://x.com/?utm_source=gh<img src='/track.gif'>https://api.mixpanel.com/track");
    const types = new Set(r.map((t) => t.type));
    expect(types.size).toBeGreaterThanOrEqual(3);
  });
});

describe("trackerSummary", () => {
  it("aggregates count and unique types", () => {
    const r = trackerSummary("https://x.com/?utm_source=gh<img src='/track.gif'>https://api.mixpanel.com/track");
    expect(r.count).toBeGreaterThan(0);
    expect(r.types.length).toBeGreaterThan(0);
    expect(r.types.length).toBeLessThanOrEqual(r.count);
  });

  it("empty for clean text", () => {
    expect(trackerSummary("hi")).toEqual({ count: 0, types: [] });
  });
});