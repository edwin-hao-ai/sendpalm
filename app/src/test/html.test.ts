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

  it("plainTextToHtml auto-links mailto URLs", () => {
    const out = plainTextToHtml("Contact me at mailto:a@b.com or a@b.com");
    expect(out).toContain('<a href="mailto:a@b.com"');
  });

  it("plainTextToHtml still escapes < > & after regex change", () => {
    const out = plainTextToHtml("a < b & c > d");
    expect(out).toContain("&lt;");
    expect(out).toContain("&amp;");
    expect(out).toContain("&gt;");
    expect(out).not.toContain("<b>"); // not interpreted as HTML tag
  });
});
