/** FilePanel — file preview with type-specific viewer.
 * Spec: prototype-v11 §3.3 + P4.
 */

import { Show, createResource, createSignal, createEffect } from "solid-js";
import { getFile, getContact } from "../stores/data";
import { setDetailOpen, setSelectedFileId, showToast } from "../stores/ui";
import type { FileItem } from "../types";
import { Icon } from "../components/Icon";
import { ErrorState } from "../components/Empty";
import { Skeleton } from "../components/Skeleton";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openPath } from "@tauri-apps/plugin-opener";
import { getAttachmentContent, getAttachmentPath } from "../services/backend";
import { saveAttachment } from "../utils/save-attachment";
import { formatBytes } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";

/** 文件类型的中文标签。 */
export function fileTypeLabel(type: FileItem["type"]): string {
  switch (type) {
    case "pdf":
      return "PDF";
    case "image":
      return "图片";
    case "doc":
      return "文档";
    case "spreadsheet":
      return "表格";
    default:
      return "文件";
  }
}

export function FilePanel(props: { fileId: string; onBack?: () => void }) {
  const [file, { refetch: refetchFile }] = createResource(
    () => props.fileId,
    getFile,
  );
  const [contact, { refetch: refetchContact }] = createResource(
    () => file()?.pid ?? "",
    (pid) => getContact(pid),
  );
  const [contentUrl, { refetch: refetchContentUrl }] = createResource(
    () => file()?.id,
    async (id) => {
      const url = await getAttachmentContent(id);
      return url ?? null;
    },
  );

  // Image preview load failure — falls back to a download prompt.
  const [imgFailed, setImgFailed] = createSignal(false);
  createEffect(() => {
    void props.fileId;
    setImgFailed(false);
  });

  useRefreshEffect(() => {
    void refetchFile();
    void refetchContact();
    void refetchContentUrl();
  });

  const downloadFile = async (f: FileItem) => {
    await saveAttachment(f.id, f.name);
  };

  const close = () => {
    if (props.onBack) {
      props.onBack();
    } else {
      setSelectedFileId(null);
      setDetailOpen(false);
    }
  };

  return (
    <div
      style={{ display: "flex", "flex-direction": "column", height: "100%" }}
    >
      <header
        style={{
          padding: "var(--space-3) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          background:
            "color-mix(in srgb, var(--surface-elevated) 82%, transparent)",
          "backdrop-filter": "blur(20px) saturate(1.4)",
          "-webkit-backdrop-filter": "blur(20px) saturate(1.4)",
        }}
      >
        <button
          onClick={close}
          aria-label={props.onBack ? "返回" : "关闭"}
          title={props.onBack ? "返回" : "关闭 (Esc)"}
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name={props.onBack ? "ph-arrow-left" : "ph-x"} size={18} />
        </button>
        <strong
          style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}
        >
          文件
        </strong>
      </header>

      <Show
        when={!file.error}
        fallback={
          <ErrorState
            title="文件加载失败"
            message="请稍后重试；若反复失败，可到顶栏的错误日志里查看详情。"
            retry={() => void refetchFile()}
          />
        }
      >
        <Show
          when={file()}
          fallback={
            <div style={{ padding: "var(--space-5)" }} aria-busy="true">
              <Skeleton height="26px" width="70%" />
              <div style={{ height: "var(--space-2)" }} />
              <Skeleton height="14px" width="50%" />
              <div style={{ height: "var(--space-3)" }} />
              <Skeleton
                height="32px"
                width="60%"
                style={{ "border-radius": "var(--radius-pill)" }}
              />
              <div style={{ height: "var(--space-5)" }} />
              <Skeleton height="240px" />
            </div>
          }
        >
          {(getF) => {
            const f = () => getF()!;
            return (
              <>
                <div
                  style={{
                    padding: "var(--space-5)",
                    "border-bottom": "0.5px solid var(--border)",
                  }}
                >
                  <h3
                    style={{
                      "font-family": "var(--font-display)",
                      "font-size": "var(--text-h4)",
                      "font-weight": "800",
                      margin: 0,
                      "margin-bottom": "var(--space-2)",
                      "overflow-wrap": "anywhere",
                    }}
                  >
                    {f().name}
                  </h3>
                  <p
                    style={{
                      "font-size": "var(--text-caption)",
                      color: "var(--text-muted)",
                      margin: 0,
                    }}
                  >
                    {formatBytes(f().size)} · {fileTypeLabel(f().type)} · 来自{" "}
                    {contact()?.name ?? "未知联系人"}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      "flex-wrap": "wrap",
                      gap: "var(--space-2)",
                      "margin-top": "var(--space-3)",
                    }}
                  >
                    <Show when={f().md ?? f().content}>
                      <button
                        onClick={async () => {
                          try {
                            await writeText(f().md ?? f().content ?? "");
                            showToast({ message: "已复制", kind: "success" });
                          } catch {
                            showToast({
                              message: "复制失败，请重试",
                              kind: "error",
                            });
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
                        <Icon name="ph-copy" size={12} /> 复制文本
                      </button>
                    </Show>
                    <button
                      onClick={async () => {
                        const path = await getAttachmentPath(f().id);
                        if (path) {
                          try {
                            await openPath(path);
                          } catch {
                            showToast({
                              message: "打开失败，请尝试下载后查看",
                              kind: "error",
                            });
                          }
                        } else {
                          await downloadFile(f());
                          showToast({
                            message: "已下载，请在下载目录打开",
                            kind: "info",
                          });
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
                      <Icon name="ph-arrow-square-out" size={12} /> 打开
                    </button>
                    <button
                      onClick={() => downloadFile(f())}
                      style={{
                        display: "flex",
                        "align-items": "center",
                        gap: "var(--space-1)",
                        padding: "6px 12px",
                        background: "var(--palm-soft)",
                        color: "var(--palm)",
                        "border-radius": "var(--radius-pill)",
                        "font-size": "var(--text-caption)",
                        "font-weight": "600",
                      }}
                    >
                      <Icon name="ph-download-simple" size={12} /> 下载
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    "overflow-y": "auto",
                    padding: "var(--space-5)",
                  }}
                >
                  {/* Image */}
                  <Show when={f().type === "image"}>
                    <Show
                      when={contentUrl() && !imgFailed()}
                      fallback={
                        <div
                          style={{
                            padding: "var(--space-5)",
                            background: "var(--paper-mid)",
                            "border-radius": "var(--radius-md)",
                            color: "var(--text-muted)",
                            "text-align": "center",
                          }}
                        >
                          <Icon name="ph-image" size={32} />
                          <p>暂时没有预览，可以下载后查看。</p>
                          <button
                            onClick={() => downloadFile(f())}
                            style={{
                              "margin-top": "var(--space-2)",
                              padding: "6px 14px",
                              background: "var(--palm-soft)",
                              color: "var(--palm)",
                              "border-radius": "var(--radius-pill)",
                              "font-size": "var(--text-caption)",
                              "font-weight": "600",
                            }}
                          >
                            <Icon name="ph-download-simple" size={12} /> 下载
                          </button>
                        </div>
                      }
                    >
                      <div
                        style={{
                          "border-radius": "var(--radius-md)",
                          overflow: "hidden",
                          background: "var(--paper-mid)",
                        }}
                      >
                        <img
                          src={contentUrl()!}
                          alt={f().name}
                          style={{ display: "block", width: "100%" }}
                          onError={() => setImgFailed(true)}
                        />
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
                        <Icon name="ph-shield-check" size={12} />{" "}
                        已屏蔽追踪像素
                      </div>
                    </Show>
                  </Show>

                  {/* PDF */}
                  <Show when={f().type === "pdf"}>
                    <Show
                      when={contentUrl()}
                      fallback={
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
                          <p style={{ "margin-top": "var(--space-2)" }}>
                            暂时没有预览，可以下载后查看。
                          </p>
                          <button
                            onClick={() => downloadFile(f())}
                            style={{
                              "margin-top": "var(--space-3)",
                              padding: "6px 14px",
                              background: "var(--palm-soft)",
                              color: "var(--palm)",
                              "border-radius": "var(--radius-pill)",
                              "font-size": "var(--text-caption)",
                              "font-weight": "600",
                            }}
                          >
                            <Icon name="ph-download-simple" size={12} /> 下载
                          </button>
                        </div>
                      }
                    >
                      <div
                        style={{
                          "border-radius": "var(--radius-md)",
                          overflow: "hidden",
                          background: "var(--paper-mid)",
                          height: "60vh",
                        }}
                      >
                        <iframe
                          src={contentUrl()!}
                          title={f().name}
                          style={{
                            width: "100%",
                            height: "100%",
                            border: "none",
                          }}
                        />
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
                        <Icon name="ph-shield-check" size={12} />{" "}
                        已屏蔽追踪像素
                      </div>
                    </Show>
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
                            "overflow-wrap": "anywhere",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {f().content ?? "（无内容）"}
                        </pre>
                      }
                    >
                      <div
                        style={{
                          padding: "var(--space-3)",
                          background: "var(--paper-mid)",
                          "border-radius": "var(--radius-md)",
                          "white-space": "pre-wrap",
                          "overflow-wrap": "anywhere",
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
                    <div
                      style={{
                        "text-align": "center",
                        color: "var(--text-muted)",
                        padding: "var(--space-8)",
                      }}
                    >
                      <Icon name="ph-file" size={48} />
                      <p>暂时没有预览，可以下载后查看。</p>
                      <button
                        onClick={() => downloadFile(f())}
                        style={{
                          "margin-top": "var(--space-3)",
                          padding: "6px 14px",
                          background: "var(--palm-soft)",
                          color: "var(--palm)",
                          "border-radius": "var(--radius-pill)",
                          "font-size": "var(--text-caption)",
                          "font-weight": "600",
                        }}
                      >
                        <Icon name="ph-download-simple" size={12} /> 下载
                      </button>
                    </div>
                  </Show>
                </div>
              </>
            );
          }}
        </Show>
      </Show>
    </div>
  );
}
