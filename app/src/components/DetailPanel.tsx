/** DetailPanel — right-side panel for the currently-selected entity. */

import { Show, Switch, Match } from "solid-js";
import {
  detailOpen,
  selectedContactId,
  selectedMessageId,
  selectedMeetingId,
  selectedFileId,
  selectedTaskId,
  selectedDraftId,
  setDetailOpen,
} from "../stores/ui";
import { ContactPanel } from "../panels/ContactPanel";
import { MessagePanel } from "../panels/MessagePanel";
import { MeetingPanel } from "../panels/MeetingPanel";
import { FilePanel } from "../panels/FilePanel";
import { TaskPanel } from "../panels/TaskPanel";
import { DraftPanel } from "../panels/DraftPanel";
import { PanelResizeHandle, initializePanelWidths } from "./PanelResizeHandle";

export function DetailPanel() {
  return (
    <Show when={detailOpen()}>
      <aside
        id="detail-panel"
        classList={{
          open: detailOpen(),
        }}
        style={{ position: "relative" }}
      >
        <PanelResizeHandle panel="detail" side="left" />
        <Switch fallback={<Empty />}>
          <Match when={selectedContactId()}>{(id) => <ContactPanel contactId={id()} />}</Match>
          <Match when={selectedMessageId()}>{(id) => <MessagePanel messageId={id()} />}</Match>
          <Match when={selectedMeetingId()}>{(id) => <MeetingPanel meetingId={id()} />}</Match>
          <Match when={selectedFileId()}>{(id) => <FilePanel fileId={id()} />}</Match>
          <Match when={selectedTaskId()}>{(id) => <TaskPanel taskId={id()} />}</Match>
          <Match when={selectedDraftId()}>{(id) => <DraftPanel draftId={id()} />}</Match>
        </Switch>
        <Show when={detailOpen() && !selectedContactId() && !selectedMessageId() && !selectedMeetingId() && !selectedFileId() && !selectedTaskId() && !selectedDraftId()}>
          <Empty />
        </Show>
      </aside>
    </Show>
  );
}

// Ensure CSS variables match stored widths when this module loads.
initializePanelWidths();

function Empty() {
  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        height: "100%",
        color: "var(--text-muted)",
        "font-size": "var(--text-caption)",
        padding: "var(--space-5)",
        "text-align": "center",
      }}
    >
      <div>
        <p>未选中任何条目</p>
        <button
          onClick={() => setDetailOpen(false)}
          style={{
            "margin-top": "var(--space-3)",
            color: "var(--text-secondary)",
            "text-decoration": "underline",
            "font-size": "var(--text-caption)",
          }}
        >
          关闭面板
        </button>
      </div>
    </div>
  );
}