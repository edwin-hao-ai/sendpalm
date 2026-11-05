/** 邮件规则 — user automation: "subject contains 发票 → Records + 发票
 *  label". One rule = one row; evaluated top-down by priority at sync
 * time. Designed for non-technical users: a sentence, not a query
 * builder. */

import { For, Show, createResource, createSignal } from "solid-js";
import { safeInvoke } from "../services/backend";
import { bucketLabel as bucketName } from "../utils/labels";
import { showToast } from "../stores/ui";
import { Icon } from "./Icon";

interface MailRule {
  id: string;
  name: string;
  enabled: boolean;
  matchField: "from" | "subject" | "body";
  matchPattern: string;
  actionBucket?: string | null;
  actionLabel?: string | null;
  priority: number;
}

const FIELD_LABEL: Record<string, string> = {
  from: "发件人",
  subject: "主题",
  body: "正文",
};

function listRules(): Promise<MailRule[] | null> {
  return safeInvoke<MailRule[]>("list_mail_rules");
}

export function RulesSettings() {
  const [rules, { refetch }] = createResource(listRules);
  const [field, setField] = createSignal<"from" | "subject" | "body">("subject");
  const [pattern, setPattern] = createSignal("");
  const [bucket, setBucket] = createSignal("paperTrail");
  const [saving, setSaving] = createSignal(false);

  const save = async () => {
    const p = pattern().trim();
    if (!p || saving()) return;
    setSaving(true);
    try {
      await safeInvoke("upsert_mail_rule", {
        rule: {
          id: `rule_${Date.now().toString(36)}`,
          name: "",
          enabled: true,
          matchField: field(),
          matchPattern: p,
          actionBucket: bucket(),
          actionLabel: null,
          priority: (rules() ?? []).length + 1,
        },
      });
      setPattern("");
      await refetch();
      showToast({ message: "规则已保存，对新邮件生效", kind: "success" });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: MailRule) => {
    await safeInvoke("upsert_mail_rule", { rule: { ...r, enabled: !r.enabled } });
    await refetch();
  };

  const remove = async (r: MailRule) => {
    await safeInvoke("delete_mail_rule", { id: r.id });
    await refetch();
  };

  const inputStyle = {
    padding: "8px 12px",
    "border-radius": "var(--radius-sm)",
    border: "0.5px solid var(--border)",
    background: "var(--paper-light)",
    color: "var(--text-primary)",
    "font-size": "var(--text-body-sm)",
  } as const;

  return (
    <div style={{ display: "grid", gap: "var(--space-3)", "max-width": "520px" }}>
      <p style={{ margin: 0, "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
        自动化规则在收信时执行，优先级高于 Gate 默认分类——例如"主题含
        发票 → Records"。
      </p>

      <Show
        when={(rules() ?? []).length > 0}
        fallback={
          <p style={{ margin: 0, "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
            还没有规则。
          </p>
        }
      >
        <For each={rules()}>
          {(r) => (
            <div
              data-rule={r.id}
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-2)",
                padding: "8px 12px",
                "border-radius": "var(--radius-sm)",
                background: "var(--paper-light)",
                border: "0.5px solid var(--border)",
                opacity: r.enabled ? 1 : 0.55,
              }}
            >
              <Icon name="ph-flow-arrow" size={14} />
              <span style={{ flex: 1, "font-size": "var(--text-body-sm)" }}>
                {FIELD_LABEL[r.matchField]}含「{r.matchPattern}」→{" "}
                {bucketName(r.actionBucket ?? "")}
                {r.actionLabel ? ` + 文件夹` : ""}
              </span>
              <button
                type="button"
                onClick={() => void toggle(r)}
                style={{
                  padding: "2px 10px",
                  "border-radius": "var(--radius-pill)",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "var(--text-micro)",
                  "font-weight": 700,
                  background: r.enabled ? "var(--palm-soft)" : "var(--paper-mid)",
                  color: r.enabled ? "var(--palm)" : "var(--text-muted)",
                }}
              >
                {r.enabled ? "启用" : "停用"}
              </button>
              <button
                type="button"
                aria-label="删除规则"
                onClick={() => void remove(r)}
                style={{
                  width: "28px",
                  height: "28px",
                  "border-radius": "var(--radius-pill)",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <Icon name="ph-trash" size={13} />
              </button>
            </div>
          )}
        </For>
      </Show>

      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          "flex-wrap": "wrap",
          "align-items": "center",
        }}
      >
        <select
          value={field()}
          onChange={(e) => setField(e.currentTarget.value as never)}
          style={inputStyle}
          aria-label="匹配字段"
        >
          <option value="subject">主题含</option>
          <option value="from">发件人含</option>
          <option value="body">正文含</option>
        </select>
        <input
          type="text"
          placeholder="发票"
          value={pattern()}
          onInput={(e) => setPattern(e.currentTarget.value)}
          style={{ ...inputStyle, flex: 1, "min-width": "120px" }}
          aria-label="匹配内容"
        />
        <select
          value={bucket()}
          onChange={(e) => setBucket(e.currentTarget.value)}
          style={inputStyle}
          aria-label="归类到"
        >
          <option value="paperTrail">→ Records</option>
          <option value="feed">→ Stream</option>
          <option value="imbox">→ Inbox</option>
        </select>
        <button
          type="button"
          data-save-rule
          disabled={saving() || !pattern().trim()}
          onClick={() => void save()}
          style={{
            padding: "8px 16px",
            "border-radius": "var(--radius-pill)",
            border: "none",
            background: "var(--palm)",
            color: "#fff",
            "font-size": "var(--text-caption)",
            "font-weight": 700,
            cursor: "pointer",
            opacity: saving() || !pattern().trim() ? 0.5 : 1,
          }}
        >
          添加规则
        </button>
      </div>
    </div>
  );
}
