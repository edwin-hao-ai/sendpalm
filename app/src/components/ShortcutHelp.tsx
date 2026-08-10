/** Keyboard Shortcut help modal — ? key.
 * Lists every shortcut in the app.
 */

import { Show } from "solid-js";
import { Modal } from "./Modal";
import { helpOpen, setHelpOpen } from "../stores/ui";

interface Shortcut {
  combo: string;
  label: string;
}

const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: "全局",
    items: [
      { combo: "⌘ K", label: "命令面板" },
      { combo: "⌘ N", label: "写新邮件" },
      { combo: "/", label: "搜索" },
      { combo: "⇧ A", label: "打开 Agent 面板" },
      { combo: "⇧ N", label: "打开通知" },
      { combo: "?", label: "显示快捷键" },
      { combo: "Esc", label: "关闭面板" },
    ],
  },
  {
    group: "视图",
    items: [
      { combo: "⌘ 1", label: "Gate (Screener)" },
      { combo: "⌘ 2", label: "Imbox" },
      { combo: "⌘ 3", label: "Stream" },
      { combo: "⌘ 4", label: "Records" },
      { combo: "⌘ 5", label: "Contacts" },
      { combo: "⌘ 6", label: "Calendar" },
      { combo: "⌘ 7", label: "Files" },
      { combo: "⌘ 8", label: "Insights" },
    ],
  },
  {
    group: "Imbox (j/k 移动 · Enter 打开 · x 多选)",
    items: [
      { combo: "j / ↓", label: "下一条" },
      { combo: "k / ↑", label: "上一条" },
      { combo: "x", label: "选择/取消" },
      { combo: "Enter", label: "打开消息详情" },
      { combo: "r", label: "回复" },
      { combo: "e", label: "归档" },
      { combo: "l", label: "Reply Later" },
      { combo: "s", label: "Set Aside" },
      { combo: "b", label: "Bubble Up" },
      { combo: "u", label: "标为未读" },
      { combo: "#", label: "移至 Trash" },
      { combo: "!", label: "标记 Spam" },
      { combo: ";", label: "批量菜单" },
    ],
  },
  {
    group: "日历",
    items: [
      { combo: "d / w / y", label: "Day / Week / Year" },
      { combo: "t", label: "回到今天" },
      { combo: "← / →", label: "上一/下一 周期" },
    ],
  },
];

export function ShortcutHelp() {
  return (
    <Modal
      open={helpOpen()}
      onClose={() => setHelpOpen(false)}
      title="键盘快捷键"
      width="600px"
    >
      <Show when={true}>
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          {SHORTCUTS.map((s) => (
            <section>
              <h4
                style={{
                  "font-family": "var(--font-display)",
                  "font-size": "var(--text-micro)",
                  "font-weight": "700",
                  "letter-spacing": "0.04em",
                  "text-transform": "uppercase",
                  color: "var(--text-muted)",
                  margin: "0 0 var(--space-2)",
                }}
              >
                {s.group}
              </h4>
              <div
                style={{
                  display: "grid",
                  "grid-template-columns": "120px 1fr",
                  gap: "var(--space-1) var(--space-3)",
                  "font-size": "var(--text-body-sm)",
                }}
              >
                {s.items.map((it) => (
                  <>
                    <kbd
                      style={{
                        padding: "3px 10px",
                        background: "var(--paper-mid)",
                        "border-radius": "var(--radius-sm)",
                        "font-family": "var(--font-mono)",
                        "font-size": "11px",
                        "font-weight": "700",
                        color: "var(--text-primary)",
                        "text-align": "center",
                        "align-self": "center",
                      }}
                    >
                      {it.combo}
                    </kbd>
                    <span style={{ "align-self": "center" }}>{it.label}</span>
                  </>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Show>
    </Modal>
  );
}
