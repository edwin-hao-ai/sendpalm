/** Onboarding — 4-step first-run wizard. */

import { Show } from "solid-js";
import { Icon } from "../components/Icon";
import {
  onboardingStep,
  setOnboardingStep,
  setOnboardingCompleted,
} from "../stores/ui";
import { load } from "@tauri-apps/plugin-store";
import { STORE_PATH } from "../bootstrap";

const STEPS = [
  {
    title: "Welcome to SendPalm",
    body: "A calm, HEY-inspired workspace for email + calendar + agent.",
    icon: "ph-sparkle",
    color: "var(--palm)",
  },
  {
    title: "Connect channels",
    body: "Plug in Gmail, Outlook, IMAP, Slack, WeChat, Google Calendar. We'll keep the inbox unified.",
    icon: "ph-plug",
    color: "var(--cobalt)",
  },
  {
    title: "Indexing",
    body: "SendPalm sorts your inbox into Imbox, Stream, Records. First-time senders go to Gate for your approval.",
    icon: "ph-funnel",
    color: "var(--purple)",
  },
  {
    title: "All set",
    body: "Press ? for keyboard shortcuts. ⌘K opens the command palette. You're ready.",
    icon: "ph-rocket-launch",
    color: "var(--orange)",
  },
] as const;

export function Onboarding() {
  const advance = async () => {
    const cur = onboardingStep();
    if (cur === null) return;
    if (cur < STEPS.length - 1) {
      setOnboardingStep(cur + 1);
    } else {
      const store = await load(STORE_PATH);
      await store.set("onboarding_completed", true);
      await store.save();
      setOnboardingCompleted(true);
      setOnboardingStep(null);
    }
  };

  const skip = async () => {
    const store = await load(STORE_PATH);
    await store.set("onboarding_completed", true);
    await store.save();
    setOnboardingCompleted(true);
    setOnboardingStep(null);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(35,28,51,0.5)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": "var(--z-modal)",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      <div
        style={{
          width: "560px",
          "max-width": "90vw",
          "max-height": "85vh",
          background: "var(--paper-light)",
          "border-radius": "var(--radius-xl)",
          padding: "var(--space-10)",
          "box-shadow": "var(--shadow-xl)",
          animation: "modal-enter 0.4s var(--spring) both",
        }}
      >
        <Show when={onboardingStep() !== null}>
          {(() => {
            const step = STEPS[onboardingStep()!]!;
            return (
              <>
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    "border-radius": "50%",
                    background: `${step.color}20`,
                    color: step.color,
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    "margin": "0 auto var(--space-5)",
                  }}
                >
                  <Icon name={step.icon} size={36} />
                </div>
                <h2
                  style={{
                    "font-family": "var(--font-display)",
                    "font-size": "var(--text-h2)",
                    "font-weight": "800",
                    "text-align": "center",
                    "margin-bottom": "var(--space-3)",
                  }}
                >
                  {step.title}
                </h2>
                <p
                  style={{
                    "text-align": "center",
                    color: "var(--text-secondary)",
                    "font-size": "var(--text-body)",
                    "line-height": 1.5,
                    "margin-bottom": "var(--space-8)",
                  }}
                >
                  {step.body}
                </p>
                <div
                  style={{
                    display: "flex",
                    "justify-content": "center",
                    gap: "6px",
                    "margin-bottom": "var(--space-6)",
                  }}
                >
                  {STEPS.map((_, i) => (
                    <div
                      style={{
                        width: i === onboardingStep() ? "24px" : "8px",
                        height: "8px",
                        "border-radius": "var(--radius-pill)",
                        background:
                          i === onboardingStep()
                            ? "var(--palm)"
                            : "var(--paper-dark)",
                        transition: "all var(--duration-base) var(--ease-out)",
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-3)",
                    "justify-content": "center",
                  }}
                >
                  <button
                    onClick={skip}
                    style={{
                      padding: "10px 20px",
                      color: "var(--text-secondary)",
                      "font-weight": "700",
                      "font-size": "var(--text-caption)",
                    }}
                  >
                    跳过
                  </button>
                  <button
                    onClick={advance}
                    style={{
                      padding: "10px 24px",
                      background: "var(--palm)",
                      color: "white",
                      "border-radius": "var(--radius-pill)",
                      "font-weight": "700",
                      "font-size": "var(--text-caption)",
                    }}
                  >
                    {onboardingStep() === STEPS.length - 1 ? "开始使用" : "下一步"}
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