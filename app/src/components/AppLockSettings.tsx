/** 设置 → 偏好 → 安全：应用锁。
 *
 *  应用锁 was a dead field for the whole project (in the type, no reader,
 *  no UI). It now ships with the two things a local lock actually needs:
 *  a recovery code shown once at setup, and a documented manual reset. The
 *  copy states the threat model rather than implying encryption.
 */

import { Show, createSignal } from "solid-js";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { showToast } from "../stores/ui";
import {
  PIN_MAX,
  PIN_MIN,
  changePin,
  disableLock,
  enableLock,
  issueRecoveryCode,
  lockNow,
  validatePin,
} from "../services/app-lock";

const PIN_PROBLEM_COPY: Record<string, string> = {
  "too-short": `PIN 至少 ${PIN_MIN} 位数字`,
  "too-long": `PIN 最多 ${PIN_MAX} 位数字`,
  "not-numeric": "PIN 只能包含数字",
};

type Mode = "setup" | "change" | "disable" | "regenerate";

export function AppLockSettings(props: { enabled: boolean }) {
  const [mode, setMode] = createSignal<Mode | null>(null);
  return (
    <>
      <div
        style={{
          display: "flex",
          gap: "var(--space-3)",
          "align-items": "flex-start",
          padding: "var(--space-3)",
          "border-radius": "var(--radius-md)",
          background: "var(--paper-light)",
          border: "0.5px solid var(--border)",
          "max-width": "520px",
        }}
      >
        <Icon
          name={props.enabled ? "ph-lock-simple" : "ph-lock-simple-open"}
          size={18}
          style={{ color: props.enabled ? "var(--palm)" : "var(--text-muted)" }}
        />
        <div style={{ flex: 1, "min-width": 0 }}>
          <div style={{ "font-weight": 700, "font-size": "var(--text-body-sm)" }}>
            应用锁
          </div>
          <p
            style={{
              margin: "2px 0 0",
              "font-size": "var(--text-caption)",
              color: "var(--text-muted)",
              "line-height": 1.6,
            }}
          >
            启动时用 PIN 解锁。只拦得住拿到这台电脑的人——
            <strong>不加密本地数据</strong>。
          </p>
          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              "margin-top": "var(--space-2)",
              "flex-wrap": "wrap",
            }}
          >
            <Show
              when={props.enabled}
              fallback={
                <button
                  type="button"
                  data-app-lock-enable
                  onClick={() => setMode("setup")}
                  style={pillStyle(true)}
                >
                  开启应用锁
                </button>
              }
            >
              <button
                type="button"
                data-app-lock-change
                onClick={() => setMode("change")}
                style={pillStyle(false)}
              >
                修改 PIN
              </button>
              <button
                type="button"
                data-app-lock-now
                onClick={() => {
                  lockNow();
                  showToast({ message: "已锁定", kind: "info", ttlMs: 1500 });
                }}
                style={pillStyle(false)}
              >
                立即锁定
              </button>
              <button
                type="button"
                data-app-lock-regenerate
                onClick={() => setMode("regenerate")}
                style={pillStyle(false)}
              >
                新的恢复码
              </button>
              <button
                type="button"
                data-app-lock-disable
                onClick={() => setMode("disable")}
                style={{ ...pillStyle(false), color: "var(--status-danger)" }}
              >
                关闭
              </button>
            </Show>
          </div>
        </div>
      </div>

      <Show when={mode() === "setup"}>
        <PinModal
          title="开启应用锁"
          needsCurrent={false}
          submitLabel="开启"
          onClose={() => setMode(null)}
          onSubmit={(pin) => {
            const { recoveryCode } = enableLock(pin);
            setMode(null);
            showRecoveryToast(recoveryCode);
            return undefined;
          }}
        />
      </Show>

      <Show when={mode() === "change"}>
        <PinModal
          title="修改 PIN"
          needsCurrent
          submitLabel="保存"
          onClose={() => setMode(null)}
          onSubmit={(pin, current) => {
            if (!changePin(current ?? "", pin)) {
              return "当前 PIN 或恢复码不正确";
            }
            setMode(null);
            // changePin rotates the recovery digest, so the old code is dead.
            // Show the replacement immediately — the user cannot get it back.
            const code = issueRecoveryCode(pin);
            if (code) showRecoveryToast(code);
            return undefined;
          }}
        />
      </Show>

      <Show when={mode() === "disable"}>
        <PinModal
          title="关闭应用锁"
          needsCurrent
          submitLabel="关闭"
          onClose={() => setMode(null)}
          onSubmit={(_pin, current) => {
            if (!disableLock(current ?? "")) {
              return "当前 PIN 或恢复码不正确";
            }
            setMode(null);
            showToast({ message: "应用锁已关闭", kind: "success" });
            return undefined;
          }}
        />
      </Show>

      <Show when={mode() === "regenerate"}>
        <PinModal
          title="生成新的恢复码"
          needsCurrent
          currentOnly
          submitLabel="生成"
          onClose={() => setMode(null)}
          onSubmit={(_pin, current) => {
            // The recovery code replaces the PIN, so entering the current
            // PIN as the "new PIN" would be a lie. Accept the current secret
            // in either field: the modal's new-PIN box is unused here.
            const code = issueRecoveryCode(current ?? "");
            if (!code) return "当前 PIN 不正确";
            setMode(null);
            showRecoveryToast(code);
            return undefined;
          }}
        />
      </Show>
    </>
  );
}

