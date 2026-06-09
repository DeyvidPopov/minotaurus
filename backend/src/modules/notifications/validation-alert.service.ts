// Validation-alert notifications — the first real notification path.
//
// Side-effect layer: given the NEW ERROR findings a validation run produced, it
// figures out who should be told (project owners), checks each user's persisted
// preference (validationAlertsEnabled), and sends ONE concise email per opted-in
// user via the existing EmailService seam. It never touches validation state and
// never throws — a delivery failure (or a missing/unconfigured email provider)
// is logged server-side and swallowed so the validation run always succeeds.
//
// Recipient decision (documented): the ProjectRole model has no ADMIN tier
// (ADMIN is a global User role, not a project role), so "OWNER / ADMIN" maps to
// project OWNERs here — the project's creator pointer (`Project.ownerId`, an
// implicit OWNER) plus any ProjectMember with role OWNER. ARCHITECT / DEVELOPER /
// VIEWER are NOT alerted. This matches the access model where OWNER is the top
// project role and owns governance concerns.

import { prisma } from "../../lib/prisma.js";
import { getEmailService, type EmailService } from "../email/email.service.js";
import { getAppBaseUrl } from "../../config/env.js";
import { stripFindingCode } from "../findings/finding-classifier.js";
import { HttpError } from "../../utils/response.js";
import type {
  AlertRecipient,
  RenderedEmail,
  ValidationAlertOutcome,
  ValidationErrorIssue,
} from "./notification.types.js";

const ALERT_FOOTER =
  "You are receiving this because Validation alerts are enabled in your Minotaurus settings.";
/** Cap the issue list in the email body — keep it concise (spec: top 5). */
const MAX_LISTED = 5;

// ────────────────────────────── pure: recipient selection ──────────────────────────────

/**
 * Resolve the set of user ids that should receive a validation alert for a
 * project: the owner pointer (implicit OWNER) plus any member with role OWNER,
 * deduped. Pure so the owner/role rule has a single, testable definition.
 */
export function selectAlertRecipientUserIds(input: {
  ownerId: string;
  members: Array<{ userId: string; role: string }>;
}): string[] {
  const ids = new Set<string>([input.ownerId]);
  for (const m of input.members) {
    if (m.role === "OWNER") ids.add(m.userId);
  }
  return [...ids];
}

// ────────────────────────────── pure: email rendering ──────────────────────────────

/** Escape user-supplied text before interpolating into the HTML email body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build the validation-alert email (subject + plain text + HTML). Pure and
 * deterministic. Messages and the project name are user-controllable, so they're
 * HTML-escaped in the HTML part; the "CODE · " machine prefix is stripped from
 * each message for readability (matches what the UI shows).
 */
export function buildValidationAlertEmail(opts: {
  projectId: string;
  projectName: string;
  errorIssues: ValidationErrorIssue[];
  firstName?: string;
  appBaseUrl?: string | null;
}): RenderedEmail {
  const count = opts.errorIssues.length;
  const listed = opts.errorIssues.slice(0, MAX_LISTED).map((i) => stripFindingCode(i.message));
  const remaining = count - listed.length;
  const issueWord = count === 1 ? "issue" : "issues";

  const validationPath = `/projects/${opts.projectId}/validation`;
  const link = opts.appBaseUrl ? `${opts.appBaseUrl}${validationPath}` : validationPath;

  const subject = `Minotaurus validation alert: ${opts.projectName}`;
  const greetingText = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const greetingHtml = opts.firstName ? `Hi ${escapeHtml(opts.firstName)},` : "Hi,";

  // ── plain text ──
  const text = [
    greetingText,
    "",
    `Validation ran on "${opts.projectName}" and surfaced ${count} new high-severity ${issueWord}:`,
    "",
    ...listed.map((m) => `  • ${m}`),
    ...(remaining > 0 ? [`  • …and ${remaining} more.`] : []),
    "",
    `Review them on the Validation page:`,
    `  ${link}`,
    "",
    "—",
    ALERT_FOOTER,
    "",
    "— The Minotaurus Team",
  ].join("\n");

  // ── HTML (dark/branded shell, matching the other Minotaurus emails) ──
  const listHtml = listed
    .map(
      (m) =>
        `<li style="margin:0 0 6px 0;font-size:13.5px;line-height:1.5;color:#e4e4e7;">${escapeHtml(m)}</li>`,
    )
    .join("");
  const remainingHtml =
    remaining > 0
      ? `<li style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa;">…and ${remaining} more.</li>`
      : "";
  const projectHtml = escapeHtml(opts.projectName);
  const linkHtml = escapeHtml(link);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Validation alert</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0c;color:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${count} new high-severity ${issueWord} in ${projectHtml}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0c;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;background-color:#111114;border:1px solid #27272a;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="padding:28px 32px 4px 32px;">
            <span style="font-size:18px;font-weight:700;letter-spacing:0.5px;color:#f4f4f5;">MINOTAURUS<span style="color:#8b5cf6;">.dev</span></span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 0 32px;">
            <h1 style="margin:12px 0 4px 0;font-size:20px;font-weight:600;color:#f4f4f5;">Validation alert</h1>
            <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#a1a1aa;">${greetingHtml} validation on <span style="color:#f4f4f5;font-weight:600;">${projectHtml}</span> surfaced <span style="color:#fca5a5;font-weight:600;">${count} new high-severity ${issueWord}</span>.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#18181b;border:1px solid #7f1d1d;border-radius:10px;padding:14px 18px;">
                  <ul style="margin:0;padding:0 0 0 18px;">${listHtml}${remainingHtml}</ul>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px 0 32px;">
            <a href="${linkHtml}" style="display:inline-block;background-color:#8b5cf6;color:#ffffff;text-decoration:none;font-size:13.5px;font-weight:600;padding:10px 18px;border-radius:8px;">Open the Validation page</a>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 28px 32px;">
            <div style="border-top:1px solid #27272a;padding-top:16px;">
              <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:#71717a;">${ALERT_FOOTER}</p>
              <p style="margin:0;font-size:12px;color:#52525b;">— The Minotaurus Team</p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}

