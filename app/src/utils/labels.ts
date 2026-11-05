/** Centralized label / color maps — single source of truth.
 * Mirrors prototype's D.stageLabel / D.stageColor / D.stageSuggest.
 */

import type { ContactStage, FileType } from "../types";
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

export const BUCKET_LABEL: Record<string, string> = {
  imbox: "Inbox",
  feed: "Stream",
  paperTrail: "Records",
  trash: "回收站",
  spam: "垃圾邮件",
};

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
    label: "Contacts",
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
    label: "Calendar",
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
];

/** Workspace metadata is additive; NAV_SECTIONS remains the route/shortcut source. */
export interface NavGroup {
  id: string;
  label: string;
  icon: string;
  defaultView: ViewName;
  views: ViewName[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "mail",
    label: "Mail",
    icon: "ph-tray",
    defaultView: "imbox",
    views: ["screener", "imbox", "feed", "paperTrail", "drafts", "spam", "trash"],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: "ph-calendar",
    defaultView: "calendar",
    views: ["calendar"],
  },
  {
    id: "contacts",
    label: "Contacts",
    icon: "ph-users",
    defaultView: "contacts",
    views: ["contacts", "companies"],
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "ph-bell-ringing",
    defaultView: "tasks",
    views: ["tasks", "followUps"],
  },
  {
    id: "library",
    label: "Library",
    icon: "ph-paperclip",
    defaultView: "files",
    views: ["files", "clips", "folders"],
  },
  {
    id: "more",
    label: "More",
    icon: "ph-dots-three",
    defaultView: "insights",
    views: ["insights", "settings"],
  },
];
