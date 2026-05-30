// Export Engine V2 — Architecture Analysis Engine constants.
//
// Single source of truth for every threshold, weight and band used by the
// deterministic analysis layer. Changing a number here changes every report
// consistently — and the change is auditable in git. No logic lives in this
// file; it is pure configuration consumed by `metrics.engine.ts`.

/** Composite health-score weights. MUST sum to 1.00. */
export const HEALTH_WEIGHTS = {
  documentation: 0.2,
  connectivity: 0.2,
  traceability: 0.2,
  validation: 0.25,
  governance: 0.15,
} as const;

/** Per-severity penalty weight for the validation sub-score. */
export const SEVERITY_WEIGHT: Record<string, number> = {
  CRITICAL: 10,
  ERROR: 5,
  WARNING: 2,
  INFO: 0.5,
};

/** Stable ordering rank for severities (lower = more severe = sorts first). */
export const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  ERROR: 1,
  WARNING: 2,
  INFO: 3,
};

/** Relative weights for the traceability composite (renormalized when a side is null). */
export const TRACE_WEIGHTS = {
  requirement: 0.6,
  resource: 0.4,
} as const;

export const DEGREE_LIMIT = 6; // relations above this flag over-coupling
export const CHURN_WINDOW_DAYS = 7; // window for HIGH_CHURN detection
export const CHURN_LIMIT = 5; // CREATED/UPDATED events above this = churn (strictly greater)
export const GOV_RECENCY_DAYS = 30; // "recently validated" window
export const VALIDATION_K = 10; // validation penalty scale
export const COUPLING_PENALTY_CAP = 15; // max connectivity points lost to over-coupling
export const HUB_LIMIT = 10; // max hubs emitted

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Grade bands applied to the composite 0–100 score. */
export const GRADE_BANDS: ReadonlyArray<{
  min: number;
  max: number;
  label: string;
  grade: string;
}> = [
  { min: 90, max: 100, label: "Excellent", grade: "A" },
  { min: 75, max: 89, label: "Healthy", grade: "B" },
  { min: 60, max: 74, label: "Fair", grade: "C" },
  { min: 40, max: 59, label: "At Risk", grade: "D" },
  { min: 0, max: 39, label: "Critical", grade: "F" },
];

/** Result for a project with no artifacts to score. */
export const EMPTY_GRADE = { grade: "N/A", label: "Insufficient data" } as const;
