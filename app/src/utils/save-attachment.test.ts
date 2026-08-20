/** Tests for save-attachment util.
 *
 * The util wraps the Tauri save dialog + writeFile combo. In jsdom
 * (the vitest environment) those plugins aren't loaded, so the util
 * falls through to the browser anchor-download path. We mock the
 * minimal surface (`getAttachmentContent`, `showToast`) and assert
 * the behaviour.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/backend", () => ({
  getAttachmentContent: vi.fn(),
}));

vi.mock("../stores/ui", () => ({
  showToast: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(),
}));

import { getAttachmentContent } from "../services/backend";
import { showToast } from "../stores/ui";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { saveAttachment } from "./save-attachment";

const mockedGetAttachment = vi.mocked(getAttachmentContent);
const mockedShowToast = vi.mocked(showToast);
const mockedSaveDialog = vi.mocked(saveDialog);
const mockedWriteFile = vi.mocked(writeFile);

describe("saveAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Force the browser-mode flag (the tauri-shim may have set it
    // already via import side effects). The util ANDs
    // __TAURI_INTERNALS__ with !__SENDPALM_BROWSER_MODE__ to distinguish
    // a real Tauri runtime from the dev / jsdom shim.
    (
      window as unknown as { __SENDPALM_BROWSER_MODE__?: boolean }
    ).__SENDPALM_BROWSER_MODE__ = true;
  });

  /** Switch the global into "real Tauri" mode. The shim is mocked out
   *  in this test file (vi.mock above), so its module-load side effect
   *  that installs `__TAURI_INTERNALS__` does not run. We install the
   *  flag ourselves to simulate the real Tauri webview state, and
   *  clear the browser-mode flag the shim would have set. */
  function enterTauriMode() {
    (
      window as unknown as { __TAURI_INTERNALS__?: unknown }
    ).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" } },
    };
    delete (window as unknown as Record<string, unknown>)
      .__SENDPALM_BROWSER_MODE__;
  }

  /** Minimal valid base64 payload — "Hello, World!" encoded. */
  const HELLO_B64 =
    "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==";

  it("shows a friendly toast when the backend returns null (browser mode)", async () => {
    mockedGetAttachment.mockResolvedValueOnce(null);

    await saveAttachment("file_123", "report.pdf");

    expect(mockedShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "info" }),
    );
  });

  it("triggers a browser anchor download when running outside Tauri", async () => {
    mockedGetAttachment.mockResolvedValueOnce(HELLO_B64);
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === "a") {
        (el as HTMLAnchorElement).click = clickSpy;
      }
      return el;
    });

    await saveAttachment("file_456", "invoice.pdf");

    expect(clickSpy).toHaveBeenCalled();
    expect(mockedShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "开始下载", kind: "success" }),
    );
  });

  it("uses the Tauri save dialog + writeFile when the runtime is present", async () => {
    enterTauriMode();
    mockedGetAttachment.mockResolvedValueOnce(HELLO_B64);
    mockedSaveDialog.mockResolvedValueOnce("/Users/me/Downloads/invoice.pdf");
    mockedWriteFile.mockResolvedValueOnce(undefined);

    await saveAttachment("file_789", "invoice.pdf");

    expect(mockedSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "invoice.pdf" }),
    );
    expect(mockedWriteFile).toHaveBeenCalledWith(
      "/Users/me/Downloads/invoice.pdf",
      expect.any(Uint8Array),
    );
    expect(mockedShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "success" }),
    );
  });

  it("does nothing on dialog cancel (no writeFile call)", async () => {
    enterTauriMode();
    mockedGetAttachment.mockResolvedValueOnce(HELLO_B64);
    mockedSaveDialog.mockResolvedValueOnce(null);

    await saveAttachment("file_abc", "cancel.pdf");

    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  it("surfaces writeFile errors via the error toast", async () => {
    enterTauriMode();
    mockedGetAttachment.mockResolvedValueOnce(HELLO_B64);
    mockedSaveDialog.mockResolvedValueOnce("/tmp/x.pdf");
    mockedWriteFile.mockRejectedValueOnce(new Error("permission denied"));

    await saveAttachment("file_err", "x.pdf");

    expect(mockedShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "error",
        message: expect.stringContaining("permission denied"),
      }),
    );
  });
});
