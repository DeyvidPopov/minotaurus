// Thin controllers for the verified email-change flow. All routes are behind
// requireAuth, so the acting userId comes from req.user (set by the middleware),
// never from the body. Validate, delegate to the service, emit the envelope.
import type { Request, Response } from "express";
import { z } from "zod";
import { fail, ok } from "../../../utils/response.js";
import {
  requestEmailChange,
  resendEmailChangeCode,
  verifyEmailChange,
} from "./email-change.service.js";

function userId(req: Request): string | undefined {
  return (req as Request & { user?: { userId: string } }).user?.userId;
}

const requestSchema = z.object({
  newEmail: z.string().trim().email(),
  currentPassword: z.string().min(1),
});

const verifySchema = z.object({
  code: z.string().trim().min(1),
});

export async function requestChange(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return fail(res, 401, "UNAUTHORIZED", "User not found");
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const result = await requestEmailChange({ userId: uid, ...parsed.data });
  return ok(
    res,
    { newEmail: result.newEmail, resendAvailableAt: result.resendAvailableAt.toISOString() },
    "A confirmation code has been sent to your new email",
  );
}

export async function verifyChange(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return fail(res, 401, "UNAUTHORIZED", "User not found");
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const result = await verifyEmailChange({ userId: uid, code: parsed.data.code });
  return ok(res, { user: result.user }, "Email updated");
}

export async function resendChange(req: Request, res: Response) {
  const uid = userId(req);
  if (!uid) return fail(res, 401, "UNAUTHORIZED", "User not found");
  const result = await resendEmailChangeCode({ userId: uid });
  return ok(
    res,
    { newEmail: result.newEmail, resendAvailableAt: result.resendAvailableAt.toISOString() },
    "A new confirmation code has been sent",
  );
}
