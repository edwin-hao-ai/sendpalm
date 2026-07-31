/** Topbar — search, view title, notification bell, avatar. */

import { Icon } from "./Icon";
import {
  commandPaletteOpen,
  setCommandPaletteOpen,
  notificationsOpen,
  setNotificationsOpen,
  setSearchOpen,
  view,
} from "../stores/ui";
import { NAV_SECTIONS } from "../utils/labels";
import { Avatar } from "./Avatar";

export function Topbar() {
  const currentTitle = () => {
    const sec = NAV_SECTIONS.find((s) => s.view === view());
    return sec?.label ?? "SendPalm";
  };

  return (
    <header
      id="topbar"
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between",
        height: "var(--topbar-height)",
        padding: "0 var(--space-5)",
        background: "var(--surface)",
        "border-bottom": "0.5px solid var(--border)",
        gap: "var(--space-4)",
        position: "relative",
        "z-index": "var(--z-sticky)",
      }}
    >
      <h1
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h4)",
          "font-weight": "800",
          color: "var(--text-primary)",
          margin: 0,
          "letter-spacing": "-0.01em",
        }}
      >
        {currentTitle()}
      </h1>

      <div style={{ display: "flex", "align-items": "center", gap: "var(--space-3)", flex: 1, "max-width": "560px" }}>
        <button
          onClick={() => setSearchOpen(true)}
          title="Search (/)"
          aria-label="Search"
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-2)",
            width: "100%",
            padding: "8px 14px",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-pill)",
            color: "var(--text-muted)",
            "font-size": "var(--text-caption)",
            border: "0.5px solid var(--border)",
            cursor: "text",
          }}
        >
          <Icon name="ph-magnifying-glass" size={14} />
          <span>Search contacts, messages, files…</span>
          <span style={{ "margin-left": "auto", "font-size": "10px", "font-weight": "600" }}>⌘K</span>
        </button>
      </div>

      <div style={{ display: "flex", "align-items": "center", gap: "var(--space-2)" }}>
        <button
          onClick={() => setCommandPaletteOpen(!commandPaletteOpen())}
          title="Command palette (⌘K)"
          aria-label="Command palette"
          style={iconButtonStyle}
        >
          <Icon name="ph-lightning" size={18} />
        </button>
        <button
          onClick={() => setNotificationsOpen(!notificationsOpen())}
          title="Notifications"
          aria-label="Notifications"
          style={iconButtonStyle}
        >
          <Icon name="ph-bell" size={18} />
        </button>
        <Avatar name="Edwin Hao" size={28} />
      </div>
    </header>
  );
}

const iconButtonStyle = {
  width: "36px",
  height: "36px",
  "border-radius": "var(--radius-pill)",
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  color: "var(--text-secondary)",
  transition: "background var(--duration-fast) var(--ease-out)",
};