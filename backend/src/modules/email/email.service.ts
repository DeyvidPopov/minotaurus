// Email service abstraction.
//
// One seam (`EmailService`) the rest of the app talks to, so registration code
// never knows which provider is wired. The factory picks a concrete provider
// from EMAIL_PROVIDER at call time (not import time) so tests can swap env.
//
// Provider-specific transport logic must stay behind a concrete EmailService —
// don't reach into nodemailer/SMTP from controllers or services.
import { getEmailConfig, isDevEmailLoggingAllowed } from "../../config/env.js";
import { HttpError } from "../../utils/response.js";

export interface SendVerificationCodeInput {
  email: string;
  code: string;
  /** Recipient name for the greeting (best-effort; transport may ignore it). */
  firstName?: string;
  /** Minutes until the code expires, for copy like "expires in 10 minutes". */
  expiresInMinutes?: number;
}

/** Same shape as the verification input; named separately so the two flows read distinctly. */
export type SendPasswordResetCodeInput = SendVerificationCodeInput;

export interface EmailService {
  readonly name: string;
  sendVerificationCode(input: SendVerificationCodeInput): Promise<void>;
  /** Email a 6-digit password-reset code (forgot-password flow). */
  sendPasswordResetCode(input: SendPasswordResetCodeInput): Promise<void>;
}

/** Mask an email for logs: `deyvid@minotaurus.dev` → `d****d@minotaurus.dev`. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? "*"}*${domain}`;
  return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}${domain}`;
}

/**
 * Development provider: never sends mail. Logs the code (masked email, masked
 * code) ONLY outside production so a developer can complete the flow locally
 * without an email backend. In production it logs nothing sensitive.
 */
export class DevEmailService implements EmailService {
  readonly name = "dev";

  async sendVerificationCode(input: SendVerificationCodeInput): Promise<void> {
    if (isDevEmailLoggingAllowed()) {
      // eslint-disable-next-line no-console
      console.log(
        `[email:dev] verification code for ${maskEmail(input.email)}: ${input.code} ` +
          `(expires in ${input.expiresInMinutes ?? 10}m)`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[email:dev] suppressed verification code send for ${maskEmail(input.email)} ` +
          `(dev provider active in production — configure EMAIL_PROVIDER=smtp)`,
      );
    }
  }

  async sendPasswordResetCode(input: SendPasswordResetCodeInput): Promise<void> {
    if (isDevEmailLoggingAllowed()) {
      // eslint-disable-next-line no-console
      console.log(
        `[email:dev] password reset code for ${maskEmail(input.email)}: ${input.code} ` +
          `(expires in ${input.expiresInMinutes ?? 10}m)`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[email:dev] suppressed password reset code send for ${maskEmail(input.email)} ` +
          `(dev provider active in production — configure EMAIL_PROVIDER=smtp)`,
      );
    }
  }
}

/**
 * SMTP transactional provider (placeholder). The transport (nodemailer or a
 * provider SDK) is intentionally NOT wired yet — no new production dependency
 * until a provider is chosen. Until then a "smtp" selection with complete creds
 * still refuses to silently drop mail: it throws so the failure is explicit.
 *
 * When implementing: validate creds in the constructor, build the transport
 * once, and map transport failures to a 502-class error — keep all of that
 * inside this class so the EmailService seam stays clean.
 */
export class SmtpEmailService implements EmailService {
  readonly name = "smtp";

  constructor(
    private readonly cfg: {
      host?: string;
      port?: number;
      user?: string;
      pass?: string;
      from: string;
    },
  ) {}

  private assertConfigured(): void {
    const missing: string[] = [];
    if (!this.cfg.host) missing.push("SMTP_HOST");
    if (!this.cfg.port) missing.push("SMTP_PORT");
    if (!this.cfg.user) missing.push("SMTP_USER");
    if (!this.cfg.pass) missing.push("SMTP_PASS");
    if (missing.length > 0) {
      throw new HttpError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Email delivery is not configured on this server",
      );
    }
  }

  async sendVerificationCode(_input: SendVerificationCodeInput): Promise<void> {
    this.assertConfigured();
    // TODO: wire a real SMTP/transactional transport here. Until then a fully
    // configured "smtp" provider must not pretend to send.
    throw new HttpError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "SMTP email transport is not implemented yet",
    );
  }

  async sendPasswordResetCode(_input: SendPasswordResetCodeInput): Promise<void> {
    this.assertConfigured();
    throw new HttpError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "SMTP email transport is not implemented yet",
    );
  }
}

/**
 * Resend (https://resend.com) transactional provider. Sends the verification
 * email through the Resend REST API with the global `fetch` (no SDK dependency).
 * A missing API key surfaces 503 EMAIL_NOT_CONFIGURED (same contract as SMTP);
 * a transport / non-2xx response surfaces 502 EMAIL_PROVIDER_ERROR. The Resend
 * response body / API key are NEVER returned to the client — only logged
 * server-side (masked recipient, no secrets) for diagnosis.
 */
export class ResendEmailService implements EmailService {
  readonly name = "resend";

  private static readonly ENDPOINT = "https://api.resend.com/emails";

  constructor(
    private readonly cfg: {
      apiKey?: string;
      from: string;
    },
  ) {}

  async sendVerificationCode(input: SendVerificationCodeInput): Promise<void> {
    const expires = input.expiresInMinutes ?? 10;
    const { text, html } = renderVerificationEmail({
      code: input.code,
      firstName: input.firstName,
      expiresInMinutes: expires,
    });
    await this.post({
      to: input.email,
      subject: `Your Minotaurus verification code: ${input.code}`,
      text,
      html,
    });
  }

