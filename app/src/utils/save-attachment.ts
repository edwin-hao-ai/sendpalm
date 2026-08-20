/** Save an attachment to disk.
 *
 * Desktop (Tauri shell): opens the OS save dialog, then writes the bytes
 * via `tauri-plugin-fs::writeFile`. Falls back to the browser-anchor
 * download trick (which lands in the browser's default download folder)
 * when running outside Tauri (e.g. in `vite dev` or Playwright).
 *
 * `getAttachmentContent` returns a `data:<mime>;base64,<...>` string.
 * We strip the prefix, base64-decode once, and hand raw bytes to the
 * FS plugin. The decode is cheap (we already pulled the dataUrl across
 * the IPC bridge); an alternative would be a Tauri command that returns
 * raw bytes, but the dataUrl path keeps the round-trip generic.
 */
import { showToast } from "../stores/ui";
import { getAttachmentContent } from "../services/backend";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

/** Returns true if we're running in the real Tauri runtime (NOT the
 *  browser shim). The shim installs `__TAURI_INTERNALS__` for any
 *  non-Tauri context so naive `'__TAURI_INTERNALS__' in window` checks
 *  can't tell apart Tauri from a `vite dev` browser page. The shim also
 *  sets its own `__SENDPALM_BROWSER_MODE__ = true` flag, so we AND
 *  those two for a clean signal. */
function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  if (!("__TAURI_INTERNALS__" in w)) return false;
  if (w.__SENDPALM_BROWSER_MODE__ === true) return false;
  return true;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  // atob is universally available (Tauri webview + browser + jsdom).
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function saveAttachment(
  fileId: string,
  filename: string,
): Promise<void> {
  const dataUrl = await getAttachmentContent(fileId);
  if (!dataUrl) {
    showToast({
      message: "无法读取附件（浏览器模式不支持）",
      kind: "info",
    });
    return;
  }
  if (isTauri()) {
    try {
      const target = await saveDialog({
        defaultPath: filename,
        title: "保存到…",
      });
      if (!target) return; // user cancelled
      const bytes = dataUrlToBytes(dataUrl);
      await writeFile(target, bytes);
      showToast({ message: `已保存到 ${target}`, kind: "success" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast({ message: `保存失败：${msg}`, kind: "error" });
    }
    return;
  }
  // Browser fallback — anchor download into the browser's default
  // downloads folder. This is what `vite dev` + Playwright hit.
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
  showToast({ message: "开始下载", kind: "success" });
}
