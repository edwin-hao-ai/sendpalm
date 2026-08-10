/** Resize handle for detail/agent side panels.
 *  Dragging updates the matching CSS variable and persists to localStorage.
 */

import { createSignal, onCleanup, onMount, Show } from "solid-js";
import {
  detailPanelWidth,
  setDetailPanelWidth,
  agentPanelWidth,
  setAgentPanelWidth,
} from "../stores/ui";

type PanelSide = "left" | "right";

interface Props {
  panel: "detail" | "agent";
  side?: PanelSide;
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const STORAGE_KEY = "sendpalm.panelWidths";

function readStored(): { detail: number; agent: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.detail === "number" && typeof parsed.agent === "number") {
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
  const side = props.side ?? (props.panel === "detail" ? "left" : "left");

  const width = () =>
    props.panel === "detail" ? detailPanelWidth() : agentPanelWidth();
  const setWidth =
    props.panel === "detail" ? setDetailPanelWidth : setAgentPanelWidth;

  onMount(() => {
    updateRootVars();
  });

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startWidth = width();

    const onPointerMove = (ev: PointerEvent) => {
      const delta = side === "left" ? startX - ev.clientX : ev.clientX - startX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
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
    <div
      onPointerDown={onPointerDown}
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
      title="Drag to resize"
    >
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
  );
}
