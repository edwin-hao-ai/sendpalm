import { describe, it, expect } from "vitest";
import { createSignal, createResource, type Resource } from "solid-js";
import { render } from "@solidjs/testing-library";
import { isResourceEmpty, ResourceGate } from "./ResourceGate";

describe("isResourceEmpty", () => {
  it("treats undefined as non-empty (loading path)", () => {
    expect(isResourceEmpty(undefined)).toBe(false);
    expect(isResourceEmpty<unknown>(null)).toBe(false);
  });

  it("treats empty array as empty", () => {
    expect(isResourceEmpty([])).toBe(true);
    expect(isResourceEmpty<string[]>([])).toBe(true);
  });

  it("treats non-empty array as non-empty", () => {
    expect(isResourceEmpty([1, 2, 3])).toBe(false);
    expect(isResourceEmpty(["a"])).toBe(false);
  });

  it("treats non-array data as non-empty by default", () => {
    expect(isResourceEmpty({ id: 1 })).toBe(false);
    expect(isResourceEmpty(42)).toBe(false);
    expect(isResourceEmpty("hello")).toBe(false);
  });

  it("honours a custom isEmpty predicate", () => {
    const isUserEmpty = (u: { name: string }) => u.name === "";
    expect(isResourceEmpty({ name: "" }, isUserEmpty)).toBe(true);
    expect(isResourceEmpty({ name: "Alice" }, isUserEmpty)).toBe(false);
  });

  it("custom isEmpty on undefined returns false (still loading)", () => {
    const isUserEmpty = (u: { name: string }) => u.name === "";
    expect(isResourceEmpty(undefined, isUserEmpty)).toBe(false);
  });

  it("custom isEmpty on empty array still uses the predicate", () => {
    // The predicate is the override; Array.isArray check is bypassed when
    // isEmpty is supplied.
    const alwaysEmpty = () => true;
    expect(isResourceEmpty([], alwaysEmpty)).toBe(true);
    expect(isResourceEmpty([1, 2], alwaysEmpty)).toBe(true);
  });
});

describe("ResourceGate", () => {
  /** Build a resource that resolves to `value` after `delayMs` ms. */
  function delayedResource<T>(value: T, delayMs = 50): Resource<T | undefined> {
    const [r] = createResource(
      () =>
        new Promise<T>((resolve) => setTimeout(() => resolve(value), delayMs)),
    );
    return r;
  }

  it("renders the SkeletonList while the resource is loading", async () => {
    const resource = delayedResource([{ id: "a" }]);
    const { findAllByLabelText, unmount } = render(() => (
      <ResourceGate resource={resource}>
        {(data) => <span>rows: {data.length}</span>}
      </ResourceGate>
    ));
    const skeletons = await findAllByLabelText("加载中");
    expect(skeletons.length).toBeGreaterThan(0);
    unmount();
  });

  it("renders children once the resource resolves", async () => {
    const resource = delayedResource([{ id: "a" }, { id: "b" }], 0);
    const { findByText, unmount } = render(() => (
      <ResourceGate resource={resource}>
        {(data) => <span>rows: {data.length}</span>}
      </ResourceGate>
    ));
    expect(await findByText("rows: 2")).toBeTruthy();
    unmount();
  });

  it("honours isLoading override to keep skeleton up for secondary resources", async () => {
    // Main resource resolves immediately, secondary resource takes time.
    // Without isLoading, the gate would render children against an empty
    // secondary dataset; with isLoading, the skeleton stays up until both
    // are ready. This is the multi-resource pattern used by Drafts / Files
    // / Insights / Agent.
    const main = delayedResource([{ id: "a" }], 0);
    const [secondaryReady, setSecondaryReady] = createSignal(false);
    const { findAllByLabelText, findByText, unmount } = render(() => (
      <ResourceGate resource={main} isLoading={() => !secondaryReady()}>
        {(data) => <span>rows: {data.length}</span>}
      </ResourceGate>
    ));
    // Immediately after mount, main is resolved but secondaryReady is false
    // → skeleton should still be up.
    const skeletons = await findAllByLabelText("加载中");
    expect(skeletons.length).toBeGreaterThan(0);
    setSecondaryReady(true);
    expect(await findByText("rows: 1")).toBeTruthy();
    unmount();
  });

  it("renders ErrorState when the resource errors", async () => {
    const [trigger, setTrigger] = createSignal(false);
    const resource: Resource<string[] | undefined> = (() => {
      // Build a resource whose fetcher throws once `trigger` flips.
      // We can't use createResource's source signal directly because
      // it doesn't refetch on .error changes — we re-create on toggle.
      // Simpler: a resource that always rejects.
      const [r] = createResource<string[], unknown>(() =>
        Promise.reject(new Error("network down")),
      );
      void trigger; // referenced to silence the unused-locals lint
      return r;
    })();
    setTrigger(true);
    const { findByText, unmount } = render(() => (
      <ResourceGate resource={resource}>
        {(data) => <span>rows: {data.length}</span>}
      </ResourceGate>
    ));
    expect(await findByText(/加载失败/)).toBeTruthy();
    expect(await findByText(/network down/)).toBeTruthy();
    unmount();
  });
});
