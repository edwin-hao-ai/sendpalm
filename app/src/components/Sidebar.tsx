/** Six workspaces in the existing rail; all original routes stay in disclosures. */

import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "./Icon";
import { SidebarTooltip } from "./SidebarTooltip";
import { setView, view, type ViewName } from "../stores/ui";
import {
  NAV_GROUPS,
  NAV_SECTIONS,
  viewLabel,
  type NavGroup,
  type NavSection,
} from "../utils/labels";
import {
  useLongPress,
  useRefreshEffect,
  useViewport,
} from "../utils/gestures";
import { countGateCandidates, countPileMessages } from "../stores/data";
import { useSoftRefreshEffect } from "../utils/gestures";
import "./Sidebar.css";

/** Display label for a route. The single source lives in utils/labels.ts
 *  so the sidebar, page titles, ⌘K and tooltips can never drift apart. */
export function navDisplayLabel(viewName: string): string {
  return viewLabel(viewName as ViewName);
}

/** Tooltip = name (+ the ⌘ shortcut hint when the section has one).
 *  Brand nouns no longer need a Chinese annotation: the display label
 *  is already Chinese. */
export function navTooltipLabel(section: NavSection): string {
  const base = navDisplayLabel(section.view);
  return section.hint ? `${base} (${section.hint})` : base;
}