  async sendPasswordResetCode(input: SendPasswordResetCodeInput): Promise<void> {
    const expires = input.expiresInMinutes ?? 10;
    const { text, html } = renderPasswordResetEmail({
      code: input.code,
      firstName: input.firstName,
      expiresInMinutes: expires,
    });
    await this.post({
      to: input.email,
      subject: `Your Minotaurus password reset code: ${input.code}`,
      text,
      html,
    });
  }

  /**
   * Shared Resend transport. A missing API key → 503 EMAIL_NOT_CONFIGURED; a
   * transport error or non-2xx → 502 EMAIL_PROVIDER_ERROR. The Resend response
   * body / API key are NEVER returned to the client — only logged server-side
   * (masked recipient, no secrets).
   */
  private async post(msg: { to: string; subject: string; text: string; html: string }): Promise<void> {
    if (!this.cfg.apiKey) {
      throw new HttpError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Email delivery is not configured on this server",
      );
    }

    let res: Response;
    try {
      res = await fetch(ResendEmailService.ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.cfg.from,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
        }),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[email:resend] transport error", {
        to: maskEmail(msg.to),
        error: err instanceof Error ? err.name : "unknown",
      });
      throw new HttpError(502, "EMAIL_PROVIDER_ERROR", "Failed to send the email");
    }

    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 500);
      } catch {
        /* ignore body read failure */
      }
      // eslint-disable-next-line no-console
      console.error("[email:resend] send failed", {
        to: maskEmail(msg.to),
        status: res.status,
        detail, // provider error text (no secrets) — server-side only
      });
      throw new HttpError(502, "EMAIL_PROVIDER_ERROR", "Failed to send the email");
    }
  }
}

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
 * Verification email — dark, branded (matches the Minotaurus app). Table layout +
 * inline styles + a plain-text part for cross-client compatibility; no external
 * assets. The first name is HTML-escaped (it's user input). Palette mirrors the
 * app dark theme + accent (`#8b5cf6`).
 */
function renderVerificationEmail(opts: {
  code: string;
  firstName?: string;
  expiresInMinutes: number;
}): { text: string; html: string } {
  const expires = opts.expiresInMinutes;
  const greetingText = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const greetingHtml = opts.firstName ? `Hi ${escapeHtml(opts.firstName)},` : "Hi,";

  const text = [
    greetingText,
    "",
    `Your Minotaurus verification code is: ${opts.code}`,
    `It expires in ${expires} minutes.`,
    "",
    "If you didn't request this, you can safely ignore this email.",
    "",
    "— The Minotaurus Team",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0c;color:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Minotaurus verification code is ${opts.code} — expires in ${expires} minutes.</div>
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
            <h1 style="margin:12px 0 4px 0;font-size:20px;font-weight:600;color:#f4f4f5;">Verify your email</h1>
            <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#a1a1aa;">${greetingHtml} use this code to finish creating your Minotaurus account.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background-color:#18181b;border:1px solid #8b5cf6;border-radius:10px;padding:18px 12px;">
                  <span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#ffffff;">${opts.code}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 32px 0 32px;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">This code expires in ${expires} minutes.</p>
            <p style="margin:8px 0 0 0;font-size:13px;line-height:1.6;color:#71717a;">Didn't request this? You can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 28px 32px;">
            <div style="border-top:1px solid #27272a;padding-top:16px;">
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

  return { text, html };
}

/**
 * Password-reset email — same dark/branded shell as the verification email, with
 * reset-specific copy. The first name is HTML-escaped (user input). Reassures the
 * recipient that ignoring it leaves the password unchanged (anti-phishing-friendly).
 */
function renderPasswordResetEmail(opts: {
  code: string;
  firstName?: string;
  expiresInMinutes: number;
}): { text: string; html: string } {
  const expires = opts.expiresInMinutes;
  const greetingText = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const greetingHtml = opts.firstName ? `Hi ${escapeHtml(opts.firstName)},` : "Hi,";

  const text = [
    greetingText,
    "",
    `Your Minotaurus password reset code is: ${opts.code}`,
    `It expires in ${expires} minutes.`,
    "",
    "If you didn't request a password reset, you can safely ignore this email — your password won't change.",
    "",
    "— The Minotaurus Team",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0c;color:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Minotaurus password reset code is ${opts.code} — expires in ${expires} minutes.</div>
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
            <h1 style="margin:12px 0 4px 0;font-size:20px;font-weight:600;color:#f4f4f5;">Reset your password</h1>
            <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#a1a1aa;">${greetingHtml} use this code to reset your Minotaurus password.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background-color:#18181b;border:1px solid #8b5cf6;border-radius:10px;padding:18px 12px;">
                  <span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#ffffff;">${opts.code}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 32px 0 32px;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">This code expires in ${expires} minutes.</p>
            <p style="margin:8px 0 0 0;font-size:13px;line-height:1.6;color:#71717a;">Didn't request this? You can safely ignore this email — your password won't change.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 28px 32px;">
            <div style="border-top:1px solid #27272a;padding-top:16px;">
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

  return { text, html };
}

/** Build the active EmailService from current env. Cheap; safe to call per request. */
export function getEmailService(): EmailService {
  const cfg = getEmailConfig();
  if (cfg.provider === "resend") {
    return new ResendEmailService({ apiKey: cfg.resend.apiKey, from: cfg.from });
  }
  if (cfg.provider === "smtp") {
    return new SmtpEmailService({ ...cfg.smtp, from: cfg.from });
  }
  return new DevEmailService();
}
