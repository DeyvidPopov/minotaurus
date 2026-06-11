// Orchestration for the verified email-change flow (authenticated).
//
// Unlike registration/forgot-password, the actor is a known, logged-in user, so
// state is keyed by userId (one pending change per user). The shape is request →
// verify: the 6-digit code is sent to the NEW address, and the swap only happens
// once that code is verified — proving the user controls the new mailbox. On
// success the OLD address gets a security notice (anti-account-takeover).
//
// Reuses the registration engine's pure decision helpers (expiry/cooldown/attempt
// math, code gen, normalization). Invariants:
//  - Step-up auth: the current password is re-verified before a code is sent.
//  - Plaintext codes are NEVER persisted (only bcrypt hashes).
//  - The new address is uniqueness-checked at request AND re-checked at verify
//    (race-safe: a Prisma P2002 on the swap also maps to EMAIL_TAKEN).
import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma.js";
import { HttpError } from "../../../utils/response.js";
import {
  getEmailService,
  maskEmail,
  type EmailService,
  type SendEmailChangeCodeInput,
  type SendEmailChangeNoticeInput,
} from "../../email/email.service.js";
import { toPublicUser } from "../auth.controller.js";
import { DUMMY_BCRYPT_HASH, generateCode, hashCode, verifyCode } from "../auth-crypto.js";
import {
  CODE_TTL_MINUTES,
  MAX_VERIFY_ATTEMPTS,
  codeExpiryFrom,
  isExpired,
  isResendAllowed,
  isValidCodeFormat,
  normalizeEmail,
  resendAvailableFrom,
  resendRetryAfterSeconds,
} from "../registration/registration.engine.js";

// ───────────────────────── injectable dependencies (for tests) ─────────────────────────

export interface EmailChangeDeps {
  db: typeof prisma;
  email: EmailService;
}

let testDeps: EmailChangeDeps | null = null;

/** TEST ONLY: override the DB + email dependencies. Pass null to restore defaults. */
export function __setEmailChangeDeps(deps: EmailChangeDeps | null): void {
  testDeps = deps;
}

function deps(): EmailChangeDeps {
  return testDeps ?? { db: prisma, email: getEmailService() };
}

function logChange(event: string, fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(`[auth] email-change ${event}`, fields);
}

/** Notify the old address best-effort — a delivery failure must not fail the swap. */
async function safeNotice(mailer: EmailService, input: SendEmailChangeNoticeInput): Promise<void> {
  try {
    await mailer.sendEmailChangeNotice(input);
  } catch (err) {
    logChange("notice.failed", { error: err instanceof Error ? err.name : "unknown" });
  }
}

// ───────────────────────── request ─────────────────────────

export interface RequestChangeInput {
  userId: string;
  newEmail: string;
  currentPassword: string;
}

export interface RequestChangeResult {
  newEmail: string;
  resendAvailableAt: Date;
}

export async function requestEmailChange(
  input: RequestChangeInput,
  now = new Date(),
): Promise<RequestChangeResult> {
  const { db, email: mailer } = deps();

  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "User not found");

  // Step-up re-authentication before a sensitive identity change.
  const okPw = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!okPw) throw new HttpError(401, "INVALID_CREDENTIALS", "Current password is incorrect");

  const newEmail = normalizeEmail(input.newEmail);
  if (newEmail === user.email.toLowerCase()) {
    throw new HttpError(400, "SAME_EMAIL", "That's already your email address");
  }

  const taken = await db.user.findFirst({
    where: { id: { not: user.id }, email: { equals: newEmail, mode: "insensitive" } },
  });
  if (taken) throw new HttpError(409, "EMAIL_TAKEN", "That email is already in use");

  const code = generateCode();
  const codeHash = await hashCode(code);
  const expiresAt = codeExpiryFrom(now);
  const resendAvailableAt = resendAvailableFrom(now);

  await db.emailChange.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      newEmail,
      codeHash,
      expiresAt,
      attempts: 0,
      resendCount: 0,
      resendAvailableAt,
    },
    update: {
      // Restart the flow: possibly a different target, new code, reset counters.
      newEmail,
      codeHash,
      expiresAt,
      attempts: 0,
      resendAvailableAt,
    },
  });

  // Surface a real send failure (no enumeration concern here — the actor is
  // authenticated and is changing their OWN email).
  await mailer.sendEmailChangeCode({
    email: newEmail,
    code,
    firstName: user.firstName,
    expiresInMinutes: CODE_TTL_MINUTES,
  } satisfies SendEmailChangeCodeInput);

  logChange("request", { userId: user.id });
  return { newEmail, resendAvailableAt };
}

