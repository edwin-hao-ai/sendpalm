/** Centralized label / color maps — single source of truth.
 * Mirrors prototype's D.stageLabel / D.stageColor / D.stageSuggest.
 */

import type { ContactStage, FileType, MessageBucket } from "../types";
import type { ViewName } from "../stores/ui";

export const STAGE_LABEL: Record<ContactStage, string> = {
  explore: "探索期",
  build: "建立期",
  active: "活跃期",
  maintain: "维护期",
  cold: "冷淡期",
  rekindle: "重新激活",
};

export const STAGE_COLOR: Record<ContactStage, string> = {
  explore: "#af52de",
  build: "#0A8F63",
  active: "#34c759",
  maintain: "#5ac8fa",
  cold: "#ff3b30",
  rekindle: "#ff9500",
};

export const STAGE_SUGGEST: Record<ContactStage, string> = {
  cold: "建议发送问候重新激活",
  active: "关系健康，保持当前频率",
  build: "建议安排一次深度交流",
  maintain: "维持定期沟通节奏",
  explore: "建议介绍公司和合作方向",
  rekindle: "建议提供新的价值点",
};

export const BUCKET_LABEL: Record<MessageBucket, string> = {
  imbox: "收件箱",
  feed: "报刊",
  paperTrail: "单据",
  trash: "回收站",
  spam: "垃圾邮件",
};

/** User-facing names for every route. This is the ONLY place a view name
 *  may be spelled out — sidebar, page titles, ⌘K, tooltips and empty
 *  states all read from here. The English `NAV_SECTIONS[].label` stays
 *  untouched because it doubles as the `data-nav` test hook. */
export const VIEW_LABEL: Record<ViewName, string> = {
  screener: "筛选台",
  screenerHistory: "筛选历史",
  imbox: "收件箱",
  feed: "报刊",
  paperTrail: "单据",
  trash: "回收站",
  spam: "垃圾邮件",
  contacts: "联系人",
  companies: "公司",
  calendar: "日历",
  files: "文件",
  insights: "洞察",
  drafts: "草稿",
  followUps: "跟进",
  tasks: "任务",
  clips: "片段",
  search: "搜索",
  settings: "设置",
  agent: "Agent",
  focusReply: "专注回复",
  readTogether: "一起读",
  replyLater: "稍后回复",
  setAside: "已搁置",
  bubbleUp: "提醒",
  folders: "文件夹",
  onboarding: "上手",
};

export function viewLabel(name: ViewName): string {
  return VIEW_LABEL[name] ?? name;
}

/** Safe lookup for values that arrive as a plain string (IPC payloads,
 *  filter state, rule targets). */
export function bucketLabel(bucket: string): string {
  return (BUCKET_LABEL as Record<string, string>)[bucket] ?? bucket;
}

export const BUCKET_ICON: Record<string, string> = {
  imbox: "ph-tray",
  feed: "ph-newspaper",
  paperTrail: "ph-receipt",
  trash: "ph-trash",
  spam: "ph-warning-circle",
  gate: "ph-shield-check",
};

/** Map a file type to a Phosphor icon name. */
export function fileIconName(type: FileType): string {
  switch (type) {
    case "image":
      return "ph-file-image";
    case "pdf":
      return "ph-file-pdf";
    case "spreadsheet":
      return "ph-file-xls";
    case "doc":
      return "ph-file-doc";
    default:
      return "ph-file-text";
  }
}

/** Map a 0–100 health score to the prototype's contact group. */
export function healthToGroup(health: number): "active" | "risk" | "cold" {
  if (health >= 70) return "active";
  if (health >= 40) return "risk";
  return "cold";
}

