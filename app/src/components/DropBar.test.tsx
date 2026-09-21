/** DropBar tests — the bar must be a REAL drop zone: during an HTML5
 *  drag, `click` never fires, so `dragover`/`drop` handlers are the
 *  only path. Regression guard for the 2026-09-22 "fake drag" audit
 *  finding (all 8 targets had onClick only). */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@solidjs/testing-library";
import { DropBar } from "./DropBar";
import { startDrag, endDrag, useDragContext } from "../utils/drag";

describe("DropBar", () => {
  beforeEach(() => {
    endDrag();
  });

  it("renders nothing while no drag is active", () => {
    render(() => <DropBar />);
    expect(document.getElementById("drop-bar")).toBeNull();
  });

  it("shows all 8 targets once a drag starts", () => {
    render(() => <DropBar />);
    startDrag({ id: "m1" }, vi.fn());
    const bar = document.getElementById("drop-bar");
    expect(bar).not.toBeNull();
    expect(bar!.querySelectorAll("[data-drop-target]")).toHaveLength(8);
  });

  it("commits on drop (not click) and closes the bar", async () => {
    const commit = vi.fn();
    render(() => <DropBar />);
    startDrag({ id: "m1" }, commit);

    const target = document.querySelector<HTMLElement>(
      '[data-drop-target="pending"]',
    )!;
    // dragover must be preventable (this is what allows the drop).
    const over = new Event("dragover", { bubbles: true, cancelable: true });
    target.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);

    await fireEvent.drop(target);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("pending");
    expect(useDragContext()().active).toBe(false);
  });

  it("dropping on the bar background cancels without committing", async () => {
    const commit = vi.fn();
    render(() => <DropBar />);
    startDrag({ id: "m1" }, commit);

    const bar = document.getElementById("drop-bar")!;
    await fireEvent.drop(bar);
    expect(commit).not.toHaveBeenCalled();
    expect(useDragContext()().active).toBe(false);
  });

  it("click still commits (non-drag pointer path)", async () => {
    const commit = vi.fn();
    render(() => <DropBar />);
    startDrag({ id: "m1" }, commit);

    await fireEvent.click(screen.getByText("回收站"));
    expect(commit).toHaveBeenCalledWith("trash");
    expect(useDragContext()().active).toBe(false);
  });

  it("closes the bar even when the commit handler throws", async () => {
    const commit = vi.fn(() => Promise.reject(new Error("db locked")));
    render(() => <DropBar />);
    startDrag({ id: "m1" }, commit);

    const target = document.querySelector<HTMLElement>(
      '[data-drop-target="imbox"]',
    )!;
    // The rejection is unhandled inside commit(); swallow it here.
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    target.dispatchEvent(drop);
    await new Promise((r) => setTimeout(r, 0));
    expect(useDragContext()().active).toBe(false);
  });
});
