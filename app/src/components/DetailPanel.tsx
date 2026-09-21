/** DetailPanel — right-side panel for the currently-selected entity.
 *  Mobile: full-screen sheet with a shell-level back button (top-left ←).
 *  Tablet/desktop: overlay drawer with a translucent click-to-close scrim
 *  and a liquid-glass surface. */

import { Show, Switch, Match } from "solid-js";
import {
  detailOpen,
  selectedContactId,
  selectedMessageId,
  selectedMeetingId,
  selectedFileId,
  selectedTaskId,
  selectedDraftId,
  selectedCompanyName,
  setDetailOpen,
} from "../stores/ui";
import { ContactPanel } from "../panels/ContactPanel";
import { MessagePanel } from "../panels/MessagePanel";
import { MeetingPanel } from "../panels/MeetingPanel";
import { FilePanel } from "../panels/FilePanel";
import { TaskPanel } from "../panels/TaskPanel";
import { DraftPanel } from "../panels/DraftPanel";
import { CompanyPanel } from "../panels/CompanyPanel";
import { PanelResizeHandle, initializePanelWidths } from "./PanelResizeHandle";
import { Icon } from "./Icon";
import { useViewport } from "../utils/gestures";

export function DetailPanel() {
  const { isMobile } = useViewport();
  const close = () => setDetailOpen(false);

  return (
    <Show when={detailOpen()}>
      {/* Scrim — click outside the panel to close. Mobile uses a
          full-screen sheet, so the scrim is tablet/desktop only. */}
      <Show when={!isMobile()}>
        <div
          aria-hidden="true"
          onClick={close}
          style={{
            position: "fixed",
            inset: "0",
            background: "rgba(35,28,51,0.12)",
            "z-index": "calc(var(--z-detail) - 1)",
            animation: "backdrop-fade-in 0.2s var(--ease-out) both",
          }}
        />
      </Show>
      <aside
        id="detail-panel"
        classList={{
          open: detailOpen(),
        }}
        style={{
          background: "var(--glass-bg)",
          "backdrop-filter": "var(--glass-blur)",
          "-webkit-backdrop-filter": "var(--glass-blur)",
        }}
      >
        <PanelResizeHandle panel="detail" side="left" />
        {/* Shell-level back button on mobile — panels don't each re-implement
            their own close affordance. */}
        <Show when={isMobile()}>
          <button
            onClick={close}
            aria-label="返回"
            title="返回"
            style={{
              position: "absolute",
              top: "calc(var(--space-3) + env(safe-area-inset-top))",
              left: "var(--space-3)",
              "z-index": 10,
              width: "44px",
              height: "44px",
              "border-radius": "var(--radius-pill)",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: "var(--glass-bg)",
              "backdrop-filter": "var(--glass-blur)",
              "-webkit-backdrop-filter": "var(--glass-blur)",
              border: "0.5px solid var(--glass-border)",
              "box-shadow": "var(--shadow-sm)",
              color: "var(--text-primary)",
            }}
          >
            <Icon name="ph-arrow-left" size={20} />
          </button>
        </Show>
        <Switch fallback={<Empty />}>
          <Match when={selectedCompanyName()}>
            {(name) => <CompanyPanel companyName={name()} />}
          </Match>
          <Match when={selectedContactId()}>
            {(id) => <ContactPanel contactId={id()} />}
          </Match>
          <Match when={selectedMessageId()}>
            {(id) => <MessagePanel messageId={id()} />}
          </Match>
          <Match when={selectedMeetingId()}>
            {(id) => <MeetingPanel meetingId={id()} />}
          </Match>
          <Match when={selectedFileId()}>
            {(id) => <FilePanel fileId={id()} />}
          </Match>
          <Match when={selectedTaskId()}>
            {(id) => <TaskPanel taskId={id()} />}
          </Match>
          <Match when={selectedDraftId()}>
            {(id) => <DraftPanel draftId={id()} />}
          </Match>
        </Switch>
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
