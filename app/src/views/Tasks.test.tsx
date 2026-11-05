import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));
import { resetMockDb } from "../services/mock-db";
import { getTask, listPendingTaskSuggestions, upsertTask, upsertTaskSuggestion } from "../stores/data";
import { Tasks } from "./Tasks";
import { TaskPanel } from "../panels/TaskPanel";
import * as dataStore from "../stores/data";
import { bumpSoftRefreshTick } from "../stores/ui";

const now = "2026-11-02T00:00:00.000Z";
describe("Tasks review", () => {
  beforeEach(resetMockDb);
  it("preserves manual tasks and explains the no-model empty state", async () => {
    render(() => <Tasks />);
    expect(await screen.findByText("还没有任务")).toBeInTheDocument();
    expect(screen.getByText(/配置模型/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新建任务" }));
    expect(await screen.findByRole("button", { name: /新任务/ })).toBeInTheDocument();
  });
  it("groups legacy, mine and theirs without dropping done tasks", async () => {
    for (const [id, direction] of [["old", undefined], ["mine", "mine"], ["theirs", "theirs"]] as const) await upsertTask({ id, title: id, direction, notes: "", status: "done", priority: "normal", createdAt: now });
    render(() => <Tasks />);
    expect(await screen.findByText("未分类")).toBeInTheDocument();
    expect(screen.getByText("我承诺的")).toBeInTheDocument();
    expect(screen.getByText("对方承诺的")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /old/ })).toBeInTheDocument();
  });
  it("edits and confirms unclear suggestions only after direction review", async () => {
    await upsertTaskSuggestion({ id: "s", sourceMessageId: "m", title: "Report", notes: "", direction: "unclear", priority: "normal", status: "pending", createdAt: now });
    render(() => <Tasks />);
    const title = await screen.findByLabelText("建议标题");
    expect(screen.getByRole("button", { name: "确认任务" })).toBeDisabled();
    fireEvent.input(title, { target: { value: "Edited report" } });
    fireEvent.change(screen.getByLabelText("承诺方向"), { target: { value: "mine" } });
    fireEvent.click(screen.getByRole("button", { name: "确认任务" }));
    await waitFor(async () => expect(await getTask("task-s")).toMatchObject({ title: "Edited report", direction: "mine", relatedMessageId: "m" }));
    expect(await listPendingTaskSuggestions()).toEqual([]);
  });
  it("dismisses without creating a task and safely handles missing sources", async () => {
    await upsertTaskSuggestion({ id: "s", sourceMessageId: "missing", title: "Report", notes: "", direction: "mine", priority: "normal", status: "pending", createdAt: now });
    render(() => <Tasks />);
    fireEvent.click(await screen.findByRole("button", { name: "来源邮件" }));
    expect(await screen.findByText("来源邮件已不可用")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "忽略建议" }));
    await waitFor(async () => expect(await listPendingTaskSuggestions()).toEqual([]));
    expect(await getTask("task-s")).toBeNull();
  });
  it("shows a recoverable error when storage fails", async () => {
    const query = vi.spyOn(dataStore, "listTasksPage").mockRejectedValueOnce(new Error("Unavailable database"));
    render(() => <Tasks />);
    expect(await screen.findByText("加载失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("还没有任务")).toBeInTheDocument();
    query.mockRestore();
  });
  it("preserves edited draft suggestions across background refreshes", async () => {
    await upsertTaskSuggestion({ id: "s", sourceMessageId: "m", title: "Report", notes: "", direction: "mine", priority: "normal", status: "pending", createdAt: now });
    const query = vi.spyOn(dataStore, "listPendingTaskSuggestions");
    render(() => <Tasks />);
    fireEvent.input(await screen.findByLabelText("建议标题"), { target: { value: "My reviewed title" } });
    bumpSoftRefreshTick();
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("建议标题")).toHaveValue("My reviewed title");
    query.mockRestore();
  });
  it("updates the Tasks list after saving through the existing TaskPanel", async () => {
    await upsertTask({ id: "old", title: "Old title", notes: "", priority: "normal", status: "todo", createdAt: now });
    render(() => <><Tasks /><TaskPanel taskId="old" /></>);
    fireEvent.input(await screen.findByDisplayValue("Old title"), { target: { value: "Updated title" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    expect(await screen.findByRole("button", { name: /Updated title/ })).toBeInTheDocument();
  });
});
