/** Account-add verification: what to do with each sync reason code. */

import { describe, expect, it } from "vitest";
import { classifyVerifyResult } from "./account-verify";

describe("classifyVerifyResult", () => {
  it("treats a clean sync as connected", () => {
    expect(classifyVerifyResult(null)).toBe("connected");
    expect(classifyVerifyResult(undefined)).toBe("connected");
    expect(classifyVerifyResult("")).toBe("connected");
  });

  it("rejects an account whose credentials the server refused", () => {
    expect(classifyVerifyResult("auth_failed")).toBe("reject");
    expect(classifyVerifyResult("missing_credentials")).toBe("reject");
  });

  it("keeps the account when the server is unreachable", () => {
    expect(classifyVerifyResult("network")).toBe("retry-later");
    expect(classifyVerifyResult("sync_failed")).toBe("retry-later");
  });

  it("keeps the account for codes it does not recognise", () => {
    // Deleting a mailbox the user just typed in is worse than retrying.
    expect(classifyVerifyResult("quota_exceeded")).toBe("retry-later");
    expect(classifyVerifyResult("something_new")).toBe("retry-later");
  });
});
