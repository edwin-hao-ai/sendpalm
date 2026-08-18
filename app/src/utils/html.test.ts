import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml, analyzeImages, emailBodyPreview } from "./html";

describe("sanitizeEmailHtml", () => {
  it("strips <script> blocks", () => {
    const input = `<p>hi</p><script>alert(1)</script><p>bye</p>`;
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("<p>hi</p>");
    expect(result).toContain("<p>bye</p>");
  });

  it("neutralizes javascript: URLs in href, src, action, formaction", () => {
    const input = `<a href="javascript:alert(1)">x</a><img src="javascript:alert(2)"><form action="javascript:alert(3)"><button formaction="javascript:alert(4)">click</button></form>`;
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain("javascript:alert(1)");
    expect(result).not.toContain("javascript:alert(2)");
    expect(result).not.toContain("javascript:alert(3)");
    expect(result).not.toContain("javascript:alert(4)");
  });

  it("adds class=sp-img-hidden and data-original-src to external https img", () => {
    const input = `<img src="https://example.com/pic.png" alt="x">`;
    const result = sanitizeEmailHtml(input);
    expect(result).toContain('class="sp-img-hidden"');
    expect(result).toContain('data-original-src="https://example.com/pic.png"');
    expect(result).toContain('src="data:image/svg+xml');
    expect(result).not.toMatch(/\ssrc="https:\/\/example\.com\/pic\.png"/);
  });

  it("preserves cid: and data: images without sp-img-hidden class", () => {
    const cidInput = `<img src="cid:abc123" alt="inline">`;
    const cidResult = sanitizeEmailHtml(cidInput);
    expect(cidResult).not.toContain("sp-img-hidden");
    expect(cidResult).toContain('src="cid:abc123"');

    const dataInput = `<img src="data:image/png;base64,AAAA" alt="data">`;
    const dataResult = sanitizeEmailHtml(dataInput);
    expect(dataResult).not.toContain("sp-img-hidden");
    expect(dataResult).toContain('src="data:image/png;base64,AAAA"');
  });

  it("preserves table, tr, td, blockquote structure", () => {
    const input = `<table><tr><td>cell</td></tr></table><blockquote>quote</blockquote>`;
    const result = sanitizeEmailHtml(input);
    expect(result).toContain("<table");
    expect(result).toContain("<tr");
    expect(result).toContain("<td");
    expect(result).toContain("cell");
    expect(result).toContain("<blockquote");
    expect(result).toContain("quote");
  });

  it("strips <object>, <embed>, <link> tags", () => {
    const input = `<object data="https://evil.com/payload.swf"></object><embed src="https://evil.com/payload.swf"><link rel="stylesheet" href="https://evil.com/style.css"><p>safe</p>`;
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain("<object");
    expect(result).not.toContain("<embed");
    expect(result).not.toContain("<link");
    expect(result).not.toContain("evil.com");
    expect(result).toContain("<p>safe</p>");
  });

  it("strips event handler attributes (onclick, onerror, onload, onmouseover)", () => {
    const input = `<img src="x" onclick="alert(1)" onerror="alert(2)" onload="alert(3)" onmouseover="alert(4)"><a href="x" onfocus="alert(5)">link</a>`;
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("onload");
    expect(result).not.toContain("onmouseover");
    expect(result).not.toContain("onfocus");
    expect(result).not.toContain("alert(1)");
    expect(result).not.toContain("alert(2)");
    expect(result).not.toContain("alert(3)");
    expect(result).not.toContain("alert(4)");
    expect(result).not.toContain("alert(5)");
  });

  it("adds rel=noopener noreferrer to <a target=_blank>", () => {
    const input = `<a href="https://example.com" target="_blank">link</a>`;
    const result = sanitizeEmailHtml(input);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });
});

describe("emailBodyPreview", () => {
  it("returns sanitized HTML when bodyHtml is present", () => {
    const bodyHtml = `<p>Hello <b>Gate</b></p><script>alert(1)</script>`;
    const result = emailBodyPreview("plain fallback", bodyHtml);
    expect(result).toContain("<p>Hello <b>Gate</b></p>");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
  });

  it("falls back to escaped linked plain text when bodyHtml is absent", () => {
    const body = "Line one\nLine two\nVisit https://example.com";
    const result = emailBodyPreview(body);
    expect(result).toContain("Line one<br>Line two<br>Visit");
    expect(result).toContain('<a href="https://example.com"');
    expect(result).not.toContain("\n");
  });

  it("treats whitespace-only bodyHtml as absent", () => {
    const body = "plain";
    const result = emailBodyPreview(body, "   ");
    expect(result).toBe("plain");
  });
});

describe("analyzeImages", () => {
  it("counts external images correctly", () => {
    const input = `<img src="https://a.com/1.png"><img src="https://b.com/2.png"><img src="cid:inline"><img src="data:image/png;base64,AAAA">`;
    const result = analyzeImages(input);
    expect(result.externalImageCount).toBe(2);
  });

  it("detects tracking pixels (width=0, height=0, display:none)", () => {
    const widthZero = `<img width="0" height="0" src="https://tracker.com/pixel.png">`;
    expect(analyzeImages(widthZero).hasTrackingPixel).toBe(true);

    const displayNone = `<img style="display:none" src="https://tracker.com/pixel.png">`;
    expect(analyzeImages(displayNone).hasTrackingPixel).toBe(true);

    const benign = `<img width="600" height="200" src="https://example.com/banner.png">`;
    expect(analyzeImages(benign).hasTrackingPixel).toBe(false);
  });
});
