/** UI visual-audit screenshot pipeline.
 *
 *  Seeds a realistic mixed CN/EN mailbox via `window.__sendpalmE2E`
 *  (sessionStorage auto-seed) and captures every reachable view at
 *  desktop 1440x900, iPad portrait 820x1180 and iPhone SE 375x667.
 *
 *  Output: qa-tmp/ui-audit-2026-09-22/<viewport>-<seq>-<name>.png
 */

import { test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CalendarEvent, Contact, FileItem, Message } from "../src/types";

const SHOTS = "/Users/edwinhao/sendpalm/qa-tmp/ui-audit-2026-09-22";

test.beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
});

const counters: Record<string, number> = {};

async function shoot(page: Page, viewport: string, name: string, settleMs = 400) {
  counters[viewport] = (counters[viewport] ?? 0) + 1;
  const seq = String(counters[viewport]).padStart(2, "0");
  await page.waitForTimeout(settleMs);
  await page.screenshot({
    path: join(SHOTS, `${viewport}-${seq}-${name}.png`),
    fullPage: false,
  });
}

/* ── Seed data ─────────────────────────────────────────────────────── */

function dayIso(daysAgo: number, h: number, min: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, min, 0, 0);
  return d.toISOString();
}

/** Bare UTC date ("YYYY-MM-DD") for calendar events. The app's canonical
 *  event `dt` format is a bare local date (Calendar.tsx P1-9 `newEvent`),
 *  and the Calendar occurrence window is built from
 *  `cursor().toISOString().slice(0,10)` — a UTC date — with a lexicographic
 *  `ev.dt > windowEnd` pre-filter that silently drops full ISO datetimes.
 *  Anchoring to the UTC date keeps seeded events visible in the Day window
 *  at any local run time. The display time lives in `tm`. */
function utcDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const ACCT = "acct-audit-001";

function contact(over: Partial<Contact> & { id: string; name: string }): Contact {
  return {
    firstName: over.name,
    lastName: "",
    nickname: "",
    company: "",
    title: "",
    emails: [],
    phones: [],
    stage: "active",
    labels: [],
    topics: [],
    notes: "",
    avatar: "",
    photo: "",
    health: 80,
    sc: 0,
    scC: "",
    scL: "",
    lc: "",
    grp: "",
    trd: "stable",
    pattern: "",
    accounts: [],
    stageHistory: [],
    firstContact: dayIso(30, 9, 0),
    milestones: [],
    merged: false,
    blocked: false,
    notify: false,
    firstSeen: false,
    screened: true,
    defaultBucket: "imbox",
    autoLabel: [],
    recycling: false,
    ch: [],
    ...over,
  };
}

const CONTACTS: Contact[] = [
  contact({
    id: "ct-chenxiao",
    name: "陈晓",
    company: "澄光科技",
    title: "产品经理",
    emails: [{ value: "chenxiao@chenguang.tech", label: "work" }],
    scC: "#2f6f4f",
  }),
  contact({
    id: "ct-sarah",
    name: "Sarah Miller",
    company: "Stripe",
    title: "Billing",
    emails: [{ value: "receipts@stripe.com", label: "work" }],
    scC: "#635bff",
  }),
  contact({
    id: "ct-aws",
    name: "AWS",
    company: "Amazon Web Services",
    title: "Billing",
    emails: [{ value: "aws-billing@amazon.com", label: "work" }],
    scC: "#ff9900",
  }),
  contact({
    id: "ct-alipay",
    name: "支付宝",
    company: "蚂蚁集团",
    title: "账单服务",
    emails: [{ value: "bill@alipay.com", label: "work" }],
    scC: "#1677ff",
  }),
  contact({
    id: "ct-liwang",
    name: "李望",
    company: "设计周刊",
    title: "编辑",
    emails: [{ value: "weekly@design-weekly.cn", label: "work" }],
    scC: "#c2553b",
  }),
  contact({
    id: "ct-james",
    name: "James Park",
    company: "Vercel",
    title: "Developer Relations",
    emails: [{ value: "james@vercel.com", label: "work" }],
    scC: "#1f6feb",
  }),
  contact({
    id: "ct-wangyuqing",
    name: "王雨晴",
    company: "蓝湖资本 HR",
    title: "招聘专员",
    emails: [{ value: "wang.yuqing@bluehire.cn", label: "work" }],
    scC: "#8b5cf6",
    // Unscreened first-time sender → lands in the Gate queue.
    firstSeen: true,
    screened: false,
  }),
  contact({
    id: "ct-daniel",
    name: "Daniel Kim",
    company: "Horizon Ventures",
    title: "Partner",
    emails: [{ value: "daniel@horizon.vc", label: "work" }],
    scC: "#b7791f",
    firstSeen: true,
    screened: false,
  }),
  contact({
    id: "ct-meituan",
    name: "美团外卖",
    company: "美团",
    title: "",
    emails: [{ value: "noreply@meituan.com", label: "work" }],
    scC: "#f6ad1f",
  }),
  contact({
    id: "ct-liuyang",
    name: "刘洋",
    company: "澄光科技",
    title: "前端工程师",
    emails: [{ value: "liuyang@chenguang.tech", label: "work" }],
    scC: "#0e7490",
  }),
  contact({
    id: "ct-spammer",
    name: "Lucky Draw Center",
    company: "",
    title: "",
    emails: [{ value: "win@prize-center.xyz", label: "work" }],
    scC: "#9ca3af",
    blocked: true,
  }),
  contact({
    id: "ct-zhaojing",
    name: "赵静",
    company: "自由职业",
    title: "插画师",
    emails: [{ value: "zhaojing@illust.studio", label: "home" }],
    scC: "#db2777",
  }),
];

