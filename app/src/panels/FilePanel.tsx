/** FilePanel — file preview with type-specific viewer.
 * Spec: prototype-v11 §3.3 + P4.
 */

import { Show, createResource } from "solid-js";
import { getFile, getContact } from "../stores/data";
import { setDetailOpen, setSelectedFileId, showToast } from "../stores/ui";
import { Icon } from "../components/Icon";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";

export function FilePanel(props: { fileId: string }) {
  const [file] = createResource(() => props.fileId, getFile);
  const [contact] = createResource(
    () => file()?.pid ?? "",
    (pid) => getContact(pid)
  );

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <header
        style={{
          padding: "var(--space-3) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          background: "var(--surface-elevated)",
        }}
      >
        <button
          onClick={() => { setSelectedFileId(null); setDetailOpen(false); }}
          aria-label="Close"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}>File</strong>
      </header>

      <Show when={file()}>
        {(getF) => {
          const f = () => getF()!;
          return (
            <>
              <div style={{ padding: "var(--space-5)", "border-bottom": "0.5px solid var(--border)" }}>
                <h3
                  style={{
                    "font-family": "var(--font-display)",
                    "font-size": "var(--text-h4)",
                    "font-weight": "800",
                    margin: 0,
                    "margin-bottom": "var(--space-2)",
                    "word-break": "break-all",
                  }}
                >
                  {f().name}
                </h3>
                <p style={{ "font-size": "var(--text-caption)", color: "var(--text-muted)", margin: 0 }}>
                  {(f().size / 1024).toFixed(1)} KB · {f().mime || f().type} ·{" "}
                  from {contact()?.name ?? "—"}
                </p>
                <div style={{ display: "flex", gap: "var(--space-2)", "margin-top": "var(--space-3)" }}>
                  <button
                    onClick={async () => {
                      try {
                        await writeText(f().md ?? f().content ?? f().name);
                        showToast({ message: "Markdown 已复制", kind: "success" });
                      } catch {
                        showToast({ message: "复制失败", kind: "error" });
                      }
                    }}
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-1)",
                      padding: "6px 12px",
                      background: "var(--paper-mid)",
                      "border-radius": "var(--radius-pill)",
                      "font-size": "var(--text-caption)",
                      "font-weight": "600",
                    }}
                  >
                    <Icon name="ph-copy" size={12} /> Copy Markdown
                  </button>
                  <button
                    onClick={async () => {
                      if (f().url) {
                        try {
                          if (f().url) await openUrl(f().url!);
                        } catch {
                          showToast({ message: "打开失败", kind: "error" });
                        }
                      } else {
                        showToast({ message: "无可打开的 URL", kind: "info" });
                      }
                    }}
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-1)",
                      padding: "6px 12px",
                      background: "var(--paper-mid)",
                      "border-radius": "var(--radius-pill)",
                      "font-size": "var(--text-caption)",
                      "font-weight": "600",
                    }}
                  >
                    <Icon name="ph-arrow-square-out" size={12} /> Open
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, "overflow-y": "auto", padding: "var(--space-5)" }}>
                {/* Image */}
                <Show when={f().type === "image"}>
                  <div
                    style={{
                      "border-radius": "var(--radius-md)",
                      overflow: "hidden",
                      background: "var(--paper-mid)",
                    }}
                  >
                    <Show when={f().url} fallback={
                      <div style={{ padding: "var(--space-5)", color: "var(--text-muted)", "text-align": "center" }}>
                        <Icon name="ph-image" size={32} />
                        <p>无图片预览（附件 URL 缺失）</p>
                      </div>
                    }>
                      <img
                        src={f().url}
                        alt={f().name}
                        style={{ display: "block", width: "100%" }}
                      />
                    </Show>
                  </div>
                  <div
                    style={{
                      "margin-top": "var(--space-3)",
                      padding: "var(--space-3)",
                      background: "var(--canary)",
                      "border-radius": "var(--radius-md)",
                      "font-size": "var(--text-caption)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <Icon name="ph-shield-check" size={12} /> Tracking pixels stripped.
                  </div>
                </Show>

                {/* PDF */}
                <Show when={f().type === "pdf"}>
                  <div
                    style={{
                      padding: "var(--space-5)",
                      background: "var(--paper-mid)",
                      "border-radius": "var(--radius-md)",
                      "text-align": "center",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <Icon name="ph-file-pdf" size={48} />
                    <p style={{ "margin-top": "var(--space-2)" }}>PDF 预览占位</p>
                    <p style={{ "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
                      实际渲染由 webview 原生 PDF viewer 处理。
                    </p>
                  </div>
                  <div
                    style={{
                      "margin-top": "var(--space-3)",
                      padding: "var(--space-3)",
                      background: "var(--canary)",
                      "border-radius": "var(--radius-md)",
                      "font-size": "var(--text-caption)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <Icon name="ph-shield-check" size={12} /> Tracking stripped.
                  </div>
                </Show>

                {/* Doc / Spreadsheet */}
                <Show when={f().type === "doc" || f().type === "spreadsheet"}>
                  <Show
                    when={f().md}
                    fallback={
                      <pre
                        style={{
                          padding: "var(--space-3)",
                          background: "var(--paper-mid)",
                          "border-radius": "var(--radius-md)",
                          "font-family": "var(--font-mono)",
                          "font-size": "var(--text-caption)",
                          "white-space": "pre-wrap",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {f().content ?? "(empty)"}
                      </pre>
                    }
                  >
                    <div
                      style={{
                        padding: "var(--space-3)",
                        background: "var(--paper-mid)",
                        "border-radius": "var(--radius-md)",
                        "white-space": "pre-wrap",
                        "font-size": "var(--text-body-sm)",
                        "font-family": "var(--font-body)",
                        "line-height": 1.5,
                      }}
                    >
                      {f().md}
                    </div>
                  </Show>
                </Show>

                {/* Other */}
                <Show when={f().type === "other"}>
                  <div style={{ "text-align": "center", color: "var(--text-muted)", padding: "var(--space-8)" }}>
                    <Icon name="ph-file" size={48} />
                    <p>无法预览</p>
                  </div>
                </Show>
              </div>
            </>
          );
        }}
      </Show>
    </div>
  );
}