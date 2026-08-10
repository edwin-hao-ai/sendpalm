import { describe, it, expect } from "vitest";
import { htmlToPlainText, plainTextToHtml } from "../utils/html";

describe("htmlToPlainText", () => {
  it("strips tags and decodes entities", () => {
    const out = htmlToPlainText("<p>Hello &amp; welcome!</p>");
    expect(out).toBe("Hello & welcome!");
  });

  it("removes script and style content", () => {
    const out = htmlToPlainText(
      "<style>body{color:red}</style><p>text</p><script>alert(1)</script>",
    );
    expect(out).toBe("text");
  });
});

describe("plainTextToHtml", () => {
  it("escapes HTML entities", () => {
    const out = plainTextToHtml("a < b & c > d");
    expect(out).toBe("a &lt; b &amp; c &gt; d");
  });

  it("converts line breaks to <br>", () => {
    const out = plainTextToHtml("line1\nline2\r\nline3");
    expect(out).toBe("line1<br>line2<br>line3");
  });

  it("auto-links URLs", () => {
    const out = plainTextToHtml("See https://example.com/path here");
    expect(out).toBe(
      'See <a href="https://example.com/path" target="_blank" rel="noopener noreferrer">https://example.com/path</a> here',
    );
  });
});
