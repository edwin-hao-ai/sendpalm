/** App lock — PIN / recovery-code logic.
 *
 *  The digest is an obfuscation, not a KDF (see the module comment), so these
 *  assert behaviour: the right secret opens, the wrong one never does, and
 *  rotating a PIN kills the old recovery code.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  checkPin,
  checkRecoveryCode,
  changePin,
  digest,
  disableLock,
  enableLock,
  hasPin,
  issueRecoveryCode,
  lockEnabled,
  newRecoveryCode,
  newSalt,
  normalizeRecoveryCode,
  resetPinWithRecovery,
  validatePin,
} from "./app-lock";
import { setAppSettings } from "../stores/ui";

function reset() {
  setAppSettings("preferences", "security", {
    appLock: false,
    pinSalt: undefined,
    pinHash: undefined,
    recoveryHash: undefined,
  });
}

beforeEach(reset);

describe("validatePin", () => {
  it("rejects non-numeric, too short, and too long", () => {
    expect(validatePin("12a4")).toBe("not-numeric");
    expect(validatePin("123")).toBe("too-short");
    expect(validatePin("123456789")).toBe("too-long");
  });

  it("accepts 4–8 digits", () => {
    expect(validatePin("1234")).toBeNull();
    expect(validatePin("12345678")).toBeNull();
  });
});

describe("digest", () => {
  it("is deterministic for the same secret and salt", () => {
    expect(digest("1234", "abcd")).toBe(digest("1234", "abcd"));
  });

  it("changes with the salt, so a stolen digest is not portable", () => {
    expect(digest("1234", "abcd")).not.toBe(digest("1234", "abce"));
  });

  it("changes with the secret", () => {
    expect(digest("1234", "abcd")).not.toBe(digest("1235", "abcd"));
  });
});

describe("newSalt / newRecoveryCode", () => {
  it("generates different values each call", () => {
    expect(newSalt()).not.toBe(newSalt());
    expect(newRecoveryCode()).not.toBe(newRecoveryCode());
  });

  it("formats the recovery code as XXXX-XXXX", () => {
    expect(newRecoveryCode()).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });
});

describe("normalizeRecoveryCode", () => {
  it("ignores case and separators", () => {
    expect(normalizeRecoveryCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeRecoveryCode("ABCD EFGH")).toBe("ABCDEFGH");
  });
});

describe("enable / verify", () => {
  it("stores a digest, never the PIN", () => {
    const { recoveryCode } = enableLock("1234");
    expect(lockEnabled()).toBe(true);
    expect(hasPin()).toBe(true);
    expect(JSON.stringify({ recoveryCode })).not.toContain("1234");
    expect(checkPin("1234")).toBe(true);
  });

  it("rejects the wrong PIN", () => {
    enableLock("1234");
    expect(checkPin("4321")).toBe(false);
  });

  it("accepts the recovery code and rejects a wrong one", () => {
    const { recoveryCode } = enableLock("1234");
    expect(checkRecoveryCode(recoveryCode)).toBe(true);
    expect(checkRecoveryCode("ZZZZ-ZZZZ")).toBe(false);
  });

  it("accepts the recovery code case-insensitively and without the dash", () => {
    const { recoveryCode } = enableLock("1234");
    expect(checkRecoveryCode(normalizeRecoveryCode(recoveryCode))).toBe(true);
    expect(checkRecoveryCode(recoveryCode.toLowerCase())).toBe(true);
  });
});

describe("changePin", () => {
  it("requires the current PIN", () => {
    enableLock("1234");
    expect(changePin("9999", "5678")).toBe(false);
    expect(checkPin("1234")).toBe(true);
  });

  it("replaces the PIN and invalidates the old one", () => {
    enableLock("1234");
    expect(changePin("1234", "5678")).toBe(true);
    expect(checkPin("1234")).toBe(false);
    expect(checkPin("5678")).toBe(true);
  });

  it("can be authorised by the recovery code instead of the PIN", () => {
    const { recoveryCode } = enableLock("1234");
    expect(changePin(recoveryCode, "5678")).toBe(true);
    expect(checkPin("5678")).toBe(true);
  });
});

describe("issueRecoveryCode", () => {
  it("needs the current PIN", () => {
    enableLock("1234");
    expect(issueRecoveryCode("0000")).toBeNull();
  });

  it("rotates the recovery code: the old one stops working", () => {
    const first = enableLock("1234").recoveryCode;
    const second = issueRecoveryCode("1234");
    expect(second).toBeTruthy();
    expect(checkRecoveryCode(first)).toBe(false);
    expect(checkRecoveryCode(second!)).toBe(true);
  });
});

describe("resetPinWithRecovery", () => {
  it("needs the right recovery code", () => {
    enableLock("1234");
    expect(resetPinWithRecovery("ZZZZ-ZZZZ", "5678")).toBe(false);
  });

  it("sets a new PIN when the recovery code matches", () => {
    const { recoveryCode } = enableLock("1234");
    expect(resetPinWithRecovery(recoveryCode, "5678")).toBe(true);
    expect(checkPin("5678")).toBe(true);
    expect(checkPin("1234")).toBe(false);
  });
});

describe("disableLock", () => {
  it("refuses without the PIN and leaves the lock on", () => {
    enableLock("1234");
    expect(disableLock("0000")).toBe(false);
    expect(lockEnabled()).toBe(true);
    expect(hasPin()).toBe(true);
  });

  it("clears the stored secrets when the PIN matches", () => {
    enableLock("1234");
    expect(disableLock("1234")).toBe(true);
    expect(lockEnabled()).toBe(false);
    expect(hasPin()).toBe(false);
  });
});
