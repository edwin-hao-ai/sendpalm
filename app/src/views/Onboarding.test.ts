/** Onboarding / Agent surface regression guards (2026-09-22 UX pass).
 *  `?raw` source assertions for the audit findings that are easiest to
 *  reintroduce: technical jargon in first-run copy, overlay-click skip,
 *  and fake/dead buttons in the Agent surfaces. */

import { describe, expect, it } from "vitest";
import onboardingSource from "./Onboarding.tsx?raw";
import agentSource from "./Agent.tsx?raw";

describe("Onboarding.tsx source guards", () => {
  it("has no technical jargon in user-facing copy", () => {
    expect(onboardingSource).not.toContain("OS Keychain");
    expect(onboardingSource).not.toContain("IMAP");
    expect(onboardingSource).not.toContain("SQLite");
  });

  it("does not skip the wizard on overlay click", () => {
    // The backdrop element used to carry onClick={skip} — a single
    // misclick permanently dismissed the wizard.
    expect(onboardingSource).not.toMatch(/onClick=\{\(e\)/);
  });

  it("is an accessible modal dialog", () => {
    expect(onboardingSource).toContain('role="dialog"');
    expect(onboardingSource).toContain('aria-modal="true"');
  });

  it("goes to Settings → 账户 without completing the wizard", () => {
    expect(onboardingSource).toContain("setOnboardingResumeStep(2)");
    expect(onboardingSource).toContain('setSettingsTab("accounts")');
    expect(onboardingSource).toContain('setView("settings")');
  });
});

describe("Agent.tsx source guards", () => {
  it("has no English placeholder copy left", () => {
    expect(agentSource).not.toContain("Search sessions, drafts, tasks");
    expect(agentSource).not.toContain("Ask Agent…");
    expect(agentSource).not.toContain("Start a conversation");
    expect(agentSource).not.toContain("No results");
  });

  it("renders a thinking placeholder while Agent is working", () => {
    expect(agentSource).toContain("agent-thinking");
    expect(agentSource).toContain("Agent 正在思考…");
  });

  it("Esc clears an active search before leaving the view", () => {
    const escBlock = agentSource.indexOf('e.key !== "Escape"');
    expect(escBlock).toBeGreaterThan(-1);
    expect(agentSource.indexOf('setQuery("")')).toBeGreaterThan(escBlock);
  });
});
