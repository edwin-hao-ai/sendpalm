/** Sidebar — left rail with nav icons. Bottom-tab-bar on mobile. */

import { For, Show } from "solid-js";
import { Icon } from "./Icon";
import { setView, view } from "../stores/ui";
import { NAV_SECTIONS } from "../utils/labels";
import { useViewport } from "../utils/gestures";

export function Sidebar() {
  const { isMobile } = useViewport();
  return (
    <nav
      id="sidebar"
      style={{
        display: "flex",
        "flex-direction": isMobile() ? "row" : "column",
        background: "var(--paper-mid)",
        "border-right": isMobile() ? "none" : "0.5px solid var(--border)",
        "border-top": isMobile() ? "0.5px solid var(--border)" : "none",
        padding: isMobile() ? "0 var(--space-2)" : "var(--space-3) 0",
        "align-items": "center",
        "justify-content": isMobile() ? "space-around" : "flex-start",
        gap: isMobile() ? "0" : "var(--space-1)",
        position: "relative",
        "z-index": "var(--z-sticky)",
      }}
    >
      <For each={NAV_SECTIONS}>
        {(section) => (
          <NavItem
            icon={section.icon}
            label={section.label}
            active={view() === section.view}
            onClick={() => setView(section.view as never)}
          />
        )}
      </For>
    </nav>
  );
}

function NavItem(props: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const { isMobile } = useViewport();
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        width: isMobile() ? "auto" : "48px",
        height: isMobile() ? "auto" : "48px",
        "border-radius": isMobile() ? "8px" : "var(--radius-md)",
        background: props.active ? "var(--palm-soft)" : "transparent",
        color: props.active ? "var(--palm)" : "var(--text-secondary)",
        "margin-bottom": isMobile() ? "0" : "2px",
        transition: "background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        if (!props.active) {
          e.currentTarget.style.background = "rgba(35,28,51,0.04)";
        }
      }}
      onMouseLeave={(e) => {
        if (!props.active) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <Icon name={props.icon} size={isMobile() ? 20 : 18} />
      <Show when={!isMobile()}>
        <span
          style={{
            "font-size": "9px",
            "font-weight": "600",
            "margin-top": "3px",
            "letter-spacing": "0.02em",
          }}
        >
          {props.label.slice(0, 5)}
        </span>
      </Show>
    </button>
  );
}