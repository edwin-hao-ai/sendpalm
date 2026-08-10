/** Global keyboard shortcut router — wired up in App.tsx.
 * Loads shortcuts from the `shortcuts` table and dispatches by `action`.
 * Implements PRD §3.17 complete shortcut set.
 */

import { createResource, onCleanup, onMount } from "solid-js";
import {
  setView,
  view,
  setCommandPaletteOpen,
  commandPaletteOpen,
  setSearchOpen,
  searchOpen,
  setNotificationsOpen,
  notificationsOpen,
  setComposeOpen,
  composeOpen,
  setDetailOpen,
  detailOpen,
  selectedMessageId,
  setSelectedMessageId,
  selectedContactId,
  setSelectedContactId,
  setAgentPanelOpen,
  agentPanelOpen,
  showToast,
  setCursorIndex,
  setHelpOpen,
  helpOpen,
  setComposeContext,
  setCalendarView,
  calendarView,
  setCalendarSelected,
  calendarSelected,
  setCalendarWeekStart,
  setCalendarYearAnchor,
} from "../stores/ui";
import { getMessage, listShortcuts, upsertMessage } from "../stores/data";
import { startOfWeek } from "./date";
import { DEFAULT_SHORTCUTS } from "./shortcut-defaults";
import { openBulkActionMenu } from "../components/BulkActionMenu";
import type { ViewName } from "../stores/ui";

