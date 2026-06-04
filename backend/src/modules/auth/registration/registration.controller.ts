// Thin controllers for the multi-step registration flow. Validate the body,
// delegate policy/IO to the service, emit the standard envelope. Typed
// HttpErrors thrown by the service reach the central error handler (with their
// user-facing `details`) via express-async-errors — no try/catch needed.
import type { Request, Response } from "express";
import { z } from "zod";
import { created, fail, ok } from "../../../utils/response.js";
import {
  completeRegistration,
  resendCode,
  startRegistration,
  verifyEmail,
} from "./registration.service.js";

const startSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
});

const verifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().min(1),
});

const completeSchema = z.object({
  registrationToken: z.string().min(1),
  password: z.string().min(1),
  confirmPassword: z.string().min(1),
});

const resendSchema = z.object({
  email: z.string().trim().email(),
});

export async function registerStart(req: Request, res: Response) {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const result = await startRegistration(parsed.data);
  return ok(
    res,
    { email: result.email, resendAvailableAt: result.resendAvailableAt.toISOString() },
    "If this email can be registered, a verification code has been sent",
  );
}

export async function registerVerify(req: Request, res: Response) {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const result = await verifyEmail(parsed.data);
  return ok(
    res,
    { registrationToken: result.registrationToken, expiresAt: result.expiresAt.toISOString() },
    "Email verified",
  );
}

export async function registerComplete(req: Request, res: Response) {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const result = await completeRegistration(parsed.data);
  return created(res, { token: result.token, user: result.user }, "Account created");
}

export async function registerResend(req: Request, res: Response) {
  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const result = await resendCode(parsed.data);
  return ok(
    res,
    { resendAvailableAt: result.resendAvailableAt.toISOString() },
    "If a pending registration exists, a new code has been sent",
  );
}
