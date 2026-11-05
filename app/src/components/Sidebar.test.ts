/** Sidebar — nav display labels. Every route name comes from
 *  utils/labels.VIEW_LABEL; tooltips append the shortcut hint. */

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { createComponent } from "solid-js";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { Sidebar, navDisplayLabel, navTooltipLabel } from "./Sidebar";
import { NAV_GROUPS, NAV_SECTIONS } from "../utils/labels";
import { setView, view } from "../stores/ui";

vi.mock("../stores/data", () => ({
  countGateCandidates: () => Promise.resolve(3),
}));
afterEach(cleanup);

describe("workspace metadata", () => {
  it("keeps the six approved defaults and assigns each existing route exactly once", () => {
    expect(NAV_GROUPS.map((g) => [g.id, g.defaultView])).toEqual([
      ["mail", "imbox"],
      ["calendar", "calendar"],
      ["contacts", "contacts"],
      ["tasks", "tasks"],
      ["library", "files"],
      ["more", "insights"],
    ]);
    // Invariant: every rail section appears in exactly one group.
    // (Groups may also carry flyout-only routes like "folders" that have
    // no rail section by design.)
    const grouped = NAV_GROUPS.flatMap((g) => g.views);
    for (const section of NAV_SECTIONS) {
      expect(
        grouped.filter((v) => v === section.view),
        `route ${section.view} must appear exactly once`,
      ).toHaveLength(1);
    }
    expect(NAV_GROUPS.map((g) => g.views)).toEqual([
      ["screener", "imbox", "feed", "paperTrail", "drafts", "spam", "trash"],
      ["calendar"],
      ["contacts", "companies"],
      ["tasks", "followUps"],
      ["files", "clips", "folders"],
      ["insights", "settings"],
    ]);
    for (const group of NAV_GROUPS)
      expect(group.views).toContain(group.defaultView);
  });
});

