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
    body: "一个安静的、HEY 风格的本地优先邮件客户端。接你的 Gmail / Outlook / iCloud / 飞书 / 网易 / QQ 任何邮箱，体验 HEY 那种「分门别类」的工作流。",
    icon: "ph-sparkle",
    color: "var(--palm)",
    cta: "开始",
  },
  {
    title: "连接你的邮箱",
    body: "支持 10 种邮件服务（Gmail / Outlook / iCloud / 飞书 / QQ / 网易 163 / 126 / Yahoo / Fastmail / 自定义 IMAP）。下一步去添加你的第一个账户。",
    icon: "ph-plug-connected",
    color: "var(--cobalt)",
    cta: "去连接",
    highlight: { label: "凭据存储", value: "OS Keychain" },
  },
  {
    title: "后台自动同步",
    body: "60 秒 IMAP 循环把新邮件拉到本地 SQLite；Sent 文件夹也同步，所以你用其他客户端发的邮件也能在这里看到。",
    icon: "ph-arrows-clockwise",
    color: "var(--purple)",
    cta: "继续",
    highlight: { label: "拉取协议", value: "60s IMAP 轮询" },
  },
  {
    title: "HEY 工作流，本地运行",
    body: "Gate 筛选陌生寄件人；L 延迟、A 暂存、Z 提醒；Sticky 黄色便签贴在邮件上；Follow-up 自动跟踪回信。⌘K 全局搜索，j/k 在 Imbox 里穿梭。",
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
    // P0-7: navigating to Settings to add an account must NOT mark
    // the wizard complete. The previous code called `complete()` here,
    // which meant clicking "去连接" on step 2 jumped past steps 3 (sync)
    // and 4 (done). The user never saw the rest of the wizard.
    //
    // Flow now:
    //   - step 2 "去连接" → setView("settings"), keep wizard state at 1
    //   - user adds an account in Settings, then either:
    //       a) clicks "继续" on the wizard (we'll add a "重新显示" affordance
    //          via the Settings → Profile "重放 Onboarding" button)
    //       b) navigates back manually and finishes step 2
    //   - on step 3 / 4 the user sees the sync progress + final card.
    //
    // We move the wizard one step forward so the "back" arrow on Settings
    // doesn't drag them back into a stale step 2.
    setView("settings");
    setOnboardingStep(1);
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
          // P1-16: shrink the card and padding on small viewports
          // so the 96x96 hero icon doesn't get clipped on iPhone SE
          // (375x667). The old fixed `560px` + 40px padding meant the
          // inner content area was 480px wide; on a 320-px-wide
          // iPhone 5 the card was 90vw = 288 px and the 96-px icon
          // was clipped on both sides.
          width: "min(560px, 92vw)",
          "max-width": "92vw",
          background: "var(--paper-light)",
          "border-radius": "24px",
          padding: "min(var(--space-10), 6vw)",
          "box-shadow": "0 32px 64px rgba(0,0,0,0.18)",
          animation: "modal-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
          "max-height": "88vh",
          "overflow-y": "auto",
        }}
      >
        <Show when={onboardingStep() !== null}>
          {(() => {
            const stepIndex = onboardingStep() ?? 0;
            const step = STEPS[stepIndex]!;
            const stepColor = step.color;
            const onPrimary = () => {
              if (step.cta === "去连接") goToAccounts();
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
