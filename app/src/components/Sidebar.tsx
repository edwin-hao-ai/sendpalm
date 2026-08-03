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
      data-testid="sidebar"
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
            view={section.view}
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
  view: string;
  active: boolean;
  onClick: () => void;
}) {
  const { isMobile } = useViewport();
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      data-nav={props.label}
      data-nav-view={props.view}
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        width: isMobile() ? "auto" : "100%",
        "max-width": isMobile() ? "auto" : "92px",
        height: isMobile() ? "auto" : "56px",
        padding: isMobile() ? "0" : "4px 4px",
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
            "font-size": "10px",
            "font-weight": "600",
            "margin-top": "3px",
            "letter-spacing": "0.01em",
            "white-space": "nowrap",
            "max-width": "100%",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {props.label}
        </span>
      </Show>
    </button>
  );
}