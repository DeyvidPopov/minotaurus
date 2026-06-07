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

/** Same shape again — the code sent to the NEW address in the email-change flow. */
export type SendEmailChangeCodeInput = SendVerificationCodeInput;

/** Security notice sent to the OLD address after an email change (no code). */
export interface SendEmailChangeNoticeInput {
  /** The old address being notified. */
  email: string;
  firstName?: string;
  /** Masked form of the new address, for "changed to d****d@…" copy. */
  newEmailMasked: string;
}

/**
 * Generic pre-rendered message. Used by feature modules that build their own
 * HTML/text (e.g. validation alerts) and just need the provider's transport —
 * the content stays in the feature module, the transport stays behind this seam.
 */
export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Optional binary attachments (e.g. a data-export .zip). Resend-only for now. */
  attachments?: { filename: string; content: Buffer }[];
}

export interface EmailService {
  readonly name: string;
  sendVerificationCode(input: SendVerificationCodeInput): Promise<void>;
  /** Email a 6-digit password-reset code (forgot-password flow). */
  sendPasswordResetCode(input: SendPasswordResetCodeInput): Promise<void>;
  /** Email a 6-digit code to the NEW address to confirm an email change. */
  sendEmailChangeCode(input: SendEmailChangeCodeInput): Promise<void>;
  /** Notify the OLD address that the account email was changed (security alert). */
  sendEmailChangeNotice(input: SendEmailChangeNoticeInput): Promise<void>;
  /** Send a pre-rendered message (subject + text + html). Caller owns the content. */
  sendMail(input: SendMailInput): Promise<void>;
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

