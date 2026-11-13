/** Navigate to whatever a notification points at.
 *
 *  A notification carries `{ type, id }` — the bell dropdown renders it, and the
 *  OS banner hands the same shape back through `notification_target`. Both
 *  surfaces must land in the same place, so the mapping lives here once: a
 *  second copy of this switch is how "clicking the banner" and "clicking the
 *  row in the bell" drift into different behaviour.
 */

import {
  setCalendarSelected,
  setCalendarView,
  setDetailOpen,
  setSelectedContactId,
  setSelectedDraftId,
  setSelectedFileId,
  setSelectedMessageId,
  setView,
} from "../stores/ui";

export interface NotificationRef {
  type: string;
  id: string;
}

export function openNotificationRef(ref: NotificationRef): void {
  switch (ref.type) {
    case "contact":
      setView("contacts");
      setSelectedContactId(ref.id);
      setDetailOpen(true);
      return;
    case "message":
      // `setSelectedMessageId` + `setDetailOpen` is also what the tray menu
      // writes; Imbox's reveal effect is what puts the row on screen.
      setView("imbox");
      setSelectedMessageId(ref.id);
      setDetailOpen(true);
      return;
    case "file":
      setView("files");
      setSelectedFileId(ref.id);
      setDetailOpen(true);
      return;
    case "draft":
      setView("drafts");
      setSelectedDraftId(ref.id);
      setDetailOpen(true);
      return;
    case "event":
      setView("calendar");
      setCalendarView("day");
      setCalendarSelected(new Date());
      return;
    default:
      // An unknown ref type is a newer writer than this build. Doing nothing is
      // right; inventing a destination is not.
      return;
  }
}