function message(over: Partial<Message> & { id: string; pid: string; subj: string }): Message {
  return {
    prev: "",
    body: "",
    bodyHtml: null,
    tm: "09:00",
    st: dayIso(0, 9, 0),
    ac: ACCT,
    bucket: "imbox",
    direction: "in",
    unread: false,
    labels: [],
    attachments: [],
    trackers: [],
    replyLater: false,
    setAside: false,
    bubbleUpAt: null,
    remindAt: null,
    deletedAt: null,
    to: "edwinhao@sendpalm.com",
    cc: [],
    bcc: [],
    calendarInvite: null,
    ...over,
  };
}

const LONG_HTML = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;color:#1a1a1a;line-height:1.6">
  <h2 style="margin:0 0 12px">8 月产品数据月报</h2>
  <p>Hi Edwin,</p>
  <p>以下是 8 月核心指标摘要，完整看板链接在邮件底部：</p>
  <table border="0" cellpadding="10" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px">
    <thead>
      <tr style="background:#f3f0e9;text-align:left">
        <th style="border-bottom:2px solid #d8d2c4">指标</th>
        <th style="border-bottom:2px solid #d8d2c4">8 月</th>
        <th style="border-bottom:2px solid #d8d2c4">环比</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="border-bottom:1px solid #eee">DAU</td><td style="border-bottom:1px solid #eee">12,480</td><td style="border-bottom:1px solid #eee;color:#2f6f4f">+6.2%</td></tr>
      <tr><td style="border-bottom:1px solid #eee">付费转化率</td><td style="border-bottom:1px solid #eee">3.4%</td><td style="border-bottom:1px solid #eee;color:#2f6f4f">+0.3pt</td></tr>
      <tr><td style="border-bottom:1px solid #eee">NPS</td><td style="border-bottom:1px solid #eee">47</td><td style="border-bottom:1px solid #eee;color:#2f6f4f">+2</td></tr>
      <tr><td style="border-bottom:1px solid #eee">崩溃率</td><td style="border-bottom:1px solid #eee">0.21%</td><td style="border-bottom:1px solid #eee;color:#c2553b">-0.05pt</td></tr>
    </tbody>
  </table>
  <p style="margin:16px 0"><img src="https://placehold.co/600x240/png" alt="DAU 趋势图" width="600" style="max-width:100%;border-radius:8px" /></p>
  <p>留存曲线在第三周出现拐点，主要来自新手引导改版上线。建议 Q4 继续投入 Onboarding 实验。</p>
  <p style="margin:20px 0">
    <a href="https://metrics.example.com/reports/2026-08" style="display:inline-block;background:#2f6f4f;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">查看完整报告</a>
  </p>
  <p style="color:#6b7280;font-size:13px">— 数据团队 · 自动生成于每月 1 日<br/>如需退订月报，请回复 “unsubscribe”。</p>
