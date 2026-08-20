import { describe, it, expect } from "vitest";

// Vite's `?raw` query returns the file contents as a string. Vitest
// inherits Vite's loader pipeline, so this works in the test runner
// without needing @types/node or fs imports.
import mainSource from "./Main.tsx?raw";

describe("Main.tsx view lazy-loading", () => {
  it("uses lazy() for every view file (no eager static imports)", () => {
    // Each view file under src/views/ must be reachable through a
    // dynamic import. Static `import { X } from "../views/X"` would
    // pull the whole chunk into the initial bundle, defeating the
    // code-splitting that keeps first paint at ~400 KB instead of
    // ~630 KB. We allow static imports for the topbar/sidebar shell
    // but not for view files.
    const viewImport = /from\s+["']\.\.\/views\/([A-Za-z]+)["']/g;
    const staticViewImports = [...mainSource.matchAll(viewImport)];
    expect(staticViewImports).toEqual([]);
  });

  it("wraps ViewSwitch in <Suspense fallback={<FeedSkeleton />}>", () => {
    // While a view's chunk is in flight, the user sees the FeedSkeleton
    // — same shape as a real Imbox row so there's no layout shift when
    // the chunk resolves.
    expect(mainSource).toMatch(/<Suspense\s+fallback=\{<FeedSkeleton \/>\}>/);
  });

  it("every <Match> renders a component that was loaded via lazy()", () => {
    // View names and component names don't always line up (e.g. view
    // `screener` renders `<Gate />`, view `paperTrail` renders
    // `<Records />`, view `replyLater` renders `<PileBoard />`). The
    // invariant we want to enforce is: for every Match block, the
    // component it renders is declared as a `lazy(...)` import above.
    const matchRe =
      /<Match when=\{view\(\)\s*===\s*["']([a-zA-Z]+)["']\}>[\s\S]*?<(\w+)\s*\/>/g;
    const componentRe = /const\s+(\w+)\s*=\s*lazy\(/g;
    const lazyComponents = new Set<string>();
    for (const m of mainSource.matchAll(componentRe)) {
      lazyComponents.add(m[1]!);
    }
    const missing: string[] = [];
    for (const m of mainSource.matchAll(matchRe)) {
      const viewName = m[1]!;
      const componentName = m[2]!;
      if (!lazyComponents.has(componentName)) {
        missing.push(`view="${viewName}" → <${componentName}/>`);
      }
    }
    expect(missing, "Components rendered in <Match> must be lazy()-loaded").toEqual([]);
  });

  it("FeedSkeleton renders at least 8 row placeholders", () => {
    // The skeleton should match the shape of the real Imbox list well
    // enough to avoid the "empty box → rows appear" layout shift. 8+
    // rows covers the average viewport without bloating the DOM.
    const skeletonMatch = mainSource.match(
      /function FeedSkeleton[\s\S]*?Array\.from\(\{\s*length:\s*(\d+)\s*\}\)/,
    );
    expect(skeletonMatch, "FeedSkeleton must use Array.from({ length: N })").not.toBeNull();
    const rows = Number(skeletonMatch![1]);
    expect(rows).toBeGreaterThanOrEqual(8);
  });
});
