// Orchestration for the multi-step registration flow.
//
// This layer owns the I/O the pure engine deliberately avoids: Prisma reads/
// writes, the CSPRNG, bcrypt/sha256 hashing, the email send, and the wall clock.
// All policy decisions (expiry, cooldown, attempts, password strength) come from
// registration.engine.ts so they stay deterministic and unit-tested.
//
// Security invariants enforced here:
//  - Plaintext codes/tokens are NEVER persisted (only bcrypt/sha256 hashes).
//  - `start`/`resend` are enumeration-neutral for already-verified accounts.
//  - No User is created — and no JWT issued — until verify + complete succeed.
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { HttpError } from "../../../utils/response.js";
import { signToken } from "../../../middleware/auth.js";
import { getEmailService, type EmailService } from "../../email/email.service.js";
import { toPublicUser } from "../auth.controller.js";
import {
  BCRYPT_COST,
  DUMMY_BCRYPT_HASH,
  generateCode,
  generateSecureToken,
  hashCode,
  hashToken,
  verifyCode,
} from "../auth-crypto.js";
import {
  CODE_TTL_MINUTES,
  MAX_VERIFY_ATTEMPTS,
  codeExpiryFrom,
  evaluatePasswordStrength,
  isExpired,
  isResendAllowed,
  isValidCodeFormat,
  normalizeEmail,
  normalizeName,
  registrationTokenExpiryFrom,
  resendAvailableFrom,
  resendRetryAfterSeconds,
} from "./registration.engine.js";

// ───────────────────────── injectable dependencies (for tests) ─────────────────────────
//
// Production uses the real Prisma singleton + the env-selected EmailService. A
// test can swap both for in-memory fakes (no DB, no mail) via
// __setRegistrationDeps — this keeps the orchestration unit-testable while the
// pure decisions stay in the engine. `now` is still an explicit per-call param.
export interface RegistrationDeps {
  db: typeof prisma;
  email: EmailService;
}

let testDeps: RegistrationDeps | null = null;

/** TEST ONLY: override the DB + email dependencies. Pass null to restore defaults. */
export function __setRegistrationDeps(deps: RegistrationDeps | null): void {
  testDeps = deps;
}

function deps(): RegistrationDeps {
  return testDeps ?? { db: prisma, email: getEmailService() };
}

/** Mask an email for logs (keeps shape, hides the local part). */
function maskForLog(email: string): string {
  return email.replace(/(.).*(@.*)/, "$1***$2");
}

/** Scalar, secret-free audit log line. */
function logRegistration(event: string, fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(`[auth] registration ${event}`, fields);
}

// ───────────────────────── start ─────────────────────────

export interface StartInput {
  firstName: string;
  lastName: string;
  email: string;
}

export interface StartResult {
  email: string;
  resendAvailableAt: Date;
}

/**
 * Begin (or restart) a pending registration.
 *
 * If a COMPLETED account already owns this email, we reject with 409 EMAIL_TAKEN
 * so the wizard can stop the user on the account-details step instead of sending
 * them to verify a code that will never arrive. This deliberately reveals account
 * existence at signup — the standard registration tradeoff; the other steps
 * (resend / verify / complete) and login remain neutral/generic. A "completed
 * account" is a `User` row; pending/incomplete registrations live only in
 * `EmailVerification` (no `User`), so they still proceed via the normal path.
 */
export async function startRegistration(input: StartInput, now = new Date()): Promise<StartResult> {
  const { db, email: mailer } = deps();
  const email = normalizeEmail(input.email);
  const firstName = normalizeName(input.firstName);
  const lastName = normalizeName(input.lastName);

  // Opportunistic cleanup of an expired pending record for this email.
  await db.emailVerification.deleteMany({
    where: { email, expiresAt: { lt: now }, verifiedAt: null },
  });

  const existingUser = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (existingUser) {
    logRegistration("start.duplicate", { email: maskForLog(email) });
    throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists");
  }

  const code = generateCode();
  const codeHash = await hashCode(code);
  const expiresAt = codeExpiryFrom(now);
  const resendAvailableAt = resendAvailableFrom(now);

  const record = await db.emailVerification.upsert({
    where: { email },
    create: {
      email,
      firstName,
      lastName,
      codeHash,
      expiresAt,
      attempts: 0,
      resendCount: 0,
      resendAvailableAt,
      verifiedAt: null,
      registrationTokenHash: null,
      registrationTokenExpiresAt: null,
    },
    update: {
      // Restart the flow: new identity, new code, reset counters/verification.
      firstName,
      lastName,
      codeHash,
      expiresAt,
      attempts: 0,
      resendAvailableAt,
      verifiedAt: null,
      registrationTokenHash: null,
      registrationTokenExpiresAt: null,
    },
  });

  await mailer.sendVerificationCode({
    email,
    code,
    firstName,
    expiresInMinutes: CODE_TTL_MINUTES,
  });

  logRegistration("start", { id: record.id, expiresInMinutes: CODE_TTL_MINUTES });
  return { email, resendAvailableAt };
}

// ───────────────────────── verify ─────────────────────────

export interface VerifyInput {
  email: string;
  code: string;
}

export interface VerifyResult {
  registrationToken: string;
  expiresAt: Date;
}