</div>`;

const MESSAGES: Message[] = [
  // ── Imbox · today ──
  message({
    id: "msg-01",
    pid: "ct-chenxiao",
    subj: "Q4 产品评审会议纪要",
    prev: "Edwin,会议纪要整理好了,行动项第 3 条需要你确认…",
    body: "Edwin,\n\n会议纪要整理好了:\n\n1. Q4 OKR 定稿截止 9/30\n2. 新手引导实验下周出数据\n3. 发布列车改为双周 —— 这条需要你确认\n\n有空回我一下。\n\n陈晓",
    tm: "09:12",
    st: dayIso(0, 9, 12),
    unread: true,
    attachments: ["file-01"],
  }),
  message({
    id: "msg-02",
    pid: "ct-james",
    subj: "Deploy preview ready: sendpalm-web#412",
    prev: "Preview URL: https://sendpalm-web-git-feat-onboarding.vercel.app …",
    body: "Hi Edwin,\n\nThe preview for PR #412 is live:\nhttps://sendpalm-web-git-feat-onboarding.vercel.app\n\nBuild passed in 2m 14s. No bundle-size regression.\n\n— Vercel Bot",
    tm: "08:40",
    st: dayIso(0, 8, 40),
    unread: true,
  }),
  message({
    id: "msg-03",
    pid: "ct-liuyang",
    subj: "设计稿 v3 已更新,请查收",
    prev: "首页和设置页都改完了,暗色模式对比度提到 AA 级…",
    body: "Edwin,\n\n首页和设置页都改完了,暗色模式对比度提到 AA 级。截图见附件。\n\n刘洋",
    bodyHtml: LONG_HTML,
    tm: "07:55",
    st: dayIso(0, 7, 55),
    attachments: ["file-02", "file-03"],
  }),
  // ── Imbox · yesterday ──
  message({
    id: "msg-04",
    pid: "ct-chenxiao",
    subj: "Re: Roadmap 评审反馈",
    prev: "收到,那我把 P1 的范围再收一版,明天给你…",
    body: "收到,那我把 P1 的范围再收一版,明天给你。\n\n另外 Metrics 那边的口径要对齐一下,别又各说各话。",
    tm: "昨天 18:20",
    st: dayIso(1, 18, 20),
    unread: true,
    replyLater: true,
  }),
  message({
    id: "msg-05",
    pid: "ct-james",
    subj: "Incident postmortem: API latency spike on Sep 20",
    prev: "Root cause: a misconfigured connection pool in the edge layer…",
    body: "Hi all,\n\nRoot cause: a misconfigured connection pool in the edge layer.\nImpact: 23 minutes of elevated p95 latency.\nAction items in the doc.\n\nJames",
    tm: "昨天 15:02",
    st: dayIso(1, 15, 2),
    setAside: true,
  }),
  message({
    id: "msg-06",
    pid: "ct-liuyang",
    subj: "下周出差行程安排确认",
    prev: "机票酒店都订好了,周三 9:40 的航班,行程单如下…",
    body: "机票酒店都订好了,周三 9:40 的航班。\n\n行程单:\n- 9/30 上海 → 深圳\n- 10/2 深圳 → 上海\n\n酒店在南山,离客户办公室两站地铁。",
    tm: "昨天 10:30",
    st: dayIso(1, 10, 30),
    unread: true,
    bubbleUpAt: dayIso(-1, 9, 0), // tomorrow 09:00 local
  }),
  // ── Imbox · earlier this week ──
  message({
    id: "msg-07",
    pid: "ct-chenxiao",
    subj: "周报模板更新",
    prev: "新模板加了「风险与依赖」一栏,本周开始用新版…",
    body: "新模板加了「风险与依赖」一栏,本周开始用新版。\n\n旧版存档在共享盘 /templates/weekly-v1.md。",
    tm: "周日 16:40",
    st: dayIso(2, 16, 40),
  }),
  message({
    id: "msg-08",
    pid: "ct-james",
    subj: "New comment on PR #388: feat(ios): share extension",
    prev: "@edwinhao PTAL at the entitlements diff — I think we need…",
    body: "@edwinhao PTAL at the entitlements diff — I think we need the app-groups capability for the share extension to read the keychain.\n\nThread: https://github.com/sendpalm/app/pull/388",
    tm: "周日 11:05",
    st: dayIso(2, 11, 5),
    unread: true,
  }),
  // ── Imbox · earlier this month ──
  message({
    id: "msg-09",
    pid: "ct-liuyang",
    subj: "团队 offsite 照片",
    prev: "上周末的照片传好了,挑了几张能发的…",
    body: "上周末的照片传好了,挑了几张能发的。\n\n行程文档见附件。",
    tm: "9月12日",
    st: dayIso(10, 14, 30),
    attachments: ["file-06"],
  }),
  message({
    id: "msg-10",
    pid: "ct-chenxiao",
    subj: "OKR 草稿 — 需要你的输入",
    prev: "Q4 的 KR 我起草了三条,第二条量化指标还不确定…",
    body: "Q4 的 KR 我起草了三条,第二条量化指标还不确定,你看看定多少合适。",
    tm: "9月7日",
    st: dayIso(15, 10, 0),
  }),
  message({
    id: "msg-11",
    pid: "ct-chenxiao",
    subj: "8 月产品数据月报",
    prev: "DAU 12,480(+6.2%),付费转化率 3.4%…",
    body: "8 月产品数据月报,见附件表格。",
    bodyHtml: LONG_HTML,
    tm: "9月2日",
    st: dayIso(20, 9, 30),
    attachments: ["file-05"],
  }),
  // ── Feed (Stream) ──
  message({
    id: "msg-12",
    pid: "ct-meituan",
    subj: "你的美团外卖订单已送达",
    prev: "订单 #MT20260922-8834 已由骑手送达,记得给个好评…",
    body: "订单 #MT20260922-8834 已由骑手送达。\n\n用餐愉快!记得给个好评。",
    tm: "12:38",
    st: dayIso(0, 12, 38),
    bucket: "feed",
    unread: true,
  }),
  message({
    id: "msg-13",
    pid: "ct-liwang",
    subj: "设计周刊 #128:极简主义的回归",
    prev: "本期导读:当 AI 生成的界面千篇一律,设计师如何…",
    body: "本期导读:\n\n1. 当 AI 生成的界面千篇一律,设计师如何保持手感\n2. HEY 的邮件哲学,五年后再看\n3. 字体排印的黄金比例是否还成立\n\n—— 设计周刊编辑部",
    bodyHtml: LONG_HTML,
    tm: "昨天 07:00",
    st: dayIso(1, 7, 0),
    bucket: "feed",
  }),
  message({
    id: "msg-14",
    pid: "ct-meituan",
    subj: "【会员日】限时 5 折红包,今晚 24 点截止",
    prev: "尊敬的用户,您有 3 张会员红包待领取…",
    body: "尊敬的用户,您有 3 张会员红包待领取,今晚 24 点截止。",
    tm: "周六 20:15",
    st: dayIso(3, 20, 15),
    bucket: "feed",
  }),
  message({
    id: "msg-15",
    pid: "ct-liwang",
    subj: "Product Hunt Daily Digest",
    prev: "Today's top products: an AI email triage tool, a local-first…",
    body: "Today's top products:\n\n1. Triage — AI email sorting\n2. LocalNote — local-first notes\n3. Beam — calendar for founders",
    tm: "9月17日",
    st: dayIso(5, 6, 0),
    bucket: "feed",
    unread: true,
  }),
  // ── Paper Trail (Records) ──
  message({
    id: "msg-16",
    pid: "ct-sarah",
    subj: "Your receipt from Stripe #2841-9921",
    prev: "Amount: $49.00 — SendPalm Pro (monthly)…",
    body: "Receipt #2841-9921\n\nAmount: $49.00\nDescription: SendPalm Pro (monthly)\nDate: Sep 22, 2026\n\nThanks for your business.",
    bodyHtml: LONG_HTML,
    tm: "06:30",
    st: dayIso(0, 6, 30),
    bucket: "paperTrail",
  }),
  message({
    id: "msg-17",
    pid: "ct-aws",
    subj: "Invoice INV-2026-0913 from AWS",
    prev: "Your September invoice is ready. Total: $312.44…",
    body: "Your September invoice is ready.\n\nTotal: $312.44\nDue: Oct 1, 2026\n\nPDF attached.",
    tm: "9月20日",
    st: dayIso(2, 3, 0),
    bucket: "paperTrail",
    attachments: ["file-04"],
  }),
  message({
    id: "msg-18",
    pid: "ct-alipay",
    subj: "支付宝 电子账单 2026-09",
    prev: "您 9 月的电子账单已生成,本月共支出 ¥4,821.30…",
    body: "您 9 月的电子账单已生成,本月共支出 ¥4,821.30。\n\n登录支付宝 App 查看明细。",
    tm: "9月14日",
    st: dayIso(8, 8, 0),
    bucket: "paperTrail",
  }),
  // ── Spam ──
  message({
    id: "msg-19",
    pid: "ct-spammer",
    subj: "中奖通知!领取您的 ¥50,000 奖金",
    prev: "恭喜您成为本期的幸运用户,点击链接领取奖金…",
    body: "恭喜您成为本期的幸运用户,点击链接领取奖金:http://prize-center.xyz/claim",
    tm: "9月19日",
    st: dayIso(3, 2, 11),
    bucket: "spam",
    deletedAt: dayIso(3, 8, 0),
  }),
  message({
    id: "msg-20",
    pid: "ct-spammer",
    subj: "Cheap meds online, no prescription !!!",
    prev: "Best prices guaranteed, worldwide shipping…",
    body: "Best prices guaranteed, worldwide shipping. Buy now!",
    tm: "9月15日",
    st: dayIso(7, 4, 45),
    bucket: "spam",
    deletedAt: dayIso(7, 9, 0),
  }),
  // ── Trash ──
  message({
    id: "msg-21",
    pid: "ct-zhaojing",
    subj: "Re: 同学聚会改期",
    prev: "那就定在下个月第二个周末,我来订地方…",
    body: "那就定在下个月第二个周末,我来订地方。\n\n老同学们都到齐了,就等你了。",
    tm: "昨天 21:12",
    st: dayIso(1, 21, 12),
    bucket: "trash",
    deletedAt: dayIso(0, 8, 0),
  }),
  message({
    id: "msg-22",
    pid: "ct-chenxiao",
    subj: "(已作废)转发:旧版发布流程",
    prev: "这版流程已经废弃,以新的双周列车为准…",
    body: "这版流程已经废弃,以新的双周列车为准。",
    tm: "9月19日",
    st: dayIso(3, 15, 0),
    bucket: "trash",
    deletedAt: dayIso(2, 10, 0),
  }),
  // ── Gate queue (first-time, unscreened senders) ──
  message({
    id: "msg-23",
    pid: "ct-wangyuqing",
    subj: "您好,邀请您参加面试 — 高级前端工程师",
    prev: "Edwin 您好,我是蓝湖资本的招聘专员王雨晴,看到您的简历…",
    body: "Edwin 您好,\n\n我是蓝湖资本的招聘专员王雨晴。我们正在为被投企业寻找一位高级前端工程师,看到您的背景非常匹配,想邀请您聊聊。\n\n方便的话本周找个时间?\n\n王雨晴",
    tm: "10:05",
    st: dayIso(0, 10, 5),
    unread: true,
  }),
  message({
    id: "msg-24",
    pid: "ct-daniel",
    subj: "About your seed round — intro from 张总",
    prev: "Hi Edwin, 张总 suggested I reach out. We led rounds in…",
    body: "Hi Edwin,\n\n张总 suggested I reach out. We led seed rounds in three productivity tools last year and I'd love to hear what you're building with SendPalm.\n\nAre you raising now?\n\nDaniel Kim · Horizon Ventures",
    tm: "08:15",
    st: dayIso(0, 8, 15),
    unread: true,
  }),
];

function event(over: Partial<CalendarEvent> & { id: string; title: string }): CalendarEvent {
  return {
    dt: utcDate(0),
    tm: "10:00",
    pids: [],
    color: "#2f6f4f",
    agenda: [],
    notes: "",
    brief: "",
    actionItems: [],
    materials: [],
    ...over,
  };
}

const EVENTS: CalendarEvent[] = [
  event({
    id: "evt-01",
    title: "晨会 Standup",
    dt: utcDate(0),
    tm: "10:00",
    dur: 30,
    pids: ["ct-chenxiao", "ct-liuyang"],
    color: "#2f6f4f",
    videoLink: "https://meet.example.com/standup",
  }),
  event({
    id: "evt-02",
    title: "1:1 · 陈晓",
    dt: utcDate(0),
    tm: "14:00",
    dur: 45,
    pids: ["ct-chenxiao"],
    color: "#1f6feb",
    location: "3F 会议室 B",
  }),
  event({
    id: "evt-03",
    title: "Q4 产品评审",
    dt: utcDate(-1),
    tm: "10:30",
    dur: 60,
    pids: ["ct-chenxiao", "ct-james", "ct-liuyang"],
    color: "#c2553b",
    videoLink: "https://meet.example.com/q4-review",
    reminder: 15,
  }),
  event({
    id: "evt-04",
    title: "设计工作坊:Onboarding 改版",
    dt: utcDate(-3),
    tm: "13:00",
    dur: 120,
    pids: ["ct-liuyang"],
    color: "#8b5cf6",
    location: "2F 创意空间",
  }),
  event({
    id: "evt-05",
    title: "国庆放假",
    dt: utcDate(-9),
    endDt: utcDate(-15),
    allDay: true,
    tm: "全天",
    color: "#b7791f",
  }),
  event({
    id: "evt-06",
    title: "Sprint Planning",
    dt: utcDate(1),
    tm: "11:00",
    dur: 90,
    pids: ["ct-chenxiao", "ct-liuyang"],
    color: "#0e7490",
  }),
  event({
    id: "evt-07",
    title: "牙医预约",
    dt: utcDate(6),
    tm: "16:00",
    dur: 60,
    color: "#db2777",
    location: "瑞尔齿科 · 静安店",
  }),
  event({
    id: "evt-08",
    title: "投资人月度同步",
    dt: utcDate(-5),
    tm: "17:00",
    dur: 30,
    pids: ["ct-daniel"],
    color: "#635bff",
    videoLink: "https://meet.example.com/investor-sync",
  }),
];

const FILES: FileItem[] = [
  {
    id: "file-01",
    pid: "ct-chenxiao",
    name: "Q4-产品评审纪要.pdf",
    type: "pdf",
    mime: "application/pdf",
    size: 245_760,
    st: dayIso(0, 9, 12),
    sender: "陈晓",
    sourceMessageIds: ["msg-01"],
  },
  {
    id: "file-02",
    pid: "ct-liuyang",
    name: "homepage-v3.png",
    type: "image",
    mime: "image/png",
    size: 1_258_291,
    st: dayIso(0, 7, 55),
    sender: "刘洋",
    sourceMessageIds: ["msg-03"],
  },
  {
    id: "file-03",
    pid: "ct-liuyang",
    name: "settings-dark.png",
    type: "image",
    mime: "image/png",
    size: 880_640,
    st: dayIso(0, 7, 56),
    sender: "刘洋",
    sourceMessageIds: ["msg-03"],
  },
  {
    id: "file-04",
    pid: "ct-sarah",
    name: "AWS-INV-2026-0913.pdf",
    type: "pdf",
    mime: "application/pdf",
    size: 100_352,
    st: dayIso(2, 3, 0),
    sender: "Sarah Miller",
    sourceMessageIds: ["msg-17"],
  },
  {
    id: "file-05",
    pid: "ct-chenxiao",
    name: "数据月报-2026-08.xlsx",
    type: "spreadsheet",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 460_800,
    st: dayIso(20, 9, 30),
    sender: "陈晓",
    sourceMessageIds: ["msg-11"],
  },
  {
    id: "file-06",
    pid: "ct-liuyang",
    name: "offsite-行程.docx",
    type: "doc",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 33_792,
    st: dayIso(10, 14, 30),
    sender: "刘洋",
    sourceMessageIds: ["msg-09"],
  },
];

const SEED = {
  contacts: CONTACTS,
  messages: MESSAGES,
  events: EVENTS,
  files: FILES,
};

/* ── Shared helpers ────────────────────────────────────────────────── */

async function bootSeeded(page: Page) {
  await page.addInitScript((payload) => {
    sessionStorage.setItem("__sendpalm_e2e_seed", JSON.stringify(payload));
  }, SEED);
  await page.goto("/");
  await page.locator("body.app-ready").waitFor({ timeout: 15_000 });
  await page.waitForFunction(
    () => (window as never as { __sendpalmE2E?: { __seedReady?: Promise<void> } })
      .__sendpalmE2E?.__seedReady !== undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(
    () => (window as never as { __sendpalmE2E: { __seedReady: Promise<void> } })
      .__sendpalmE2E.__seedReady,
  );
  // Let the bumpRefreshTick refetch land in the mounted view.
  await page.waitForTimeout(500);
}

async function navTo(page: Page, view: string) {
  const btn = page.locator(`#sidebar [data-nav-view="${view}"]`);
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    // Park the cursor over the main area so the sidebar hover tooltip
    // doesn't linger into the screenshot.
    const vp = page.viewportSize();
    await page.mouse.move((vp?.width ?? 1440) * 0.6, 300);
    return;
  }
  // Mobile: hidden behind the "More" sheet.
  await page.locator('#sidebar [data-nav-view="more"]').click();
  const sheet = page.locator('[data-testid="mobile-more-sheet"]');
  await sheet.waitFor({ timeout: 5_000 });
  await sheet.locator(`[data-nav-view="${view}"]`).click();
}

