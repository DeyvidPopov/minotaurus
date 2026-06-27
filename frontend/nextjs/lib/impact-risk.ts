// lib/impact-risk.ts — deterministic change-impact risk model for the Impact
// Analysis page.
//
// Pure and explainable: the same ImpactResponse + nowMs always yields the same
// assessment, there is NO AI and NO hidden weighting, and every verdict ships
// the exact list of rules that produced it (surfaced in the UI's "How is this
// calculated?" panel). All inputs are fields the impact endpoint already
// returns — see modules/versions/impact.controller.ts.
import type { ImpactResponse } from "@/lib/api/versions";

export type RiskBand = "NONE" | "LOW" | "MEDIUM" | "HIGH";
export type DeletionVerdict = "SAFE" | "LOW" | "MEDIUM" | "HIGH";

// ≥5 direct dependents is "high fan-out" — the same threshold the validation
// engine's HIGH_FAN_OUT rule uses, so the two surfaces never disagree.
export const FAN_OUT_THRESHOLD = 5;

/** A bounded view of an open validation finding — only what the risk model needs.
 *  Sourced from the existing project validation list, filtered to this artifact. */
export interface ImpactFinding {
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  code: string | null;
}

export interface ImpactAssessment {
  overall: RiskBand;
  deletion: { verdict: DeletionVerdict; reason: string };
  modification: { band: RiskBand; reason: string };
  /** Short human chips justifying the verdict (shown under the summary). */
  reasons: string[];
  /** The exact rules that fired — drives the "How is this calculated?" panel. */
  rules: string[];
  metrics: {
    dependents: number;
    activeDependents: number;
    dependencies: number;
    assetsToReview: number;
    documented: boolean;
    ownsContract: boolean;
    lastChangeAt: string | null;
    changes30d: number;
    openFindings: number;
    blockingFindings: number;
  };
}

const DAY = 24 * 60 * 60 * 1000;

const bandWord = (b: RiskBand): string =>
  b === "NONE" ? "Minimal" : b.charAt(0) + b.slice(1).toLowerCase();

