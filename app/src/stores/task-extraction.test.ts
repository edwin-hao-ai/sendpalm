import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));
import { resetMockDb } from "../services/mock-db";
import { getTask, upsertTask, getTaskExtractionRun, upsertTaskExtractionRun, listQueuedTaskExtractionRuns, upsertTaskSuggestion, listPendingTaskSuggestions, confirmTaskSuggestion, dismissTaskSuggestion } from "./data";
import type { TaskSuggestion } from "../types";
import { appSettings } from "./ui";
import { loadAppSettings, saveAppSettings, resetAllData } from "./data";
import type { Store } from "@tauri-apps/plugin-store";

const now = "2026-11-02T12:00:00.000Z";
const suggestion = (id: string): TaskSuggestion => ({ id, sourceMessageId: "m1", title: "Send report", notes: "", priority: "normal", direction: "mine", status: "pending", createdAt: now });
describe("task extraction persistence", () => {
  beforeEach(resetMockDb);
  it("round-trips legacy and sourced tasks", async () => {
    const task = { id: "t", title: "Old task", notes: "", status: "todo" as const, priority: "normal" as const, createdAt: now };
    await upsertTask(task);
    expect((await getTask("t"))?.relatedMessageId).toBeUndefined();
    await upsertTask({ ...task, relatedMessageId: "m1", direction: "theirs" });
    expect(await getTask("t")).toMatchObject({ relatedMessageId: "m1", direction: "theirs" });
  });
  it("persists one run per message and bounded queues", async () => {
    for (let i = 0; i < 30; i++) await upsertTaskExtractionRun({ sourceMessageId: `m${i}`, state: "queued", mode: "automatic", createdAt: now, updatedAt: now });
    expect(await listQueuedTaskExtractionRuns()).toHaveLength(25);
    await upsertTaskExtractionRun({ sourceMessageId: "m1", state: "no_tasks", mode: "automatic", createdAt: now, updatedAt: now });
    expect((await getTaskExtractionRun("m1"))?.state).toBe("no_tasks");
  });
  it("bounds suggestions and confirms idempotently without creating tasks on dismiss", async () => {
    for (let i = 0; i < 105; i++) await upsertTaskSuggestion(suggestion(`s${i}`));
    expect(await listPendingTaskSuggestions()).toHaveLength(100);
    const task = await confirmTaskSuggestion({ ...suggestion("s1"), title: "Edited" });
    expect(await confirmTaskSuggestion(suggestion("s1"))).toBe(task);
    expect(await getTask(task)).toMatchObject({ title: "Edited", relatedMessageId: "m1", direction: "mine" });
    await dismissTaskSuggestion("s2");
    expect(await getTask("task-s2")).toBeNull();
    expect((await listPendingTaskSuggestions()).find(s => s.id === "s2")).toBeUndefined();
  });
  it("requires direction review for unclear candidates", async () => {
    await upsertTaskSuggestion({ ...suggestion("s"), direction: "unclear" });
    await expect(confirmTaskSuggestion({ ...suggestion("s"), direction: "unclear" })).rejects.toThrow();
  });
  it("normalizes old preference files to default off and persists the toggle without credentials", async () => {
    const legacy = JSON.parse(JSON.stringify(appSettings));
    delete legacy.agent.autoExtractTasks;
    delete legacy.agent.taskExtractionEnabledAt;
    const store = { get: vi.fn().mockResolvedValue(legacy), set: vi.fn(), save: vi.fn() } as unknown as Store;
    const settings = await loadAppSettings(store);
    expect(settings.agent.autoExtractTasks).toBe(false);
    expect(settings.agent.taskExtractionEnabledAt).toBeNull();
    settings.agent.autoExtractTasks = true;
    settings.agent.taskExtractionEnabledAt = now;
    settings.agent.llm.apiKey = "secret";
    await saveAppSettings(store, settings);
    expect(store.set).toHaveBeenCalledWith("app_settings", expect.objectContaining({ agent: expect.objectContaining({ autoExtractTasks: true, taskExtractionEnabledAt: now, llm: expect.objectContaining({ apiKey: "" }) }) }));
    expect(settings.agent.llm.apiKey).toBe("secret");
  });
  it("reset removes queued and review state", async () => {
    await upsertTaskExtractionRun({ sourceMessageId: "m1", state: "queued", mode: "automatic", createdAt: now, updatedAt: now });
    await upsertTaskSuggestion(suggestion("s1"));
    await resetAllData();
    expect(await listPendingTaskSuggestions()).toEqual([]);
    expect(await listQueuedTaskExtractionRuns()).toEqual([]);
  });
});
