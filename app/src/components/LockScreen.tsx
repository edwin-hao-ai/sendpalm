/** Full-screen lock covering the app while `appLocked()` is true.
 *
 *  Rendered by `App.tsx` above every other overlay so nothing leaks through
 *  (compose, command palette, toasts, the detail panel). The recovery path
 *  is deliberately on-screen: a local lock with no way back is a lockout,
 *  and the honest fallback is documented right where the user needs it.
 */

import { Show, createSignal, onMount } from "solid-js";
import { Icon } from "./Icon";
import { BrandMark } from "./BrandMark";
import {
  PIN_MAX,
  PIN_MIN,
  checkPin,
  checkRecoveryCode,
  resetPinWithRecovery,
  unlock,
  normalizeRecoveryCode,
} from "../services/app-lock";

export function LockScreen() {
  const [pin, setPin] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [showRecovery, setShowRecovery] = createSignal(false);
  const [recovery, setRecovery] = createSignal("");
  const [newPin, setNewPin] = createSignal("");
  const [recoveryError, setRecoveryError] = createSignal<string | null>(null);
  const [showHelp, setShowHelp] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  onMount(() => inputRef?.focus());

  const submit = () => {
    const value = pin().trim();
    if (value.length < PIN_MIN) {
      setError(`PIN 至少 ${PIN_MIN} 位`);
      return;
    }
    setBusy(true);
    // Synchronous digest over 4096 rounds — one frame of work, not a task
    // worth making async.
    const ok = checkPin(value);
    setBusy(false);
    if (ok) {
      setPin("");
      setError(null);
      unlock();
    } else {
      setPin("");
      setError("PIN 不正确");
      inputRef?.focus();
    }
  };

  const submitRecovery = () => {
    setRecoveryError(null);
    if (normalizeRecoveryCode(recovery()).length === 0) {
      setRecoveryError("请输入恢复码");
      return;
    }
    if (newPin().length < PIN_MIN) {
      setRecoveryError(`新 PIN 至少 ${PIN_MIN} 位`);
      return;
    }
    if (!checkRecoveryCode(recovery())) {
      setRecoveryError("恢复码不正确");
      return;
    }
    if (resetPinWithRecovery(recovery(), newPin())) {
      setPin("");
      setRecovery("");
      setNewPin("");
      unlock();
    } else {
      setRecoveryError("恢复码不正确");
    }
  };

  return (
    <div
      data-lock-screen
      role="dialog"
      aria-modal="true"
      aria-label="SendPalm 已锁定"
      style={{
        position: "fixed",
        inset: "0",
        // Above the toast stack (z-toast = 100) — a locked app must not
        // show a mail subject in a toast.
        "z-index": "calc(var(--z-toast) + 10)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        padding: "var(--space-5)",
        background: "var(--paper)",
        "-webkit-app-region": "no-drag",
      }}
    >
      <div
        style={{
          width: "min(380px, 100%)",
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          gap: "var(--space-4)",
          "text-align": "center",
        }}
      >
        <BrandMark />
        <div>
          <h1
            style={{
              margin: 0,
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h3)",
              "font-weight": "800",
              color: "var(--text-primary)",
            }}
          >
            已锁定
          </h1>
          <p
            style={{
              margin: "var(--space-1) 0 0",
              "font-size": "var(--text-caption)",
              color: "var(--text-muted)",
            }}
          >
            输入 PIN 继续
          </p>
        </div>

        <Show
          when={!showRecovery()}
          fallback={
            <div style={{ display: "grid", gap: "var(--space-2)", width: "100%" }}>
              <label style={{ display: "grid", gap: "4px", "text-align": "left" }}>
                <span style={{ "font-size": "var(--text-caption)", color: "var(--text-secondary)" }}>
                  恢复码
                </span>
                <input
                  data-lock-recovery
                  value={recovery()}
                  onInput={(e) => setRecovery(e.currentTarget.value)}
                  placeholder="XXXX-XXXX"
                  autocomplete="off"
                  spellcheck={false}
                  style={fieldStyle}
                />
              </label>
              <label style={{ display: "grid", gap: "4px", "text-align": "left" }}>
                <span style={{ "font-size": "var(--text-caption)", color: "var(--text-secondary)" }}>
                  新的 PIN（{PIN_MIN}–{PIN_MAX} 位数字）
                </span>
                <input
                  data-lock-new-pin
                  type="password"
                  inputmode="numeric"
                  value={newPin()}
                  onInput={(e) => setNewPin(e.currentTarget.value)}
                  autocomplete="off"
                  style={fieldStyle}
                />
              </label>
              <Show when={recoveryError()}>
                <p
                  role="alert"
                  style={{
                    margin: 0,
                    color: "var(--status-danger)",
                    "font-size": "var(--text-caption)",
                    "text-align": "left",
                  }}
                >
                  {recoveryError()}
                </p>
              </Show>
              <button
                type="button"
                data-lock-recovery-submit
                onClick={submitRecovery}
                style={primaryStyle}
              >
                用恢复码解锁
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRecovery(false);
                  setRecoveryError(null);
                }}
                style={linkStyle}
              >
                返回输入 PIN
              </button>
            </div>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            style={{ display: "grid", gap: "var(--space-2)", width: "100%" }}
          >
            <input
              ref={(el) => (inputRef = el)}
              data-lock-pin
              type="password"
              inputmode="numeric"
              autocomplete="off"
              aria-label="PIN"
              aria-invalid={!!error()}
              value={pin()}
              maxLength={PIN_MAX}
              onInput={(e) => {
                setPin(e.currentTarget.value);
                setError(null);
              }}
              style={{
                ...fieldStyle,
                "text-align": "center",
                "letter-spacing": "0.35em",
                "font-size": "var(--text-h4)",
                "padding": "12px",
              }}
            />
            <Show when={error()}>
              <p
                role="alert"
                style={{
                  margin: 0,
                  color: "var(--status-danger)",
                  "font-size": "var(--text-caption)",
                }}
              >
                {error()}
              </p>
            </Show>
            <button type="submit" data-lock-submit disabled={busy()} style={primaryStyle}>
              解锁
            </button>
            <button
              type="button"
              data-lock-use-recovery
              onClick={() => setShowRecovery(true)}
              style={linkStyle}
            >
              用恢复码解锁
            </button>
          </form>
        </Show>

        <button
          type="button"
          data-lock-help-toggle
          onClick={() => setShowHelp(!showHelp())}
          style={{
            ...linkStyle,
            color: "var(--text-muted)",
            "font-size": "var(--text-micro)",
          }}
        >
          {showHelp() ? "收起" : "忘记 PIN，也没有恢复码？"}
        </button>

        <Show when={showHelp()}>
          <div
            data-lock-help
            style={{
              "text-align": "left",
              padding: "var(--space-3)",
              "border-radius": "var(--radius-md)",
              background: "var(--paper-light)",
              border: "0.5px solid var(--border)",
              "font-size": "var(--text-micro)",
              color: "var(--text-secondary)",
              "line-height": 1.6,
            }}
          >
            <div style={{ display: "flex", gap: "6px", "align-items": "flex-start" }}>
              <Icon name="ph-info" size={13} />
              <span>
                应用锁只拦得住拿到这台电脑的人，<strong>不加密本地数据</strong>。
                它能防的是顺手翻看和投屏，不是硬盘分析。
              </span>
            </div>
            <p style={{ margin: "8px 0 0" }}>
              两种都丢了就只能在退出 SendPalm 后删除偏好文件里的
              <code style={{ "font-family": "var(--font-mono)" }}>
                preferences.security
              </code>
              ，锁会随之解除（邮件数据不会丢）。
            </p>
          </div>
        </Show>
      </div>
    </div>
  );
}

const fieldStyle = {
  width: "100%",
  padding: "10px 12px",
  "border-radius": "var(--radius-md)",
  border: "0.5px solid var(--border)",
  background: "var(--paper-light)",
  color: "var(--text-primary)",
  "font-size": "var(--text-body)",
  outline: "none",
  "box-sizing": "border-box",
} as const;

const primaryStyle = {
  width: "100%",
  "min-height": "44px",
  padding: "10px 16px",
  "border-radius": "var(--radius-pill)",
  border: "none",
  background: "var(--palm)",
  color: "#fff",
  "font-size": "var(--text-body-sm)",
  "font-weight": "700",
  cursor: "pointer",
} as const;

const linkStyle = {
  background: "transparent",
  border: "none",
  color: "var(--palm)",
  "font-size": "var(--text-caption)",
  "font-weight": "600",
  cursor: "pointer",
  "min-height": "32px",
} as const;
