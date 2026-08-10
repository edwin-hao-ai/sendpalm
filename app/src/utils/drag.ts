/** Drag context — singleton for drag-and-drop bucket moves.
 * Wired up in M8 with full touch + mouse support.
 */

import { createSignal } from "solid-js";
import type { MessageBucket } from "../types";

export interface DragState {
  active: boolean;
  messageId?: string;
  commit?: (target: MessageBucket) => void;
}

const [drag, setDrag] = createSignal<DragState>({ active: false });

export function useDragContext() {
  return drag;
}

export function startDrag(
  messageId: string,
  commit: (target: MessageBucket) => void,
) {
  setDrag({ active: true, messageId, commit });
}

export function endDrag() {
  setDrag({ active: false });
}