const isMac = process.platform === "darwin";
const MOD = isMac ? "Meta" : "Control";

/* ── Desktop 1440x900 ──────────────────────────────────────────────── */

test.describe("UI audit shots — desktop 1440x900", () => {
  test("all 15 nav views", async ({ page }) => {
    await bootSeeded(page);
    const views: { id: string; name: string; wait?: () => Promise<void> }[] = [
      {
        id: "screener",
        name: "gate-screener",
        wait: async () => {
          await page
            .locator('[data-testid^="gate-approve-"]')
            .first()
            .waitFor({ timeout: 8_000 })
            .catch(() => {});
        },
      },
      {
        id: "imbox",
        name: "imbox",
        wait: async () => {
          await page
            .locator('[data-feed-card="message"]')
            .first()
            .waitFor({ timeout: 8_000 });
        },
      },
      { id: "feed", name: "stream" },
      { id: "paperTrail", name: "records" },
      { id: "contacts", name: "contacts" },
      { id: "companies", name: "companies" },
      { id: "calendar", name: "calendar" },
      { id: "files", name: "files" },
      { id: "drafts", name: "drafts" },
      { id: "followUps", name: "follow-ups" },
      { id: "clips", name: "clips" },
      { id: "insights", name: "insights" },
      { id: "trash", name: "trash" },
      { id: "spam", name: "spam" },
      { id: "settings", name: "settings" },
    ];
    for (const v of views) {
      await navTo(page, v.id);
      await v.wait?.();
      await shoot(page, "desktop", `view-${v.name}`, 500);
    }
  });

  test("imbox message detail panel", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "imbox");
    const firstCard = page.locator('[data-feed-card="message"]').first();
    await firstCard.waitFor({ timeout: 8_000 });
    await firstCard.click();
    await page.locator("#detail-panel").waitFor({ timeout: 8_000 });
    // MessagePanel defers the DOMPurify sanitize via setTimeout(0); give the
    // iframe/plain-text fallback a beat to render.
    await shoot(page, "desktop", "imbox-message-panel", 900);
  });

  test("imbox card hover action bar", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "imbox");
    const card = page.locator('[data-feed-card="message"]').nth(1);
    await card.waitFor({ timeout: 8_000 });
    await card.hover();
    await page
      .locator("[data-feed-card-actions]")
      .first()
      .waitFor({ timeout: 3_000 })
      .catch(() => {});
    await shoot(page, "desktop", "imbox-card-hover", 400);
  });

  test("compose modal", async ({ page }) => {
    await bootSeeded(page);
    await page.locator("body").click();
    await page.keyboard.press(`${MOD}+n`);
    // Scope to the dialog: the Imbox "新邮件" tab also matches getByText
    // and trips strict mode. No accounts are seeded, so the dialog shows
    // the add-account empty state instead of the form fields.
    const dialog = page.getByRole("dialog", { name: "新邮件" });
    await dialog.waitFor({ timeout: 5_000 });
    await dialog
      .getByText("还没有绑定邮箱账户，暂时无法写信。")
      .waitFor({ timeout: 5_000 });
    await shoot(page, "desktop", "compose-modal", 500);
  });

  test("command palette", async ({ page }) => {
    await bootSeeded(page);
    await page.locator("body").click();
    await page.waitForTimeout(200);
    await page.keyboard.press(`${MOD}+k`);
    await page
      .locator('input[placeholder*="搜索视图"]')
      .waitFor({ timeout: 5_000 });
    // Type a query so the palette shows seeded results.
    await page.keyboard.type("陈晓", { delay: 30 });
    await shoot(page, "desktop", "command-palette", 500);
  });

  test("shortcut help modal", async ({ page }) => {
    await bootSeeded(page);
    await page.locator("body").click();
    await page.waitForTimeout(200);
    await page.keyboard.press("?");
    await page.getByText("键盘快捷键").waitFor({ timeout: 5_000 });
    await shoot(page, "desktop", "shortcut-help", 400);
  });

  test("settings tabs", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "settings");
    const tabs = [
      "profile",
      "accounts",
      "preferences",
      "agent",
      "labels",
      "snippets",
      "data",
      "shortcuts",
    ];
    for (const tab of tabs) {
      const item = page.locator(`[data-testid="settings-menu-item-${tab}"]`);
      if (await item.isVisible().catch(() => false)) {
        await item.click();
      }
      await shoot(page, "desktop", `settings-${tab}`, 450);
    }
  });

  test("sync badge add-account CTA", async ({ page }) => {
    await bootSeeded(page);
    // No accounts are seeded in browser mode: the badge is now a direct
    // "添加邮箱账户 →" CTA that jumps to Settings → Accounts instead of
    // opening an empty popover.
    await page.locator("[data-sync-badge]").click();
    await page.locator("#topbar").getByText("设置").waitFor({ timeout: 5_000 });
    await shoot(page, "desktop", "sync-badge-add-account", 400);
  });

  test("gate screener card detail", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "screener");
    await page
      .locator('[data-testid^="gate-approve-"]')
      .first()
      .waitFor({ timeout: 8_000 });
    await shoot(page, "desktop", "gate-card", 600);
  });

  test("pile board (replyLater) via imbox pile card", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "imbox");
    const pile = page.locator('[data-testid="pile-replyLater"]');
    await pile.waitFor({ timeout: 8_000 });
    await pile.click(); // expands the drawer
    await page
      .locator('[data-testid="pile-replyLater"] [data-pile-open-board]')
      .click();
    await shoot(page, "desktop", "pileboard-reply-later", 600);
  });
});

