/** Every resource consumer must say something while it loads and something
 *  else when it fails.
 *
 *  The 2026-11-08 audit found panels, popovers and settings sections that
 *  rendered nothing at all in either state — a failed query looked exactly
 *  like "this record has no fields", and a slow one looked like an empty
 *  screen. That is the same class of bug as the black window: the user gets
 *  no way to tell "nothing here" from "we couldn't ask".
 *
 *  Structural check (source string, no render) so it stays fast. Views that
 *  go through `ResourceGate`/`PanelState` pass automatically; hand-rolled
 *  ones must show both markers.
 */

import { describe, it, expect } from "vitest";

import companyPanel from "../panels/CompanyPanel.tsx?raw";
import contactPanel from "../panels/ContactPanel.tsx?raw";
import draftPanel from "../panels/DraftPanel.tsx?raw";
import taskPanel from "../panels/TaskPanel.tsx?raw";
import messagePanel from "../panels/MessagePanel.tsx?raw";
import filePanel from "../panels/FilePanel.tsx?raw";
import meetingPanel from "../panels/MeetingPanel.tsx?raw";
import notifications from "../notifications/NotificationPanel.tsx?raw";
import compose from "../compose/Compose.tsx?raw";
import commandPalette from "../search/CommandPalette.tsx?raw";
import liveSearch from "../search/LiveSearch.tsx?raw";
import rules from "../components/RulesSettings.tsx?raw";
import labelPicker from "../components/LabelPicker.tsx?raw";
import llmProviders from "../components/LlmProviderSettings.tsx?raw";
import agentConnections from "../components/AgentConnectionPanel.tsx?raw";
import folders from "../views/Folders.tsx?raw";
import imbox from "../views/Imbox.tsx?raw";
import stream from "../views/Stream.tsx?raw";
import records from "../views/Records.tsx?raw";
import trash from "../views/Trash.tsx?raw";
import spam from "../views/Spam.tsx?raw";
import readTogether from "../views/ReadTogether.tsx?raw";
import contacts from "../views/Contacts.tsx?raw";

/** Files that fetch through `createResource` and must handle all states. */
const CONSUMERS: Array<{ name: string; source: string }> = [
  { name: "panels/CompanyPanel", source: companyPanel },
  { name: "panels/ContactPanel", source: contactPanel },
  { name: "panels/DraftPanel", source: draftPanel },
  { name: "panels/TaskPanel", source: taskPanel },
  { name: "panels/MessagePanel", source: messagePanel },
  { name: "panels/FilePanel", source: filePanel },
  { name: "panels/MeetingPanel", source: meetingPanel },
  { name: "notifications/NotificationPanel", source: notifications },
  { name: "compose/Compose", source: compose },
  { name: "search/CommandPalette", source: commandPalette },
  { name: "search/LiveSearch", source: liveSearch },
  { name: "components/RulesSettings", source: rules },
  { name: "components/LabelPicker", source: labelPicker },
  { name: "components/LlmProviderSettings", source: llmProviders },
  { name: "components/AgentConnectionPanel", source: agentConnections },
  { name: "views/Folders", source: folders },
  { name: "views/Imbox", source: imbox },
  { name: "views/Stream", source: stream },
  { name: "views/Records", source: records },
  { name: "views/Trash", source: trash },
  { name: "views/Spam", source: spam },
  { name: "views/ReadTogether", source: readTogether },
  { name: "views/Contacts", source: contacts },
];

const GATE = /<PanelState\b|<ResourceGate\b/;
const ERROR = /\.error\b|state === "errored"|ErrorState|errorTitle/;
const LOADING =
  /\.loading\b|state === "pending"|Skeleton|aria-busy|<PanelState\b|<ResourceGate\b/;

describe("resource consumers handle loading and failure", () => {
  for (const { name, source } of CONSUMERS) {
    it(`${name} renders a loading state`, () => {
      expect(LOADING.test(source)).toBe(true);
    });

    it(`${name} renders an error state`, () => {
      expect(GATE.test(source) || ERROR.test(source)).toBe(true);
    });
  }
});
