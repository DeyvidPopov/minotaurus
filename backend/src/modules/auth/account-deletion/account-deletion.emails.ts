// Branded email content for the account-deletion flow. Kept in this module (the
// feature owns its copy) and delivered through the generic EmailService.sendMail
// seam. Dark/inline-styled shell mirrors the verification/reset emails.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "2026-07-06" — stable, locale-independent. */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Wrap body rows in the shared dark branded shell. `inner` is trusted HTML. */
function shell(title: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0c;color:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0c;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;background-color:#111114;border:1px solid #27272a;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="padding:28px 32px 4px 32px;">
        <span style="font-size:18px;font-weight:700;letter-spacing:0.5px;color:#f4f4f5;">MINOTAURUS<span style="color:#8b5cf6;">.dev</span></span>
      </td></tr>
      ${inner}
      <tr><td style="padding:24px 32px 28px 32px;">
        <div style="border-top:1px solid #27272a;padding-top:16px;">
          <p style="margin:0;font-size:12px;color:#52525b;">— The Minotaurus Team</p>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderDeletionScheduledEmail(opts: {
  firstName?: string;
  scheduledFor: Date;
  undoUrl?: string | null;
}): RenderedEmail {
  const date = fmtDate(opts.scheduledFor);
  const greetingText = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const greetingHtml = opts.firstName ? `Hi ${esc(opts.firstName)},` : "Hi,";

  const undoLine = opts.undoUrl
    ? `To keep your account, undo the deletion: ${opts.undoUrl}`
    : `To keep your account, sign back in before then and choose "Reactivate".`;

  const text = [
    greetingText,
    "",
    `Your Minotaurus account is scheduled for permanent deletion on ${date}.`,
    "Until then your account is deactivated but recoverable.",
    "",
    undoLine,
    "",
    "If you meant to do this, no action is needed — everything will be removed on the date above.",
    "",
    "— The Minotaurus Team",
  ].join("\n");

  const undoHtml = opts.undoUrl
    ? `<tr><td style="padding:4px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background-color:#18181b;border:1px solid #8b5cf6;border-radius:10px;">
            <a href="${esc(opts.undoUrl)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Keep my account</a>
          </td></tr></table>
      </td></tr>`
    : `<tr><td style="padding:4px 32px 0 32px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">To keep your account, sign back in before then and choose <strong style="color:#f4f4f5;">Reactivate</strong>.</p>
      </td></tr>`;

  const inner = `
      <tr><td style="padding:8px 32px 0 32px;">
        <h1 style="margin:12px 0 4px 0;font-size:20px;font-weight:600;color:#f4f4f5;">Account scheduled for deletion</h1>
        <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#a1a1aa;">${greetingHtml} your Minotaurus account is scheduled for permanent deletion on <span style="color:#f4f4f5;font-weight:600;">${esc(date)}</span>. Until then it's deactivated but fully recoverable.</p>
      </td></tr>
      ${undoHtml}
      <tr><td style="padding:16px 32px 0 32px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">If you meant to do this, no action is needed — everything you own will be removed on the date above.</p>
      </td></tr>`;

  return {
    subject: "Your Minotaurus account is scheduled for deletion",
    text,
    html: shell("Account scheduled for deletion", inner),
  };
}

export function renderDataExportEmail(opts: { firstName?: string }): RenderedEmail {
  const greetingText = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const greetingHtml = opts.firstName ? `Hi ${esc(opts.firstName)},` : "Hi,";

  const text = [
    greetingText,
    "",
    "Your Minotaurus data export is attached as a .zip archive.",
    "It contains, for each project you own, a full JSON snapshot and a PDF report.",
    "",
    "We're sending this because you requested account deletion — keep it somewhere safe.",
    "",
    "— The Minotaurus Team",
  ].join("\n");

  const inner = `
      <tr><td style="padding:8px 32px 0 32px;">
        <h1 style="margin:12px 0 4px 0;font-size:20px;font-weight:600;color:#f4f4f5;">Your data export</h1>
        <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#a1a1aa;">${greetingHtml} your Minotaurus data export is attached as a <span style="color:#f4f4f5;font-weight:600;">.zip</span> archive — a full JSON snapshot and a PDF report for every project you own.</p>
      </td></tr>
      <tr><td style="padding:4px 32px 0 32px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">We're sending this because you requested account deletion. Keep it somewhere safe — you won't be able to download it again once your account is removed.</p>
      </td></tr>`;

  return {
    subject: "Your Minotaurus data export",
    text,
    html: shell("Your data export", inner),
  };
}
