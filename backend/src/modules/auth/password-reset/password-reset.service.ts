// Orchestration for the forgot-password flow.
//
// Structurally a sibling of the multi-step registration service: request →
// verify → reset, plus resend. This layer owns the I/O the pure engine avoids
// (Prisma, CSPRNG, bcrypt/sha256, email, the wall clock); every policy decision
// (expiry, cooldown, attempts, password strength, code/email normalization) is
// reused from registration.engine.ts so it stays deterministic and unit-tested.
//
// Security invariants enforced here:
//  - Plaintext codes/tokens are NEVER persisted (only bcrypt/sha256 hashes).
//  - The request step is ENUMERATION-NEUTRAL: an unknown email gets the same
//    response (and equivalent bcrypt work) as a known one, and no mail is sent.
//  - Email delivery is best-effort: a provider failure is logged but never
//    propagated, so a misconfigured mailer can't make a known account observable.
//  - The reset token is single-use: the pending row is deleted on success.
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma.js";
import { HttpError } from "../../../utils/response.js";
import {
  getEmailService,
  type EmailService,
  type SendPasswordResetCodeInput,
} from "../../email/email.service.js";
import {
  CODE_TTL_MINUTES,
  MAX_VERIFY_ATTEMPTS,
  codeExpiryFrom,
  evaluatePasswordStrength,
  generateNumericCode,
  isExpired,
  isResendAllowed,
  isValidCodeFormat,
  normalizeEmail,
  registrationTokenExpiryFrom as resetTokenExpiryFrom,
  resendAvailableFrom,
  resendRetryAfterSeconds,
} from "../registration/registration.engine.js";

const BCRYPT_COST = 10;

// Equalizes response timing on the no-account path (which skips the real bcrypt
// hash of a code) so latency can't distinguish "account exists" from "doesn't".
const DUMMY_BCRYPT_HASH = bcrypt.hashSync("timing-equalizer", BCRYPT_COST);

// ───────────────────────── injectable dependencies (for tests) ─────────────────────────

export interface PasswordResetDeps {
  db: typeof prisma;
  email: EmailService;
}

let testDeps: PasswordResetDeps | null = null;

/** TEST ONLY: override the DB + email dependencies. Pass null to restore defaults. */
export function __setPasswordResetDeps(deps: PasswordResetDeps | null): void {
  testDeps = deps;
}

function deps(): PasswordResetDeps {
  return testDeps ?? { db: prisma, email: getEmailService() };
}

// ───────────────────────── crypto helpers (impure, kept out of the engine) ─────────────────────────

/** CSPRNG-backed 6-digit code. */
function generateCode(): string {
  return generateNumericCode((maxExclusive) => crypto.randomInt(maxExclusive));
}

function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, BCRYPT_COST);
}

function verifyCode(code: string, codeHash: string): Promise<boolean> {
  return bcrypt.compare(code, codeHash);
}

/** High-entropy handoff token (returned once to the client). */
function generateResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Fast hash is fine: the token is not brute-forceable. */
function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Scalar, secret-free audit log line. */
function logReset(event: string, fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(`[auth] password-reset ${event}`, fields);
}

/**
 * Best-effort send: a provider failure (503/502) is logged but swallowed so the
 * request/resend responses stay enumeration-neutral even when mail is down. The
 * user-facing copy is always "if an account exists, we sent a code" regardless.
 */
async function safeSend(
  mailer: EmailService,
  input: SendPasswordResetCodeInput,
): Promise<void> {
  try {
    await mailer.sendPasswordResetCode(input);
  } catch (err) {
    logReset("send.failed", { error: err instanceof Error ? err.name : "unknown" });
  }
}

// ───────────────────────── request ─────────────────────────

export interface RequestResetInput {
  email: string;
}

export interface RequestResetResult {
  resendAvailableAt: Date;
}

/**
 * Begin (or restart) a password reset. Enumeration-neutral: the response is
 * identical whether or not an account owns the email. Only a real account gets a
 * pending record + an emailed code; the unknown path still spends a bcrypt hash
 * to equalize timing and sends nothing.
 */
