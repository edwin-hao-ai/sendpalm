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
          display: "inline-flex",
          "align-items": "center",
          gap: "6px",
          color: "var(--text-muted)",
        }}
      >
        <img
          src="/src/assets/logo-mark.svg"
          alt=""
          width="16"
          height="16"
          style={{ display: "block" }}
        />
        <span
          style={{
            "font-size": "11px",
            "font-weight": "700",
            "letter-spacing": "0.02em",
          }}
        >
          SendPalm
        </span>
      </span>
    </header>
  );
}