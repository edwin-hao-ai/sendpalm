import { describe, expect, it } from "vitest";
import { parseTaskExtractionResponse, buildTaskExtractionInput, TASK_INPUT_MAX_CHARS } from "./task-extraction";
import type { Message } from "../types";
describe("task extraction contract", () => {
  it("validates multiple candidates and preserves explicit or absent due dates", () => {
    expect(parseTaskExtractionResponse(JSON.stringify({ tasks: [{ title: "Report", direction: "mine", due: "2026-11-03" }, { title: "Review", direction: "unclear" }] }))).toEqual([{ title: "Report", direction: "mine", due: "2026-11-03", notes: "", priority: "normal" }, { title: "Review", direction: "unclear", due: undefined, notes: "", priority: "normal" }]);
  });
  it("accepts empty results", () => expect(parseTaskExtractionResponse('{"tasks":[]}')).toEqual([]));
  it.each(["bad json", '{}', '{"tasks":[{"title":"x","direction":"out"}]}', '{"tasks":[{"title":"x","direction":"mine","due":"2026-02-30"}]}', JSON.stringify({ tasks: Array.from({ length: 4 }, () => ({ title: "x", direction: "mine" })) })])("rejects invalid output %s", raw => expect(() => parseTaskExtractionResponse(raw)).toThrow());
  it("bounds the entire one-message input and excludes thread, HTML, attachments", () => {
    const input = buildTaskExtractionInput({ subj: "subject", body: "a".repeat(24000), bodyHtml: "secret html", attachments: ["secret attachment"], direction: "in", st: "2026-11-02", to: "me@test.com" } as Message, "me@test.com", "sender@test.com");
    expect(input.length).toBeLessThanOrEqual(TASK_INPUT_MAX_CHARS);
    expect(input).not.toContain("secret");
    expect(JSON.parse(input)).toMatchObject({ direction: "in", accountEmail: "me@test.com", sender: "sender@test.com" });
  });
  it("uses plain text for HTML-only mail", () => {
    expect(JSON.parse(buildTaskExtractionInput({ body: "", bodyHtml: "<p>Report &amp; review</p>" } as Message, "", "")).body).toBe("Report & review");
  });
});
