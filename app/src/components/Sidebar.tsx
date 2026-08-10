/** Sidebar — left rail with nav icons. Bottom-tab-bar on mobile.
 *  Mobile collapses the 15 nav entries into 6 primary tabs +
 *  a "More" sheet so tap targets stay >= 44px.
 */

import { For, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "./Icon";
import { SidebarTooltip } from "./SidebarTooltip";
import { setView, view } from "../stores/ui";
import { NAV_SECTIONS, type NavSection } from "../utils/labels";
import { useLongPress, useViewport } from "../utils/gestures";

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
  let buttonRef: HTMLButtonElement | undefined;
  const [tooltipAnchor, setTooltipAnchor] = createSignal<{
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null>(null);
  let showTimer: number | undefined;

  const showTooltip = () => {
    if (!buttonRef) return;
    setTooltipAnchor(buttonRef.getBoundingClientRect());
  };
  const hideTooltip = () => setTooltipAnchor(null);
  const scheduleShow = () => {
    if (showTimer) window.clearTimeout(showTimer);
    showTimer = window.setTimeout(showTooltip, 120);
  };
  const cancelShow = () => {
    if (showTimer) window.clearTimeout(showTimer);
    hideTooltip();
  };

  // Touch / long-press support for tablet.
  useLongPress(buttonRef, { delay: 600, onLongPress: showTooltip });

  return (
    <>
      <button
        ref={(el) => (buttonRef = el)}
        onClick={props.onClick}
        title={props.label}
        aria-label={
          props.hint
            ? `${props.label}, 快捷键 ${props.hint}`
            : props.label
        }
        aria-current={props.active ? "page" : undefined}
        data-nav={props.label}
        data-nav-view={props.view}
        data-active={props.active}
        onMouseEnter={scheduleShow}
        onMouseLeave={cancelShow}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        style={{
          position: "relative",
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          "justify-content": "center",
          width: isMobile() ? "auto" : "100%",
          "max-width": isMobile() ? undefined : "64px",
          height: isMobile() ? "auto" : "56px",
          "min-width": isMobile() ? "44px" : undefined,
          "min-height": isMobile() ? "44px" : undefined,
          padding: isMobile() ? "0" : "4px",
          "border-radius": isMobile() ? "8px" : "var(--radius-md)",
          background: props.active ? "var(--palm-soft)" : "transparent",
          color: props.active ? "var(--palm)" : "var(--text-secondary)",
          "margin-bottom": isMobile() ? "0" : "2px",
          flex: isMobile() ? "1" : undefined,
          transition:
            "background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), transform 0.12s var(--ease-out)",
        }}
      >
        <Show when={props.active && !isMobile()}>
          <div
            aria-hidden="true"
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
          size={isMobile() ? 20 : 22}
          style={
            props.active && !isMobile() ? { transform: "scale(1.08)" } : undefined
          }
        />
        {/* Mobile: keep the label visible (10px). Desktop: hide it. */}
        <Show when={isMobile()}>
          <span
            style={{
              "font-size": "10px",
              "font-weight": "600",
              "margin-top": "2px",
              "white-space": "nowrap",
            }}
          >
            {props.label}
          </span>
        </Show>
        {/* ⌘N chip — only on desktop/tablet when present. */}
        <Show when={props.hint && !isMobile()}>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: "4px",
              bottom: "2px",
              "font-size": "9px",
              "font-weight": "700",
              color: props.active ? "var(--palm)" : "var(--text-muted)",
              opacity: 0.7,
            }}
          >
            {props.hint}
          </span>
        </Show>
      </button>
      <Show when={!isMobile() && tooltipAnchor()}>
        <Portal>
          <SidebarTooltip
            anchor={tooltipAnchor() as never}
            label={props.label}
            hint={props.hint}
          />
        </Portal>
      </Show>
    </>
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
