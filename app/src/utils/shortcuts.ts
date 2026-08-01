/** Global keyboard shortcut router — wired up in App.tsx.
 * Implements PRD §3.17 complete shortcut set.
 */

import { onCleanup, onMount } from "solid-js";
import {
  setView,
  setCommandPaletteOpen,
  commandPaletteOpen,
  setSearchOpen,
  searchOpen,
  setNotificationsOpen,
  notificationsOpen,
  setComposeOpen,
  composeOpen,
  setDetailOpen,
  selectedMessageId,
  setSelectedMessageId,
  selectedContactId,
  setSelectedContactId,
  setAgentPanelOpen,
  showToast,
  cursorIndex,
  setCursorIndex,
  setHelpOpen,
  helpOpen,
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
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    const inField = tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable;

    // Always-on
    if (matches(e, "⌘k") || matches(e, "ctrl+k")) {
      e.preventDefault();
      setCommandPaletteOpen(!commandPaletteOpen());
      return;
    }
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
    if (matches(e, "⌘n")) {
      e.preventDefault();
      setComposeOpen(true);
      return;
    }
    if (matches(e, "⌘/") || (e.key === "/" && !inField)) {
      e.preventDefault();
      setSearchOpen(!searchOpen());
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
        "0": () => setView("drafts"),
      };
      const fn = viewMap[e.key];
      if (fn) {
        e.preventDefault();
        fn();
        return;
      }
    }

    if (e.key === "?") {
      e.preventDefault();
      setHelpOpen(true);
      return;
    }
    if (e.shiftKey && e.key.toLowerCase() === "a") {
      // ⇧A: toggle agent panel
      e.preventDefault();
      setAgentPanelOpen(true);
      return;
    }
    if (e.shiftKey && e.key.toLowerCase() === "n") {
      // ⇧N: toggle notifications
      e.preventDefault();
      setNotificationsOpen(!notificationsOpen());
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

void cursorIndex;
void setCursorIndex;
void showToast;