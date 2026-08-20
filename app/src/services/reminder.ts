/** Re-surfacing tick — every 60s, walks bubble_up_at timestamps.
 * If a message's bubbleUpAt has passed and the message is not unread,
 * mark it as unread (so it floats to top of "New for you") + toast.
 *
 * The previous version of this file called `listMessages()` and
 * `listFollowUps()` (full-table pulls with body_html) and then
 * filtered in JS. On a real mailbox with 4,000+ messages averaging
 * 90 KB of body_html, that pushed ~360 MB through the IPC bridge at
 * boot and ballooned the webview's V8 heap to 8 GB before the user
 * could click anything. The fix is to push the filter into SQL
 * (`listMessagesForReminder` + `listFollowUpsDue` in `stores/data.ts`)
 * and to fetch only the columns the tick actually needs.
 *
 * The tick also fetches one full message per due follow-up (to know
 * its current bucket + unread state) via `getMessage` — that's
 * already a scoped, by-id query, so the per-tick cost is O(due
 * follow-ups) not O(all messages).
 */

import { onCleanup, onMount } from "solid-js";
import {
  getMessage,
  listFollowUpsDue,
  listMessagesForReminder,
  upsertMessage,
  upsertFollowUp,
  appendAgentAudit,
  upsertNotification,
} from "../stores/data";
import { showToast, setView } from "../stores/ui";
import { uid } from "../utils/id";
import { isoNow } from "../utils/date";
import type { FollowUp } from "../types";

const TICK_MS = 60_000;

let intervalId: number | undefined;

export function startResurfaceLoop(): () => void {
  const tick = async () => {
    const nowIso = isoNow();

    // 1. Bubble-up: messages whose bubbleUpAt has passed and that are
    //    not already unread. SQL pre-filters so the IPC payload is
    //    tiny (a handful of rows in normal use).
    const dueBubbles = await listMessagesForReminder(nowIso);
    for (const slice of dueBubbles) {
      // We have a small slice (id + subj + bucket + unread + bubbleUpAt).
      // The next `upsertMessage` will read+write the full row, so the
      // SQLite round-trip covers everything. We just need the slice to
      // decide what to do.
      await upsertMessage({
        id: slice.id,
        pid: "",
        subj: slice.subj,
        prev: "",
        body: "",
        bodyHtml: null,
        tm: nowIso,
        st: nowIso,
        ac: "",
        bucket: slice.bucket,
        direction: "in",
        unread: true,
        labels: [],
        attachments: [],
        trackers: [],
        replyLater: false,
        setAside: false,
        bubbleUpAt: slice.bubbleUpAt,
        remindAt: null,
        deletedAt: null,
      });
      await appendAgentAudit({
        id: uid("aa"),
        sessionId: undefined,
        kind: "resurface",
        message: `消息回浮：${slice.subj}`,
        createdAt: nowIso,
        undoable: true,
      });
      await upsertNotification({
        id: uid("nt"),
        type: "surfaced",
        title: "消息回浮",
        body: `${slice.subj} 回到了 Imbox 顶部`,
        ref: { type: "message", id: slice.id },
        read: false,
        createdAt: nowIso,
      });
      showToast({
        message: `回浮：${slice.subj}`,
        kind: "info",
        action: {
          label: "打开 Imbox",
          run: () => {
            setView("imbox");
          },
        },
        ttlMs: 6000,
      });
    }

    // 2. Follow-ups that are due. SQL pre-filters too. The slice is
    //    just ids; we fetch the full message by id only when there
    //    is a real bucket/unread mismatch to fix.
    const dueFollowUps = await listFollowUpsDue(nowIso);
    for (const f of dueFollowUps) {
      const m = await getMessage(f.msgId);
      if (!m) continue;
      const needsMove = m.bucket !== "imbox";
      const needsUnread = !m.unread;
      if (needsMove || needsUnread) {
        await upsertMessage({
          ...m,
          bucket: "imbox",
          unread: true,
        });
      }
      const followUpRow: FollowUp = {
        id: f.id,
        msgId: f.msgId,
        dueAt: f.dueAt,
        status: "pending",
        surfacedAt: nowIso,
      };
      await upsertFollowUp(followUpRow);
      await appendAgentAudit({
        id: uid("aa"),
        sessionId: undefined,
        kind: "followup_due",
        message: `跟进到期：${m.subj}`,
        payload: f.id,
        createdAt: nowIso,
        undoable: false,
      });
      await upsertNotification({
        id: uid("nt"),
        type: "followup",
        title: "跟进到期",
        body: m.subj || "有一封邮件需要跟进",
        ref: { type: "message", id: m.id },
        read: false,
        createdAt: nowIso,
      });
      showToast({
        message: `跟进到期：${m.subj}`,
        kind: "info",
        action: {
          label: "打开 Imbox",
          run: () => {
            setView("imbox");
          },
        },
        ttlMs: 8000,
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
