/** What to do with an account after the first IMAP handshake.
 *
 *  Adding a mailbox used to end with "密码已安全存入系统钥匙串" — a claim
 *  about storage, not about whether the mailbox is reachable. A typo'd
 *  password then surfaced as silence for up to a minute and a red banner in
 *  the list. The reason codes come from `getSyncState()`.
 */

export type VerifyOutcome =
  /** Credentials accepted, mail is importable. */
  | "connected"
  /** Could not reach the server — keep the account, let the loop retry. */
  | "retry-later"
  /** The server rejected the credentials — do not keep a broken mailbox. */
  | "reject";

/** Reason codes surfaced by the Rust sync layer. */
export type SyncErrorCode =
  | "auth_failed"
  | "missing_credentials"
  | "network"
  | "sync_failed"
  | null;

export function classifyVerifyResult(
  code: SyncErrorCode | string | null | undefined,
): VerifyOutcome {
  switch (code) {
    case null:
    case undefined:
    case "":
      return "connected";
    case "auth_failed":
    case "missing_credentials":
      return "reject";
    case "network":
    case "sync_failed":
      return "retry-later";
    default:
      // Unknown code: keep the account. Deleting a mailbox the user just
      // typed in is far worse than letting the next sync retry.
      return "retry-later";
  }
}
