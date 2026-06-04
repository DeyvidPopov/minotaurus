// Pure, deterministic logic for the multi-step registration flow.
//
// Everything here is a pure function over its inputs — no Prisma, no I/O, no
// implicit clock (callers pass `now`), no crypto side effects (code generation
// takes an injected RNG). This mirrors the analysis-engine convention: it makes
// expiry / cooldown / attempt / password decisions unit-testable without a DB or
// a real timer. Hashing of codes/tokens (bcrypt/crypto) lives in the service.

/** Code lifetime: 10 minutes. */
export const CODE_TTL_MINUTES = 10;
/** Resend cooldown: 30 seconds. */
export const RESEND_COOLDOWN_SECONDS = 30;
/** Max failed verify attempts before a code is burned and a resend is required. */
export const MAX_VERIFY_ATTEMPTS = 5;
/** Short-lived verify→complete handoff token lifetime: 15 minutes. */
export const REGISTRATION_TOKEN_TTL_MINUTES = 15;
/** Minimum password length for the multi-step flow (raises the legacy min-6). */
export const PASSWORD_MIN_LENGTH = 8;

/** Trim + lowercase so duplicate detection and lookups are case-insensitive. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Trim a display name and collapse internal whitespace. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** A valid verification code is exactly 6 ASCII digits. */
export function isValidCodeFormat(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

/**
 * Generate a 6-digit numeric code, zero-padded. `randomInt(maxExclusive)` must
 * return an integer in [0, maxExclusive). The service injects a CSPRNG
 * (crypto.randomInt); tests inject a deterministic stub.
 */
export function generateNumericCode(randomInt: (maxExclusive: number) => number): string {
  const n = randomInt(1_000_000); // 0 .. 999999
  return String(n).padStart(6, "0");
}

/** Code expiry timestamp given the issue time. */
export function codeExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + CODE_TTL_MINUTES * 60_000);
}

/** Earliest time a resend is permitted given the last send time. */
export function resendAvailableFrom(now: Date): Date {
  return new Date(now.getTime() + RESEND_COOLDOWN_SECONDS * 1_000);
}

/** Registration-token expiry timestamp given the verify time. */
export function registrationTokenExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + REGISTRATION_TOKEN_TTL_MINUTES * 60_000);
}

/** True if `expiresAt` is at or before `now`. */
export function isExpired(expiresAt: Date | null | undefined, now: Date): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() <= now.getTime();
}

/** True once the failed-attempt count has reached the cap. */
export function hasExceededAttempts(attempts: number): boolean {
  return attempts >= MAX_VERIFY_ATTEMPTS;
}

/** True if a resend is allowed now (cooldown elapsed). */
export function isResendAllowed(resendAvailableAt: Date, now: Date): boolean {
  return now.getTime() >= resendAvailableAt.getTime();
}

/** Whole seconds the caller must wait before resending (0 if allowed now). */
export function resendRetryAfterSeconds(resendAvailableAt: Date, now: Date): number {
  const ms = resendAvailableAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 1_000);
}

export interface PasswordStrength {
  ok: boolean;
  /** Machine-readable list of unmet rules (empty when ok). */
  failures: string[];
}

/**
 * Policy: at least PASSWORD_MIN_LENGTH chars, at least one letter and one digit.
 * Returns the unmet rules so the client can render specific guidance.
 */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  const failures: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) failures.push("MIN_LENGTH");
  if (!/[A-Za-z]/.test(password)) failures.push("REQUIRE_LETTER");
  if (!/\d/.test(password)) failures.push("REQUIRE_NUMBER");
  return { ok: failures.length === 0, failures };
}