// ────────────────────────────── impure: dispatch ──────────────────────────────

export interface SendValidationAlertsInput {
  projectId: string;
  /** The dedup'd NEW ERROR findings from this run (empty ⇒ nothing to send). */
  errorIssues: ValidationErrorIssue[];
}

/** Injectable seam so the orchestrator can be unit-tested without a DB or network. */
export interface ValidationAlertDeps {
  loadAlertTargets: (
    projectId: string,
  ) => Promise<{ projectName: string; recipients: AlertRecipient[] } | null>;
  emailService: Pick<EmailService, "sendMail" | "name">;
  log: (level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) => void;
  appBaseUrl: string | null;
}

/** Minimal sanity check so a malformed address never reaches the provider. */
function isLikelyEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/** Default scalar logger — never logs email bodies, addresses, or provider secrets. */
function defaultLog(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
): void {
  const line = `[notifications] ${message}`;
  // eslint-disable-next-line no-console
  if (level === "error") console.error(line, meta ?? {});
  // eslint-disable-next-line no-console
  else console.log(line, meta ?? {});
}

/** Default DB-backed recipient loader: project owners + their notification prefs. */
async function loadAlertTargetsFromDb(
  projectId: string,
): Promise<{ projectName: string; recipients: AlertRecipient[] } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      ownerId: true,
      members: { select: { userId: true, role: true } },
    },
  });
  if (!project) return null;

  const userIds = selectAlertRecipientUserIds({ ownerId: project.ownerId, members: project.members });
  if (userIds.length === 0) return { projectName: project.name, recipients: [] };

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      email: true,
      firstName: true,
      notificationPreference: { select: { validationAlertsEnabled: true } },
    },
  });
  const recipients: AlertRecipient[] = users.map((u) => ({
    userId: u.id,
    email: u.email,
    firstName: u.firstName,
    validationAlertsEnabled: u.notificationPreference?.validationAlertsEnabled ?? false,
  }));
  return { projectName: project.name, recipients };
}

/**
 * Send validation alerts for a finished run. At most ONE email per opted-in
 * owner. Never throws: any failure (DB, provider not configured, transport
 * error) is logged and swallowed so the validation result is returned normally.
 */
export async function sendValidationAlerts(
  input: SendValidationAlertsInput,
  depsOverride: Partial<ValidationAlertDeps> = {},
): Promise<ValidationAlertOutcome> {
  const deps: ValidationAlertDeps = {
    loadAlertTargets: depsOverride.loadAlertTargets ?? loadAlertTargetsFromDb,
    // Resolve the provider lazily (factory reads EMAIL_PROVIDER at call time).
    emailService: depsOverride.emailService ?? getEmailService(),
    log: depsOverride.log ?? defaultLog,
    appBaseUrl: depsOverride.appBaseUrl !== undefined ? depsOverride.appBaseUrl : getAppBaseUrl(),
  };

  // Nothing new to report ⇒ no DB hit, no email (the common case on a rerun).
  if (input.errorIssues.length === 0) {
    return { attempted: 0, sent: 0, failed: 0, skipped: true };
  }

  try {
    const targets = await deps.loadAlertTargets(input.projectId);
    if (!targets) {
      return { attempted: 0, sent: 0, failed: 0, skipped: true };
    }

    const recipients = targets.recipients.filter(
      (r) => r.validationAlertsEnabled && isLikelyEmail(r.email),
    );
    let sent = 0;
    let failed = 0;

    for (const r of recipients) {
      const email = buildValidationAlertEmail({
        projectId: input.projectId,
        projectName: targets.projectName,
        errorIssues: input.errorIssues,
        firstName: r.firstName,
        appBaseUrl: deps.appBaseUrl,
      });
      try {
        await deps.emailService.sendMail({
          to: r.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
        sent++;
        deps.log("info", "validation alert sent", {
          projectId: input.projectId,
          userId: r.userId,
          errorCount: input.errorIssues.length,
          provider: deps.emailService.name,
        });
      } catch (err) {
        failed++;
        // Log a code only — never the provider's raw response or any secret.
        deps.log("error", "validation alert delivery failed", {
          projectId: input.projectId,
          userId: r.userId,
          provider: deps.emailService.name,
          code: err instanceof HttpError ? err.code : "UNKNOWN",
        });
      }
    }

    return { attempted: recipients.length, sent, failed, skipped: false };
  } catch (err) {
    // An unexpected failure (e.g. the recipient DB read) must not break the run.
    deps.log("error", "validation alert dispatch error", {
      projectId: input.projectId,
      error: err instanceof Error ? err.name : "unknown",
    });
    return { attempted: 0, sent: 0, failed: 0, skipped: false };
  }
}
