import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildValidationAlertEmail,
  selectAlertRecipientUserIds,
  sendValidationAlerts,
} from "./validation-alert.service.js";
import { HttpError } from "../../utils/response.js";
import {
  issueFingerprint,
  selectNewErrorIssues,
} from "../validation/validation.status.js";
import type { AlertRecipient } from "./notification.types.js";

// ── helpers ──────────────────────────────────────────────────────────────────

interface SentMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** A fake EmailService.sendMail that records every call. */
function emailSpy(opts: { fail?: boolean } = {}) {
  const calls: SentMail[] = [];
  return {
    calls,
    service: {
      name: "spy",
      sendMail: async (input: SentMail) => {
        calls.push(input);
        if (opts.fail) {
          throw new HttpError(502, "EMAIL_PROVIDER_ERROR", "Failed to send the email");
        }
      },
    },
  };
}

const noopLog = () => {};

function recipient(over: Partial<AlertRecipient> = {}): AlertRecipient {
  return {
    userId: "u1",
    email: "owner@example.com",
    firstName: "Ada",
    validationAlertsEnabled: true,
    ...over,
  };
}

function errIssue(message: string, subjectId = "a1") {
  return { subjectId, category: "DATABASE", message };
}

// ── 1. opted-out recipient receives no email ───────────────────────────────────

test("a recipient with validationAlertsEnabled=false receives no email", async () => {
  const spy = emailSpy();
  const outcome = await sendValidationAlerts(
    { projectId: "p1", errorIssues: [errIssue("FK has no target entity.")] },
    {
      loadAlertTargets: async () => ({
        projectName: "Shop",
        recipients: [recipient({ validationAlertsEnabled: false })],
      }),
      emailService: spy.service,
      log: noopLog,
      appBaseUrl: null,
    },
  );
  assert.equal(spy.calls.length, 0);
  assert.deepEqual(outcome, { attempted: 0, sent: 0, failed: 0, skipped: false });
});

// ── 2. opted-in recipient receives one email for ERROR issues ──────────────────

test("an opted-in recipient receives exactly one alert email", async () => {
  const spy = emailSpy();
  const outcome = await sendValidationAlerts(
    { projectId: "p1", errorIssues: [errIssue("FK has no target entity.")] },
    {
      loadAlertTargets: async () => ({ projectName: "Shop", recipients: [recipient()] }),
      emailService: spy.service,
      log: noopLog,
      appBaseUrl: null,
    },
  );
  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0].to, "owner@example.com");
  assert.match(spy.calls[0].subject, /Minotaurus validation alert: Shop/);
  assert.equal(outcome.sent, 1);
  assert.equal(outcome.failed, 0);
});

// ── 3. WARNING/INFO findings never become alert-eligible ───────────────────────

test("WARNING/INFO findings are filtered out and trigger no email", async () => {
  const drafts = [
    { subjectId: "a1", category: "DATABASE", severity: "WARNING", message: "no PK", status: "OPEN" as const },
    { subjectId: "a2", category: "DIAGRAM", severity: "INFO", message: "not linked", status: "OPEN" as const },
  ];
  const newErrors = selectNewErrorIssues(drafts, new Set());
  assert.equal(newErrors.length, 0, "only ERROR severity should be selected");

  // Feeding the (empty) result to the dispatcher sends nothing and skips.
  const spy = emailSpy();
  const outcome = await sendValidationAlerts(
    { projectId: "p1", errorIssues: newErrors },
    {
      loadAlertTargets: async () => ({ projectName: "Shop", recipients: [recipient()] }),
      emailService: spy.service,
      log: noopLog,
      appBaseUrl: null,
    },
  );
  assert.equal(spy.calls.length, 0);
  assert.equal(outcome.skipped, true);
});

// ── 4. multiple ERROR issues in one run produce ONE email ──────────────────────

test("multiple ERROR issues produce a single summarizing email", async () => {
  const spy = emailSpy();
  const issues = [
    errIssue("FK A has no target entity.", "a1"),
    errIssue("FK B references a missing entity.", "a2"),
    errIssue("FK C has no target entity.", "a3"),
  ];
  await sendValidationAlerts(
    { projectId: "p1", errorIssues: issues },
    {
      loadAlertTargets: async () => ({ projectName: "Shop", recipients: [recipient()] }),
      emailService: spy.service,
      log: noopLog,
      appBaseUrl: null,
    },
  );
  assert.equal(spy.calls.length, 1, "one email per user, not one per issue");
  assert.match(spy.calls[0].text, /3 new high-severity issues/);
});

