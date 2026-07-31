/** Titlebar — macOS-style drag region + traffic lights (Tauri native handles the rest). */

import { onCleanup, onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function Titlebar() {
  const onMouseDown = (e: MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest("button")) return;
    getCurrentWindow().startDragging().catch(() => {});
  };

  onMount(() => {
    const stop = () => { /* no-op; placeholder for future drag tracking */ };
    document.addEventListener("mouseup", stop);
    onCleanup(() => document.removeEventListener("mouseup", stop));
  });

  return (
    <header
      id="titlebar"
      onMouseDown={onMouseDown}
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        height: "var(--titlebar-height)",
        background: "var(--surface)",
        "border-bottom": "0.5px solid var(--border)",
        "user-select": "none",
        "-webkit-app-region": "drag",
        position: "relative",
        "z-index": "var(--z-sticky)",
      }}
    >
      <span
        style={{
          "font-size": "11px",
          "font-weight": "600",
          color: "var(--text-muted)",
          "letter-spacing": "0.04em",
        }}
      >
        SendPalm
      </span>
    </header>
  );
}