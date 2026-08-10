/** Meeting helpers — pure functions only.
 *
 * Mirrors prototype-v11's `generateMeetingBrief` and material linking logic.
 */

import type { CalendarEvent, Contact, FileItem, Message } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Build a short, auto-generated brief for a meeting from attendee context. */
export function generateMeetingBrief(
  event: CalendarEvent,
  messages: Message[],
  files: FileItem[],
  contacts: Contact[],
): string[] {
  const items: string[] = [];
  const pids = event.pids ?? [];
  const cutoff = Date.now() - 30 * DAY_MS;

  const recent = messages.filter((m) => {
    if (!pids.includes(m.pid)) return false;
    const t = new Date(m.st).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  });

  if (recent.length > 0) {
    const names = pids
      .map((pid) => contacts.find((c) => c.id === pid)?.name)
      .filter(Boolean)
      .join(" + ");
    items.push(`过去 30 天与 ${names} 共有 ${recent.length} 条沟通。`);

    // Topic extraction: use simple keyword frequency on subject + body.
    const topicCounts = new Map<string, number>();
    for (const m of recent) {
      const text = `${m.subj} ${m.body}`;
      for (const topic of extractTopics(text)) {
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
    }
    const topTopic = [...topicCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topTopic) {
      items.push(`主要话题：${topTopic[0]}（${topTopic[1]} 次提及）。`);
    }
  }

  // Waiting reply: messages from me marked reply-later (HEY "wait" flag).
  const waitingReply = messages.filter(
    (m) => pids.includes(m.pid) && m.direction === "out" && m.replyLater,
  );
  if (waitingReply.length > 0) {
    items.push(`你在等对方回复 ${waitingReply.length} 条消息。`);
  }

  // Shared attachments.
  const sharedFiles = files.filter((f) => pids.includes(f.pid));
  if (sharedFiles.length > 0) {
    items.push(
      `已与参会者共享 ${sharedFiles.length} 个附件（自动列入 Materials）。`,
    );
  }

  return items;
}

/** Extract candidate topic words from a message body/subject. */
function extractTopics(text: string): string[] {
  // A small keyword lexicon; expand as needed.
  const lexicon = [
    "合同",
    "报价",
    "发票",
    "付款",
    "会议",
    "面试",
    "offer",
    "项目",
    "需求",
    "设计",
    "开发",
    "测试",
    "上线",
    "部署",
    "bug",
    "issue",
    "roadmap",
    "review",
    "sync",
    "update",
    "feedback",
    "proposal",
    "agreement",
    "invoice",
    "payment",
    "schedule",
    "interview",
    "hiring",
    "onboarding",
  ];
  const lower = text.toLowerCase();
  return lexicon.filter((kw) => lower.includes(kw.toLowerCase()));
}

/** Build the set of file IDs that should appear in a meeting's Materials section.
 *  Explicit materials are merged with a few recent files from each attendee. */
export function linkedMaterialIds(
  event: CalendarEvent,
  files: FileItem[],
): string[] {
  const linked = new Set<string>();
  for (const m of event.materials ?? []) {
    linked.add(m.fileId);
  }
  const pids = event.pids ?? [];
  for (const pid of pids) {
    files
      .filter((f) => f.pid === pid)
      .slice(0, 3)
      .forEach((f) => linked.add(f.id));
  }
  return Array.from(linked);
}
