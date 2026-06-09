// Weekly email digest — the second notification path (after validation alerts).
//
// A scheduled job (weekly-digest.scheduler.ts) calls sendWeeklyDigests(): for
// every user with `emailDigestEnabled = true`, it aggregates the OPEN validation
// issues across the projects they can access (owned + member, same rule as the
// dashboard) and emails ONE summary. Like the validation-alert path it is a
// strict side-effect layer: it only READS validation/project state, never writes
// it, and it NEVER throws — a per-user failure (DB, provider not configured,
// transport error) is logged (a code only) and swallowed so one bad send can't
// abort the batch.
//
// A user with no accessible projects, or with zero open issues, is skipped (no
// "all-clear" spam) — the digest fires only when there's something to report.

import { prisma } from "../../lib/prisma.js";
import { getEmailService, type EmailService } from "../email/email.service.js";
import { getAppBaseUrl } from "../../config/env.js";
import { HttpError } from "../../utils/response.js";
import type {
  DigestProjectSummary,
  DigestRecipient,
  RenderedEmail,
  WeeklyDigestOutcome,
} from "./notification.types.js";

const DIGEST_FOOTER =
  "You are receiving this because the Weekly email digest is enabled in your Minotaurus settings.";
/** Cap the project list in the email body — keep it scannable. */
const MAX_LISTED = 12;

// ────────────────────────────── pure: shaping + rendering ──────────────────────────────

/** Escape user-supplied text before interpolating into the HTML email body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Severity-weighted sort key so the worst projects surface first. */
function projectWeight(p: DigestProjectSummary): number {
  return p.critical * 1_000_000 + p.error * 10_000 + p.warning * 100 + p.info;
}

/**
 * Order projects worst-first (critical, then error, …), then by open count, then
 * name. Pure + deterministic — same input gives the same order.
 */
export function sortDigestProjects(projects: DigestProjectSummary[]): DigestProjectSummary[] {
  return [...projects].sort(
    (a, b) => projectWeight(b) - projectWeight(a) || b.open - a.open || a.name.localeCompare(b.name),
  );
}

