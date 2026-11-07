/** Local app lock.
 *
 *  Threat model, stated plainly because the UI repeats it: this stops a
 *  person who picks up an unlocked laptop from reading the mailbox. It does
 *  NOT encrypt anything on disk — the SQLite file and the prefs JSON are
 *  readable by anyone with the account's file access, and deleting the
 *  prefs file removes the lock. A 4–8 digit PIN has too little entropy to
 *  be a cryptographic secret, so we deliberately do not pretend otherwise
 *  either in the code or in the copy.
 *
 *  What it does buy: accidentally handing someone the app, screen-sharing,
 *  and a borrowed machine.
 *
 *  PIN and the one-time recovery code are stored as salted digests so the
 *  plaintext is never written to disk. `digest` is FNV-1a, stretched; it is
 *  an obfuscation, not a KDF.
 */

import { createSignal } from "solid-js";
import { appSettings, setAppSettings } from "../stores/ui";

const MIN_PIN = 4;
const MAX_PIN = 8;
/** Enough stretching that a stolen file is not instantly readable. */
const STRETCH_ROUNDS = 4096;

export type PinProblem = "too-short" | "too-long" | "not-numeric";

/** Validate before hashing so the UI can explain what is wrong. */
export function validatePin(pin: string): PinProblem | null {
  const trimmed = pin.trim();
  if (!/^\d+$/.test(trimmed)) return "not-numeric";
  if (trimmed.length < MIN_PIN) return "too-short";
  if (trimmed.length > MAX_PIN) return "too-long";
  return null;
}

export const PIN_MIN = MIN_PIN;
export const PIN_MAX = MAX_PIN;

/** FNV-1a, iterated. Deterministic so it can be unit-tested. */
export function digest(secret: string, salt: string): string {
  let h = 0x811c9dc5;
  const input = `${salt}\u0000${secret}`;
  for (let round = 0; round < STRETCH_ROUNDS; round++) {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i) + round;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  // Two more passes over the mixed value so the output uses the full
  // 32 bits rather than the low FNV byte.
  let out = "";
  let v = h;
  for (let i = 0; i < 4; i++) {
    v = Math.imul(v ^ (v >>> 13), 0x5bd1e995) >>> 0;
    out += v.toString(16).padStart(8, "0");
  }
  return out;
}

/** 8 characters from an unambiguous alphabet (no O/0, I/1). */
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Cryptographically random when the platform has it, `Math.random` only as
 *  a last resort (deterministic test doubles). */
export function newRecoveryCode(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]!);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function newSalt(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Recovery codes are compared case- and separator-insensitively. */
export function normalizeRecoveryCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* ── Lock state ──────────────────────────────────────────────── */

/** True while the lock screen is covering the app. */
export const [appLocked, setAppLocked] = createSignal(false);

export function lockEnabled(): boolean {
  return appSettings.preferences.security?.appLock === true;
}

/** Called once at boot, after settings hydrate. A no-op unless the user
 *  turned the lock on. */
export function applyLockOnBoot(): void {
  if (lockEnabled()) setAppLocked(true);
}

export function lockNow(): void {
  if (lockEnabled()) setAppLocked(true);
}

export function unlock(): void {
  setAppLocked(false);
}

/* ── PIN management ──────────────────────────────────────────── */

function securityState() {
  return appSettings.preferences.security;
}

export function hasPin(): boolean {
  const s = securityState();
  return !!s?.pinSalt && !!s?.pinHash;
}

export function checkPin(pin: string): boolean {
  const s = securityState();
  if (!s?.pinSalt || !s.pinHash) return false;
  return digest(pin.trim(), s.pinSalt) === s.pinHash;
}

export function checkRecoveryCode(code: string): boolean {
  const s = securityState();
  if (!s?.pinSalt || !s.recoveryHash) return false;
  return (
    digest(normalizeRecoveryCode(code), `${s.pinSalt}:recovery`) ===
    s.recoveryHash
  );
}

export interface EnableLockResult {
  /** Shown exactly once, at setup. Never recoverable afterwards. */
  recoveryCode: string;
}

/** Turn the lock on and return the one-time recovery code. */
export function enableLock(pin: string): EnableLockResult {
  const salt = newSalt();
  const recoveryCode = newRecoveryCode();
  setAppSettings("preferences", "security", {
    appLock: true,
    pinSalt: salt,
    pinHash: digest(pin.trim(), salt),
    recoveryHash: digest(normalizeRecoveryCode(recoveryCode), `${salt}:recovery`),
  });
  return { recoveryCode };
}

/** Replace the PIN after verifying the current one (or the recovery code). */
export function changePin(
  currentSecret: string,
  nextPin: string,
): boolean {
  const authorized =
    checkPin(currentSecret) || checkRecoveryCode(currentSecret);
  if (!authorized) return false;
  const salt = securityState()?.pinSalt ?? newSalt();
  const recoveryCode = newRecoveryCode();
  setAppSettings("preferences", "security", {
    appLock: true,
    pinSalt: salt,
    pinHash: digest(nextPin.trim(), salt),
    recoveryHash: digest(
      normalizeRecoveryCode(recoveryCode),
      `${salt}:recovery`,
    ),
  });
  return true;
}

/** A fresh recovery code for the current PIN (issued at PIN change). */
export function issueRecoveryCode(pin: string): string | null {
  if (!checkPin(pin)) return null;
  const s = securityState();
  if (!s?.pinSalt) return null;
  const recoveryCode = newRecoveryCode();
  setAppSettings("preferences", "security", {
    ...s,
    recoveryHash: digest(
      normalizeRecoveryCode(recoveryCode),
      `${s.pinSalt}:recovery`,
    ),
  });
  return recoveryCode;
}

/** Requires the PIN so a passer-by cannot simply switch the lock off. */
export function disableLock(pin: string): boolean {
  if (!checkPin(pin)) return false;
  setAppSettings("preferences", "security", {
    appLock: false,
    pinSalt: undefined,
    pinHash: undefined,
    recoveryHash: undefined,
  });
  setAppLocked(false);
  return true;
}

/** Reset the PIN using the recovery code. Returns false if it was wrong. */
export function resetPinWithRecovery(
  code: string,
  nextPin: string,
): boolean {
  if (!checkRecoveryCode(code)) return false;
  const salt = newSalt();
  const recoveryCode = newRecoveryCode();
  setAppSettings("preferences", "security", {
    appLock: true,
    pinSalt: salt,
    pinHash: digest(nextPin.trim(), salt),
    recoveryHash: digest(
      normalizeRecoveryCode(recoveryCode),
      `${salt}:recovery`,
    ),
  });
  return true;
}
