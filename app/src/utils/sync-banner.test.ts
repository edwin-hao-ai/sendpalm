import { describe, expect, it } from "vitest";
import { bannerCopy } from "../views/Imbox";
import { classifyVerifyResult } from "./account-verify";

/** Four sync problems, four different actions for the user. The wording is the
 *  whole point: telling someone to "输入密码" when the keychain simply refused
 *  access sends them looking for a password they already set. */
describe("sync problem copy", () => {
  it("distinguishes a refused keychain from an empty one", () => {
    const unreadable = bannerCopy("credentials_unreadable");
    const missing = bannerCopy("missing_credentials");
    expect(unreadable).not.toBe(missing);
    expect(unreadable).toContain("钥匙串");
    // The action is "try again", not "set a password".
    expect(unreadable).toContain("重新输入");
  });

  it("tells an expired password apart from a refused keychain", () => {
    expect(bannerCopy("auth_failed")).toContain("验证失败");
    expect(bannerCopy("auth_failed")).not.toBe(bannerCopy("credentials_unreadable"));
  });

  it("says a network problem is not the account's fault", () => {
    expect(bannerCopy("network")).toContain("网络");
  });

  it("has copy for every issue kind", () => {
    for (const issue of [
      "missing_credentials",
      "credentials_unreadable",
      "auth_failed",
      "network",
      "sync_failed",
    ] as const) {
      expect(bannerCopy(issue).length).toBeGreaterThan(8);
    }
  });

  it("still rejects an account when the keychain refuses access", () => {
    // The setup flow must not claim success here either.
    expect(classifyVerifyResult("credentials_unreadable")).toBe("reject");
  });
});