// ── 4b. CRITICAL severity is alerted too (not just ERROR) ──────────────────────

test("a CRITICAL finding is selected for alerting", () => {
  const draft = {
    subjectId: "a9",
    category: "SECURITY",
    severity: "CRITICAL",
    message: "Public endpoint exposes a secret.",
    status: "OPEN" as const,
  };
  assert.equal(selectNewErrorIssues([draft], new Set()).length, 1);
});

// ── 5. a duplicate, already-known ERROR does not re-alert ──────────────────────

test("an ERROR whose fingerprint existed before the run is not re-selected (dedup)", () => {
  const draft = {
    subjectId: "a1",
    category: "DATABASE",
    severity: "ERROR",
    message: "FK has no target entity.",
    status: "OPEN" as const,
  };
  // First run (no previous) ⇒ it's new.
  assert.equal(selectNewErrorIssues([draft], new Set()).length, 1);

  // Rerun: the same finding was present before ⇒ NOT new ⇒ no re-alert.
  const previous = new Set([issueFingerprint(draft)]);
  assert.equal(selectNewErrorIssues([draft], previous).length, 0);
});

// ── 6. a provider failure does not throw (validation must not fail) ────────────

test("an email provider failure is swallowed (does not fail the run)", async () => {
  const spy = emailSpy({ fail: true });
  const outcome = await sendValidationAlerts(
    { projectId: "p1", errorIssues: [errIssue("FK has no target entity.")] },
    {
      loadAlertTargets: async () => ({ projectName: "Shop", recipients: [recipient()] }),
      emailService: spy.service,
      log: noopLog,
      appBaseUrl: null,
    },
  );
  // It attempted the send, the provider threw, and the dispatcher resolved cleanly.
  assert.equal(spy.calls.length, 1);
  assert.deepEqual(outcome, { attempted: 1, sent: 0, failed: 1, skipped: false });
});

test("a thrown loadAlertTargets is swallowed (does not fail the run)", async () => {
  const outcome = await sendValidationAlerts(
    { projectId: "p1", errorIssues: [errIssue("boom")] },
    {
      loadAlertTargets: async () => {
        throw new Error("db down");
      },
      emailService: emailSpy().service,
      log: noopLog,
      appBaseUrl: null,
    },
  );
  assert.deepEqual(outcome, { attempted: 0, sent: 0, failed: 0, skipped: false });
});

// ── 7. recipient selection respects the owner rule ─────────────────────────────

test("recipient selection includes the owner + OWNER members, excludes lower roles", () => {
  const ids = selectAlertRecipientUserIds({
    ownerId: "owner",
    members: [
      { userId: "owner", role: "OWNER" }, // duplicate of the owner pointer
      { userId: "coOwner", role: "OWNER" },
      { userId: "arch", role: "ARCHITECT" },
      { userId: "dev", role: "DEVELOPER" },
      { userId: "viewer", role: "VIEWER" },
    ],
  });
  assert.deepEqual([...ids].sort(), ["coOwner", "owner"]);
});

test("the owner pointer is always a recipient even with no member rows", () => {
  const ids = selectAlertRecipientUserIds({ ownerId: "solo", members: [] });
  assert.deepEqual(ids, ["solo"]);
});

// ── bonus: email content is well-formed and escapes user input ─────────────────

test("the email lists the top 5 messages and notes the remainder", () => {
  const issues = Array.from({ length: 7 }, (_, i) => errIssue(`error number ${i + 1}`, `a${i}`));
  const email = buildValidationAlertEmail({
    projectId: "p1",
    projectName: "Shop",
    errorIssues: issues,
    firstName: "Ada",
    appBaseUrl: "https://app.minotaurus.dev",
  });
  assert.match(email.text, /error number 5/);
  assert.doesNotMatch(email.text, /error number 6\b/); // only top 5 listed verbatim
  assert.match(email.text, /…and 2 more\./);
  assert.match(email.html, /https:\/\/app\.minotaurus\.dev\/projects\/p1\/validation/);
  assert.match(email.text, /You are receiving this because Validation alerts are enabled/);
});

test("a project name with HTML is escaped in the HTML body but not the subject", () => {
  const email = buildValidationAlertEmail({
    projectId: "p1",
    projectName: `Shop <script>`,
    errorIssues: [errIssue("boom")],
    appBaseUrl: null,
  });
  assert.match(email.html, /Shop &lt;script&gt;/);
  assert.doesNotMatch(email.html, /Shop <script>/);
  // Subject is plain text (no escaping needed/applied).
  assert.equal(email.subject, "Minotaurus validation alert: Shop <script>");
});
