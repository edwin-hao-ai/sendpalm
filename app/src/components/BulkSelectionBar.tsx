/** Floating bar for multi-select, shown whenever `selectedIds` is non-empty.
 *
 *  Lives at the app shell rather than inside Imbox so every list view gets the
 *  same affordance: Stream / Records / Trash / Spam rows can be ticked too,
 *  and the bar — plus the `;` bulk menu — works the same everywhere.
 */

import { Show, createMemo } from "solid-js";
import { selectedIds, setSelectedIds, showToast } from "../stores/ui";
import { moveMessageToBucket, setMessagePileFlags } from "../stores/data";
import { useViewport } from "../utils/gestures";

export function BulkSelectionBar() {
  const { isMobile } = useViewport();
  const count = createMemo(() => selectedIds().size);
  const ids = () => [...selectedIds()];

  const clear = () => setSelectedIds(new Set<string>());

  const bulkMove = async (
    bucket: Parameters<typeof moveMessageToBucket>[1],
    message: string,
  ) => {
    const list = ids();
    try {
      for (const id of list) {
        await moveMessageToBucket(id, bucket);
      }
      showToast({ message: `${message} · ${list.length} 封`, kind: "success" });
    } catch (e) {
      showToast({
        message: "批量操作失败，请重试",
        kind: "error",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      clear();
    }
  };

  const bulkPending = async () => {
    const list = ids();
    try {
      for (const id of list) {
        await setMessagePileFlags(id, {
          replyLater: true,
          setAside: false,
          bubbleUpAt: null,
        });
      }
      showToast({
        message: `已加入稍后回复 · ${list.length} 封`,
        kind: "success",
      });
    } catch {
      showToast({ message: "操作失败，请重试", kind: "error" });
    } finally {
      clear();
    }
  };

  return (
    <Show when={count() > 0}>
      <div
        data-bulk-bar
        role="toolbar"
        aria-label="批量操作"
        style={{
          position: "fixed",
          bottom: isMobile()
            ? "calc(64px + env(safe-area-inset-bottom, 0px))"
            : "var(--space-5)",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          padding: "8px 12px",
          background: "var(--glass-bg)",
          "backdrop-filter": "var(--glass-blur)",
          "-webkit-backdrop-filter": "var(--glass-blur)",
          border: "0.5px solid var(--glass-border)",
          "border-radius": "var(--radius-pill)",
          "box-shadow": "var(--glass-shadow)",
          "z-index": "var(--z-detail)",
          animation: "toast-enter 0.2s var(--ease-out) both",
        }}
      >
        <span
          style={{
            "font-size": "var(--text-caption)",
            "font-weight": "700",
            color: "var(--text-secondary)",
            "white-space": "nowrap",
          }}
        >
          已选 {count()} 封
        </span>
        <BarButton label="稍后回复" onClick={() => void bulkPending()} />
        <BarButton
          label="归档"
          onClick={() => void bulkMove("paperTrail", "已归档到单据")}
        />
        <BarButton
          label="删除"
          danger
          onClick={() => void bulkMove("trash", "已移到回收站")}
        />
        <BarButton label="取消选择" onClick={clear} />
      </div>
    </Show>
  );
}

function BarButton(props: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        "min-height": "32px",
        padding: "4px 12px",
        "border-radius": "var(--radius-pill)",
        background: props.danger ? "var(--status-danger)" : "var(--paper-light)",
        color: props.danger ? "#fff" : "var(--text-primary)",
        "font-size": "var(--text-caption)",
        "font-weight": "700",
        "white-space": "nowrap",
      }}
    >
      {props.label}
    </button>
  );
}
