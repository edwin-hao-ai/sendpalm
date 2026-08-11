import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml } from "./html";

describe("sanitizeEmailHtml", () => {
  it("strips <script> blocks", () => {
    const input = `<p>hi</p><script>alert(1)</script><p>bye</p>`;
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("<p>hi</p>");
    expect(result).toContain("<p>bye</p>");
  });

  it("strips multi-line <script>", () => {
    const input = `<script>
      alert(1);
      var x = 2;
      foo();
    </script><p>after</p>`;
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
    expect(result).not.toContain("var x");
    expect(result).not.toContain("foo()");
    expect(result).toContain("<p>after</p>");
  });

  it("strips inline event handlers (onclick, onerror, onload)", () => {
    const input = `<img src="x" onclick="alert(1)" onerror="alert(2)" onload="alert(3)">`;
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("onload");
    expect(result).not.toContain("alert(1)");
    expect(result).not.toContain("alert(2)");
    expect(result).not.toContain("alert(3)");
    expect(result).toContain("<img");
}
  );

  it("strips event handlers with no space before (svg/onload bypass)", () => {
    const input = `<svg/onload=alert(1)></svg>`;
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain("onload");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("svg");
  });

  it("neutralizes javascript: URLs in href, src, action, formaction", () => {
    const input = `<a href="javascript:alert(1)">x</a><img src="javascript:alert(2)"><form action="javascript:alert(3)"><button formaction="javascript:alert(4)">`;
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain("javascript:alert(1)");
    expect(result).not.toContain("javascript:alert(2)");
    expect(result).not.toContain("javascript:alert(3)");
    expect(result).not.toContain("javascript:alert(4)");
    expect(result).toContain('href="#"');
    expect(result).toContain('src="#"');
    expect(result).toContain('action="#"');
    expect(result).toContain('formaction="#"');
  });

  it("strips <meta http-equiv=refresh>", () => {
    const input = `<meta http-equiv="refresh" content="0;url=http://evil.com"><p>safe</p>`;
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain("<meta");
    expect(result).not.toContain("http-equiv");
    expect(result).not.toContain("evil.com");
    expect(result).toContain("<p>safe</p>");
  });

  it("strips <base> tags", () => {
    const input = `<base href="http://evil.com"><img src="pic.jpg">`;
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain("<base");
    expect(result).not.toContain("evil.com");
    expect(result).toContain('<img src="pic.jpg">');
  });

  it("adds rel=noopener noreferrer to <a target=_blank> (quoted or unquoted)", () => {
    const quoted = `<a href="x" target="_blank">link</a>`;
    const quotedResult = sanitizeEmailHtml(quoted);
    expect(quotedResult).toContain('rel="noopener noreferrer"');
    expect(quotedResult).toContain('<a href="x" target="_blank" rel="noopener noreferrer">link</a>');

    const unquoted = `<a href="x" target=_blank>link</a>`;
    const unquotedResult = sanitizeEmailHtml(unquoted);
    expect(unquotedResult).toContain('rel="noopener noreferrer"');
  });

  it("preserves existing rel, only adds missing tokens", () => {
    const input = `<a href="x" target="_blank" rel="canonical">link</a>`;
    const result = sanitizeEmailHtml(input);
    expect(result).toContain("canonical");
    expect(result).toContain("noopener");
    expect(result).toContain("noreferrer");
    expect(result).toContain(
      '<a href="x" target="_blank" rel="canonical noopener noreferrer">link</a>',
    );
  });

  it("preserves all other HTML (p, img cid:, table, blockquote)", () => {
    const input = `<p>text</p><img src="cid:abc123"><table><tr><td>cell</td></tr></table><blockquote>quote</blockquote>`;
    const result = sanitizeEmailHtml(input);
    expect(result).toEqual(input);
  });
});