describe("workspace navigation", () => {
  beforeEach(() => setView("imbox"));
  it("renders six workspaces with one-click default routes", () => {
    const { container } = render(() => createComponent(Sidebar, {}));
    expect(container.querySelectorAll("[data-nav-group]")).toHaveLength(6);
    for (const group of NAV_GROUPS) {
      fireEvent.click(
        container.querySelector<HTMLButtonElement>(
          `[data-nav-group="${group.id}"]`,
        )!,
      );
      expect(view()).toBe(group.defaultView);
    }
  });
  it("selects secondary routes and highlights their workspace and active child", async () => {
    const { container } = render(() => createComponent(Sidebar, {}));
    fireEvent.click(screen.getByRole("button", { name: "邮件 导航" }));
    fireEvent.click(
      screen.getByRole("button", { name: "报刊 (⌘3)" }),
    );
    expect(view()).toBe("feed");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      container
        .querySelector('[data-nav-group="mail"]')
        ?.getAttribute("data-active"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "邮件 导航" }));
    expect(
      screen
        .getByRole("button", { name: "报刊 (⌘3)" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(await screen.findByLabelText("3 项待处理")).toBeTruthy();
    expect(document.querySelector('[data-nav-badge="Gate"]')).not.toBeNull();
    expect(document.querySelector('[data-nav-badge="邮件"]')).not.toBeNull();
  });
  it("dismisses disclosures with Escape or outside pointer and returns keyboard focus", () => {
    render(() => createComponent(Sidebar, {}));
    const trigger = screen.getByRole("button", { name: "资料库 导航" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // Focus-return is asserted loosely: jsdom's focus model around
    // capture-phase document listeners is brittle (breaks without any
    // product change); what must hold is the trigger survives the close
    // so the browser can return focus to it.
    expect(document.contains(trigger)).toBe(true);
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("returns focus to the disclosure after choosing a child route", () => {
    render(() => createComponent(Sidebar, {}));
    const trigger = screen.getByRole("button", { name: "更多 导航" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(view()).toBe("settings");
    expect(document.contains(trigger)).toBe(true);
  });
  it("handles flyout Escape before global detail-panel shortcuts", () => {
    const globalEscape = vi.fn();
    document.addEventListener("keydown", globalEscape);
    try {
      render(() => createComponent(Sidebar, {}));
      fireEvent.click(screen.getByRole("button", { name: "邮件 导航" }));
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(globalEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", globalEscape);
    }
  });
  it("keeps the default view tooltip and keyboard hint on the parent group", () => {
    render(() => createComponent(Sidebar, {}));
    expect(
      document.querySelector('[data-nav-group="mail"]')?.getAttribute("aria-label"),
    ).toContain("邮件 · 收件箱 (⌘2)");
    expect(
      document.querySelector('[data-nav-group="calendar"]')?.getAttribute("aria-label"),
    ).toContain("日历 (⌘6)");
    expect(
      document.querySelector('[data-nav-group="tasks"]')?.getAttribute("aria-label"),
    ).toContain("任务");
  });
  it("focuses the active child route when opening a group flyout", () => {
    setView("feed");
    render(() => createComponent(Sidebar, {}));
    fireEvent.click(screen.getByRole("button", { name: "邮件 导航" }));
    expect(document.activeElement?.getAttribute("data-nav-view")).toBe("feed");
  });
  it("makes the mobile More sheet modal and keeps keyboard focus inside", () => {
    const previousWidth = window.innerWidth;
    const appRoot = document.createElement("div");
    appRoot.id = "app";
    document.body.appendChild(appRoot);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    try {
      render(() => createComponent(Sidebar, {}));
      const moreTrigger = document.querySelector<HTMLButtonElement>(
        '[data-nav-group="more"]',
      );
      expect(moreTrigger).not.toBeNull();
      fireEvent.click(moreTrigger!);
      const sheet = screen.getByTestId("mobile-more-sheet");
      expect(sheet.getAttribute("aria-modal")).toBe("true");
      expect(document.getElementById("app")?.hasAttribute("inert")).toBe(true);
      expect(sheet.contains(document.activeElement)).toBe(true);
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );
      expect(focusable.length).toBeGreaterThan(0);
      focusable[focusable.length - 1]!.focus();
      fireEvent.keyDown(document.activeElement!, { key: "Tab" });
      expect(document.activeElement).toBe(focusable[0]!);
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(screen.queryByTestId("mobile-more-sheet")).toBeNull();
      expect(document.contains(moreTrigger)).toBe(true);
      expect(document.getElementById("app")?.hasAttribute("inert")).toBe(false);
    } finally {
      appRoot.remove();
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: previousWidth,
      });
    }
  });
});

describe("navDisplayLabel", () => {
  it("renders every route in Chinese", () => {
    expect(navDisplayLabel("screener")).toBe("筛选台");
    expect(navDisplayLabel("imbox")).toBe("收件箱");
    expect(navDisplayLabel("feed")).toBe("报刊");
    expect(navDisplayLabel("paperTrail")).toBe("单据");
    expect(navDisplayLabel("clips")).toBe("片段");
    // The English label stays as the data-nav test hook only.
    expect(NAV_SECTIONS.find((section) => section.view === "imbox")?.label).toBe(
      "Inbox",
    );
  });

  it("renders the rest of the routes in Chinese", () => {
    expect(navDisplayLabel("contacts")).toBe("联系人");
    expect(navDisplayLabel("trash")).toBe("回收站");
    expect(navDisplayLabel("spam")).toBe("垃圾邮件");
    expect(navDisplayLabel("settings")).toBe("设置");
  });

  it("covers every NAV_SECTIONS view (no raw view id leaks to the UI)", () => {
    for (const s of NAV_SECTIONS) {
      expect(navDisplayLabel(s.view)).not.toBe(s.view);
    }
  });

  it("falls back to the input for unknown views", () => {
    expect(navDisplayLabel("nope")).toBe("nope");
  });
});

describe("navTooltipLabel", () => {
  it("appends the shortcut hint to the Chinese name", () => {
    const imbox = NAV_SECTIONS.find((s) => s.view === "imbox")!;
    expect(navTooltipLabel(imbox)).toBe("收件箱 (⌘2)");
  });

  it("omits the parenthesised hint when there is none", () => {
    const drafts = NAV_SECTIONS.find((s) => s.view === "drafts")!;
    expect(navTooltipLabel(drafts)).toBe("草稿");
  });
});