// ───────────────────────── verify ─────────────────────────

export interface VerifyChangeInput {
  userId: string;
  code: string;
}

export interface VerifyChangeResult {
  user: ReturnType<typeof toPublicUser>;
}

export async function verifyEmailChange(
  input: VerifyChangeInput,
  now = new Date(),
): Promise<VerifyChangeResult> {
  const { db, email: mailer } = deps();
  const code = input.code.trim();

  if (!isValidCodeFormat(code)) {
    throw new HttpError(400, "INVALID_CODE", "The confirmation code is invalid");
  }

  const record = await db.emailChange.findUnique({ where: { userId: input.userId } });
  if (!record) {
    await verifyCode(code, DUMMY_BCRYPT_HASH);
    throw new HttpError(400, "INVALID_CODE", "The confirmation code is invalid");
  }

  if (isExpired(record.expiresAt, now)) {
    throw new HttpError(410, "CODE_EXPIRED", "The confirmation code has expired. Request a new one.");
  }

  // Atomic attempt reservation before the bcrypt compare (no TOCTOU).
  const reserved = await db.emailChange.updateMany({
    where: { userId: input.userId, attempts: { lt: MAX_VERIFY_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count === 0) {
    throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many incorrect attempts. Request a new code.");
  }

  const matches = await verifyCode(code, record.codeHash);
  if (!matches) {
    throw new HttpError(400, "INVALID_CODE", "The confirmation code is invalid");
  }

  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "User not found");

  // Re-check uniqueness (someone may have claimed the address since request).
  const taken = await db.user.findFirst({
    where: { id: { not: user.id }, email: { equals: record.newEmail, mode: "insensitive" } },
  });
  if (taken) {
    await db.emailChange.delete({ where: { userId: user.id } }).catch(() => {});
    throw new HttpError(409, "EMAIL_TAKEN", "That email is already in use");
  }

  const oldEmail = user.email;
  let updated;
  try {
    updated = await db.user.update({
      where: { id: user.id },
      // The new address is verified by this very flow, so mark it verified.
      data: { email: record.newEmail, emailVerifiedAt: now },
    });
  } catch (err) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
      await db.emailChange.delete({ where: { userId: user.id } }).catch(() => {});
      throw new HttpError(409, "EMAIL_TAKEN", "That email is already in use");
    }
    throw err;
  }

  // Consume the pending record so the code can't be replayed.
  await db.emailChange.delete({ where: { userId: user.id } }).catch(() => {});

  // Security alert to the OLD address (best-effort).
  await safeNotice(mailer, {
    email: oldEmail,
    firstName: user.firstName,
    newEmailMasked: maskEmail(record.newEmail),
  });

  logChange("verify", { userId: user.id });
  return { user: toPublicUser(updated) };
}

// ───────────────────────── resend ─────────────────────────

export interface ResendChangeInput {
  userId: string;
}

export interface ResendChangeResult {
  newEmail: string;
  resendAvailableAt: Date;
}

export async function resendEmailChangeCode(
  input: ResendChangeInput,
  now = new Date(),
): Promise<ResendChangeResult> {
  const { db, email: mailer } = deps();
  const record = await db.emailChange.findUnique({ where: { userId: input.userId } });
  if (!record) {
    throw new HttpError(404, "NO_PENDING_CHANGE", "There is no email change in progress");
  }

  if (!isResendAllowed(record.resendAvailableAt, now)) {
    throw new HttpError(429, "RESEND_COOLDOWN", "Please wait before requesting another code", {
      retryAfterSeconds: resendRetryAfterSeconds(record.resendAvailableAt, now),
    });
  }

  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "User not found");

  const code = generateCode();
  const codeHash = await hashCode(code);
  const expiresAt = codeExpiryFrom(now);
  const resendAvailableAt = resendAvailableFrom(now);

  await db.emailChange.update({
    where: { userId: user.id },
    data: {
      codeHash, // invalidates the previous code
      expiresAt,
      attempts: 0,
      resendCount: { increment: 1 },
      resendAvailableAt,
    },
  });

  await mailer.sendEmailChangeCode({
    email: record.newEmail,
    code,
    firstName: user.firstName,
    expiresInMinutes: CODE_TTL_MINUTES,
  });

  logChange("resend", { userId: user.id });
  return { newEmail: record.newEmail, resendAvailableAt };
}
