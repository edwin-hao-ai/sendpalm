/** Sidebar — left rail with nav icons. Bottom-tab-bar on mobile.
 *  Mobile collapses the 15 nav entries into 6 primary tabs +
 *  a "More" sheet so tap targets stay >= 44px.
 */

import { For, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "./Icon";
import { setView, view } from "../stores/ui";
import { NAV_SECTIONS, type NavSection } from "../utils/labels";
import { useViewport } from "../utils/gestures";

const MOBILE_PRIMARY_VIEWS = new Set([
  "imbox",
  "screener",
  "contacts",
  "calendar",
  "files",
  "settings",
]);

export function Sidebar() {
  const { isMobile } = useViewport();
  const [moreOpen, setMoreOpen] = createSignal(false);

  const primary = () =>
    NAV_SECTIONS.filter((s) => MOBILE_PRIMARY_VIEWS.has(s.view));
  const overflow = () =>
    NAV_SECTIONS.filter((s) => !MOBILE_PRIMARY_VIEWS.has(s.view));
  const currentIsOverflow = () => overflow().some((s) => s.view === view());

  const navigate = (v: string) => {
    setView(v as never);
    setMoreOpen(false);
  };

  return (
    <>
      <nav
        id="sidebar"
        data-testid="sidebar"
        style={{
          display: "flex",
          "flex-direction": isMobile() ? "row" : "column",
          background: "var(--paper-mid)",
          "border-right": isMobile() ? "none" : "0.5px solid var(--border)",
          "border-top": isMobile() ? "0.5px solid var(--border)" : "none",
          padding: isMobile() ? undefined : "14px 0 12px",
          "padding-left": isMobile() ? "var(--space-2)" : undefined,
          "padding-right": isMobile() ? "var(--space-2)" : undefined,
          "align-items": "center",
          "justify-content": isMobile() ? "space-around" : "flex-start",
          gap: isMobile() ? "0" : "var(--space-1)",
          position: "relative",
          "z-index": "var(--z-sticky)",
        }}
      >
        <For each={isMobile() ? primary() : NAV_SECTIONS}>
          {(section) => (
            <NavItem
              icon={section.icon}
              label={section.label}
              hint={section.hint}
              view={section.view}
              active={view() === section.view}
              onClick={() => navigate(section.view)}
            />
          )}
        </For>
        {isMobile() && (
          <NavItem
            icon="ph-dots-three"
            label="More"
            view="more"
            active={currentIsOverflow()}
            onClick={() => setMoreOpen(true)}
          />
        )}
      </nav>

      <Show when={moreOpen()}>
        <MobileMoreSheet
          items={overflow()}
          onNavigate={navigate}
          onClose={() => setMoreOpen(false)}
        />
      </Show>
    </>
  );
}

function NavItem(props: {
  icon: string;
  label: string;
  hint?: string;
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
      data-active={props.active}
      style={{
        position: "relative",
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        width: isMobile() ? "auto" : "48px",
        "min-width": isMobile() ? "44px" : undefined,
        height: isMobile() ? "auto" : "46px",
        "min-height": isMobile() ? "44px" : undefined,
        padding: isMobile() ? "0" : "4px 4px",
        "border-radius": isMobile() ? "8px" : "var(--radius-md)",
        background: props.active ? "var(--palm-soft)" : "transparent",
        color: props.active ? "var(--palm)" : "var(--text-secondary)",
        "margin-bottom": isMobile() ? "0" : "2px",
        flex: isMobile() ? "1" : undefined,
        transition:
          "background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), transform 0.12s var(--ease-out)",
        transform: props.active ? "scale(1)" : undefined,
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
      <Show when={props.active && !isMobile()}>
        <div
          style={{
            position: "absolute",
            left: "-1px",
            top: "8px",
            bottom: "8px",
            width: "2px",
            "border-radius": "0 2px 2px 0",
            background: "var(--palm)",
          }}
        />
      </Show>
      <Icon
        name={props.icon}
        size={isMobile() ? 20 : 19}
        style={
          props.active && !isMobile() ? { transform: "scale(1.08)" } : undefined
        }
      />
      <Show when={!isMobile()}>
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "3px",
            "margin-top": "3px",
            "max-width": "100%",
          }}
        >
          <span
            style={{
              "font-size": "9.5px",
              "font-weight": "600",
              "letter-spacing": "0.005em",
              "white-space": "nowrap",
              overflow: "hidden",
              "text-overflow": "ellipsis",
            }}
          >
            {props.label}
          </span>
          <Show when={props.hint}>
            <span
              style={{
                "font-size": "9px",
                "font-weight": "700",
                color: props.active ? "var(--palm)" : "var(--text-muted)",
                opacity: 0.7,
              }}
            >
              {props.hint}
            </span>
          </Show>
        </div>
      </Show>
    </button>
  );
}

function MobileMoreSheet(props: {
  items: NavSection[];
  onNavigate: (view: string) => void;
  onClose: () => void;
}) {
  return (
    <Portal mount={document.body}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          "z-index": "var(--z-modal)",
          background: "rgba(35,28,51,0.32)",
          "backdrop-filter": "blur(4px)",
          animation: "backdrop-fade-in 0.2s var(--ease-out) both",
        }}
        onClick={props.onClose}
      >
        <div
          data-testid="mobile-more-sheet"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--paper-light)",
            "border-radius": "var(--radius-xl) var(--radius-xl) 0 0",
            padding:
              "var(--space-4) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom))",
            "box-shadow": "0 -8px 32px rgba(0,0,0,0.16)",
            animation: "sheet-enter 0.28s var(--ease-out) both",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "5px",
              "border-radius": "var(--radius-pill)",
              background: "var(--border-strong, var(--border))",
              margin: "0 auto var(--space-4)",
            }}
          />
          <div
            style={{
              display: "grid",
              "grid-template-columns": "repeat(3, 1fr)",
              gap: "var(--space-2)",
            }}
          >
            <For each={props.items}>
              {(item) => (
                <button
                  onClick={() => props.onNavigate(item.view)}
                  data-nav={item.label}
                  data-nav-view={item.view}
                  style={{
                    display: "flex",
                    "flex-direction": "column",
                    "align-items": "center",
                    "justify-content": "center",
                    gap: "var(--space-1)",
                    padding: "var(--space-3) var(--space-1)",
                    "border-radius": "var(--radius-lg)",
                    background:
                      view() === item.view ? "var(--palm-soft)" : "transparent",
                    color:
                      view() === item.view
                        ? "var(--palm)"
                        : "var(--text-secondary)",
                    "min-height": "72px",
                  }}
                >
                  <Icon name={item.icon} size={24} />
                  <span
                    style={{
                      "font-size": "var(--text-caption)",
                      "font-weight": "600",
                      "text-align": "center",
                    }}
                  >
                    {item.label}
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </Portal>
  );
}