/* Sidebar nav config — mirrors prototype navSections */
export interface NavSection {
  id: string;
  label: string;
  icon: string;
  view: string;
  hint?: string;
  badge?: () => number;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "gate",
    label: "Gate",
    icon: "ph-shield-check",
    view: "screener",
    hint: "⌘1",
  },
  { id: "imbox", label: "Inbox", icon: "ph-tray", view: "imbox", hint: "⌘2" },
  {
    id: "feed",
    label: "Stream",
    icon: "ph-newspaper",
    view: "feed",
    hint: "⌘3",
  },
  {
    id: "paperTrail",
    label: "Records",
    icon: "ph-receipt",
    view: "paperTrail",
    hint: "⌘4",
  },
  {
    id: "contacts",
    label: "联系人",
    icon: "ph-users",
    view: "contacts",
    hint: "⌘5",
  },
  {
    id: "companies",
    label: "Companies",
    icon: "ph-buildings",
    view: "companies",
  },
  {
    id: "calendar",
    label: "日历",
    icon: "ph-calendar",
    view: "calendar",
    hint: "⌘6",
  },
  {
    id: "files",
    label: "Files",
    icon: "ph-paperclip",
    view: "files",
    hint: "⌘7",
  },
  { id: "drafts", label: "Drafts", icon: "ph-pencil-line", view: "drafts" },
  { id: "tasks", label: "Tasks", icon: "ph-check-square", view: "tasks" },
  {
    id: "followUps",
    label: "Follow-ups",
    icon: "ph-bell-ringing",
    view: "followUps",
  },
  { id: "clips", label: "Clips", icon: "ph-bookmarks", view: "clips" },
  { id: "folders", label: "文件夹", icon: "ph-folder", view: "folders" },
  {
    id: "insights",
    label: "Insights",
    icon: "ph-chart-line-up",
    view: "insights",
    hint: "⌘8",
  },
  { id: "trash", label: "Trash", icon: "ph-trash", view: "trash" },
  { id: "spam", label: "Spam", icon: "ph-warning-circle", view: "spam" },
  { id: "settings", label: "Settings", icon: "ph-gear", view: "settings" },
  /* The three workflow piles are destinations, not floating buttons:
   * each one is a real list with its own header and bulk actions. */
  {
    id: "replyLater",
    label: "Reply later",
    icon: "ph-clock",
    view: "replyLater",
  },
  {
    id: "setAside",
    label: "Set aside",
    icon: "ph-push-pin",
    view: "setAside",
  },
  {
    id: "bubbleUp",
    label: "Remind",
    icon: "ph-arrow-fat-line-up",
    view: "bubbleUp",
  },
];

/** Workspace metadata is additive; NAV_SECTIONS remains the route/shortcut source. */
export interface NavGroup {
  id: string;
  label: string;
  icon: string;
  defaultView: ViewName;
  views: ViewName[];
  /** Hidden from the mobile bottom tab bar (still reachable from the
   *  "更多" sheet and from each view's own entry point). The tab bar
   *  caps out at six items — a seventh crushes the 44px touch targets. */
  mobileRail?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "mail",
    label: "邮件",
    icon: "ph-tray",
    defaultView: "imbox",
    views: ["screener", "imbox", "feed", "paperTrail", "drafts", "spam", "trash"],
  },
  {
    id: "piles",
    label: "待处理",
    icon: "ph-clock",
    defaultView: "replyLater",
    views: ["replyLater", "setAside", "bubbleUp"],
    mobileRail: true,
  },
  {
    id: "calendar",
    label: "日历",
    icon: "ph-calendar",
    defaultView: "calendar",
    views: ["calendar"],
  },
  {
    id: "contacts",
    label: "联系人",
    icon: "ph-users",
    defaultView: "contacts",
    views: ["contacts", "companies"],
  },
  {
    id: "tasks",
    label: "任务",
    icon: "ph-bell-ringing",
    defaultView: "tasks",
    views: ["tasks", "followUps"],
  },
  {
    id: "library",
    label: "资料库",
    icon: "ph-paperclip",
    defaultView: "files",
    views: ["files", "clips", "folders"],
  },
  {
    id: "more",
    label: "更多",
    icon: "ph-dots-three",
    defaultView: "insights",
    views: ["insights", "settings"],
  },
];
