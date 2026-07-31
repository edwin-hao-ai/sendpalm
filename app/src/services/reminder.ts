/** Re-surfacing tick — every 60s, walks bubble_up_at timestamps.
 * If a message's bubbleUpAt has passed and the message is not unread,
 * mark it as unread (so it floats to top of "New for you") + toast.
 */

import { onCleanup, onMount } from "solid-js";
import {
  listMessages,
  listFollowUps,
  upsertMessage,
  appendAgentAudit,
  upsertNotification,
} from "../stores/data";
import { showToast, setView } from "../stores/ui";
import { uid } from "../utils/id";
import { isoNow } from "../utils/date";
import type { FollowUp, Message } from "../types";

const TICK_MS = 60_000;

let intervalId: number | undefined;

export function startResurfaceLoop(): () => void {
  const tick = async () => {
    const now = new Date();
    const msgs = (await listMessages()).filter(
      (m: Message) => m.bubbleUpAt && new Date(m.bubbleUpAt) <= now && !m.unread && m.bucket === "imbox"
    );
    for (const m of msgs) {
      await upsertMessage({ ...m, unread: true });
      await appendAgentAudit({
        id: uid("aa"),
        sessionId: undefined,
        kind: "resurface",
        message: `消息回浮：${m.subj}`,
        createdAt: isoNow(),
        undoable: true,
      });
      await upsertNotification({
        id: uid("nt"),
        type: "surfaced",
        title: "消息回浮",
        body: `${m.subj} 回到了 Imbox 顶部`,
        ref: { type: "message", id: m.id },
        read: false,
        createdAt: isoNow(),
      });
      showToast({
        message: `回浮：${m.subj}`,
        kind: "info",
        action: {
          label: "打开 Imbox",
          run: () => setView("imbox"),
        },
        ttlMs: 6000,
      });
    }

    // Follow-ups that are due
    const fus = (await listFollowUps()).filter(
      (f: FollowUp) => f.status === "pending" && new Date(f.dueAt) <= now
    );
    for (const f of fus) {
      await appendAgentAudit({
        id: uid("aa"),
        sessionId: undefined,
        kind: "followup_due",
        message: `跟进到期`,
        payload: f.id,
        createdAt: isoNow(),
        undoable: false,
      });
    }
  };

  // Kick once on mount, then on interval.
  void tick();
  intervalId = window.setInterval(() => void tick(), TICK_MS);

  return () => {
    if (intervalId !== undefined) {
      window.clearInterval(intervalId);
      intervalId = undefined;
    }
  };
}

export function ResurfaceLoop() {
  onMount(() => startResurfaceLoop());
  onCleanup(() => {
    if (intervalId !== undefined) {
      window.clearInterval(intervalId);
      intervalId = undefined;
    }
  });
  return null;
}