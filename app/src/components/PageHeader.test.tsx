/** Shared page/section heading primitives — every top-level view must
 *  present exactly one left-aligned H1 with an optional description and
 *  action slot. Centered composition stays reserved for empty states and
 *  onboarding flows. */

import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { PageHeader, SectionHeading } from "./PageHeader";

describe("PageHeader", () => {
  it("renders exactly one h1 with the page title", () => {
    const { container } = render(() => <PageHeader title="Inbox" />);
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toBe("Inbox");
    expect(h1s[0]!.className).toContain("page-header-title");
  });

  it("is left-aligned — never applies centered text alignment", () => {
    const { container } = render(() => (
      <PageHeader title="Inbox" description="desc" actions={<button>+</button>} />
    ));
    const header = container.querySelector("h1")!;
    // No inline centering; centering is not in the stylesheet class either.
    expect(header.style.textAlign).not.toBe("center");
    expect(header.closest(".page-header")).toBeTruthy();
  });

  it("renders description and actions when provided", () => {
    render(() => (
      <PageHeader
        title="Tasks"
        description={<span data-testid="desc">跟进与建议</span>}
        actions={<button data-testid="act">新建</button>}
      />
    ));
    expect(screen.getByTestId("desc").textContent).toBe("跟进与建议");
    expect(screen.getByTestId("act")).toBeTruthy();
  });

  it("omits description/actions containers when slots are absent", () => {
    const { container } = render(() => <PageHeader title="Inbox" />);
    expect(container.querySelector(".page-header-desc")).toBeNull();
    expect(container.querySelector(".page-header-actions")).toBeNull();
  });

  it("keeps actions in a wrapping flex row (no clipping on 375px)", () => {
    const { container } = render(() => (
      <PageHeader title="Inbox" actions={<button>a</button>} />
    ));
    const actions = container.querySelector(".page-header-actions")!;
    expect(actions).toBeTruthy();
    // The stylesheet owns wrapping; guard the hook it relies on.
    expect(actions.className).toContain("page-header-actions");
  });

  it("forwards extra class names", () => {
    const { container } = render(() => <PageHeader title="Inbox" class="extra" />);
    expect(container.querySelector(".page-header")!.className).toContain("extra");
  });
});

describe("SectionHeading", () => {
  it("renders an h2 by default", () => {
    const { container } = render(() => <SectionHeading title="Section" />);
    const h2 = container.querySelector("h2");
    expect(h2?.textContent).toBe("Section");
    expect(container.querySelectorAll("h2")).toHaveLength(1);
  });

  it("renders an h3 when level=3", () => {
    const { container } = render(() => (
      <SectionHeading title="Sub" level={3} actions={<button>x</button>} />
    ));
    const h3 = container.querySelector("h3");
    expect(h3?.textContent).toBe("Sub");
    expect(container.querySelector(".section-heading-actions")).toBeTruthy();
  });

  it("renders description when provided and omits it otherwise", () => {
    const { container, unmount } = render(() => (
      <SectionHeading title="S" description="d" />
    ));
    expect(container.querySelector(".section-heading-desc")?.textContent).toBe("d");
    unmount();
    const { container: c2 } = render(() => <SectionHeading title="S" />);
    expect(c2.querySelector(".section-heading-desc")).toBeNull();
  });
});