export async function verifyEmail(input: VerifyInput, now = new Date()): Promise<VerifyResult> {
  const { db } = deps();
  const email = normalizeEmail(input.email);
  const code = input.code.trim();

  // Generic INVALID_CODE for malformed input and unknown email alike (no enum).
  if (!isValidCodeFormat(code)) {
    throw new HttpError(400, "INVALID_CODE", "The verification code is invalid");
  }

  const record = await db.emailVerification.findUnique({ where: { email } });
  if (!record) {
    // Run a dummy compare so the no-record path costs the same as the real
    // (bcrypt) path — otherwise timing reveals whether a pending record exists.
    await verifyCode(code, DUMMY_BCRYPT_HASH);
    throw new HttpError(400, "INVALID_CODE", "The verification code is invalid");
  }

  if (isExpired(record.expiresAt, now)) {
    throw new HttpError(410, "CODE_EXPIRED", "The verification code has expired. Request a new one.");
  }

  // Atomically reserve one attempt BEFORE the slow bcrypt compare. The conditional
  // increment (only when attempts < cap) is the real admission gate: concurrent
  // requests can't all slip past a stale read of `attempts` (TOCTOU), so the cap
  // bounds real guesses even under a parallel burst. count === 0 ⇒ cap reached.
  const reserved = await db.emailVerification.updateMany({
    where: { id: record.id, attempts: { lt: MAX_VERIFY_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count === 0) {
    throw new HttpError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many incorrect attempts. Request a new code.",
    );
  }

  const matches = await verifyCode(code, record.codeHash);
  if (!matches) {
    throw new HttpError(400, "INVALID_CODE", "The verification code is invalid");
  }

  // Success → mint the short-lived registration token (store only its hash).
  const registrationToken = generateSecureToken();
  const registrationTokenExpiresAt = registrationTokenExpiryFrom(now);
  await db.emailVerification.update({
    where: { id: record.id },
    data: {
      verifiedAt: record.verifiedAt ?? now,
      attempts: 0,
      registrationTokenHash: hashToken(registrationToken),
      registrationTokenExpiresAt,
    },
  });

  logRegistration("verify", { id: record.id });
  return { registrationToken, expiresAt: registrationTokenExpiresAt };
}

// ───────────────────────── complete ─────────────────────────

export interface CompleteInput {
  registrationToken: string;
  password: string;
  confirmPassword: string;
}

export interface CompleteResult {
  token: string;
  user: ReturnType<typeof toPublicUser>;
}

export async function completeRegistration(
  input: CompleteInput,
  now = new Date(),
): Promise<CompleteResult> {
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

  const tokenHash = hashToken(input.registrationToken.trim());
  const record = await db.emailVerification.findFirst({
    where: { registrationTokenHash: tokenHash },
  });
  if (!record || !record.verifiedAt) {
    throw new HttpError(401, "INVALID_REGISTRATION_TOKEN", "Invalid registration token");
  }
  if (isExpired(record.registrationTokenExpiresAt, now)) {
    throw new HttpError(
      410,
      "REGISTRATION_TOKEN_EXPIRED",
      "Registration session expired. Please start again.",
    );
  }

  // Race guard: a verified user for this email may have appeared meanwhile.
  const existingUser = await db.user.findFirst({
    where: { email: { equals: record.email, mode: "insensitive" } },
  });
  if (existingUser) {
    await db.emailVerification.delete({ where: { id: record.id } }).catch(() => {});
    throw new HttpError(409, "EMAIL_TAKEN", "Email is already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const userCount = await db.user.count();

  let user: User;
  try {
    user = await db.user.create({
      data: {
        email: record.email,
        passwordHash,
        firstName: record.firstName,
        lastName: record.lastName,
        role: userCount === 0 ? "ADMIN" : "ENGINEER",
        emailVerifiedAt: now,
      },
    });
  } catch (err) {
    // Unique-violation race on email → map to the same user-facing conflict.
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
      throw new HttpError(409, "EMAIL_TAKEN", "Email is already registered");
    }
    throw err;
  }

  // Consume the pending record so the token can't be replayed.
  await db.emailVerification.delete({ where: { id: record.id } }).catch(() => {});

  const token = signToken({ userId: user.id, email: user.email });
  logRegistration("complete", { userId: user.id });
  return { token, user: toPublicUser(user) };
}

// ───────────────────────── resend ─────────────────────────

export interface ResendInput {
  email: string;
}

export interface ResendResult {
  resendAvailableAt: Date;
}

export async function resendCode(input: ResendInput, now = new Date()): Promise<ResendResult> {
  const { db, email: mailer } = deps();
  const email = normalizeEmail(input.email);
  const record = await db.emailVerification.findUnique({ where: { email } });

  // No pending registration (or already verified account) → neutral response.
  if (!record || record.verifiedAt) {
    return { resendAvailableAt: resendAvailableFrom(now) };
  }

  if (!isResendAllowed(record.resendAvailableAt, now)) {
    throw new HttpError(429, "RESEND_COOLDOWN", "Please wait before requesting another code", {
      retryAfterSeconds: resendRetryAfterSeconds(record.resendAvailableAt, now),
    });
  }

  const code = generateCode();
  const codeHash = await hashCode(code);
  const expiresAt = codeExpiryFrom(now);
  const resendAvailableAt = resendAvailableFrom(now);

  await db.emailVerification.update({
    where: { id: record.id },
    data: {
      codeHash, // invalidates the previous code
      expiresAt,
      attempts: 0,
      resendCount: { increment: 1 },
      resendAvailableAt,
    },
  });

  await mailer.sendVerificationCode({
    email,
    code,
    firstName: record.firstName,
    expiresInMinutes: CODE_TTL_MINUTES,
  });

  logRegistration("resend", { id: record.id });
  return { resendAvailableAt };
}
