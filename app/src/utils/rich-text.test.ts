/** Composer rich-text subset — transformations and both renderings. */

import { describe, expect, it } from "vitest";
import {
  insertLink,
  prefixLines,
  richTextToHtml,
  richTextToPlain,
  wrapSelection,
} from "./rich-text";

describe("wrapSelection", () => {
  it("wraps the selected text", () => {
    expect(wrapSelection("hello world", 6, 11, "**")).toEqual({
      text: "hello **world**",
      selStart: 8,
      selEnd: 13,
    });
  });

  it("drops the caret between the markers when nothing is selected", () => {
    const r = wrapSelection("ab", 1, 1, "**");
    expect(r.text).toBe("a****b");
    expect(r.selStart).toBe(3);
    expect(r.selEnd).toBe(3);
  });

  it("works with CJK text", () => {
    const r = wrapSelection("报价单", 0, 2, "**");
    expect(r.text).toBe("**报价**单");
  });
});

describe("prefixLines", () => {
  it("prefixes every selected line once", () => {
    const r = prefixLines("one\ntwo", 0, 7);
    expect(r.text).toBe("- one\n- two");
  });

  it("is idempotent — a second press removes the bullets", () => {
    const first = prefixLines("one\ntwo", 0, 7);
    const second = prefixLines(first.text, first.selStart, first.selEnd);
    expect(second.text).toBe("one\ntwo");
  });

  it("only touches the lines the selection covers", () => {
    const text = "keep\nchange\nkeep";
    const start = text.indexOf("change");
    const r = prefixLines(text, start, start + "change".length);
    expect(r.text).toBe("keep\n- change\nkeep");
  });

  it("skips blank lines", () => {
    const r = prefixLines("a\n\nb", 0, 4);
    expect(r.text).toBe("- a\n\n- b");
  });
});

describe("insertLink", () => {
  it("wraps the selection as a markdown link and selects the URL", () => {
    const r = insertLink("see docs", 4, 8);
    expect(r.text).toBe("see [docs](https://)");
    const selected = r.text.slice(r.selStart, r.selEnd);
    expect(selected).toBe("https://");
  });

  it("uses placeholder text when nothing is selected", () => {
    const r = insertLink("", 0, 0);
    expect(r.text).toBe("[链接文字](https://)");
  });
});

describe("richTextToHtml", () => {
  it("renders bold, italic and code", () => {
    expect(richTextToHtml("**粗** 和 *斜* 和 `code`")).toBe(
      "<p><strong>粗</strong> 和 <em>斜</em> 和 <code>code</code></p>",
    );
  });

  it("renders a bullet list", () => {
    expect(richTextToHtml("- 一\n- 二")).toBe("<ul><li>一</li><li>二</li></ul>");
  });

  it("separates paragraphs on blank lines and keystrokes lines with <br>", () => {
    expect(richTextToHtml("第一行\n第二行\n\n第二段")).toBe(
      "<p>第一行<br>第二行</p>\n<p>第二段</p>",
    );
  });

  it("escapes HTML so a message can never inject markup", () => {
    expect(richTextToHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("renders markdown links and keeps bare URLs clickable", () => {
    // Shared linkifier: anchors always carry target+rel so a recipient can
    // never window-opener a link out of our tab.
    expect(richTextToHtml("[文档](https://example.com/a)")).toContain(
      '<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">文档</a>',
    );
    expect(richTextToHtml("看 https://example.com")).toContain(
      '<a href="https://example.com"',
    );
  });

  it("returns an empty string for whitespace only", () => {
    expect(richTextToHtml("   \n  ")).toBe("");
  });
});

describe("richTextToPlain", () => {
  it("strips the markers so text-only readers see the words", () => {
    expect(richTextToPlain("**粗** 和 *斜* 和 `code`")).toBe("粗 和 斜 和 code");
  });

  it("keeps the link label and the destination", () => {
    expect(richTextToPlain("见 [文档](https://example.com)")).toBe(
      "见 文档 (https://example.com)",
    );
  });

  it("keeps list bullets", () => {
    expect(richTextToPlain("- 一\n- 二")).toBe("- 一\n- 二");
  });
});