/** "2 critical · 3 errors · 1 warning" from a project's counts (omits zeros). */
function severityParts(p: DigestProjectSummary): string {
  return [
    p.critical ? `${p.critical} critical` : "",
    p.error ? `${p.error} error${p.error === 1 ? "" : "s"}` : "",
    p.warning ? `${p.warning} warning${p.warning === 1 ? "" : "s"}` : "",
    p.info ? `${p.info} info` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Build the weekly-digest email (subject + plain text + HTML). Pure and
 * deterministic. Project names are user-controllable so they're HTML-escaped.
 * When there are no open issues the email is a short "all clear" (the dispatcher
 * normally skips that case; kept here so a manual/forced send still renders).
 */
export function buildWeeklyDigestEmail(opts: {
  firstName?: string;
  projects: DigestProjectSummary[];
  appBaseUrl?: string | null;
}): RenderedEmail {
  const sorted = sortDigestProjects(opts.projects);
  const withIssues = sorted.filter((p) => p.open > 0);
  const totalOpen = sorted.reduce((n, p) => n + p.open, 0);
  const totalCritical = sorted.reduce((n, p) => n + p.critical, 0);
  const totalError = sorted.reduce((n, p) => n + p.error, 0);
  const listed = withIssues.slice(0, MAX_LISTED);
  const remaining = withIssues.length - listed.length;

  const projWord = withIssues.length === 1 ? "project" : "projects";
  const issueWord = totalOpen === 1 ? "issue" : "issues";
  const errLevel = totalCritical + totalError;

  const dashLink = opts.appBaseUrl ? `${opts.appBaseUrl}/dashboard` : "/dashboard";
  const greetingText = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const greetingHtml = opts.firstName ? `Hi ${escapeHtml(opts.firstName)},` : "Hi,";

  const subject =
    totalOpen === 0
      ? "Minotaurus weekly digest: all clear"
      : `Minotaurus weekly digest: ${totalOpen} open ${issueWord} across ${withIssues.length} ${projWord}`;

  const headline =
    totalOpen === 0
      ? `No open validation issues across your ${sorted.length} ${sorted.length === 1 ? "project" : "projects"} — nice.`
      : `${totalOpen} open ${issueWord} across ${withIssues.length} ${projWord}` +
        (errLevel > 0 ? ` (${errLevel} error-level).` : ".");

  // ── plain text ──
  const text = [
    greetingText,
    "",
    headline,
    ...(listed.length > 0 ? [""] : []),
    ...listed.map((p) => `  • ${p.name}: ${severityParts(p)}`),
    ...(remaining > 0 ? [`  • …and ${remaining} more.`] : []),
    "",
    "Open your dashboard:",
    `  ${dashLink}`,
    "",
    "—",
    DIGEST_FOOTER,
    "",
    "— The Minotaurus Team",
  ].join("\n");

  // ── HTML (dark/branded shell, matching the validation-alert email) ──
  const rowsHtml = listed
    .map((p) => {
      const accent = p.critical > 0 ? "#fca5a5" : p.error > 0 ? "#fca5a5" : "#a1a1aa";
      return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #27272a;">
    <span style="font-size:13.5px;color:#f4f4f5;font-weight:600;">${escapeHtml(p.name)}</span><br>
    <span style="font-size:12.5px;color:${accent};">${escapeHtml(severityParts(p))}</span>
  </td>
</tr>`;
    })
    .join("");
  const remainingHtml =
    remaining > 0
      ? `<tr><td style="padding:8px 0;font-size:12.5px;color:#a1a1aa;">…and ${remaining} more.</td></tr>`
      : "";
  const bodyBlockHtml =
    totalOpen === 0
      ? ""
      : `<tr>
          <td style="padding:0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}${remainingHtml}</table>
          </td>
        </tr>`;
  const dashLinkHtml = escapeHtml(dashLink);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Weekly digest</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0c;color:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(headline)}</div>
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
            <h1 style="margin:12px 0 4px 0;font-size:20px;font-weight:600;color:#f4f4f5;">Your weekly digest</h1>
            <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#a1a1aa;">${greetingHtml} ${escapeHtml(headline)}</p>
          </td>
        </tr>
        ${bodyBlockHtml}
        <tr>
          <td style="padding:18px 32px 0 32px;">
            <a href="${dashLinkHtml}" style="display:inline-block;background-color:#8b5cf6;color:#ffffff;text-decoration:none;font-size:13.5px;font-weight:600;padding:10px 18px;border-radius:8px;">Open your dashboard</a>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 28px 32px;">
            <div style="border-top:1px solid #27272a;padding-top:16px;">
              <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:#71717a;">${DIGEST_FOOTER}</p>
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

/** Injectable seam so the dispatcher is unit-testable without a DB or network. */
export interface WeeklyDigestDeps {
  loadRecipients: () => Promise<DigestRecipient[]>;
  loadProjectSummaries: (userId: string) => Promise<DigestProjectSummary[]>;
  emailService: Pick<EmailService, "sendMail" | "name">;
  log: (level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) => void;
  appBaseUrl: string | null;
}

function isLikelyEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

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

/** Default DB loader: every user with the weekly digest enabled. */
async function loadDigestRecipientsFromDb(): Promise<DigestRecipient[]> {
  const users = await prisma.user.findMany({
    where: { notificationPreference: { emailDigestEnabled: true } },
    select: { id: true, email: true, firstName: true },
  });
  return users.map((u) => ({ userId: u.id, email: u.email, firstName: u.firstName }));
}

/** Default DB loader: OPEN-issue counts per project the user can access. */
async function loadProjectSummariesFromDb(userId: string): Promise<DigestProjectSummary[]> {
  const projects = await prisma.project.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    select: { id: true, name: true },
  });
  if (projects.length === 0) return [];

  const grouped = await prisma.validationIssue.groupBy({
    by: ["projectId", "severity"],
    where: { projectId: { in: projects.map((p) => p.id) }, status: "OPEN" },
    _count: true,
  });

  const byProject = new Map<string, DigestProjectSummary>(
    projects.map((p) => [p.id, { projectId: p.id, name: p.name, open: 0, critical: 0, error: 0, warning: 0, info: 0 }]),
  );
  for (const g of grouped) {
    const s = byProject.get(g.projectId);
    if (!s) continue;
    const n = g._count;
    s.open += n;
    if (g.severity === "CRITICAL") s.critical += n;
    else if (g.severity === "ERROR") s.error += n;
    else if (g.severity === "WARNING") s.warning += n;
    else if (g.severity === "INFO") s.info += n;
  }
  return [...byProject.values()];
}

/**
 * Send the weekly digest to every opted-in user with at least one open issue.
 * Never throws: per-user failures are logged (a code only) and swallowed.
 */
export async function sendWeeklyDigests(
  depsOverride: Partial<WeeklyDigestDeps> = {},
): Promise<WeeklyDigestOutcome> {
  const deps: WeeklyDigestDeps = {
    loadRecipients: depsOverride.loadRecipients ?? loadDigestRecipientsFromDb,
    loadProjectSummaries: depsOverride.loadProjectSummaries ?? loadProjectSummariesFromDb,
    emailService: depsOverride.emailService ?? getEmailService(),
    log: depsOverride.log ?? defaultLog,
    appBaseUrl: depsOverride.appBaseUrl !== undefined ? depsOverride.appBaseUrl : getAppBaseUrl(),
  };

  let recipients: DigestRecipient[];
  try {
    recipients = (await deps.loadRecipients()).filter((r) => isLikelyEmail(r.email));
  } catch (err) {
    deps.log("error", "weekly digest recipient load failed", {
      error: err instanceof Error ? err.name : "unknown",
    });
    return { recipients: 0, sent: 0, failed: 0, skipped: 0 };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of recipients) {
    try {
      const projects = await deps.loadProjectSummaries(r.userId);
      const totalOpen = projects.reduce((n, p) => n + p.open, 0);
      // Nothing to report ⇒ no "all-clear" spam.
      if (totalOpen === 0) {
        skipped++;
        continue;
      }
      const email = buildWeeklyDigestEmail({
        firstName: r.firstName,
        projects,
        appBaseUrl: deps.appBaseUrl,
      });
      await deps.emailService.sendMail({
        to: r.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      sent++;
      deps.log("info", "weekly digest sent", {
        userId: r.userId,
        openIssues: totalOpen,
        provider: deps.emailService.name,
      });
    } catch (err) {
      failed++;
      deps.log("error", "weekly digest delivery failed", {
        userId: r.userId,
        provider: deps.emailService.name,
        code: err instanceof HttpError ? err.code : "UNKNOWN",
      });
    }
  }

  return { recipients: recipients.length, sent, failed, skipped };
}
