/** Onboarding — 4-step first-run wizard. */

import { Show, createSignal } from "solid-js";
import { Icon } from "../components/Icon";
import {
  onboardingStep,
  setOnboardingStep,
  setOnboardingCompleted,
  setView,
} from "../stores/ui";
import { load } from "@tauri-apps/plugin-store";
import { STORE_PATH } from "../bootstrap";

interface Step {
  title: string;
  body: string;
  icon: string;
  color: string;
  cta: string;
  highlight?: { label: string; value: string };
}

const STEPS: Step[] = [
  {
    title: "欢迎来到 SendPalm",
    body: "一个安静的、HEY 风格的邮件 + 日历 + IM + Agent 工作区。本地优先，不依赖云端往返。",
    icon: "ph-sparkle",
    color: "var(--palm)",
    cta: "开始",
  },
  {
    title: "接入真实邮箱",
    body: "Settings → Accounts → 添加账户。支持 Gmail / Outlook / iCloud / 飞书 / QQ / 网易 163 / 126 / Yahoo / Fastmail / 自定义 IMAP。凭据加密存储在系统 Keychain。",
    icon: "ph-plug-connected",
    color: "var(--cobalt)",
    cta: "去添加",
    highlight: { label: "凭据存储", value: "OS Keychain" },
  },
  {
    title: "后台自动同步",
    body: "接入后，60 秒 IMAP 循环自动拉取新邮件到本地 SQLite。首屏已有几百封历史邮件被回填。无 mock 数据，无云端中转。",
    icon: "ph-arrows-clockwise",
    color: "var(--purple)",
    cta: "继续",
    highlight: { label: "拉取协议", value: "IMAP IDLE" },
  },
  {
    title: "真发真收",
    body: "Compose 用 SMTP 真发邮件。⌘K 全局搜索、? 看快捷键、j/k 在 Imbox 里穿梭。你准备好了。",
    icon: "ph-paper-plane-tilt",
    color: "var(--orange)",
    cta: "开始使用",
  },
];

