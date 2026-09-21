/** Resize handle for the detail/agent side panels.
 *  Dragging updates the matching CSS variable and persists to localStorage.
 *  Panels are fixed overlays whose width comes from the variable, so the
 *  drag tracks the pointer 1:1 with no grid transition to suppress.
 */

import { createSignal, onCleanup, onMount, Show } from "solid-js";
import {
  detailPanelWidth,
  setDetailPanelWidth,
  agentPanelWidth,
  setAgentPanelWidth,
} from "../stores/ui";
import { useViewport } from "../utils/gestures";

type PanelSide = "left" | "right";

interface Props {
  panel: "detail" | "agent";
  side?: PanelSide;
}

const MIN_DETAIL = 280;
const MAX_DETAIL = 720;
const MIN_AGENT = 280;
const MAX_AGENT = 720;
const STORAGE_KEY = "sendpalm.panelWidths";

interface StoredWidths {
  detail: number;
  agent: number;
}

function readStored(): StoredWidths | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.detail === "number" &&
      typeof parsed.agent === "number"
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function initializePanelWidths(): void {
  const stored = readStored();
  if (stored) {
    setDetailPanelWidth(stored.detail);
    setAgentPanelWidth(stored.agent);
  }
  updateRootVars();
}

function updateRootVars() {
  document.documentElement.style.setProperty(
    "--detail-panel-width",
    `${detailPanelWidth()}px`,
  );
  document.documentElement.style.setProperty(
    "--agent-panel-width",
    `${agentPanelWidth()}px`,
  );
}

function persist(d: number, a: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ detail: d, agent: a }));
  } catch {
    // ignore
  }
}

export function PanelResizeHandle(props: Props) {
  const [dragging, setDragging] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);
  const { isMobile } = useViewport();
  const side = props.side ?? (props.panel === "agent" ? "left" : "right");

  const width = () =>
    props.panel === "detail" ? detailPanelWidth() : agentPanelWidth();
  const setWidth = (n: number) =>
    props.panel === "detail" ? setDetailPanelWidth(n) : setAgentPanelWidth(n);

  onMount(() => {
    updateRootVars();
  });

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startWidth = width();

    const min = props.panel === "detail" ? MIN_DETAIL : MIN_AGENT;
    const max = props.panel === "detail" ? MAX_DETAIL : MAX_AGENT;

    const onPointerMove = (ev: PointerEvent) => {
      const delta = side === "left" ? startX - ev.clientX : ev.clientX - startX;
      const next = Math.min(max, Math.max(min, startWidth + delta));
      setWidth(next);
      updateRootVars();
    };

    const onPointerUp = () => {
      setDragging(false);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persist(detailPanelWidth(), agentPanelWidth());
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  onCleanup(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  return (
    <Show when={!isMobile()}>
      <div
        onPointerDown={onPointerDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        role="separator"
        aria-orientation="vertical"
        aria-label="拖拽调整面板宽度"
        style={{
          position: "absolute",
          top: "0",
          [side]: "-4px",
          width: "8px",
          height: "100%",
          cursor: "col-resize",
          "z-index": "var(--z-sticky)",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
        }}
        title="拖拽调整面板宽度"
      >
        {/* Grip indicator — visible on hover / while dragging */}
        <div
          aria-hidden="true"
          style={{
            width: "3px",
            height: "32px",
            "border-radius": "var(--radius-pill)",
            background: "var(--border-strong)",
            opacity: hovered() || dragging() ? 1 : 0,
            transition: "opacity var(--duration-fast) var(--ease-out)",
            "pointer-events": "none",
          }}
        />
        <Show when={dragging()}>
          <div
            style={{
              position: "fixed",
              inset: "0",
              "z-index": "9999",
              cursor: "col-resize",
            }}
          />
        </Show>
      </div>
    </Show>
  );
}