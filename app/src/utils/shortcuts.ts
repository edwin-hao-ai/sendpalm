/** Global keyboard shortcut router — wired up in App.tsx. */

import { onCleanup, onMount } from "solid-js";
import {
  setView,
  setCommandPaletteOpen,
  commandPaletteOpen,
  setSearchOpen,
  searchOpen,
  setNotificationsOpen,
  setComposeOpen,
  composeOpen,
  notificationsOpen,
  setDetailOpen,
  selectedMessageId,
  setSelectedMessageId,
  showToast,
} from "../stores/ui";

function matches(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+").map((p) => p.trim().toLowerCase());
  const key = parts[parts.length - 1];
  const needMeta = parts.includes("cmd") || parts.includes("⌘") || parts.includes("meta");
  const needShift = parts.includes("shift") || parts.includes("⇧");
  if (needMeta !== (e.metaKey || e.ctrlKey)) return false;
  if (needShift !== e.shiftKey) return false;
  return e.key.toLowerCase() === key;
}

export function useGlobalShortcuts() {
  const handler = (e: KeyboardEvent) => {
    // Don't intercept while typing in inputs
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    const inField = tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable;

    // Always-on: ⌘K / Ctrl+K
    if (matches(e, "⌘k") || matches(e, "ctrl+k")) {
      e.preventDefault();
      setCommandPaletteOpen(!commandPaletteOpen());
      return;
    }
    if (matches(e, "/")) {
      if (!inField) {
        e.preventDefault();
        setSearchOpen(!searchOpen());
        return;
      }
    }
    if (e.key === "Escape") {
      if (commandPaletteOpen()) setCommandPaletteOpen(false);
      if (searchOpen()) setSearchOpen(false);
      if (notificationsOpen()) setNotificationsOpen(false);
      if (composeOpen()) setComposeOpen(false);
      if (selectedMessageId()) {
        setSelectedMessageId(null);
        setDetailOpen(false);
      }
      return;
    }
    if (matches(e, "⌘n")) {
      e.preventDefault();
      setComposeOpen(true);
      return;
    }

    if (inField) return;

    // View nav with ⌘1..9
    if (e.metaKey || e.ctrlKey) {
      const viewMap: Record<string, () => void> = {
        "1": () => setView("screener"),
        "2": () => setView("imbox"),
        "3": () => setView("feed"),
        "4": () => setView("paperTrail"),
        "5": () => setView("contacts"),
        "6": () => setView("calendar"),
        "7": () => setView("files"),
        "8": () => setView("insights"),
        "9": () => setView("settings"),
      };
      const fn = viewMap[e.key];
      if (fn) {
        e.preventDefault();
        fn();
        return;
      }
    }

    if (e.key === "?") {
      showToast({
        message: `快捷键：⌘K 命令面板 · / 搜索 · ⌘1-9 视图 · ⌘N 写信 · ESC 关闭`,
        kind: "info",
        ttlMs: 6000,
      });
    }
  };

  onMount(() => {
    document.addEventListener("keydown", handler);
  });
  onCleanup(() => {
    document.removeEventListener("keydown", handler);
  });
}