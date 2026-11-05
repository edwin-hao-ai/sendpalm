import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));
vi.mock("../services/task-extraction", () => ({ extractTasksForMessage: vi.fn().mockResolvedValue({ state: "skipped" }) }));
import { extractTasksForMessage } from "../services/task-extraction";
import { upsertContact, upsertMessage } from "../stores/data";
import { resetMockDb } from "../services/mock-db";
import type { Contact, Message } from "../types";
import { Gate } from "./Gate";
beforeEach(() => { resetMockDb(); vi.mocked(extractTasksForMessage).mockClear(); });
async function seed() {
  await upsertContact({ id: "c", name: "Sender", firstSeen: true, screened: false, emails: [], phones: [], labels: [], topics: [], accounts: [], stageHistory: [], milestones: [], autoLabel: [], ch: [] } as unknown as Contact);
  for (const [id, st] of [["old", "2020-01-01"], ["displayed", "2026-11-02"]]) await upsertMessage({ id, pid: "c", subj: "Request", body: "Please send a report", st, direction: "in", bucket: "imbox", labels: [], attachments: [], trackers: [], cc: [], bcc: [] } as unknown as Message);
}
it("Gate approval queues only the displayed message, never sender history", async () => {
  await seed(); render(() => <Gate />);
  fireEvent.click(await screen.findByTestId("gate-approve-imbox"));
  await waitFor(() => expect(extractTasksForMessage).toHaveBeenCalledWith("displayed", "automatic"));
  expect(extractTasksForMessage).toHaveBeenCalledTimes(1);
});
it("Gate approval into Stream never queues extraction", async () => {
  await seed(); render(() => <Gate />);
  fireEvent.click(await screen.findByTestId("gate-approve-feed"));
  await waitFor(() => expect(screen.queryByTestId("gate-approve-feed")).not.toBeInTheDocument());
  expect(extractTasksForMessage).not.toHaveBeenCalled();
});
