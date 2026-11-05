/** 分类建议引擎 — rule-based, on-device, suggestion-only. */

import { describe, it, expect } from "vitest";
import { suggestBucket } from "./suggest";

describe("suggestBucket", () => {
  it("routes newsletters to Stream", () => {
    const s = suggestBucket({
      subj: "本周产品动态",
      body: "hi",
      isNewsletter: true,
    });
    expect(s.bucket).toBe("feed");
    expect(s.reasons).toContain("订阅邮件");
  });

  it("routes receipts and statements to Records", () => {
    expect(
      suggestBucket({ subj: "您的 十月 希尔顿荣誉客会对账单", body: "", isNewsletter: false }).bucket,
    ).toBe("paperTrail");
    expect(
      suggestBucket({ subj: "Your payment receipt", body: "", isNewsletter: false }).bucket,
    ).toBe("paperTrail");
    expect(
      suggestBucket({ subj: "发票：阿里云 11 月账单", body: "", isNewsletter: false }).bucket,
    ).toBe("paperTrail");
  });

  it("routes OTP/security notices to Records", () => {
    expect(
      suggestBucket({ subj: "您的登录验证码是 483920", body: "", isNewsletter: false }).bucket,
    ).toBe("paperTrail");
  });

  it("defaults regular mail to Inbox", () => {
    const s = suggestBucket({
      subj: "下周评审材料",
      body: "见附件",
      isNewsletter: false,
    });
    expect(s.bucket).toBe("imbox");
    expect(s.reasons).toHaveLength(0);
  });

  it("ignores receipt keywords in long-body false positives beyond the scan window", () => {
    // keyword appears far into the body — outside the 2000-char scan
    const body = "x".repeat(3000) + "invoice";
    expect(suggestBucket({ subj: "hello", body, isNewsletter: false }).bucket).toBe("imbox");
  });
});