export async function requestPasswordReset(
  input: RequestResetInput,
  now = new Date(),
): Promise<RequestResetResult> {
  const { db, email: mailer } = deps();
  const email = normalizeEmail(input.email);
  const resendAvailableAt = resendAvailableFrom(now);

  // Opportunistic cleanup of an expired pending reset for this email.
  await db.passwordReset.deleteMany({
    where: { email, expiresAt: { lt: now }, verifiedAt: null },
  });

  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  if (!user) {
    // Timing equalizer — same dominant (bcrypt) cost as the real path; discarded.
    await hashCode(generateCode());
    logReset("request.unknown", {});
    return { resendAvailableAt };
  }

  const code = generateCode();
  const codeHash = await hashCode(code);
  const expiresAt = codeExpiryFrom(now);

  const record = await db.passwordReset.upsert({
    where: { email },
    create: {
      email,
      codeHash,
      expiresAt,
      attempts: 0,
      resendCount: 0,
      resendAvailableAt,
      verifiedAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
    update: {
      // Restart the flow: new code, reset counters/verification.
      codeHash,
      expiresAt,
      attempts: 0,
      resendAvailableAt,
      verifiedAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });

  await safeSend(mailer, {
    email,
    code,
    firstName: user.firstName,
    expiresInMinutes: CODE_TTL_MINUTES,
  });

  logReset("request", { id: record.id });
  return { resendAvailableAt };
}

// ───────────────────────── verify ─────────────────────────

export interface VerifyResetInput {
  email: string;
  code: string;
}

export interface VerifyResetResult {
  resetToken: string;
  expiresAt: Date;
}

export async function verifyResetCode(
  input: VerifyResetInput,
  now = new Date(),
): Promise<VerifyResetResult> {
  const { db } = deps();
  const email = normalizeEmail(input.email);
  const code = input.code.trim();

  if (!isValidCodeFormat(code)) {
    throw new HttpError(400, "INVALID_CODE", "The reset code is invalid");
  }

  const record = await db.passwordReset.findUnique({ where: { email } });
  if (!record) {
    // Dummy compare so the no-record path costs the same as the real bcrypt path.
    await verifyCode(code, DUMMY_BCRYPT_HASH);
    throw new HttpError(400, "INVALID_CODE", "The reset code is invalid");
  }

  if (isExpired(record.expiresAt, now)) {
    throw new HttpError(410, "CODE_EXPIRED", "The reset code has expired. Request a new one.");
  }

  // Atomically reserve one attempt BEFORE the slow bcrypt compare (no TOCTOU
  // under concurrent requests). count === 0 ⇒ cap reached.
  const reserved = await db.passwordReset.updateMany({
    where: { id: record.id, attempts: { lt: MAX_VERIFY_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count === 0) {
    throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many incorrect attempts. Request a new code.");
  }

  const matches = await verifyCode(code, record.codeHash);
  if (!matches) {
    throw new HttpError(400, "INVALID_CODE", "The reset code is invalid");
  }

  // Success → mint the short-lived reset token (store only its hash).
  const resetToken = generateResetToken();
  const resetTokenExpiresAt = resetTokenExpiryFrom(now);
  await db.passwordReset.update({
    where: { id: record.id },
    data: {
      verifiedAt: record.verifiedAt ?? now,
      attempts: 0,
      resetTokenHash: hashResetToken(resetToken),
      resetTokenExpiresAt,
    },
  });

  logReset("verify", { id: record.id });
  return { resetToken, expiresAt: resetTokenExpiresAt };
}

// ───────────────────────── reset ─────────────────────────

export interface ResetPasswordInput {
  resetToken: string;
  password: string;
  confirmPassword: string;
}

export interface ResetPasswordResult {
  email: string;
}

/**
 * Consume a verified reset token and set the new password. Does NOT log the user
 * in — the client redirects to /login on success (deliberate: a reset should not
 * silently establish a session). The pending row is deleted so the token can't
 * be replayed.
 */
export async function resetPassword(
  input: ResetPasswordInput,
  now = new Date(),
): Promise<ResetPasswordResult> {
  const { db } = deps();
  if (input.password !== input.confirmPassword) {
    throw new HttpError(400, "PASSWORD_MISMATCH", "Passwords do not match");
  }
  const strength = evaluatePasswordStrength(input.password);
  if (!strength.ok) {
    throw new HttpError(400, "WEAK_PASSWORD", "Password does not meet the requirements", {
      failures: strength.failures,
    });
  }

  const tokenHash = hashResetToken(input.resetToken.trim());
  const record = await db.passwordReset.findFirst({ where: { resetTokenHash: tokenHash } });
  if (!record || !record.verifiedAt) {
    throw new HttpError(401, "INVALID_RESET_TOKEN", "Invalid reset token");
  }
  if (isExpired(record.resetTokenExpiresAt, now)) {
    throw new HttpError(410, "RESET_TOKEN_EXPIRED", "Reset session expired. Please start again.");
  }

  const user = await db.user.findFirst({
    where: { email: { equals: record.email, mode: "insensitive" } },
  });
  if (!user) {
    // Account disappeared between request and reset — consume the row, stay generic.
    await db.passwordReset.delete({ where: { id: record.id } }).catch(() => {});
    throw new HttpError(401, "INVALID_RESET_TOKEN", "Invalid reset token");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  await db.user.update({
    where: { id: user.id },
    // Completing a reset proves email ownership, so backfill emailVerifiedAt if unset.
    data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now },
  });

  // Consume the pending record so the token can't be replayed.
  await db.passwordReset.delete({ where: { id: record.id } }).catch(() => {});

  logReset("reset", { userId: user.id });
  return { email: user.email };
}

// ───────────────────────── resend ─────────────────────────

export interface ResendResetInput {
  email: string;
}

export interface ResendResetResult {
  resendAvailableAt: Date;
}

export async function resendResetCode(
  input: ResendResetInput,
  now = new Date(),
): Promise<ResendResetResult> {
  const { db, email: mailer } = deps();
  const email = normalizeEmail(input.email);
  const record = await db.passwordReset.findUnique({ where: { email } });

  // No pending reset (or already verified) → neutral response, nothing re-issued.
  if (!record || record.verifiedAt) {
    return { resendAvailableAt: resendAvailableFrom(now) };
  }

  if (!isResendAllowed(record.resendAvailableAt, now)) {
    throw new HttpError(429, "RESEND_COOLDOWN", "Please wait before requesting another code", {
      retryAfterSeconds: resendRetryAfterSeconds(record.resendAvailableAt, now),
    });
  }

  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (!user) {
    // Orphaned record (account removed) → neutral; don't re-issue.
    return { resendAvailableAt: resendAvailableFrom(now) };
  }

  const code = generateCode();
  const codeHash = await hashCode(code);
  const expiresAt = codeExpiryFrom(now);
  const resendAvailableAt = resendAvailableFrom(now);

  await db.passwordReset.update({
    where: { id: record.id },
    data: {
      codeHash, // invalidates the previous code
      expiresAt,
      attempts: 0,
      resendCount: { increment: 1 },
      resendAvailableAt,
    },
  });

  await safeSend(mailer, {
    email,
    code,
    firstName: user.firstName,
    expiresInMinutes: CODE_TTL_MINUTES,
  });

  logReset("resend", { id: record.id });
  return { resendAvailableAt };
}
