import { beforeEach, describe, expect, it, vi } from "vitest";
const runtime = vi.hoisted(() => ({ browser: false }));
vi.mock("./tauri-shim", () => ({ IS_BROWSER: () => runtime.browser }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: async () => new (await import("./mock-db")).MockDb() } }));
vi.mock("./backend", () => ({
  agentChat: vi.fn(),
  DEFAULT_LLM_BASE_URL: "https://api.openai.com/v1",
}));
import { agentChat } from "./backend";
import { resetMockDb } from "./mock-db";
import { appSettings, setAppSettings, setSelectedCompanyName, setSelectedFileId, setSelectedMeetingId, selectedCompanyName, selectedFileId, selectedMeetingId, selectedMessageId } from "../stores/ui";
import { upsertContact, upsertMessage, getContact, getTaskExtractionRun, listPendingTaskSuggestions, upsertTaskExtractionRun, listTasks } from "../stores/data";
import { extractTasksForMessage, resumeTaskExtractionQueue, openTaskSource } from "./task-extraction";
import type { Contact, Message } from "../types";
import * as dataStore from "../stores/data";

const now = "2026-11-02T12:00:00.000Z";
async function seed(message: Partial<Message> = {}, contact: Partial<Contact> = {}) {
  await upsertContact({ id: "c", name: "Sender", emails: [{ value: "sender@test.com", label: "work" }], screened: true, blocked: false, firstSeen: false, labels: [], topics: [], phones: [], accounts: [], stageHistory: [], milestones: [], autoLabel: [], ch: [], ...contact } as Contact);
  await upsertMessage({ id: "m", pid: "c", ac: "a", subj: "Report", st: now, body: "Please send the report", direction: "in", bucket: "imbox", labels: [], attachments: [], trackers: [], cc: [], bcc: [], ...message } as Message);
}
describe("task extraction pipeline", () => {
  beforeEach(() => {
    resetMockDb(); runtime.browser = false; vi.mocked(agentChat).mockReset();
    vi.mocked(agentChat).mockResolvedValue({ content: '{"tasks":[{"title":"Send report","direction":"mine"}]}' });
    setAppSettings("agent", "llm", "model", "test-model");
    setAppSettings("agent", "llm", "apiKey", "key");
    setAppSettings("agent", "autoExtractTasks", true);
    setAppSettings("agent", "taskExtractionEnabledAt", "2026-11-02T00:00:00.000Z");
  });
  it("requires explicit auto opt-in and configured model/runtime", async () => {
    await seed();
    setAppSettings("agent", "autoExtractTasks", false);
    await extractTasksForMessage("m", "automatic");
    expect(await getTaskExtractionRun("m")).toBeNull();
    setAppSettings("agent", "autoExtractTasks", true);
    setAppSettings("agent", "llm", "model", "");
    await extractTasksForMessage("m", "automatic");
    runtime.browser = true;
    setAppSettings("agent", "llm", "model", "test-model");
    await extractTasksForMessage("m", "manual");
    expect(agentChat).not.toHaveBeenCalled();
  });
  it.each([{ bucket: "spam" }, { bucket: "trash" }, { bucket: "feed" }, { direction: "out" }, { st: "2026-11-01T12:00:00.000Z" }])("excludes automatic mail %j", async overrides => {
    await seed(overrides as Partial<Message>); await extractTasksForMessage("m", "automatic"); expect(agentChat).not.toHaveBeenCalled();
  });
  it.each([{ screened: false }, { blocked: true }, { firstSeen: true }])("requires Gate approval %j", async overrides => {
    await seed({}, overrides); await extractTasksForMessage("m", "automatic"); expect(agentChat).not.toHaveBeenCalled();
  });
  it("retries an auto-skipped Gate message when the user approves it into Inbox", async () => {
    await seed({}, { screened: false, firstSeen: true });
    expect((await extractTasksForMessage("m", "automatic")).state).toBe("skipped");
    const sender = await getContact("c");
    await upsertContact({ ...sender!, firstSeen: false, screened: true, blocked: false });
    expect((await extractTasksForMessage("m", "automatic")).state).toBe("pending_review");
    expect(agentChat).toHaveBeenCalledTimes(1);
  });
  it("serializes and deduplicates concurrent events, storing drafts only", async () => {
    await seed(); await Promise.all([extractTasksForMessage("m", "automatic"), extractTasksForMessage("m", "automatic")]);
    expect(agentChat).toHaveBeenCalledTimes(1);
    expect(await listPendingTaskSuggestions()).toHaveLength(1);
    expect(await listTasks()).toEqual([]);
    expect((await getTaskExtractionRun("m"))?.state).toBe("pending_review");
    expect(vi.mocked(agentChat).mock.calls[0]?.[0].max_tokens).toBe(512);
  });
  it("keeps queued mail lightweight and only loads one body per serial request", async () => {
    await seed(); await seed({ id: "second" });
    let complete: ((value: { content: string }) => void) | undefined;
    vi.mocked(agentChat).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const bodies = vi.spyOn(dataStore, "getMessage");
    const first = extractTasksForMessage("m", "automatic");
    const second = extractTasksForMessage("second", "automatic");
    await vi.waitFor(() => expect(agentChat).toHaveBeenCalledTimes(1));
    const queuedState = (await getTaskExtractionRun("second"))?.state;
    const queuedBodies = bodies.mock.calls.length;
    complete!({ content: '{"tasks":[]}' });
    await Promise.all([first, second]);
    const totalBodies = bodies.mock.calls.length;
    bodies.mockRestore();
    expect(queuedState).toBe("queued");
    expect(queuedBodies).toBe(1);
    expect(agentChat).toHaveBeenCalledTimes(2);
    expect(totalBodies).toBe(2);
  });
  it("serializes per-message metadata reads for a burst of sync IDs", async () => {
    await seed(); await seed({ id: "second" }); await seed({ id: "third" });
    const original = dataStore.listMessagesByIdsLight;
    let active = 0;
    let maxActive = 0;
    vi.spyOn(dataStore, "listMessagesByIdsLight").mockImplementation(async ids => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      const rows = await original(ids);
      active--;
      return rows;
    });
    await Promise.all([
      extractTasksForMessage("m", "automatic"),
      extractTasksForMessage("second", "automatic"),
      extractTasksForMessage("third", "automatic"),
    ]);
    expect(maxActive).toBe(1);
  });
  it("manual historical/sent requests work with auto off and reuse saved results", async () => {
    await seed({ direction: "out", bucket: "paperTrail", st: "2020-01-01" }); setAppSettings("agent", "autoExtractTasks", false);
    await extractTasksForMessage("m", "manual"); await extractTasksForMessage("m", "manual"); expect(agentChat).toHaveBeenCalledTimes(1);
  });
  it("opens persisted results even after model configuration is removed", async () => {
    await seed(); await extractTasksForMessage("m", "manual");
    setAppSettings("agent", "llm", "model", "");
    expect((await extractTasksForMessage("m", "manual")).state).toBe("pending_review");
    expect(agentChat).toHaveBeenCalledTimes(1);
  });
  it("uses a configured local endpoint without requiring an API key", async () => {
    await seed(); setAppSettings("agent", "llm", "apiKey", "");
    setAppSettings("agent", "llm", "baseUrl", "http://localhost:11434/v1");
    expect((await extractTasksForMessage("m", "manual")).state).toBe("pending_review");
    expect(agentChat).toHaveBeenCalledTimes(1);
  });
  it("uses the default OpenAI endpoint when the configured base URL is blank", async () => {
    await seed();
    setAppSettings("agent", "llm", "baseUrl", "");
    await extractTasksForMessage("m", "manual");
    expect(vi.mocked(agentChat).mock.calls[0]?.[0].base_url).toBe("https://api.openai.com/v1");
  });
  it("opens source mail instead of a stale company/file/meeting selection", async () => {
    await seed(); setSelectedCompanyName("Old company"); setSelectedFileId("old-file"); setSelectedMeetingId("old-meeting");
    expect(await openTaskSource("m")).toBe(true);
    expect(selectedCompanyName()).toBeNull();
    expect(selectedFileId()).toBeNull();
    expect(selectedMeetingId()).toBeNull();
    expect(selectedMessageId()).toBe("m");
  });
  it("persists no-task and failed runs; only manual failed retries spend again", async () => {
    await seed(); vi.mocked(agentChat).mockResolvedValueOnce({ content: "invalid" });
    await extractTasksForMessage("m", "automatic");
    expect((await getTaskExtractionRun("m"))?.state).toBe("failed");
    await extractTasksForMessage("m", "automatic"); expect(agentChat).toHaveBeenCalledTimes(1);
    vi.mocked(agentChat).mockResolvedValueOnce({ content: '{"tasks":[]}' });
    await extractTasksForMessage("m", "manual");
    expect((await getTaskExtractionRun("m"))?.state).toBe("no_tasks");
    await extractTasksForMessage("m", "manual"); expect(agentChat).toHaveBeenCalledTimes(2);
  });
  it("does not expose partial suggestions if saving a candidate fails", async () => {
    await seed();
    vi.mocked(agentChat).mockResolvedValueOnce({ content: '{"tasks":[{"title":"One","direction":"mine"},{"title":"Two","direction":"mine"}]}' });
    const original = dataStore.upsertTaskSuggestion;
    const save = vi.spyOn(dataStore, "upsertTaskSuggestion").mockImplementationOnce(original).mockRejectedValueOnce(new Error("Storage unavailable"));
    await extractTasksForMessage("m", "manual");
    expect((await getTaskExtractionRun("m"))?.state).toBe("failed");
    expect(await listPendingTaskSuggestions()).toEqual([]);
    save.mockRestore();
  });
  it("recovers interrupted processing without automatic retry and resumes queued work", async () => {
    await seed();
    await upsertTaskExtractionRun({ sourceMessageId: "old", state: "processing", mode: "automatic", createdAt: now, updatedAt: now });
    await upsertTaskExtractionRun({ sourceMessageId: "m", state: "queued", mode: "automatic", createdAt: now, updatedAt: now });
    await resumeTaskExtractionQueue();
    expect((await getTaskExtractionRun("old"))?.state).toBe("failed");
    expect((await getTaskExtractionRun("m"))?.state).toBe("pending_review");
  });
  it("skips unsent queued work when disabled and discards an in-flight response", async () => {
    await seed();
    vi.mocked(agentChat).mockImplementationOnce(() => { setAppSettings("agent", "autoExtractTasks", false); return Promise.resolve({ content: '{"tasks":[{"title":"Report","direction":"mine"}]}' }); });
    await extractTasksForMessage("m", "automatic");
    expect(await listPendingTaskSuggestions()).toEqual([]);
    expect((await getTaskExtractionRun("m"))?.state).toBe("skipped");
    await upsertTaskExtractionRun({ sourceMessageId: "queued", state: "queued", mode: "automatic", createdAt: now, updatedAt: now });
    await resumeTaskExtractionQueue();
    expect((await getTaskExtractionRun("queued"))?.state).toBe("skipped");
    const callsAfterAutomaticRun = vi.mocked(agentChat).mock.calls.length;
    expect((await extractTasksForMessage("m", "manual")).state).toBe("skipped");
    expect(vi.mocked(agentChat)).toHaveBeenCalledTimes(callsAfterAutomaticRun);
  });
  it("discards a response if re-enabled at a later timestamp", async () => {
    await seed();
    vi.mocked(agentChat).mockImplementationOnce(() => { setAppSettings("agent", "taskExtractionEnabledAt", "2026-11-03T00:00:00.000Z"); return Promise.resolve({ content: '{"tasks":[]}' }); });
    await extractTasksForMessage("m", "automatic"); expect((await getTaskExtractionRun("m"))?.state).toBe("skipped");
    expect(appSettings.agent.autoExtractTasks).toBe(true);
  });
});