  async sendEmailChangeCode(input: SendEmailChangeCodeInput): Promise<void> {
    if (isDevEmailLoggingAllowed()) {
      // eslint-disable-next-line no-console
      console.log(
        `[email:dev] email change code for ${maskEmail(input.email)}: ${input.code} ` +
          `(expires in ${input.expiresInMinutes ?? 10}m)`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[email:dev] suppressed email change code send for ${maskEmail(input.email)} ` +
          `(dev provider active in production — configure EMAIL_PROVIDER=smtp)`,
      );
    }
  }

  async sendEmailChangeNotice(input: SendEmailChangeNoticeInput): Promise<void> {
    // The notice carries no secret (only a masked address), so it's safe to log
    // in any environment for traceability.
    // eslint-disable-next-line no-console
    console.log(
      `[email:dev] email change notice to ${maskEmail(input.email)} ` +
        `(new address ${input.newEmailMasked})`,
    );
  }

  async sendMail(input: SendMailInput): Promise<void> {
    // No secret in a generic message (the subject is the payload), so log it for
    // traceability in any environment — a developer can confirm the alert fired.
    const att = input.attachments?.length
      ? ` with ${input.attachments.length} attachment(s) (${input.attachments.reduce((n, a) => n + a.content.length, 0)} bytes)`
      : "";
    // eslint-disable-next-line no-console
    console.log(`[email:dev] sendMail "${input.subject}" → ${maskEmail(input.to)}${att}`);
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
    // The "smtp" provider is an intentional placeholder: with no transport wired
    // it must fail loudly rather than silently pretend to have sent the message.
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

  async sendEmailChangeCode(_input: SendEmailChangeCodeInput): Promise<void> {
    this.assertConfigured();
    throw new HttpError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "SMTP email transport is not implemented yet",
    );
  }

  async sendEmailChangeNotice(_input: SendEmailChangeNoticeInput): Promise<void> {
    this.assertConfigured();
    throw new HttpError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "SMTP email transport is not implemented yet",
    );
  }

  async sendMail(_input: SendMailInput): Promise<void> {
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

  async sendEmailChangeCode(input: SendEmailChangeCodeInput): Promise<void> {
    const expires = input.expiresInMinutes ?? 10;
    const { text, html } = renderEmailChangeCodeEmail({
      code: input.code,
      firstName: input.firstName,
      expiresInMinutes: expires,
    });
    await this.post({
      to: input.email,
      subject: `Confirm your new Minotaurus email: ${input.code}`,
      text,
      html,
    });
  }

  async sendEmailChangeNotice(input: SendEmailChangeNoticeInput): Promise<void> {
    const { text, html } = renderEmailChangeNoticeEmail({
      firstName: input.firstName,
      newEmailMasked: input.newEmailMasked,
    });
    await this.post({
      to: input.email,
      subject: "Your Minotaurus account email was changed",
      text,
      html,
    });
  }

  async sendMail(input: SendMailInput): Promise<void> {
    // Content is pre-rendered by the caller; just hand it to the shared transport.
    await this.post({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments,
    });
  }

  /**
   * Shared Resend transport. A missing API key → 503 EMAIL_NOT_CONFIGURED; a
   * transport error or non-2xx → 502 EMAIL_PROVIDER_ERROR. The Resend response
   * body / API key are NEVER returned to the client — only logged server-side
   * (masked recipient, no secrets).
   */
  private async post(msg: {
    to: string;
    subject: string;
    text: string;
    html: string;
    attachments?: { filename: string; content: Buffer }[];
  }): Promise<void> {
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
          // Resend accepts base64-encoded attachment content.
          ...(msg.attachments?.length
            ? {
                attachments: msg.attachments.map((a) => ({
                  filename: a.filename,
                  content: a.content.toString("base64"),
                })),
              }
            : {}),
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

/**
 * Email-change confirmation — the 6-digit code sent to the NEW address. Same
 * dark/branded shell as the verification email, with copy that makes clear the
 * change only takes effect once this code is entered.
 */
function renderEmailChangeCodeEmail(opts: {
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
    `Use this code to confirm this as your new Minotaurus email address: ${opts.code}`,
    `It expires in ${expires} minutes.`,
    "",
    "Your email won't change until this code is entered. If you didn't request this, you can ignore this email.",
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
<title>Confirm your new email</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0c;color:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Minotaurus email-change code is ${opts.code} — expires in ${expires} minutes.</div>
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
            <h1 style="margin:12px 0 4px 0;font-size:20px;font-weight:600;color:#f4f4f5;">Confirm your new email</h1>
            <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#a1a1aa;">${greetingHtml} enter this code in Minotaurus to start using this address.</p>
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
            <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">This code expires in ${expires} minutes. Your email won't change until it's entered.</p>
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
 * Email-change security notice — sent to the OLD address after the change
 * completes. No code; it's an alert so a hijacker can't silently move the email
 * without the original owner being told. `newEmailMasked` is already masked by
 * the caller (it's the destination address, shown partially for recognition).
 */
function renderEmailChangeNoticeEmail(opts: {
  firstName?: string;
  newEmailMasked: string;
}): { text: string; html: string } {
  const greetingText = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const greetingHtml = opts.firstName ? `Hi ${escapeHtml(opts.firstName)},` : "Hi,";
  const maskedHtml = escapeHtml(opts.newEmailMasked);

  const text = [
    greetingText,
    "",
    `The email address on your Minotaurus account was just changed to ${opts.newEmailMasked}.`,
    "",
    "If this was you, no action is needed.",
    "If this WASN'T you, your account may be compromised — contact support immediately.",
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
<title>Your account email was changed</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0c;color:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Minotaurus account email was changed to ${maskedHtml}.</div>
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
            <h1 style="margin:12px 0 4px 0;font-size:20px;font-weight:600;color:#f4f4f5;">Your account email was changed</h1>
            <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#a1a1aa;">${greetingHtml} the email on your Minotaurus account was changed to <span style="color:#f4f4f5;font-weight:600;">${maskedHtml}</span>.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#18181b;border:1px solid #7f1d1d;border-radius:10px;padding:14px 16px;">
                  <p style="margin:0;font-size:13px;line-height:1.6;color:#fca5a5;">If this wasn't you, your account may be compromised — contact support immediately.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 32px 0 32px;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">If you made this change, no action is needed.</p>
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
