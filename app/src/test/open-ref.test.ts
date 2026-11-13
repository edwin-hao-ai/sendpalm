import { describe, it, expect, beforeEach } from "vitest";
import { openNotificationRef } from "../services/open-ref";
import {
  detailOpen,
  selectedContactId,
  selectedDraftId,
  selectedFileId,
  selectedMessageId,
  setDetailOpen,
  setSelectedContactId,
  setSelectedDraftId,
  setSelectedFileId,
  setSelectedMessageId,
  setView,
  view,
} from "../stores/ui";

/** Both the bell dropdown and the OS banner funnel through this switch, so a
 *  wrong mapping here is a wrong destination on both surfaces. */
beforeEach(() => {
  setView("imbox");
  setSelectedMessageId(null);
  setSelectedContactId(null);
  setSelectedFileId(null);
  setSelectedDraftId(null);
  setDetailOpen(false);
});

describe("openNotificationRef", () => {
  it("opens a mail in the Imbox with the panel open", () => {
    openNotificationRef({ type: "message", id: "m_1" });
    expect(view()).toBe("imbox");
    expect(selectedMessageId()).toBe("m_1");
    expect(detailOpen()).toBe(true);
  });

  it("routes a contact to the contacts view", () => {
    openNotificationRef({ type: "contact", id: "c_1" });
    expect(view()).toBe("contacts");
    expect(selectedContactId()).toBe("c_1");
    expect(detailOpen()).toBe(true);
  });

  it("routes a file and a draft to their own views", () => {
    openNotificationRef({ type: "file", id: "f_1" });
    expect(view()).toBe("files");
    expect(selectedFileId()).toBe("f_1");

    openNotificationRef({ type: "draft", id: "d_1" });
    expect(view()).toBe("drafts");
    expect(selectedDraftId()).toBe("d_1");
  });

  it("opens the calendar for an event ref", () => {
    openNotificationRef({ type: "event", id: "e_1" });
    expect(view()).toBe("calendar");
  });

  it("does nothing for a ref type this build does not know", () => {
    // A newer writer may park a new ref type in the table. Navigating somewhere
    // invented is worse than staying put.
    openNotificationRef({ type: "spaceship", id: "x_1" });
    expect(view()).toBe("imbox");
    expect(selectedMessageId()).toBeNull();
    expect(detailOpen()).toBe(false);
  });
});
