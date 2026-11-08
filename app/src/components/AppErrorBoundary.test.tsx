/** AppErrorBoundary — a crashed subtree must not blank the app. */

import { afterEach, describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { AppErrorBoundary } from "./AppErrorBoundary";

afterEach(cleanup);

function Boom(): never {
  throw new Error("kaboom");
}

describe("AppErrorBoundary", () => {
  it("renders the recovery panel instead of propagating", () => {
    render(() => (
      <AppErrorBoundary scope="view">
        <Boom />
      </AppErrorBoundary>
    ));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("这个视图没能显示出来")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
  });

  it("uses the whole-window wording at app scope", () => {
    render(() => (
      <AppErrorBoundary scope="app">
        <Boom />
      </AppErrorBoundary>
    ));
    expect(screen.getByText("界面遇到问题")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新载入" })).toBeTruthy();
  });

  it("keeps the thrown message available under 技术详情", () => {
    render(() => (
      <AppErrorBoundary scope="view">
        <Boom />
      </AppErrorBoundary>
    ));
    expect(screen.getByText(/kaboom/)).toBeTruthy();
  });

  it("recovers when the user navigates elsewhere (resetKey changes)", async () => {
    const [route, setRoute] = createSignal("broken");
    render(() => (
      <AppErrorBoundary scope="view" resetKey={route()}>
        {route() === "broken" ? <Boom /> : <p>ok</p>}
      </AppErrorBoundary>
    ));
    expect(screen.getByRole("alert")).toBeTruthy();
    setRoute("fine");
    await Promise.resolve();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("ok")).toBeTruthy();
  });

  it("retry re-mounts the subtree instead of leaving the panel up", async () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error("first render fails");
      return <p>recovered</p>;
    }
    render(() => (
      <AppErrorBoundary scope="view">
        <Flaky />
      </AppErrorBoundary>
    ));
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await Promise.resolve();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("recovered")).toBeTruthy();
  });
});
