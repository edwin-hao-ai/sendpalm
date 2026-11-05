/** 分类建议引擎 — on-device, rule-based (no server ML, matches our
 *  local-first posture). Competitors do this server-side (Gmail tabs,
 *  Outlook Focused); we do it with signals we already parse, and we
 *  SUGGEST — the user confirms, consistent with the Gate philosophy.
 *
 *  Signals: newsletter headers, receipt/statement keywords, OTP-ish mail. */

import type { Contact, Message, MessageBucket } from "../types";

const RECEIPT_KEYWORDS = [
  "发票",
  "收据",
  "账单",
  "对账单",
  "订单确认",
  "付款",
  "充值",
  "扣款",
  "invoice",
  "receipt",
  "statement",
  "order confirmation",
  "payment",
  "paid",
  "billing",
];

const NOTICE_KEYWORDS = [
  "验证码",
  "校验码",
  "安全码",
  "登录提醒",
  "verification code",
  "one-time pass",
  "security alert",
  "sign-in",
  "登录",
];

export interface BucketSuggestion {
  bucket: MessageBucket;
  reasons: string[];
}

export function suggestBucket(
  m: Pick<Message, "subj" | "body" | "isNewsletter">,
  _c?: Pick<Contact, "screened"> | null,
): BucketSuggestion {
  const reasons: string[] = [];
  const text = `${m.subj}\n${(m.body ?? "").slice(0, 2000)}`.toLowerCase();

  if (m.isNewsletter) {
    reasons.push("订阅邮件");
    return { bucket: "feed", reasons };
  }
  if (NOTICE_KEYWORDS.some((k) => text.includes(k))) {
    reasons.push("系统通知/验证码");
    return { bucket: "paperTrail", reasons };
  }
  if (RECEIPT_KEYWORDS.some((k) => text.includes(k))) {
    reasons.push("收据/账单类");
    return { bucket: "paperTrail", reasons };
  }
  return { bucket: "imbox", reasons };
}

export const BUCKET_SUGGEST_LABEL: Record<MessageBucket, string> = {
  imbox: "Inbox",
  feed: "Stream",
  paperTrail: "Records",
  trash: "回收站",
  spam: "垃圾邮件",
};
