/** Sidebar — left rail with nav icons + labels. Bottom-tab-bar on mobile.
 *  Mobile collapses the 15 nav entries into 6 primary tabs +
 *  a "More" sheet so tap targets stay >= 44px.
 */

import { For, Show, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "./Icon";
import { SidebarTooltip } from "./SidebarTooltip";
import { setView, view } from "../stores/ui";
import { NAV_SECTIONS, type NavSection } from "../utils/labels";
import { useLongPress, useViewport } from "../utils/gestures";
import { countGateCandidates } from "../stores/data";
import { useSoftRefreshEffect } from "../utils/gestures";

const MOBILE_PRIMARY_VIEWS = new Set([
  "imbox",
  "screener",
  "contacts",
  "calendar",
  "files",
  "settings",
]);

/** User-facing nav labels. HEY brand nouns (Gate / Imbox / Stream /
 *  Records / Clips) stay English; everything else is Chinese.
 *  `NAV_SECTIONS[].label` stays untouched for `data-nav` test hooks. */
const NAV_LABEL_ZH: Record<string, string> = {
  screener: "Gate",
  imbox: "Imbox",
  feed: "Stream",
  paperTrail: "Records",
  contacts: "联系人",
  companies: "公司",
  calendar: "日历",
  files: "文件",
  drafts: "草稿",
  followUps: "跟进",
  clips: "Clips",
  insights: "洞察",
  trash: "回收站",
  spam: "垃圾邮件",
  settings: "设置",
};

/** Chinese annotation for the brand nouns, shown in tooltips. */
const NAV_BRAND_NOTE: Record<string, string> = {
  screener: "筛选台",
  imbox: "收件箱",
  feed: "资讯流",
  paperTrail: "收据账单",
  clips: "剪藏",
};

export function navDisplayLabel(viewName: string): string {
  return NAV_LABEL_ZH[viewName] ?? viewName;
}

export function navTooltipLabel(section: NavSection): string {
  const label = navDisplayLabel(section.view);
  const note = NAV_BRAND_NOTE[section.view];
  const base = note ? `${label} · ${note}` : label;
  return section.hint ? `${base} (${section.hint})` : base;
}

export function Sidebar() {
  const { isMobile } = useViewport();
  const [moreOpen, setMoreOpen] = createSignal(false);

  // P0-8: badge for the Gate (Screener) sidebar entry. The count is
  // re-pulled on the soft refresh tick so a brand-new first-time sender
  // from the IMAP sync shows up without a full app reload.
  const [gateCount, { refetch: refetchGateCount }] = createResource(
    countGateCandidates,
  );
  useSoftRefreshEffect(() => {
    void refetchGateCount();
  });

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
        <For each={isMobile() ? primary() : NAV_SECTIONS}>
          {(section) => (
            <NavItem
              icon={section.icon}
              label={section.label}
              section={section}
              active={view() === section.view}
              onClick={() => navigate(section.view)}
              badgeCount={
                section.view === "screener" ? () => gateCount() ?? 0 : undefined
              }
            />
          )}
        </For>
        {isMobile() && (
          <NavItem
            icon="ph-dots-three"
            label="More"
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
          gateCount={() => gateCount() ?? 0}
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
    props.section ? navDisplayLabel(props.section.view) : "更多";
  const tooltipLabel = () =>
    props.section ? navTooltipLabel(props.section) : "更多功能";

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
        aria-label={tooltipLabel()}
        aria-current={props.active ? "page" : undefined}
        data-nav={props.label}
        data-nav-view={props.section?.view ?? "more"}
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

function MobileMoreSheet(props: {
  items: NavSection[];
  onNavigate: (view: string) => void;
  onClose: () => void;
  gateCount: () => number;
}) {
  // Drag-to-dismiss: track a downward swipe starting anywhere on the sheet
  // chrome (grabber / title row), translate the sheet 1:1, and dismiss past
  // a threshold. Content buttons stopPropagation so taps never start a drag.
  const [dragY, setDragY] = createSignal(0);
  let dragStartY: number | null = null;

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
      props.onClose();
    }
  };
  onMount(() => document.addEventListener("keydown", onKey));
  onCleanup(() => document.removeEventListener("keydown", onKey));

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
          role="dialog"
          aria-label="更多功能"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "auto",
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
                  margin: "calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) 0",
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
                  aria-label={navTooltipLabel(item)}
                  style={{
                    position: "relative",
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
                    {navDisplayLabel(item.view)}
                  </span>
                  {/* Badge for the screener entry inside the More sheet */}
                  <Show when={item.view === "screener" && (props.gateCount() ?? 0) > 0}>
                    <span
                      data-nav-badge={item.label}
                      data-count={props.gateCount() ?? 0}
                      style={{
                        position: "absolute",
                        top: "6px",
                        right: "12px",
                        "min-width": "16px",
                        height: "16px",
                        padding: "0 4px",
                        "border-radius": "var(--radius-pill)",
                        background: "var(--palm)",
                        color: "#fff",
                        "font-size": "10px",
                        "font-weight": "700",
                        "line-height": 1,
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "center",
                      }}
                    >
                      {(props.gateCount() ?? 0) > 99 ? "99+" : props.gateCount() ?? 0}
                    </span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </Portal>
  );
}
