// Thin controllers for per-user settings. All routes are behind requireAuth, so
// the acting userId comes from req.user (set by the middleware), never the body.
// A user can only read/update their OWN preferences — there is no userId input.
import type { Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import {
  mergeNotificationPreferences,
  toNotificationPreferences,
} from "./settings.engine.js";

export async function getNotificationPreferences(req: AuthedRequest, res: Response) {
  const uid = req.user?.userId;
  if (!uid) return fail(res, 401, "UNAUTHORIZED", "User not found");
  const row = await prisma.userNotificationPreference.findUnique({ where: { userId: uid } });
  return ok(res, { preferences: toNotificationPreferences(row) }, "OK");
}

const patchSchema = z
  .object({
    emailDigestEnabled: z.boolean().optional(),
    validationAlertsEnabled: z.boolean().optional(),
  })
  .refine(
    (v) => v.emailDigestEnabled !== undefined || v.validationAlertsEnabled !== undefined,
    { message: "At least one field is required" },
  );

export async function updateNotificationPreferences(req: AuthedRequest, res: Response) {
  const uid = req.user?.userId;
  if (!uid) return fail(res, 401, "UNAUTHORIZED", "User not found");
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  // Lazily create the row on first write; merge the patch over current/defaults
  // so a partial PATCH never clobbers the other flag.
  const existing = await prisma.userNotificationPreference.findUnique({ where: { userId: uid } });
  const next = mergeNotificationPreferences(toNotificationPreferences(existing), parsed.data);

  const row = await prisma.userNotificationPreference.upsert({
    where: { userId: uid },
    create: { userId: uid, ...next },
    update: next,
  });
  return ok(res, { preferences: toNotificationPreferences(row) }, "Notification preferences updated");
}