/* ── iPad portrait 820x1180 ────────────────────────────────────────── */

test.describe("UI audit shots — iPad portrait 820x1180", () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test("imbox", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "imbox");
    await page
      .locator('[data-feed-card="message"]')
      .first()
      .waitFor({ timeout: 8_000 });
    await shoot(page, "ipad", "imbox", 500);
  });

  test("calendar", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "calendar");
    await shoot(page, "ipad", "calendar", 600);
  });

  test("settings", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "settings");
    await shoot(page, "ipad", "settings", 500);
  });

  test("message detail overlay panel", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "imbox");
    const firstCard = page.locator('[data-feed-card="message"]').first();
    await firstCard.waitFor({ timeout: 8_000 });
    await firstCard.click();
    await page.locator("#detail-panel").waitFor({ timeout: 8_000 });
    await shoot(page, "ipad", "message-panel", 900);
  });
});

/* ── iPhone SE 375x667 ─────────────────────────────────────────────── */

test.describe("UI audit shots — iPhone SE 375x667", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("imbox + bottom tab bar", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "imbox");
    await page
      .locator('[data-feed-card="message"]')
      .first()
      .waitFor({ timeout: 8_000 });
    await shoot(page, "iphone", "imbox", 500);
  });

  test("more sheet", async ({ page }) => {
    await bootSeeded(page);
    await page.locator('#sidebar [data-nav-view="more"]').click();
    await page
      .locator('[data-testid="mobile-more-sheet"]')
      .waitFor({ timeout: 5_000 });
    await shoot(page, "iphone", "more-sheet", 400);
  });

  test("message detail full-screen sheet", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "imbox");
    const firstCard = page.locator('[data-feed-card="message"]').first();
    await firstCard.waitFor({ timeout: 8_000 });
    await firstCard.click();
    await page.locator("#detail-panel").waitFor({ timeout: 8_000 });
    await shoot(page, "iphone", "message-sheet", 900);
  });

  test("compose full-screen", async ({ page }) => {
    await bootSeeded(page);
    await page.locator("body").click();
    await page.keyboard.press(`${MOD}+n`);
    // Dialog-scoped: the Imbox "新邮件" tab trips strict mode on getByText.
    // No accounts seeded → the full-screen sheet shows the add-account
    // empty state with the mobile 取消/发送 header.
    const dialog = page.getByRole("dialog", { name: "新邮件" });
    await dialog.waitFor({ timeout: 5_000 });
    await dialog
      .getByText("还没有绑定邮箱账户，暂时无法写信。")
      .waitFor({ timeout: 5_000 });
    await shoot(page, "iphone", "compose", 500);
  });

  test("settings mobile menu", async ({ page }) => {
    await bootSeeded(page);
    await navTo(page, "settings");
    await page
      .locator('[data-testid="settings-menu"]')
      .waitFor({ timeout: 8_000 });
    await shoot(page, "iphone", "settings-menu", 500);
    // Also capture one sub-page with the mobile header.
    await page.locator('[data-testid="settings-menu-item-profile"]').click();
    await page
      .locator('[data-testid="settings-mobile-header"]')
      .waitFor({ timeout: 5_000 });
    await shoot(page, "iphone", "settings-profile", 500);
  });
});
