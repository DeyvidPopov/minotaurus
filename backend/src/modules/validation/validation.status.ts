// Pure helpers for preserving a user's IGNORED (waived/accepted) decision on a
// ValidationIssue across validation reruns.
//
// runValidationForProject wipes and recreates every issue row on each run, so a
// manual triage decision would otherwise revert to OPEN. Issue rows get fresh
// ids on every run, so we re-identify "the same finding" by a deterministic
// content fingerprint — artifactId | category | severity | message — not by id.
//
// Only IGNORED is carried forward, and the asymmetry is deliberate:
//   - IGNORED = "accepted / won't fix". If the finding recurs it stays waived.
//   - RESOLVED = "I believe I fixed this". If the finding is STILL produced on a
//     later run, the fix didn't take, so it must reopen as OPEN (never silently
//     suppressed). A genuinely-fixed finding simply isn't produced again and so
//     disappears on its own.
//
// Pure + deterministic: no IO, no clock, no randomness. Same input => same output.

import type { IssueStatus } from "@prisma/client";
import { stripFindingCode } from "../findings/finding-classifier.js";

export interface IssueFingerprintInput {
  artifactId: string;
  category: string;
  severity: string;
  message: string;
}

// "|" is collision-free here: artifactId/category/severity never contain it,
// and message is the trailing field, so any "|" inside it can't shift a
// boundary. Order is fixed, so the fingerprint is deterministic.
const SEP = "|";

// Fingerprint on the CODE-stripped message so a finding keeps a stable identity
// even if its message gains or loses a "CODE · " prefix between runs. Without
// this, adding a code prefix would silently reset a user's IGNORED (waived)
// decision on the next validation run.
export function issueFingerprint(issue: IssueFingerprintInput): string {
  return [issue.artifactId, issue.category, issue.severity, stripFindingCode(issue.message)].join(SEP);
}

/**
 * Snapshot only IGNORED (waived) issues, keyed by fingerprint. OPEN and
 * RESOLVED are intentionally NOT carried forward: a recomputed issue defaults
 * to OPEN, and a RESOLVED finding that is still produced must reopen rather than
 * stay suppressed (see the module header).
 */
export function buildStatusSnapshot(
  previous: Array<IssueFingerprintInput & { status: IssueStatus }>,
): Map<string, IssueStatus> {
  const snapshot = new Map<string, IssueStatus>();
  for (const issue of previous) {
    if (issue.status === "IGNORED") snapshot.set(issueFingerprint(issue), issue.status);
  }
  return snapshot;
}

/**
 * Restore each draft's status from the snapshot when a finding with the same
 * fingerprint was previously IGNORED. Drafts with no match keep their (OPEN)
 * status; findings that no longer recur simply never appear in `drafts`, so they
 * disappear normally.
 */
export function restoreIssueStatuses<
  T extends IssueFingerprintInput & { status: IssueStatus },
>(drafts: T[], snapshot: Map<string, IssueStatus>): T[] {
  if (snapshot.size === 0) return drafts;
  return drafts.map((draft) => {
    const previousStatus = snapshot.get(issueFingerprint(draft));
    return previousStatus && previousStatus !== draft.status
      ? { ...draft, status: previousStatus }
      : draft;
  });
}

/**
 * Select the NEWLY-surfaced OPEN ERROR findings from a run's (status-restored)
 * drafts — i.e. ERROR/OPEN issues whose fingerprint was NOT present before this
 * run. This is the dedup gate for validation-alert emails (Option A): a still-
 * open ERROR, a waived (IGNORED) ERROR, or one already seen on a prior run (any
 * prior status, including RESOLVED) is NOT re-alerted, so reruns over the same
 * unresolved findings don't spam the owner.
 *
 * Pure + deterministic. Pass `previousFingerprints` = the set of
 * `issueFingerprint(...)` over the issues that existed before the run.
 */
export function selectNewErrorIssues<
  T extends IssueFingerprintInput & { status: IssueStatus },
>(drafts: T[], previousFingerprints: ReadonlySet<string>): T[] {
  return drafts.filter(
    (d) =>
      d.severity === "ERROR" &&
      d.status === "OPEN" &&
      !previousFingerprints.has(issueFingerprint(d)),
  );
}
