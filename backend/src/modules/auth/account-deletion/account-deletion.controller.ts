// Thin controllers for the account-deletion flow. Role/identity comes from
// req.user (requireAuth); the destructive purge is deferred to the scheduler, so
// these handlers only record intent, stream the export, or undo.
import type { Request, Response } from "express";
import { z } from "zod";
import { fail, ok } from "../../../utils/response.js";
import { getAppBaseUrl } from "../../../config/env.js";
import type { AuthedRequest } from "../../../middleware/auth.js";
import { getEmailService, maskEmail } from "../../email/email.service.js";
import {
  DELETION_GRACE_DAYS,
  cancelAccountDeletionByToken,
  getDeletionPreview,
  getDeletionStatus,
  listOwnedProjectsForExport,
  reactivateAccount,
  requestAccountDeletion,
  type RequestResult,
} from "./account-deletion.service.js";
import { buildAccountExportZip } from "./account-deletion.zip.js";
import { renderDataExportEmail, renderDeletionScheduledEmail } from "./account-deletion.emails.js";

const MAX_SVG_LEN = 1_500_000;
const EXPORT_FILENAME = "minotaurus-export.zip";

const planItemSchema = z.object({
  projectId: z.string().min(1),
  action: z.enum(["TRANSFER", "DELETE"]),
  transferToUserId: z.string().min(1).optional(),
});

const requestSchema = z.object({
  password: z.string().min(1),
  plan: z.array(planItemSchema).default([]),
});

const bundleSchema = z.object({
  // projectId -> diagramId -> captured SVG (optional; PDFs fall back to source otherwise).
  diagramSvgs: z
    .record(z.string(), z.record(z.string(), z.string().max(MAX_SVG_LEN)))
    .optional(),
});

const cancelSchema = z.object({ token: z.string().min(1) });

export async function deletionPreview(req: AuthedRequest, res: Response) {
  const preview = await getDeletionPreview(req.user!.userId);
  return ok(res, preview, "OK");
}

export async function deletionStatus(req: AuthedRequest, res: Response) {
  return ok(res, await getDeletionStatus(req.user!.userId), "OK");
}

export async function requestDeletion(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  // Throws HttpError (bad password / invalid plan) → central error handler.
  const result = await requestAccountDeletion(userId, parsed.data.password, parsed.data.plan, new Date());

  // Emails are best-effort: a delivery problem must not fail the (already
  // persisted) deletion request — the user can still undo in-app.
  await sendScheduledEmail(result);
  void buildAndEmailExport(userId, result.email, result.firstName);

  return ok(
    res,
    { scheduledFor: result.scheduledFor, graceDays: DELETION_GRACE_DAYS },
    "Account scheduled for deletion",
  );
}

export async function downloadExportBundle(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  const parsed = bundleSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const owned = await listOwnedProjectsForExport(userId);
  const zip = await buildAccountExportZip(owned, parsed.data.diagramSvgs);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${EXPORT_FILENAME}"`);
  res.setHeader("Content-Length", String(zip.length));
  return res.end(zip);
}

export async function cancelDeletion(req: Request, res: Response) {
  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  await cancelAccountDeletionByToken(parsed.data.token);
  return ok(res, null, "Account deletion cancelled");
}

export async function reactivate(req: AuthedRequest, res: Response) {
  await reactivateAccount(req.user!.userId);
  return ok(res, null, "Account reactivated");
}

// ────────────────────────── email helpers (best-effort) ──────────────────────────

function logEmailFailure(kind: string, to: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error("[account-deletion] email failed", {
    kind,
    to: maskEmail(to),
    error: err instanceof Error ? err.name : "unknown",
  });
}

async function sendScheduledEmail(result: RequestResult): Promise<void> {
  try {
    const base = getAppBaseUrl();
    const undoUrl = base ? `${base}/reactivate?token=${result.undoToken}` : null;
    const msg = renderDeletionScheduledEmail({
      firstName: result.firstName,
      scheduledFor: result.scheduledFor,
      undoUrl,
    });
    await getEmailService().sendMail({ to: result.email, subject: msg.subject, text: msg.text, html: msg.html });
  } catch (err) {
    logEmailFailure("scheduled", result.email, err);
  }
}

async function buildAndEmailExport(userId: string, to: string, firstName: string): Promise<void> {
  try {
    const owned = await listOwnedProjectsForExport(userId);
    if (owned.length === 0) return;
    const zip = await buildAccountExportZip(owned);
    const msg = renderDataExportEmail({ firstName });
    await getEmailService().sendMail({
      to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      attachments: [{ filename: EXPORT_FILENAME, content: zip }],
    });
  } catch (err) {
    logEmailFailure("export", to, err);
  }
}