export function Onboarding() {
  const [direction, setDirection] = createSignal<1 | -1>(1);
  const [pressed, setPressed] = createSignal(false);

  const advance = async () => {
    const cur = onboardingStep();
    if (cur === null) return;
    if (cur < STEPS.length - 1) {
      setDirection(1);
      setPressed(true);
      setTimeout(() => setPressed(false), 200);
      setOnboardingStep(cur + 1);
    } else {
      await complete();
    }
  };

  const goBack = () => {
    const cur = onboardingStep();
    if (cur === null || cur === 0) return;
    setDirection(-1);
    setOnboardingStep(cur - 1);
  };

  const skip = async () => {
    await complete();
  };

  const complete = async () => {
    const store = await load(STORE_PATH);
    await store.set("onboarding_completed", true);
    await store.save();
    setOnboardingCompleted(true);
    setOnboardingStep(null);
  };

  const goToAccounts = () => {
    setView("settings");
    complete();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(35,28,51,0.5)",
        "backdrop-filter": "blur(12px)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": "var(--z-modal)",
        animation: "backdrop-fade-in 0.32s var(--ease-out) both",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) skip();
      }}
    >
      <div
        style={{
          width: "560px",
          "max-width": "90vw",
          background: "var(--paper-light)",
          "border-radius": "24px",
          padding: "var(--space-10)",
          "box-shadow": "0 32px 64px rgba(0,0,0,0.18)",
          animation: "modal-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
      >
        <Show when={onboardingStep() !== null}>
          {(() => {
            const stepIndex = onboardingStep() ?? 0;
            const step = STEPS[stepIndex]!;
            const stepColor = step.color;
            const onPrimary = () => {
              if (step.cta === "去添加") goToAccounts();
              else advance();
            };
            return (
              <>
                <div
                  style={{
                    width: "96px",
                    height: "96px",
                    "border-radius": "50%",
                    background: `${step.color}1F`,
                    color: step.color,
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    margin: "0 auto var(--space-5)",
                    "box-shadow": `0 12px 32px ${step.color}30`,
                    animation: `spring-snap 0.5s var(--ease-out) both`,
                    "transform-origin": "center",
                  }}
                  data-step={stepIndex}
                >
                  <Icon name={step.icon} size={42} />
                </div>
                <h2
                  style={{
                    "font-family": "var(--font-display)",
                    "font-size": "var(--text-h2)",
                    "font-weight": "800",
                    "text-align": "center",
                    "margin-bottom": "var(--space-3)",
                    "letter-spacing": "-0.02em",
                    animation: `view-enter 0.32s var(--ease-out) ${direction() >= 0 ? "0.04s" : "0s"} both`,
                  }}
                >
                  {step.title}
                </h2>
                <p
                  style={{
                    "text-align": "center",
                    color: "var(--text-secondary)",
                    "font-size": "var(--text-body)",
                    "line-height": 1.55,
                    "margin-bottom": "var(--space-6)",
                    animation: `view-enter 0.32s var(--ease-out) ${direction() >= 0 ? "0.08s" : "0.04s"} both`,
                  }}
                >
                  {step.body}
                </p>

                <Show when={step.highlight}>
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                      padding: "10px 14px",
                      background: "var(--paper-mid)",
                      "border-radius": "var(--radius-md)",
                      "margin-bottom": "var(--space-6)",
                      "font-size": "var(--text-caption)",
                      animation: `view-enter 0.32s var(--ease-out) 0.12s both`,
                    }}
                  >
                    <span
                      style={{
                        color: "var(--text-muted)",
                        "font-weight": "700",
                      }}
                    >
                      {step.highlight!.label}
                    </span>
                    <span
                      style={{
                        "margin-left": "auto",
                        "font-family": "var(--font-display)",
                        "font-weight": "700",
                        color: step.color,
                      }}
                    >
                      {step.highlight!.value}
                    </span>
                  </div>
                </Show>

                {/* Progress dots with sliding indicator */}
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    "justify-content": "center",
                    gap: "6px",
                    "margin-bottom": "var(--space-6)",
                  }}
                >
                  {STEPS.map((_, i) => (
                    <div
                      style={{
                        width: i === stepIndex ? "28px" : "8px",
                        height: "8px",
                        "border-radius": "var(--radius-pill)",
                        background:
                          i <= stepIndex ? stepColor : "var(--paper-dark)",
                        transition:
                          "all 0.36s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        opacity: i <= stepIndex ? 1 : 0.4,
                      }}
                    />
                  ))}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-3)",
                    "justify-content": "center",
                    "align-items": "center",
                  }}
                >
                  <Show when={onboardingStep()! > 0}>
                    <button
                      onClick={goBack}
                      style={{
                        padding: "10px 18px",
                        color: "var(--text-secondary)",
                        "font-weight": "700",
                        "font-size": "var(--text-caption)",
                        "border-radius": "var(--radius-pill)",
                        transition: "background 0.18s var(--ease-out)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--paper-mid)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      上一步
                    </button>
                  </Show>
                  <button
                    onClick={skip}
                    style={{
                      padding: "10px 18px",
                      color: "var(--text-muted)",
                      "font-weight": "600",
                      "font-size": "var(--text-caption)",
                      transition: "color 0.18s var(--ease-out)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "var(--text-secondary)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "var(--text-muted)")
                    }
                  >
                    跳过
                  </button>
                  <button
                    onClick={onPrimary}
                    data-onboard-primary
                    style={{
                      padding: "12px 26px",
                      background: step.color,
                      color: "white",
                      "border-radius": "var(--radius-pill)",
                      "font-weight": "700",
                      "font-size": "var(--text-caption)",
                      "box-shadow": `0 6px 18px ${step.color}40`,
                      transform: pressed() ? "scale(0.96)" : "scale(1)",
                      transition:
                        "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s var(--ease-out)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = `0 10px 24px ${step.color}50`;
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = `0 6px 18px ${step.color}40`;
                      e.currentTarget.style.transform = pressed()
                        ? "scale(0.96)"
                        : "scale(1)";
                    }}
                  >
                    {step.cta}
                  </button>
                </div>
              </>
            );
          })()}
        </Show>
      </div>
    </div>
  );
}
