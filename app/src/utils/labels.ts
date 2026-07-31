/** Centralized label / color maps — single source of truth.
 * Mirrors prototype's D.stageLabel / D.stageColor / D.stageSuggest.
 */

import type { ContactStage } from "../types";

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
  imbox: "Imbox",
  feed: "Stream",
  paperTrail: "Records",
  trash: "Trash",
  spam: "Spam",
};

export const BUCKET_ICON: Record<string, string> = {
  imbox: "ph-tray",
  feed: "ph-newspaper",
  paperTrail: "ph-receipt",
  trash: "ph-trash",
  spam: "ph-warning-circle",
  gate: "ph-shield-check",
};

/* Sidebar nav config — mirrors prototype navSections */
export interface NavSection {
  id: string;
  label: string;
  icon: string;
  view: string;
  badge?: () => number;
}

export const NAV_SECTIONS: NavSection[] = [
  { id: "gate", label: "Gate", icon: "ph-shield-check", view: "screener" },
  { id: "imbox", label: "Imbox", icon: "ph-tray", view: "imbox" },
  { id: "feed", label: "Stream", icon: "ph-newspaper", view: "feed" },
  { id: "paperTrail", label: "Records", icon: "ph-receipt", view: "paperTrail" },
  { id: "contacts", label: "Contacts", icon: "ph-users", view: "contacts" },
  { id: "companies", label: "Companies", icon: "ph-buildings", view: "companies" },
  { id: "calendar", label: "Calendar", icon: "ph-calendar", view: "calendar" },
  { id: "files", label: "Files", icon: "ph-paperclip", view: "files" },
  { id: "drafts", label: "Drafts", icon: "ph-pencil-line", view: "drafts" },
  { id: "followUps", label: "Follow-ups", icon: "ph-bell-ringing", view: "followUps" },
  { id: "clips", label: "Clips", icon: "ph-bookmarks", view: "clips" },
  { id: "insights", label: "Insights", icon: "ph-chart-line-up", view: "insights" },
  { id: "settings", label: "Settings", icon: "ph-gear", view: "settings" },
];