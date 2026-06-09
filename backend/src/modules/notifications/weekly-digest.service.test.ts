import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildWeeklyDigestEmail,
  sendWeeklyDigests,
  sortDigestProjects,
} from "./weekly-digest.service.js";
import { HttpError } from "../../utils/response.js";
import type { DigestProjectSummary, DigestRecipient } from "./notification.types.js";

// ── helpers ──────────────────────────────────────────────────────────────────

interface SentMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function emailSpy(opts: { fail?: boolean } = {}) {
  const calls: SentMail[] = [];
  return {
    calls,
    service: {
      name: "spy",
      sendMail: async (input: SentMail) => {
        calls.push(input);
        if (opts.fail) throw new HttpError(502, "EMAIL_PROVIDER_ERROR", "Failed to send the email");
      },
    },
  };
}

const noopLog = () => {};

function proj(over: Partial<DigestProjectSummary> = {}): DigestProjectSummary {
  return { projectId: "p", name: "Project", open: 0, critical: 0, error: 0, warning: 0, info: 0, ...over };
}

function recipient(over: Partial<DigestRecipient> = {}): DigestRecipient {
  return { userId: "u1", email: "owner@example.com", firstName: "Ada", ...over };
}

// ── 1. sort orders worst-first ─────────────────────────────────────────────────

test("sortDigestProjects orders by severity weight (critical first), then open, then name", () => {
  const a = proj({ name: "A", open: 3, warning: 3 });
  const b = proj({ name: "B", open: 1, error: 1 });
  const c = proj({ name: "C", open: 1, critical: 1 });
  const sorted = sortDigestProjects([a, b, c]).map((p) => p.name);
  assert.deepEqual(sorted, ["C", "B", "A"]); // critical > error > warning
});

// ── 2. email renders a per-project summary ─────────────────────────────────────

test("buildWeeklyDigestEmail summarizes open issues and counts projects with issues", () => {
  const email = buildWeeklyDigestEmail({
    firstName: "Ada",
    projects: [
      proj({ name: "Shop", open: 3, error: 2, warning: 1 }),
      proj({ name: "Clean", open: 0 }),
    ],
    appBaseUrl: "https://app.example.com",
  });
  assert.match(email.subject, /3 open issues across 1 project/);
  assert.match(email.text, /Shop: 2 errors · 1 warning/);
  assert.match(email.html, /Shop/);
  assert.match(email.text, /https:\/\/app\.example\.com\/dashboard/);
});

// ── 3. "all clear" when there are no open issues ───────────────────────────────

test("buildWeeklyDigestEmail renders an all-clear subject with zero open issues", () => {
  const email = buildWeeklyDigestEmail({ projects: [proj({ name: "Shop", open: 0 })], appBaseUrl: null });
  assert.match(email.subject, /all clear/i);
});

// ── 4. opted-in recipient with open issues gets one email ──────────────────────

test("a recipient with open issues receives exactly one digest email", async () => {
  const spy = emailSpy();
  const outcome = await sendWeeklyDigests({
    loadRecipients: async () => [recipient()],
    loadProjectSummaries: async () => [proj({ name: "Shop", open: 2, error: 2 })],
    emailService: spy.service,
    log: noopLog,
    appBaseUrl: null,
  });
  assert.equal(spy.calls.length, 1);
  assert.deepEqual(outcome, { recipients: 1, sent: 1, failed: 0, skipped: 0 });
});

// ── 5. a recipient with no open issues is skipped (no all-clear spam) ──────────

test("a recipient with zero open issues is skipped, not emailed", async () => {
  const spy = emailSpy();
  const outcome = await sendWeeklyDigests({
    loadRecipients: async () => [recipient()],
    loadProjectSummaries: async () => [proj({ name: "Shop", open: 0 })],
    emailService: spy.service,
    log: noopLog,
    appBaseUrl: null,
  });
  assert.equal(spy.calls.length, 0);
  assert.deepEqual(outcome, { recipients: 1, sent: 0, failed: 0, skipped: 1 });
});

// ── 6. a malformed address never reaches the provider ──────────────────────────

test("a recipient with an invalid email is filtered out before sending", async () => {
  const spy = emailSpy();
  const outcome = await sendWeeklyDigests({
    loadRecipients: async () => [recipient({ email: "not-an-email" })],
    loadProjectSummaries: async () => [proj({ name: "Shop", open: 2, error: 2 })],
    emailService: spy.service,
    log: noopLog,
    appBaseUrl: null,
  });
  assert.equal(spy.calls.length, 0);
  assert.equal(outcome.recipients, 0);
});

// ── 7. a provider failure does not throw (one bad send can't abort the batch) ──

test("a provider failure is swallowed and counted as failed", async () => {
  const spy = emailSpy({ fail: true });
  const outcome = await sendWeeklyDigests({
    loadRecipients: async () => [recipient()],
    loadProjectSummaries: async () => [proj({ name: "Shop", open: 1, error: 1 })],
    emailService: spy.service,
    log: noopLog,
    appBaseUrl: null,
  });
  assert.equal(outcome.failed, 1);
  assert.equal(outcome.sent, 0);
});
