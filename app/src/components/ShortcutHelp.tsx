/** Keyboard Shortcut help modal — ? key.
 * Derived from the same shortcut list the global handler uses
 * (utils/shortcuts.ts resolves user overrides from the DB and falls back
 * to DEFAULT_SHORTCUTS), so this list can never drift from reality again.
 */

import { For, createResource } from "solid-js";
import { Modal } from "./Modal";
import { helpOpen, setHelpOpen } from "../stores/ui";
import { listShortcuts } from "../stores/data";
import { DEFAULT_SHORTCUTS } from "../utils/shortcut-defaults";
import { navDisplayLabel } from "./Sidebar";
import type { Shortcut } from "../types";

export interface HelpEntry {
  combo: string;
  label: string;
}
export interface HelpGroup {
  group: string;
  items: HelpEntry[];
}

const GROUP_ORDER = ["全局", "视图", "列表导航", "邮件操作", "日历", "其他"];

function groupFor(action: string): string {
  if (action.startsWith("app:")) return "全局";
  if (action.startsWith("nav:")) return "视图";
  if (action.startsWith("list:")) return "列表导航";
  if (action.startsWith("message:") || action.startsWith("bulk:"))
    return "邮件操作";
  if (action.startsWith("calendar:")) return "日历";
  return "其他";
}

const ACTION_LABEL_ZH: Record<string, string> = {
  "app:command-palette": "命令面板",
  "app:search": "搜索",
  "app:help": "显示快捷键帮助",
  "app:compose": "写新邮件",
  "app:agent": "打开 Agent 面板",
  "app:notifications": "打开通知",
  "list:cursor-down": "下一条",
  "list:cursor-up": "上一条",
  "list:select": "选择 / 取消选择",
  "list:open": "打开消息详情",
  "message:reply": "回复",
  "message:forward": "转发",
  "message:reply-later": "稍后回复",
  "message:set-aside": "搁置",
  "message:bubble-up": "设为提醒（回到列表顶部）",
  "message:archive": "归档",
  "message:trash": "移到回收站",
  "message:spam": "标记为垃圾邮件",
  "message:unread": "标为未读",
  "message:label": "加标签",
  "message:move": "移动到…",
  "bulk:menu": "批量操作菜单",
  "calendar:day": "日视图",
  "calendar:week": "周视图",
  "calendar:year": "年视图",
  "calendar:today": "回到今天",
  "calendar:prev": "上一周期",
  "calendar:next": "下一周期",
};

/** "⌘K" → "⌘ K" for legibility in the kbd chip. */
function formatCombo(combo: string): string {
  return combo.replace("⌘", "⌘ ").replace("⇧", "⇧ ");
}

/** Pure derivation — unit-tested in ShortcutHelp.test.ts. */
export function buildShortcutGroups(shortcuts: Shortcut[]): HelpGroup[] {
  const groups = new Map<string, HelpEntry[]>();
  for (const s of shortcuts) {
    const g = groupFor(s.action);
    const label =
      ACTION_LABEL_ZH[s.action] ??
      (s.action.startsWith("nav:")
        ? `打开 ${navDisplayLabel(s.action.slice(4))}`
        : s.label);
    const entry: HelpEntry = { combo: formatCombo(s.combo), label };
    const list = groups.get(g);
    if (list) list.push(entry);
    else groups.set(g, [entry]);
  }
  // Esc is hard-wired in the global handler, not a configurable row.
  groups.get("全局")?.push({ combo: "Esc", label: "关闭面板 / 弹窗" });
  return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({
    group: g,
    items: groups.get(g)!,
  }));
}

export function ShortcutHelp() {
  const [shortcuts] = createResource(listShortcuts);
  // Same resolution rule as utils/shortcuts.ts: a non-empty DB list wins,
  // otherwise the defaults apply.
  const groups = () => {
    const list = shortcuts() ?? [];
    return buildShortcutGroups(list.length > 0 ? list : DEFAULT_SHORTCUTS);
  };

  return (
    <Modal
      open={helpOpen()}
      onClose={() => setHelpOpen(false)}
      title="键盘快捷键"
      width="600px"
    >
      <div
        style={{
          "max-height": "60vh",
          "overflow-y": "auto",
          display: "grid",
          gap: "var(--space-4)",
        }}
      >
        <For each={groups()}>
          {(s) => (
            <section>
              <h4
                style={{
                  "font-family": "var(--font-display)",
                  "font-size": "var(--text-micro)",
                  "font-weight": "700",
                  "letter-spacing": "0.04em",
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
                <For each={s.items}>
                  {(it) => (
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
                  )}
                </For>
              </div>
            </section>
          )}
        </For>
        {/* Bottom fade — hints that the list scrolls */}
        <div
          aria-hidden="true"
          style={{
            position: "sticky",
            bottom: "calc(-1 * var(--space-4))",
            height: "32px",
            "margin-bottom": "calc(-1 * var(--space-4))",
            background:
              "linear-gradient(to bottom, transparent, var(--paper-light))",
            "pointer-events": "none",
          }}
        />
      </div>
    </Modal>
  );
}
