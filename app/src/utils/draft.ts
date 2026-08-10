/** Simple heuristic reply draft generator for Focus & Reply.
 * Mirrors prototype-v11's generateAiDraft: keyword-driven templates.
 * Pure function — easy to test and swap for a real LLM later.
 */

import type { Contact, Message } from "../types";

function baseSubject(subject: string): string {
  return subject.replace(/^Re:\s*/i, "").trim();
}

export function generateAiDraft(
  m: Pick<Message, "subj" | "body" | "pid">,
  contact?: Contact,
  fromEmail?: string,
): string {
  const name = contact?.name || fromEmail || "there";
  const subject = baseSubject(m.subj).toLowerCase();
  const body = (m.body || "").toLowerCase();
  const firstName = name.split(/\s+/)[0] ?? name;

  if (
    subject.includes("metrics") ||
    subject.includes("numbers") ||
    body.includes("arr") ||
    body.includes("retention")
  ) {
    return `Hi ${firstName},\n\nThanks for the follow-up. I've attached the latest snapshot below:\n\n- ARR: $2.4M (up 142% YoY)\n- Net revenue retention: 118%\n- CAC payback: 13 months\n- Logo churn: 4.2% annually\n\nHappy to walk through the cohort analysis if helpful.\n\nBest,\nEdwin`;
  }

  if (
    subject.includes("合同") ||
    subject.includes("proposal") ||
    body.includes("付款") ||
    body.includes("deliverable")
  ) {
    return `${firstName}，\n\n感谢反馈，回复如下：\n\n1. 付款节奏同意按 30-40-30 调整。\n2. 交付物定义已补充在附件 v3 中。\n3. 违约金上限我们建议保持 10%，但可增加「不可抗力」免责条款。\n\n请查收附件，会上我们逐条确认。\n\nBest,\nEdwin`;
  }

  if (
    subject.includes("部署") ||
    subject.includes("测试") ||
    body.includes("测试计划")
  ) {
    return `Hi ${firstName},\n\n测试计划已看，周五上午 10 点部署可行。支付模块的回归用例和性能基线我都标注了，整体 OK。\n\nBest,\nEdwin`;
  }

  if (
    subject.includes("meeting") ||
    subject.includes("schedule") ||
    body.includes("available")
  ) {
    return `Hi ${firstName},\n\nThanks for reaching out. I'm free Tuesday afternoon or Wednesday morning this week. Let me know what works best for you.\n\nBest,\nEdwin`;
  }

  if (
    body.includes("urgent") ||
    body.includes("紧急") ||
    body.includes("今日") ||
    subject.includes("紧急")
  ) {
    return `Hi ${firstName},\n\nGot it — I'll get back to you with a decision by end of day.\n\nBest,\nEdwin`;
  }

  return `Hi ${firstName},\n\nThanks for the note. I'll review and get back to you shortly.\n\nBest,\nEdwin`;
}