export function Sidebar() {
  const { isMobile } = useViewport();
  const [moreOpen, setMoreOpen] = createSignal(false);
  const [disclosure, setDisclosure] = createSignal<{
    group: NavGroup;
    trigger: HTMLButtonElement;
  } | null>(null);
  let moreTrigger: HTMLButtonElement | undefined;
  const closeMore = () => {
    setMoreOpen(false);
    moreTrigger?.focus();
  };
  createEffect(() => {
    // A resize must not leave a desktop flyout over the mobile sheet (or vice versa).
    isMobile();
    setDisclosure(null);
    setMoreOpen(false);
  });
  createEffect(() => {
    view();
    setDisclosure(null);
    setMoreOpen(false);
  });

  // P0-8: badge for the Gate (Screener) sidebar entry. The count is
  // re-pulled on the soft refresh tick so a brand-new first-time sender
  // from the IMAP sync shows up without a full app reload.
  const [gateCount, { refetch: refetchGateCount }] =
    createResource(countGateCandidates);
  // Pile counts: the three workflow piles are routes now, so the rail
  // carries their counts instead of a floating bar over the Inbox list.
  const [pileCounts, { refetch: refetchPileCounts }] =
    createResource(countPileMessages);
  // Counts must survive both channels: a hard refresh (boot / explicit
  // pull) and a soft tick (a sync chunk landed). Without the hard tick the
  // rail shows 0 until the next sync event.
  useRefreshEffect(() => {
    void refetchGateCount();
    void refetchPileCounts();
  });
  useSoftRefreshEffect(() => {
    void refetchGateCount();
    void refetchPileCounts();
  });

  const badgeFor = (route: ViewName): number => {
    if (route === "screener") return gateCount() ?? 0;
    const c = pileCounts();
    if (!c) return 0;
    if (route === "replyLater") return c.replyLater;
    if (route === "setAside") return c.setAside;
    if (route === "bubbleUp") return c.bubbleUp;
    return 0;
  };
  const pileTotal = () => {
    const c = pileCounts();
    return c ? c.replyLater + c.setAside + c.bubbleUp : 0;
  };

  const navigate = (v: ViewName) => {
    setView(v);
    setDisclosure(null);
    setMoreOpen(false);
  };

  return (
    <>
      <nav
        id="sidebar"
        data-testid="sidebar"
        aria-label="主导航"
        style={{
          display: "flex",
          "flex-direction": isMobile() ? "row" : "column",
          // Mobile bottom tab bar: liquid glass per prototype (8295-8298).
          background: isMobile()
            ? "var(--glass-bg-strong)"
            : "var(--paper-mid)",
          "backdrop-filter": isMobile()
            ? "blur(20px) saturate(1.8)"
            : undefined,
          "-webkit-backdrop-filter": isMobile()
            ? "blur(20px) saturate(1.8)"
            : undefined,
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
        <For
          each={
            isMobile()
              ? NAV_GROUPS.filter((g) => !g.mobileRail)
              : NAV_GROUPS
          }
        >
          {(group) => (
            <div class="sidebar-workspace">
              <NavItem
                icon={group.icon}
                label={group.label}
                section={NAV_SECTIONS.find((s) => s.view === group.defaultView)}
                group={group}
                mobileMore={isMobile() && group.id === "more"}
                buttonRef={(el) => {
                  if (group.id === "more") moreTrigger = el;
                }}
                expanded={
                  isMobile() && group.id === "more" ? moreOpen() : undefined
                }
                active={group.views.includes(view())}
                onClick={() =>
                  isMobile() && group.id === "more"
                    ? setMoreOpen(true)
                    : navigate(group.defaultView)
                }
                badgeCount={
                  group.id === "mail"
                    ? () => gateCount() ?? 0
                    : group.id === "piles"
                      ? pileTotal
                      : undefined
                }
              />
              <Show when={!isMobile() && group.views.length > 1}>
                <button
                  class="sidebar-disclosure"
                  aria-label={`${group.label} 导航`}
                  aria-expanded={disclosure()?.group.id === group.id}
                  aria-controls={`workspace-${group.id}`}
                  aria-haspopup="dialog"
                  data-nav-disclosure={group.id}
                  onClick={(e) =>
                    setDisclosure(
                      disclosure()?.group.id === group.id
                        ? null
                        : { group, trigger: e.currentTarget },
                    )
                  }
                >
                  <Icon name="ph-caret-right" size={12} />
                </button>
              </Show>
            </div>
          )}
        </For>
      </nav>

      <Show when={disclosure()} keyed>
        {(open) => (
          <WorkspaceFlyout
            group={open.group}
            trigger={open.trigger}
            onClose={() => setDisclosure(null)}
            onNavigate={(route) => {
              navigate(route);
              open.trigger.focus();
            }}
            badgeFor={badgeFor}
          />
        )}
      </Show>
      <Show when={moreOpen()}>
        <MobileMoreSheet
          onNavigate={(route) => {
            navigate(route);
            moreTrigger?.focus();
          }}
          onClose={closeMore}
          badgeFor={badgeFor}
        />
      </Show>
    </>
  );
}

function NavItem(props: {
  icon: string;
  /** English label from NAV_SECTIONS — used for data-nav test hooks. */
  label: string;
  section?: NavSection;
  group?: NavGroup;
  mobileMore?: boolean;
  buttonRef?: (el: HTMLButtonElement) => void;
  expanded?: boolean;
  active: boolean;
  onClick: () => void;
  /** Optional badge count to render in the top-right corner. */
  badgeCount?: () => number;
}) {
  const { isMobile, isTablet } = useViewport();
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

  const displayLabel = () =>
    props.group?.label ??
    (props.section ? navDisplayLabel(props.section.view) : "更多");
  const tooltipLabel = () => {
    if (props.group && props.section) {
      // Single-route workspaces (日历 / 联系人 …) would otherwise read
      // "任务 · 任务" now that both names are Chinese.
      const child = navTooltipLabel(props.section);
      return props.group.label === navDisplayLabel(props.section.view)
        ? child
        : `${props.group.label} · ${child}`;
    }
    return props.section ? navTooltipLabel(props.section) : "更多功能";
  };

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
  onCleanup(cancelShow);

  // Touch / long-press support for tablet.
  useLongPress(buttonRef, { delay: 600, onLongPress: showTooltip });

  return (
    <>
      <button
        ref={(el) => {
          buttonRef = el;
          props.buttonRef?.(el);
        }}
        onClick={props.onClick}
        aria-label={tooltipLabel()}
        aria-current={props.active ? "page" : undefined}
        aria-expanded={props.expanded}
        aria-controls={props.mobileMore ? "mobile-workspaces" : undefined}
        aria-haspopup={props.mobileMore ? "dialog" : undefined}
        data-nav={props.section?.label ?? props.label}
        data-nav-group={props.group?.id}
        data-nav-view={
          props.mobileMore ? "more" : (props.section?.view ?? "more")
        }
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
          width: "100%",
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
            props.active && !isMobile()
              ? { transform: "scale(1.08)" }
              : undefined
          }
        />
        {/* Badge — top-right corner when count > 0 */}
        <Show when={props.badgeCount && props.badgeCount() > 0}>
          <span
            data-nav-badge={props.label}
            data-count={props.badgeCount!()}
            aria-label={`${props.badgeCount!()} 项待处理`}
            style={{
              position: "absolute",
              top: isMobile() ? "2px" : "6px",
              right: isMobile() ? "8px" : "12px",
              "min-width": isMobile() ? "14px" : "16px",
              height: isMobile() ? "14px" : "16px",
              padding: "0 4px",
              "border-radius": "var(--radius-pill)",
              background: "var(--palm)",
              color: "#fff",
              "font-size": isMobile() ? "9px" : "10px",
              "font-weight": "700",
              "line-height": 1,
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              "pointer-events": "none",
              "box-shadow": "0 0 0 2px var(--paper-mid)",
            }}
          >
            {props.badgeCount!() > 99 ? "99+" : props.badgeCount!()}
          </span>
        </Show>
        {/* Label under the icon. Hidden on the tablet narrow rail only
            (prototype: .nav-label { display: none } at 768–1023px). */}
        <Show when={!isTablet()}>
          <span
            style={{
              "font-size": "10px",
              "font-weight": "600",
              "margin-top": "2px",
              "white-space": "nowrap",
              "max-width": "64px",
              overflow: "hidden",
              "text-overflow": "ellipsis",
            }}
          >
            {displayLabel()}
          </span>
        </Show>
      </button>
      <Show when={!isMobile() && tooltipAnchor()}>
        <Portal>
          <SidebarTooltip
            anchor={tooltipAnchor() as never}
            label={tooltipLabel()}
          />
        </Portal>
      </Show>
    </>
  );
}

function WorkspaceRoutes(props: {
  group: NavGroup;
  onNavigate: (view: ViewName) => void;
  badgeFor: (view: ViewName) => number;
}) {
  return (
    <section class="sidebar-route-group" aria-label={props.group.label}>
      <h2>{props.group.label}</h2>
      <div class="sidebar-route-list">
        <For each={props.group.views}>
          {(route) => {
            const section = NAV_SECTIONS.find((s) => s.view === route)!;
            return (
              <button
                data-nav={section.label}
                data-nav-view={section.view}
                aria-label={navTooltipLabel(section)}
                aria-current={view() === route ? "page" : undefined}
                data-active={view() === route}
                onClick={() => props.onNavigate(route)}
              >
                <Icon name={section.icon} size={20} />
                <span>{navDisplayLabel(route)}</span>
                <Show when={props.badgeFor(route) > 0}>
                  <span
                    class="sidebar-route-badge"
                    data-nav-badge={section.label}
                    data-count={props.badgeFor(route)}
                  >
                    {props.badgeFor(route) > 99 ? "99+" : props.badgeFor(route)}
                  </span>
                </Show>
              </button>
            );
          }}
        </For>
      </div>
    </section>
  );
}

function WorkspaceFlyout(props: {
  group: NavGroup;
  trigger: HTMLButtonElement;
  onClose: () => void;
  onNavigate: (view: ViewName) => void;
  badgeFor: (view: ViewName) => number;
}) {
  let flyout: HTMLDivElement | undefined;
  const anchor = props.trigger.getBoundingClientRect();
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      props.onClose();
      props.trigger.focus();
    }
  };
  const onOutside = (event: Event) => {
    if (
      event.target instanceof Node &&
      !flyout?.contains(event.target) &&
      !props.trigger.contains(event.target)
    )
      props.onClose();
  };
  onMount(() => {
    if (flyout) {
      flyout.style.top = `clamp(var(--space-2), ${anchor.top}px, calc(100dvh - ${flyout.offsetHeight}px - var(--space-2)))`;
    }
    const activeRoute = flyout?.querySelector<HTMLButtonElement>(
      '[aria-current="page"]',
    );
    (activeRoute ?? flyout?.querySelector<HTMLButtonElement>("button"))?.focus();
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
  });
  onCleanup(() => {
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onOutside);
    document.removeEventListener("focusin", onOutside);
  });
  return (
    <Portal>
      <div
        ref={(el) => {
          flyout = el;
        }}
        id={`workspace-${props.group.id}`}
        role="dialog"
        aria-label={`${props.group.label} 导航`}
        class="sidebar-workspace-flyout"
        style={{ top: `${anchor.top}px` }}
      >
        <WorkspaceRoutes
          group={props.group}
          onNavigate={props.onNavigate}
          badgeFor={props.badgeFor}
        />
      </div>
    </Portal>
  );
}

