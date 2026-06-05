// Thin controllers for the forgot-password flow. Validate the body, delegate
// policy/IO to the service, emit the standard envelope. Typed HttpErrors thrown
// by the service reach the central error handler (with their user-facing
// `details`) via express-async-errors — no try/catch needed.
//
// The success messages are deliberately neutral ("if an account exists…") so the
// envelope itself never confirms whether an account owns the email.
import type { Request, Response } from "express";
import { z } from "zod";
import { fail, ok } from "../../../utils/response.js";
import {
  requestPasswordReset,
  resendResetCode,
  resetPassword,
  verifyResetCode,
} from "./password-reset.service.js";

const forgotSchema = z.object({
  email: z.string().trim().email(),
});

const verifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().min(1),
});

const resetSchema = z.object({
  resetToken: z.string().min(1),
  password: z.string().min(1),
  confirmPassword: z.string().min(1),
});

const resendSchema = z.object({
  email: z.string().trim().email(),
});

export async function requestReset(req: Request, res: Response) {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const result = await requestPasswordReset(parsed.data);
  return ok(
    res,
    { resendAvailableAt: result.resendAvailableAt.toISOString() },
    "If an account exists for this email, a reset code has been sent",
  );
}

export async function verifyReset(req: Request, res: Response) {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const result = await verifyResetCode(parsed.data);
  return ok(
    res,
    { resetToken: result.resetToken, expiresAt: result.expiresAt.toISOString() },
    "Code verified",
  );
}

export async function confirmReset(req: Request, res: Response) {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  await resetPassword(parsed.data);
  // No token/user echoed back: a reset deliberately does not establish a session.
  return ok(res, {}, "Password updated");
}

export async function resendReset(req: Request, res: Response) {
  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const result = await resendResetCode(parsed.data);
  return ok(
    res,
    { resendAvailableAt: result.resendAvailableAt.toISOString() },
    "If a reset is in progress, a new code has been sent",
  );
}
