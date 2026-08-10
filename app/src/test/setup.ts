/** Vitest setup — matchers + tauri-api stub. */

import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Stub @tauri-apps/api modules that require native runtime.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@tauri-apps/api/window", () => ({
  appWindow: {
    startDragging: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: class FakeDb {
    select<T>(): Promise<T> {
      return Promise.resolve([] as T);
    }
    execute(): Promise<void> {
      return Promise.resolve();
    }
  },
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(() => Promise.resolve(undefined)),
      set: vi.fn(() => Promise.resolve()),
      save: vi.fn(() => Promise.resolve()),
    }),
  ),
}));
