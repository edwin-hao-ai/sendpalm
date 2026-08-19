/** Drag context — singleton for drag-and-drop message moves.
 * Used by DropBar to show destination targets while the user drags a
 * message card. The drag-start handler (in Imbox) calls startDrag with
 * a closure that knows how to move the dragged message to the chosen
 * target — bucket (move) or workflow (toggle a flag).
 *
 * Touch + mouse support lives in the caller; this module is the
 * shared signal + commit channel.
 */

import { createSignal } from "solid-js";
import type { MessageBucket } from "../types";

/** Drop destinations. 5 buckets + 3 workflow piles (pending / saved / remind). */
export type DragTarget = MessageBucket | "pending" | "saved" | "remind";

export interface DragState {
  active: boolean;
  messageId?: string;
  commit?: (target: DragTarget) => void;
}

const [drag, setDrag] = createSignal<DragState>({ active: false });

export function useDragContext() {
  return drag;
}

export function startDrag(
  message: { id: string },
  commit: (target: DragTarget) => void,
) {
  setDrag({ active: true, messageId: message.id, commit });
}

export function endDrag() {
  setDrag({ active: false });
}
