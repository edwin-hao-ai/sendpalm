/** Recipient input with contact autocomplete + removable pills.
 * Value is a comma-separated email string for easy integration with existing
 * compose state.
 */

import { For, Show, createMemo, createSignal } from "solid-js";
import { Icon } from "./Icon";
import { glassPanelStyle } from "./glass";
import { showToast } from "../stores/ui";
import { formFactor } from "../utils/viewport";

/** Structural subset of `Contact` that the recipient picker needs.
 *  Accepting this instead of the full `Contact` lets callers pass
 *  the lightweight `listContactsForRecipient` projection (only
 *  id / name / emails / avatar) instead of the full 25-field row,
 *  which matters because Compose opens the recipient picker on every
 *  reply and the previous full-table pull was visible jank. */
export interface RecipientContact {
  id: string;
  name: string;
  emails: { value: string; label?: string }[];
  avatar?: string;
}

interface RecipientInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  contacts: RecipientContact[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cap on rendered suggestions — a 1000-contact address book matching
 *  "a" should not mount 1000 buttons into the DOM. */
export const SUGGESTION_LIMIT = 8;

function parseEmails(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type RecipientVerdict =
  | { kind: "add"; email: string }
  | { kind: "empty" }
  | { kind: "invalid"; email: string }
  | { kind: "duplicate"; email: string };

/** Decide what an Enter/Tab/comma commit should do with the raw text.
 *  Pure + exported for tests. */
export function classifyRecipient(
  raw: string,
  existing: string[],
): RecipientVerdict {
  const clean = raw.trim();
  if (!clean) return { kind: "empty" };
  if (!EMAIL_RE.test(clean)) return { kind: "invalid", email: clean };
  if (existing.includes(clean)) return { kind: "duplicate", email: clean };
  return { kind: "add", email: clean };
}

/** Flattened (contact, email) suggestion row. */
export interface Suggestion {
  contactId: string;
  name: string;
  email: string;
}

/** Match contacts against the raw query. An "@" in the query no longer
 *  hides all candidates — we prefix-match the address being typed so
 *  "alice@" still surfaces alice@example.com. Returns at most `limit`
 *  rows; `total` reports the uncapped match count for the hint row. */
export function filterSuggestions(
  contacts: RecipientContact[],
  raw: string,
  existing: string[],
  limit = SUGGESTION_LIMIT,
): { rows: Suggestion[]; total: number } {
  const q = raw.trim().toLowerCase();
  if (!q) return { rows: [], total: 0 };
  const rows: Suggestion[] = [];
  for (const c of contacts) {
    const nameHit = c.name.toLowerCase().includes(q);
    for (const e of c.emails) {
      const addr = e.value.toLowerCase();
      if (existing.includes(e.value)) continue;
      if (nameHit || addr.includes(q)) {
        rows.push({ contactId: c.id, name: c.name, email: e.value });
      }
    }
  }
  return { rows: rows.slice(0, limit), total: rows.length };
}

export function RecipientInput(props: RecipientInputProps) {
  const [raw, setRaw] = createSignal("");
  const [focused, setFocused] = createSignal(false);
  const [activeIdx, setActiveIdx] = createSignal(-1);
  const [invalidHint, setInvalidHint] = createSignal<string | null>(null);

  const pills = createMemo(() => parseEmails(props.value));

  const suggestions = createMemo(() =>
    filterSuggestions(props.contacts, raw(), pills()),
  );

  const commitRaw = () => {
    const verdict = classifyRecipient(raw(), pills());
    switch (verdict.kind) {
      case "add":
        props.onChange([...pills(), verdict.email].join(", "));
        setRaw("");
        setInvalidHint(null);
        setActiveIdx(-1);
        break;
      case "duplicate":
        setRaw("");
        setInvalidHint(null);
        showToast({ message: "该地址已在收件人列表中", kind: "info" });
        break;
      case "invalid":
        setInvalidHint(verdict.email);
        break;
      case "empty":
        break;
    }
  };

  const removePill = (email: string) => {
    const next = pills()
      .filter((e) => e !== email)
      .join(", ");
    props.onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const rows = suggestions().rows;
    if (e.key === "ArrowDown" && rows.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % rows.length);
      return;
    }
    if (e.key === "ArrowUp" && rows.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? rows.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape") {
      // Close the dropdown first; let the event continue so an
      // already-closed dropdown doesn't swallow the compose Esc.
      if (rows.length > 0 && focused()) {
        setRaw("");
        setActiveIdx(-1);
        e.stopPropagation();
      }
      return;
    }
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      e.preventDefault();
      const active = rows[activeIdx()];
      if (e.key === "Enter" && active) {
        props.onChange([...pills(), active.email].join(", "));
        setRaw("");
        setActiveIdx(-1);
        setInvalidHint(null);
      } else {
        commitRaw();
      }
      return;
    }
    if (e.key === "Backspace" && !raw() && pills().length > 0) {
      removePill(pills()[pills().length - 1]!);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        "flex-wrap": "wrap",
        "align-items": "center",
        gap: "6px",
        padding: "6px 10px",
        "border-radius": "var(--radius-md)",
        border: focused()
          ? "1px solid var(--palm)"
          : "0.5px solid var(--border)",
        "box-shadow": focused() ? "0 0 0 3px var(--palm-glow)" : "none",
        background: "var(--paper-light)",
        "min-height": "40px",
      }}
    >
      <For each={pills()}>
        {(email) => (
          <span
            style={{
              display: "inline-flex",
              "align-items": "center",
              gap: "2px",
              padding: "3px 4px 3px 10px",
              background: "var(--palm-soft)",
              color: "var(--palm)",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "600",
              "min-height": formFactor() === "mobile" ? "36px" : "auto",
            }}
          >
            {email}
            <button
              onClick={() => removePill(email)}
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                padding: "6px",
                "min-width": "28px",
                "min-height": "28px",
                "border-radius": "var(--radius-pill)",
              }}
              aria-label={`移除 ${email}`}
              title={`移除 ${email}`}
            >
              <Icon name="ph-x" size={12} />
            </button>
          </span>
        )}
      </For>
      <input
        type="text"
        value={raw()}
        onInput={(e) => {
          setRaw(e.currentTarget.value);
          setActiveIdx(-1);
          setInvalidHint(null);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={onKeyDown}
        aria-label={props.placeholder ?? "收件人"}
        aria-activedescendant={
          activeIdx() >= 0 ? `recipient-suggestion-${activeIdx()}` : undefined
        }
        role="combobox"
        aria-expanded={focused() && suggestions().rows.length > 0}
        placeholder={pills().length === 0 ? props.placeholder : ""}
        style={{
          flex: 1,
          "min-width": "120px",
          border: "none",
          background: "transparent",
          outline: "none",
          "font-size": "var(--text-body-sm)",
          padding: "4px 2px",
        }}
      />
      <Show when={invalidHint()}>
        <div
          role="alert"
          style={{
            width: "100%",
            color: "var(--status-danger)",
            "font-size": "var(--text-micro)",
            padding: "2px 2px 0",
          }}
        >
          「{invalidHint()}」不是有效的邮箱地址
        </div>
      </Show>
      <Show when={focused() && suggestions().rows.length > 0}>
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            "z-index": 20,
            ...glassPanelStyle,
            "border-radius": "var(--radius-md)",
            "max-height": "220px",
            "overflow-y": "auto",
            padding: "4px",
          }}
        >
          <For each={suggestions().rows}>
            {(s, idx) => (
              <button
                id={`recipient-suggestion-${idx()}`}
                role="option"
                aria-selected={idx() === activeIdx()}
                onClick={() => {
                  props.onChange([...pills(), s.email].join(", "));
                  setRaw("");
                  setActiveIdx(-1);
                }}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-2)",
                  width: "100%",
                  padding: "8px 12px",
                  "border-radius": "var(--radius-sm)",
                  "text-align": "left",
                  "font-size": "var(--text-body-sm)",
                  color: "var(--text-primary)",
                  background:
                    idx() === activeIdx() ? "var(--paper-mid)" : "transparent",
                }}
                onMouseEnter={(ev) => {
                  setActiveIdx(idx());
                  ev.currentTarget.style.background = "var(--paper-mid)";
                }}
                onMouseLeave={(ev) =>
                  (ev.currentTarget.style.background =
                    idx() === activeIdx()
                      ? "var(--paper-mid)"
                      : "transparent")
                }
              >
                <span style={{ "font-weight": "700" }}>{s.name}</span>
                <span style={{ color: "var(--text-muted)" }}>{s.email}</span>
              </button>
            )}
          </For>
          <Show when={suggestions().total > suggestions().rows.length}>
            <div
              style={{
                padding: "6px 12px",
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              还有 {suggestions().total - suggestions().rows.length}{" "}
              个匹配，继续输入以缩小范围
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