export function assessImpact(data: ImpactResponse, nowMs: number, findings: ImpactFinding[] = []): ImpactAssessment {
  const dependents = data.dependentArtifacts;
  const dependencies = data.directDependencies;
  const dIn = dependents.length;
  const dOut = dependencies.length;
  const activeDependents = dependents.filter((r) => r.artifact.status === "ACTIVE").length;

  const apiCount = data.apiSpecs.length;
  const dbCount = data.databaseModels.length;
  const diagramCount = data.diagrams.length;
  const docCount = data.documentation.length;
  const assetsToReview = apiCount + dbCount + diagramCount + docCount;
  const ownsContract = apiCount > 0 || dbCount > 0;
  const documented = docCount > 0;

  const eventTimes = data.recentEvents
    .map((e) => Date.parse(e.createdAt))
    .filter((n) => Number.isFinite(n));
  const lastChangeAt = data.recentEvents[0]?.createdAt ?? null;
  const changes30d = eventTimes.filter((t) => nowMs - t <= 30 * DAY).length;

  // Only hard structural errors elevate the verdict; softer findings (high
  // fan-out, deprecated-dep, missing docs) are already represented by the
  // dependents/documentation factors and are surfaced for context, not scored.
  const blockingFindings = findings.filter((f) => f.severity === "ERROR" || f.severity === "CRITICAL").length;

  const rules: string[] = [];

  // ── Deletion impact — first matching rule wins ──
  let deletionVerdict: DeletionVerdict;
  let deletionReason: string;
  if (dIn === 0 && assetsToReview === 0) {
    deletionVerdict = "SAFE";
    deletionReason = "Nothing references this artifact and it owns no linked assets.";
    rules.push("Delete · no dependents and no linked assets → Safe");
  } else if (dIn === 0) {
    deletionVerdict = "LOW";
    deletionReason = "No components depend on this, but linked assets would be left unowned.";
    rules.push("Delete · no dependents, but linked assets exist → Low");
  } else if (activeDependents === 0) {
    deletionVerdict = "LOW";
    deletionReason = `${dIn} component${dIn === 1 ? "" : "s"} depend on this, but none are active.`;
    rules.push("Delete · dependents exist but none are Active → Low");
  } else if (dIn >= FAN_OUT_THRESHOLD || activeDependents >= 3) {
    deletionVerdict = "HIGH";
    deletionReason = `${dIn} components depend on this (${activeDependents} active) and would break if it is removed.`;
    rules.push(`Delete · ${dIn} dependents (≥${FAN_OUT_THRESHOLD}) or ≥3 active → High`);
  } else {
    deletionVerdict = "MEDIUM";
    deletionReason = `${activeDependents} active component${activeDependents === 1 ? "" : "s"} would break if this is removed.`;
    rules.push("Delete · has an Active dependent, fan-out < 5 → Medium");
  }

  // ── Modification impact — additive points → band ──
  let points = 0;
  if (dIn >= FAN_OUT_THRESHOLD) { points += 3; rules.push(`Modify · +3 — ${dIn} dependents (≥${FAN_OUT_THRESHOLD})`); }
  else if (dIn >= 3) { points += 2; rules.push(`Modify · +2 — ${dIn} dependents`); }
  else if (dIn >= 1) { points += 1; rules.push(`Modify · +1 — ${dIn} dependent${dIn === 1 ? "" : "s"}`); }
  if (activeDependents >= 1) { points += 1; rules.push("Modify · +1 — has an Active dependent"); }
  if (ownsContract) { points += 1; rules.push("Modify · +1 — owns an API/DB contract surface"); }
  if (!documented) { points += 1; rules.push("Modify · +1 — not documented"); }
  if (diagramCount > 0) { points += 1; rules.push("Modify · +1 — linked diagrams may go stale"); }
  if (blockingFindings > 0) {
    const fp = Math.min(2, blockingFindings);
    points += fp;
    rules.push(`Modify · +${fp} — ${blockingFindings} open error/critical validation finding${blockingFindings === 1 ? "" : "s"} (cap 2)`);
  }
  const modificationBand: RiskBand =
    points === 0 ? "NONE" : points <= 2 ? "LOW" : points <= 4 ? "MEDIUM" : "HIGH";
  rules.push(`Modify · ${points} point${points === 1 ? "" : "s"} → ${bandWord(modificationBand)}`);
  const modificationReason =
    dIn === 0
      ? "No components depend on this; changes stay local to the artifact and its linked assets."
      : `${dIn} component${dIn === 1 ? "" : "s"} consume this${ownsContract ? " and it owns a contract surface" : ""}${documented ? "" : "; it is undocumented"}.`;

  // ── Reason chips ──
  const reasons: string[] = [];
  if (activeDependents > 0) {
    reasons.push(`${activeDependents} active component${activeDependents === 1 ? "" : "s"} depend${activeDependents === 1 ? "s" : ""} on this`);
  } else if (dIn > 0) {
    reasons.push(`${dIn} non-active component${dIn === 1 ? "" : "s"} depend on this`);
  } else {
    reasons.push("Nothing depends on this artifact");
  }
  if (ownsContract) reasons.push(`Owns ${apiCount + dbCount} API/DB contract${apiCount + dbCount === 1 ? "" : "s"}`);
  if (!documented) reasons.push("Not documented");
  if (diagramCount > 0) reasons.push(`${diagramCount} linked diagram${diagramCount === 1 ? "" : "s"} may go stale`);
  if (blockingFindings > 0) reasons.push(`${blockingFindings} open validation error${blockingFindings === 1 ? "" : "s"}`);

  // ── Overall = the higher band of deletion vs modification ──
  const ORDER: RiskBand[] = ["NONE", "LOW", "MEDIUM", "HIGH"];
  const deletionBand: RiskBand = deletionVerdict === "SAFE" ? "NONE" : deletionVerdict;
  const overall = ORDER[Math.max(ORDER.indexOf(deletionBand), ORDER.indexOf(modificationBand))];
  rules.push(`Overall · max(Delete, Modify) → ${bandWord(overall)}`);

  return {
    overall,
    deletion: { verdict: deletionVerdict, reason: deletionReason },
    modification: { band: modificationBand, reason: modificationReason },
    reasons,
    rules,
    metrics: {
      dependents: dIn,
      activeDependents,
      dependencies: dOut,
      assetsToReview,
      documented,
      ownsContract,
      lastChangeAt,
      changes30d,
      openFindings: findings.length,
      blockingFindings,
    },
  };
}

// ── Presentation helpers (display-only band → colour/label) ──
// Shared so every surface that shows a verdict renders identical bands; pure data
// mapping, no logic. (The Impact page predates these and keeps inline copies.)
export const BAND_COLOR: Record<RiskBand, string> = {
  NONE: "var(--fg-muted)",
  LOW: "var(--c-success)",
  MEDIUM: "var(--c-warning)",
  HIGH: "var(--c-danger)",
};

export const BAND_LABEL: Record<RiskBand, string> = {
  NONE: "Minimal",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const verdictColor = (v: DeletionVerdict): string =>
  v === "SAFE" ? "var(--c-success)" : BAND_COLOR[v];

export const verdictLabel = (v: DeletionVerdict): string =>
  v === "SAFE" ? "Safe" : BAND_LABEL[v];