function normalizeCombo(combo: string): string[] {
  return (
    combo
      // Insert explicit '+' around unicode modifier symbols and words so that
      // both "⌘k" and "⌘+k" parse to ["⌘", "k"].
      .replace(/(⌘|⇧|ctrl|cmd|meta)(?![+])/gi, "$1+")
      .split("+")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function matches(e: KeyboardEvent, combo: string): boolean {
  const parts = normalizeCombo(combo);
  const key = parts[parts.length - 1] ?? "";
  const needMeta =
    parts.includes("cmd") ||
    parts.includes("⌘") ||
    parts.includes("meta") ||
    parts.includes("ctrl");
  const needShift = parts.includes("shift") || parts.includes("⇧");
  if (needMeta !== (e.metaKey || e.ctrlKey)) return false;
  if (needShift !== e.shiftKey) return false;

  const eventKey = e.key.toLowerCase();
  const mappedKey = key.replace(/arrow/g, "");
  if (["left", "right", "up", "down"].includes(eventKey)) {
    return mappedKey === eventKey;
  }
  return eventKey === key;
}

const NAV_VIEWS: Record<string, ViewName> = {
  "nav:screener": "screener",
  "nav:imbox": "imbox",
  "nav:feed": "feed",
  "nav:paperTrail": "paperTrail",
  "nav:contacts": "contacts",
  "nav:calendar": "calendar",
  "nav:files": "files",
  "nav:insights": "insights",
  "nav:settings": "settings",
  "nav:drafts": "drafts",
};

function isListView(v: ViewName): boolean {
  return ["imbox", "feed", "paperTrail", "trash", "spam"].includes(v);
}

export function useGlobalShortcuts() {
  const [shortcuts] = createResource(listShortcuts);

  const handlers: Record<string, (e: KeyboardEvent) => void | Promise<void>> = {
    "app:command-palette": (e) => {
      e.preventDefault();
      setCommandPaletteOpen(!commandPaletteOpen());
    },
    "app:search": (e) => {
      e.preventDefault();
      setSearchOpen(!searchOpen());
    },
    "app:help": (e) => {
      e.preventDefault();
      setHelpOpen(true);
    },
    "app:compose": (e) => {
      e.preventDefault();
      setComposeContext({ mode: "new" });
      setComposeOpen(true);
    },
    "app:agent": (e) => {
      e.preventDefault();
      setAgentPanelOpen(true);
    },
    "app:notifications": (e) => {
      e.preventDefault();
      setNotificationsOpen(!notificationsOpen());
    },

    ...(Object.fromEntries(
      Object.entries(NAV_VIEWS).map(([action, target]) => [
        action,
        (e: KeyboardEvent) => {
          e.preventDefault();
          setView(target);
        },
      ]),
    ) as Record<string, (e: KeyboardEvent) => void>),

    "list:cursor-down": (e) => {
      if (!isListView(view())) return;
      // Imbox has its own j/k local handler; avoid double cursor movement.
      if (view() === "imbox") return;
      e.preventDefault();
      setCursorIndex((i) => Math.max(0, i + 1));
    },
    "list:cursor-up": (e) => {
      if (!isListView(view())) return;
      if (view() === "imbox") return;
      e.preventDefault();
      setCursorIndex((i) => Math.max(0, i - 1));
    },
    "list:select": (e) => {
      if (!isListView(view())) return;
      // Imbox has its own local x-key handler; avoid double toast.
      if (view() === "imbox") return;
      e.preventDefault();
      showToast({ message: "多选（M3 完整实现）", kind: "info" });
    },
    "list:open": (e) => {
      if (!isListView(view())) return;
      // Imbox handles Enter locally.
      if (view() === "imbox") return;
      const id = selectedMessageId();
      if (id) {
        e.preventDefault();
        setDetailOpen(true);
      }
    },

    "message:reply": async (e) => {
      const id = selectedMessageId();
      if (!id) return;
      e.preventDefault();
      const m = await getMessage(id);
      if (!m) return;
      setComposeContext({ mode: "reply", originalMsg: m });
      setComposeOpen(true);
    },
    "message:forward": async (e) => {
      const id = selectedMessageId();
      if (!id) return;
      e.preventDefault();
      const m = await getMessage(id);
      if (!m) return;
      setComposeContext({ mode: "forward", originalMsg: m });
      setComposeOpen(true);
    },
    "message:reply-later": async (e) => {
      // Imbox handles 'l' locally for Reply Later.
      if (view() === "imbox") return;
      await toggleMessageFlag(e, "replyLater", "已设为 Reply Later");
    },
    "message:set-aside": async (e) => {
      await toggleMessageFlag(e, "setAside", "已设为 Set Aside");
    },
    "message:bubble-up": async (e) => {
      const id = selectedMessageId();
      if (!id) return;
      e.preventDefault();
      const m = await getMessage(id);
      if (!m) return;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      await upsertMessage({ ...m, bubbleUpAt: tomorrow.toISOString() });
      showToast({ message: "已 Bubble Up 到明天 9:00", kind: "success" });
    },
    "message:archive": async (e) => {
      await setMessageBucket(e, "paperTrail", "已归档到 Records");
    },
    "message:trash": async (e) => {
      await setMessageBucket(e, "trash", "已移到 Trash");
    },
    "message:spam": async (e) => {
      await setMessageBucket(e, "spam", "已移到 Spam");
    },
    "message:unread": async (e) => {
      const id = selectedMessageId();
      if (!id) return;
      e.preventDefault();
      const m = await getMessage(id);
      if (!m) return;
      await upsertMessage({ ...m, unread: !m.unread });
      showToast({
        message: m.unread ? "已标为已读" : "已标为未读",
        kind: "success",
      });
    },
    "message:label": (e) => {
      const id = selectedMessageId();
      if (!id) return;
      e.preventDefault();
      setView("imbox");
      setDetailOpen(true);
      window.dispatchEvent(
        new CustomEvent("sp:message:label", { detail: { messageId: id } }),
      );
    },
    "message:move": (e) => {
      const id = selectedMessageId();
      if (!id) return;
      e.preventDefault();
      setView("imbox");
      setDetailOpen(true);
      window.dispatchEvent(
        new CustomEvent("sp:message:move", { detail: { messageId: id } }),
      );
    },
    "bulk:menu": (e) => {
      if (!isListView(view())) return;
      e.preventDefault();
      openBulkActionMenu();
    },

    "calendar:day": (e) => {
      if (view() !== "calendar") return;
      e.preventDefault();
      setCalendarView("day");
    },
    "calendar:week": (e) => {
      if (view() !== "calendar") return;
      e.preventDefault();
      setCalendarView("week");
    },
    "calendar:year": (e) => {
      if (view() !== "calendar") return;
      e.preventDefault();
      setCalendarView("year");
    },
    "calendar:today": (e) => {
      if (view() !== "calendar") return;
      e.preventDefault();
      setCalendarSelected(new Date());
      setCalendarWeekStart(startOfWeek(new Date()));
      setCalendarYearAnchor(new Date());
    },
    "calendar:prev": (e) => {
      if (view() !== "calendar") return;
      e.preventDefault();
      shiftCalendar(-1);
    },
    "calendar:next": (e) => {
      if (view() !== "calendar") return;
      e.preventDefault();
      shiftCalendar(1);
    },
  };

  const isOverlayOpen = () =>
    commandPaletteOpen() ||
    searchOpen() ||
    notificationsOpen() ||
    composeOpen() ||
    helpOpen() ||
    detailOpen() ||
    agentPanelOpen();

  const handler = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    const inField =
      tag === "input" ||
      tag === "textarea" ||
      (e.target as HTMLElement)?.isContentEditable;

    // Always-on shortcuts work even in fields and overlays.
    const alwaysOn = [
      "app:command-palette",
      "app:search",
      "app:help",
      "app:compose",
      "app:agent",
      "app:notifications",
    ];

    if (e.key === "Escape") {
      if (commandPaletteOpen()) setCommandPaletteOpen(false);
      if (searchOpen()) setSearchOpen(false);
      if (notificationsOpen()) setNotificationsOpen(false);
      if (composeOpen()) setComposeOpen(false);
      if (helpOpen()) setHelpOpen(false);
      if (selectedMessageId()) {
        setSelectedMessageId(null);
        setDetailOpen(false);
      }
      if (selectedContactId()) {
        setSelectedContactId(null);
        setDetailOpen(false);
      }
      return;
    }

    const list = shortcuts() ?? [];
    const activeShortcuts = list.length > 0 ? list : DEFAULT_SHORTCUTS;
    for (const s of activeShortcuts) {
      if (!matches(e, s.combo)) continue;
      const fn = handlers[s.action];
      if (!fn) continue;
      if (inField && !alwaysOn.includes(s.action)) continue;
      if (isOverlayOpen() && !alwaysOn.includes(s.action)) continue;
      try {
        const r = fn(e);
        if (r && typeof r.then === "function") {
          r.catch((err: unknown) => {
            console.error("[shortcut] action failed:", s.action, err);
          });
        }
      } catch (err) {
        console.error("[shortcut] action threw:", s.action, err);
      }
      return;
    }
  };

  onMount(() => {
    document.addEventListener("keydown", handler);
  });
  onCleanup(() => {
    document.removeEventListener("keydown", handler);
  });
}

async function toggleMessageFlag(
  e: KeyboardEvent,
  key: "replyLater" | "setAside",
  successMsg: string,
) {
  const id = selectedMessageId();
  if (!id) return;
  e.preventDefault();
  const m = await getMessage(id);
  if (!m) return;
  await upsertMessage({ ...m, [key]: !m[key] });
  showToast({ message: successMsg, kind: "success" });
}

async function setMessageBucket(
  e: KeyboardEvent,
  bucket: "trash" | "spam" | "paperTrail",
  successMsg: string,
) {
  const id = selectedMessageId();
  if (!id) return;
  e.preventDefault();
  const m = await getMessage(id);
  if (!m) return;
  await upsertMessage({ ...m, bucket });
  showToast({ message: successMsg, kind: "success" });
}

function shiftCalendar(dir: 1 | -1) {
  const v = calendarView();
  const d = calendarSelected();
  const next = new Date(d);
  if (v === "day") next.setDate(next.getDate() + dir);
  else if (v === "week") next.setDate(next.getDate() + dir * 7);
  else next.setFullYear(next.getFullYear() + dir);
  setCalendarSelected(next);
  setCalendarWeekStart(startOfWeek(next));
  setCalendarYearAnchor(next);
}
