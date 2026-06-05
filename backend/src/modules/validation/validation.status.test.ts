import test from "node:test";
import assert from "node:assert/strict";
import type { IssueStatus } from "@prisma/client";
import {
  buildStatusSnapshot,
  issueFingerprint,
  restoreIssueStatuses,
} from "./validation.status.js";

type Issue = {
  artifactId: string;
  category: string;
  severity: string;
  message: string;
  status: IssueStatus;
};

const issue = (over: Partial<Issue> = {}): Issue => ({
  artifactId: "art_1",
  category: "ARCHITECTURE",
  severity: "INFO",
  message: "Single-user project may reduce collaboration visibility.",
  status: "OPEN",
  ...over,
});

// A fresh draft as the engine produces it: always OPEN.
const draft = (over: Partial<Issue> = {}): Issue => issue({ status: "OPEN", ...over });

test("fingerprint is deterministic and order-stable", () => {
  const a = issue({ message: "x" });
  assert.equal(issueFingerprint(a), issueFingerprint({ ...a }));
});

test("fingerprint ignores status (status is what we restore, not key on)", () => {
  assert.equal(
    issueFingerprint(issue({ status: "OPEN" })),
    issueFingerprint(issue({ status: "RESOLVED" })),
  );
});

test("fingerprint distinguishes each component field", () => {
  const base = issue();
  const fp = issueFingerprint(base);
  assert.notEqual(fp, issueFingerprint({ ...base, artifactId: "art_2" }));
  assert.notEqual(fp, issueFingerprint({ ...base, category: "SECURITY" }));
  assert.notEqual(fp, issueFingerprint({ ...base, severity: "ERROR" }));
  assert.notEqual(fp, issueFingerprint({ ...base, message: "different" }));
});

test("snapshot keeps only IGNORED issues (OPEN and RESOLVED are dropped)", () => {
  const snap = buildStatusSnapshot([
    issue({ artifactId: "a", status: "OPEN" }),
    issue({ artifactId: "b", status: "RESOLVED" }),
    issue({ artifactId: "c", status: "IGNORED" }),
  ]);
  assert.equal(snap.size, 1);
  assert.equal(snap.get(issueFingerprint(issue({ artifactId: "c" }))), "IGNORED");
  assert.equal(snap.has(issueFingerprint(issue({ artifactId: "a" }))), false);
  assert.equal(snap.has(issueFingerprint(issue({ artifactId: "b" }))), false);
});

test("RESOLVED is NOT preserved — a still-produced finding reopens as OPEN", () => {
  // User believed they fixed it, but the finding is still produced -> the fix
  // didn't take, so it must reopen rather than stay suppressed.
  const previous = [issue({ status: "RESOLVED" })];
  const drafts = [draft()];
  const restored = restoreIssueStatuses(drafts, buildStatusSnapshot(previous));
  assert.equal(restored[0].status, "OPEN");
});

test("IGNORED (waived) status survives a rerun for a matching finding", () => {
  const previous = [issue({ status: "IGNORED" })];
  const restored = restoreIssueStatuses([draft()], buildStatusSnapshot(previous));
  assert.equal(restored[0].status, "IGNORED");
});

test("reopened (from IGNORED) issue stays OPEN after a rerun", () => {
  // The user reopened it, so the previous row is OPEN -> not snapshotted ->
  // the recomputed draft (also OPEN) is left untouched. It only re-waives if the
  // user marks it IGNORED again.
  const previous = [issue({ status: "OPEN" })];
  const restored = restoreIssueStatuses([draft()], buildStatusSnapshot(previous));
  assert.equal(restored[0].status, "OPEN");
});

test("a RESOLVED finding that no longer recurs simply disappears (not resurrected)", () => {
  const previous = [issue({ artifactId: "gone", status: "RESOLVED" })];
  // New run produces a different finding only.
  const drafts = [draft({ artifactId: "present" })];
  const restored = restoreIssueStatuses(drafts, buildStatusSnapshot(previous));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].artifactId, "present");
  assert.equal(restored[0].status, "OPEN");
});

test("an IGNORED finding that no longer recurs simply disappears (not resurrected)", () => {
  const previous = [issue({ artifactId: "gone", status: "IGNORED" })];
  const drafts = [draft({ artifactId: "present" })];
  const restored = restoreIssueStatuses(drafts, buildStatusSnapshot(previous));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].artifactId, "present");
  assert.equal(restored[0].status, "OPEN");
});

test("a brand-new finding with no prior match stays OPEN", () => {
  const previous = [issue({ artifactId: "old", status: "IGNORED" })];
  const restored = restoreIssueStatuses([draft({ artifactId: "new" })], buildStatusSnapshot(previous));
  assert.equal(restored[0].status, "OPEN");
});

test("restore only re-waives matching drafts, leaving others OPEN", () => {
  const previous = [issue({ artifactId: "a", status: "IGNORED" })];
  const drafts = [draft({ artifactId: "a" }), draft({ artifactId: "b" })];
  const restored = restoreIssueStatuses(drafts, buildStatusSnapshot(previous));
  assert.equal(restored.find((d) => d.artifactId === "a")?.status, "IGNORED");
  assert.equal(restored.find((d) => d.artifactId === "b")?.status, "OPEN");
});

test("empty snapshot returns the drafts unchanged (and is a no-op)", () => {
  const drafts = [draft(), draft({ artifactId: "x" })];
  const restored = restoreIssueStatuses(drafts, buildStatusSnapshot([]));
  assert.deepEqual(restored, drafts);
});

test("restore is deterministic — same inputs, same output", () => {
  const previous = [
    issue({ artifactId: "a", status: "IGNORED" }),
    issue({ artifactId: "b", status: "IGNORED" }),
  ];
  const drafts = [draft({ artifactId: "a" }), draft({ artifactId: "b" }), draft({ artifactId: "c" })];
  const snap = buildStatusSnapshot(previous);
  assert.deepEqual(restoreIssueStatuses(drafts, snap), restoreIssueStatuses(drafts, snap));
});

// ── Phase A regression: CODE-prefix safety for the fingerprint ──

test("fingerprint ignores a CODE prefix (same finding, prefixed or not)", () => {
  const plain = issue({ category: "API", message: 'POST /x: field "y" maps to nothing' });
  const prefixed = issue({ category: "API", message: 'API_FIELD_UNMAPPED · POST /x: field "y" maps to nothing' });
  assert.equal(issueFingerprint(plain), issueFingerprint(prefixed));
});

test("IGNORED survives a rerun even if the message GAINS a CODE prefix", () => {
  // Previously persisted with no prefix and waived; the rerun now emits the same
  // finding WITH a "CODE · " prefix. The waive must still be preserved.
  const previous = [issue({ category: "API", message: 'POST /x: field "y" maps to nothing', status: "IGNORED" })];
  const drafts = [draft({ category: "API", message: 'API_FIELD_UNMAPPED · POST /x: field "y" maps to nothing' })];
  const restored = restoreIssueStatuses(drafts, buildStatusSnapshot(previous));
  assert.equal(restored[0].status, "IGNORED");
});

test("IGNORED survives a rerun even if the message LOSES a CODE prefix", () => {
  const previous = [issue({ category: "API", message: 'API_FIELD_UNMAPPED · POST /x: field "y" maps to nothing', status: "IGNORED" })];
  const drafts = [draft({ category: "API", message: 'POST /x: field "y" maps to nothing' })];
  const restored = restoreIssueStatuses(drafts, buildStatusSnapshot(previous));
  assert.equal(restored[0].status, "IGNORED");
});
