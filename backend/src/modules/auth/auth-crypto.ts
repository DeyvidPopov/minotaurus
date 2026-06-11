// Shared impure crypto primitives for the auth verification flows
// (registration, password-reset, email-change, account-deletion).
//
// The pure expiry/cooldown/attempt/password/normalization decisions live in
// registration.engine.ts and stay side-effect-free; this module owns the bcrypt
// / sha256 / CSPRNG side effects those flows were each duplicating verbatim.
// Splitting them here (rather than into the engine) keeps the engine's
// no-crypto, no-IO contract intact while removing the byte-for-byte duplication.
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { generateNumericCode } from "./registration/registration.engine.js";

/** bcrypt work factor for verification codes (and the timing-equalizer hash). */
export const BCRYPT_COST = 10;

// Precomputed bcrypt hash used to equalize response timing on paths that would
// otherwise skip the (deliberately slow) bcrypt compare — so an attacker can't
// tell "record exists" from "doesn't" by latency. The hashed value is
// irrelevant; only the work factor matters, and a real code never matches it.
export const DUMMY_BCRYPT_HASH = bcrypt.hashSync("timing-equalizer", BCRYPT_COST);

/** CSPRNG-backed 6-digit verification code (zero-padded). */
export function generateCode(): string {
  return generateNumericCode((maxExclusive) => crypto.randomInt(maxExclusive));
}

/** bcrypt-hash a verification code for storage (plaintext codes are never persisted). */
export function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, BCRYPT_COST);
}

/** Compare a candidate code against its stored bcrypt hash. */
export function verifyCode(code: string, codeHash: string): Promise<boolean> {
  return bcrypt.compare(code, codeHash);
}

/** High-entropy URL-safe handoff token, returned to the client once and never stored. */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Fast sha256 hash for storing a (non-brute-forceable) high-entropy token. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