function showRecoveryToast(code: string) {
  showToast({
    message: `恢复码：${code} · 只显示这一次，请立刻抄下来。忘了 PIN 时它是唯一的后路。`,
    kind: "info",
    ttlMs: 30_000,
  });
}

function PinModal(props: {
  title: string;
  needsCurrent: boolean;
  /** Ask only for the current PIN (recovery-code reissue, unlock checks). */
  currentOnly?: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (pin: string, current?: string) => string | undefined;
}) {
  const [pin, setPin] = createSignal("");
  const [confirm, setConfirm] = createSignal("");
  const [current, setCurrent] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  const submit = () => {
    setError(null);
    if (props.needsCurrent && current().trim().length === 0) {
      setError("请输入当前 PIN 或恢复码");
      return;
    }
    if (!props.currentOnly) {
      const problem = validatePin(pin());
      if (problem) {
        setError(PIN_PROBLEM_COPY[problem] ?? "PIN 不合法");
        return;
      }
      if (pin() !== confirm()) {
        setError("两次输入的 PIN 不一致");
        return;
      }
    }
    const failure = props.onSubmit(pin(), current());
    if (failure) setError(failure);
  };

  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.title}
      width="440px"
      footer={
        <>
          <button
            type="button"
            onClick={props.onClose}
            style={{
              padding: "8px 16px",
              color: "var(--text-secondary)",
              "font-size": "var(--text-caption)",
            }}
          >
            取消
          </button>
          <button
            type="button"
            data-pin-submit
            onClick={submit}
            style={{
              padding: "8px 18px",
              "border-radius": "var(--radius-pill)",
              background: "var(--palm)",
              color: "#fff",
              "font-size": "var(--text-caption)",
              "font-weight": 700,
            }}
          >
            {props.submitLabel}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        <Show when={props.needsCurrent}>
          <label style={{ display: "grid", gap: "4px" }}>
            <span style={labelStyle}>当前 PIN（或恢复码）</span>
            <input
              data-pin-current
              type="password"
              autocomplete="off"
              value={current()}
              onInput={(e) => setCurrent(e.currentTarget.value)}
              style={inputStyle}
            />
          </label>
        </Show>
        <Show when={!props.currentOnly}>
          <label style={{ display: "grid", gap: "4px" }}>
            <span style={labelStyle}>
              PIN（{PIN_MIN}–{PIN_MAX} 位数字）
            </span>
            <input
              data-pin-new
              type="password"
              inputmode="numeric"
              autocomplete="off"
              value={pin()}
              maxLength={PIN_MAX}
              onInput={(e) => setPin(e.currentTarget.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: "4px" }}>
            <span style={labelStyle}>再输一次</span>
            <input
              data-pin-confirm
              type="password"
              inputmode="numeric"
              autocomplete="off"
              value={confirm()}
              maxLength={PIN_MAX}
              onInput={(e) => setConfirm(e.currentTarget.value)}
              style={inputStyle}
            />
          </label>
        </Show>
        <Show when={!props.currentOnly}>
          <p
            style={{
              margin: 0,
              "font-size": "var(--text-micro)",
              color: "var(--text-muted)",
              "line-height": 1.6,
            }}
          >
            保存后会显示一个<strong>一次性恢复码</strong>。请抄下来——忘了 PIN
            又没有恢复码，就只能手动删除偏好文件里的
            <code style={{ "font-family": "var(--font-mono)" }}>
              preferences.security
            </code>
            。
          </p>
        </Show>
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
      </div>
    </Modal>
  );
}

const labelStyle = {
  "font-size": "var(--text-caption)",
  color: "var(--text-secondary)",
} as const;

const inputStyle = {
  padding: "8px 12px",
  "border-radius": "var(--radius-md)",
  border: "0.5px solid var(--border)",
  background: "var(--paper-light)",
  color: "var(--text-primary)",
  "font-size": "var(--text-body)",
  width: "100%",
  "box-sizing": "border-box",
} as const;

function pillStyle(primary: boolean) {
  return {
    padding: "6px 14px",
    "border-radius": "var(--radius-pill)",
    border: primary ? "none" : "0.5px solid var(--border)",
    background: primary ? "var(--palm)" : "transparent",
    color: primary ? "#fff" : "var(--text-secondary)",
    "font-size": "var(--text-caption)",
    "font-weight": 700,
    cursor: "pointer",
    "min-height": "32px",
  } as const;
}

/** Exported for the Settings view's 安全 section header copy. */
export function appLockSummary(enabled: boolean): string {
  return enabled
    ? "启动时需要 PIN。忘了 PIN 就找恢复码，再不行只能手动重置。"
    : "未开启。开启后启动时需要 PIN，适合共享或借出的电脑。";
}
