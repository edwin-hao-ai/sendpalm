/** Recipient input with contact autocomplete + removable pills.
 * Value is a comma-separated email string for easy integration with existing
 * compose state.
 */

import { For, Show, createMemo, createSignal } from "solid-js";
import { Icon } from "./Icon";
import type { Contact } from "../types";

interface RecipientInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  contacts: Contact[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function RecipientInput(props: RecipientInputProps) {
  const [raw, setRaw] = createSignal("");
  const [focused, setFocused] = createSignal(false);

  const pills = createMemo(() => parseEmails(props.value));

  const matches = createMemo(() => {
    const q = raw().trim().toLowerCase();
    if (!q || q.includes("@")) return [];
    return props.contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.emails.some((e) => e.value.toLowerCase().includes(q)),
    );
  });

  const addPill = (email: string) => {
    const clean = email.trim();
    if (!clean || !EMAIL_RE.test(clean)) return;
    const current = new Set(pills());
    if (current.has(clean)) {
      setRaw("");
      return;
    }
    const next = [...pills(), clean].join(", ");
    props.onChange(next);
    setRaw("");
  };

  const removePill = (email: string) => {
    const next = pills()
      .filter((e) => e !== email)
      .join(", ");
    props.onChange(next);
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
              gap: "4px",
              padding: "3px 8px",
              background: "var(--palm-soft)",
              color: "var(--palm)",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "600",
            }}
          >
            {email}
            <button
              onClick={() => removePill(email)}
              style={{ display: "flex", "align-items": "center" }}
              aria-label={`Remove ${email}`}
            >
              <Icon name="ph-x" size={12} />
            </button>
          </span>
        )}
      </For>
      <input
        type="text"
        value={raw()}
        onInput={(e) => setRaw(e.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
            e.preventDefault();
            addPill(raw());
          } else if (e.key === "Backspace" && !raw() && pills().length > 0) {
            removePill(pills()[pills().length - 1]!);
          }
        }}
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
      <Show when={focused() && matches().length > 0}>
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            "z-index": 20,
            background: "var(--paper-light)",
            border: "0.5px solid var(--border-strong)",
            "border-radius": "var(--radius-md)",
            "box-shadow": "var(--shadow-lg)",
            "max-height": "200px",
            "overflow-y": "auto",
          }}
        >
          <For each={matches()}>
            {(c) => (
              <For each={c.emails}>
                {(e) => (
                  <button
                    onClick={() => addPill(e.value)}
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                      width: "100%",
                      padding: "8px 12px",
                      "text-align": "left",
                      "font-size": "var(--text-body-sm)",
                      color: "var(--text-primary)",
                    }}
                    onMouseEnter={(ev) =>
                      (ev.currentTarget.style.background = "var(--paper-mid)")
                    }
                    onMouseLeave={(ev) =>
                      (ev.currentTarget.style.background = "transparent")
                    }
                  >
                    <span style={{ "font-weight": "700" }}>{c.name}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {e.value}
                    </span>
                  </button>
                )}
              </For>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