function MobileMoreSheet(props: {
  onNavigate: (view: ViewName) => void;
  onClose: () => void;
  badgeFor: (view: ViewName) => number;
}) {
  // Drag-to-dismiss: track a downward swipe starting anywhere on the sheet
  // chrome (grabber / title row), translate the sheet 1:1, and dismiss past
  // a threshold. Content buttons stopPropagation so taps never start a drag.
  const [dragY, setDragY] = createSignal(0);
  let dragStartY: number | null = null;
  let sheet: HTMLDivElement | undefined;
  let appRoot: HTMLElement | null = null;
  let appWasInert = false;

  const onTouchStart = (e: TouchEvent) => {
    dragStartY = e.touches[0]?.clientY ?? null;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (dragStartY == null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - dragStartY;
    setDragY(Math.max(0, dy));
  };
  const onTouchEnd = () => {
    if (dragY() > 64) {
      props.onClose();
    }
    dragStartY = null;
    setDragY(0);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      props.onClose();
      return;
    }
    if (e.key === "Tab" && sheet) {
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        e.preventDefault();
        sheet.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        e.preventDefault();
        sheet.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!sheet.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  onMount(() => {
    appRoot = document.getElementById("app");
    appWasInert = appRoot?.hasAttribute("inert") ?? false;
    appRoot?.setAttribute("inert", "");
    document.addEventListener("keydown", onKey, true);
    sheet?.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled])',
    )?.focus();
  });
  onCleanup(() => {
    document.removeEventListener("keydown", onKey, true);
    if (appRoot && !appWasInert) appRoot.removeAttribute("inert");
  });

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
          id="mobile-workspaces"
          role="dialog"
          aria-label="更多功能"
          aria-modal="true"
          tabIndex={-1}
          ref={(el) => {
            sheet = el;
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "auto",
            "max-height": "85dvh",
            "overflow-y": "auto",
            background: "var(--glass-bg-strong)",
            "backdrop-filter": "var(--glass-blur)",
            "-webkit-backdrop-filter": "var(--glass-blur)",
            "border-radius": "var(--radius-xl) var(--radius-xl) 0 0",
            padding:
              "var(--space-2) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom))",
            "box-shadow": "0 -8px 32px rgba(0,0,0,0.16)",
            animation: "sheet-enter 0.28s var(--ease-out) both",
            transform: dragY() > 0 ? `translateY(${dragY()}px)` : undefined,
            transition: dragY() > 0 ? "none" : "transform 0.2s var(--ease-out)",
          }}
        >
          {/* Grabber + title row — the drag handle for swipe-to-dismiss */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{ "touch-action": "none" }}
          >
            <div
              style={{
                width: "36px",
                height: "5px",
                "border-radius": "var(--radius-pill)",
                background: "var(--border-strong, var(--border))",
                margin: "var(--space-1) auto var(--space-2)",
              }}
            />
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                "margin-bottom": "var(--space-3)",
              }}
            >
              <span
                style={{
                  "font-size": "var(--text-body-sm)",
                  "font-weight": "700",
                  color: "var(--text-primary)",
                }}
              >
                更多功能
              </span>
              <button
                onClick={props.onClose}
                aria-label="关闭"
                style={{
                  width: "44px",
                  height: "44px",
                  margin:
                    "calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) 0",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  color: "var(--text-muted)",
                  "border-radius": "var(--radius-pill)",
                }}
              >
                <Icon name="ph-x" size={16} />
              </button>
            </div>
          </div>
          <div class="sidebar-mobile-groups">
            <For each={NAV_GROUPS}>
              {(group) => (
                <WorkspaceRoutes
                  group={group}
                  onNavigate={props.onNavigate}
                  badgeFor={props.badgeFor}
                />
              )}
            </For>
          </div>
        </div>
      </div>
    </Portal>
  );
}
