// Export Engine V2 — report composition.
//
// Decides WHICH PDF sections render, from the selected export scope
// (ExportPackage.sections) plus the available data. Without this, the renderer
// blindly emits all 13 sections, so a DIAGRAMS-only export produced a 15-page
// report full of empty architecture pages.
//
// Pure & deterministic: a function of (sections, analysis, content) only — no
// I/O, no Date.now, no scoring. The renderer renders exactly what this returns,
// and the auto TOC lists exactly the rendered sections.

import type { AnalysisResult, ExportSnapshot } from "../analysis/analysis.types.js";

export interface ReportPlan {
  /** Only DIAGRAMS (no architecture-level scope) — drives the cover variant. */
  diagramsOnly: boolean;
  /** Cover + running-header + PDF metadata title. */
  reportTitle: string;
  /** Per top-level-section render flags. */
  include: {
    executiveSummary: boolean;
    healthDashboard: boolean;
    narrative: boolean;
    documentationCoverage: boolean;
    graphInsights: boolean;
    risks: boolean;
    validationFindings: boolean;
    traceability: boolean;
    governance: boolean;
    versionHistory: boolean;
    diagrams: boolean;
    appendix: boolean; // true iff any appendix subsection is included
    appendixArtifacts: boolean;
    appendixApi: boolean;
    appendixDb: boolean;
    appendixValidation: boolean;
  };
  /** Which headline KPI cards / health score the cover may show. */
  cover: {
    showHealth: boolean;
    showDocumented: boolean;
    showRelations: boolean;
    showFindings: boolean;
    showDiagramCount: boolean;
  };
}

// Logical capability -> the section tokens that imply it. Mirrors the alias
// handling in exports.engine.ts so gating matches what's actually in the
// snapshot (e.g. DOCUMENTATION implies artifacts; MEMBERS implies team).
const TOKEN_ALIASES: Record<string, string[]> = {
  ARTIFACTS: ["ARTIFACTS", "DOCUMENTATION"],
  RELATIONS: ["RELATIONS"],
  VALIDATION: ["VALIDATION", "VALIDATION_ISSUES", "VALIDATION_REPORT"],
  TEAM: ["TEAM", "MEMBERS"],
  API_SPECS: ["API_SPECS", "API_ENDPOINTS"],
  DATABASE_MODELS: ["DATABASE_MODELS", "DATABASE_ENTITIES"],
  DIAGRAMS: ["DIAGRAMS"],
  VERSION_HISTORY: ["VERSION_HISTORY", "RECENT_CHANGES"],
  IMPACT: ["IMPACT_ANALYSIS", "IMPACT"],
  GRAPH: ["GRAPH"],
};

// Capabilities that make this an "architecture" report (vs diagrams-only).
const ARCH_CAPS = [
  "ARTIFACTS",
  "RELATIONS",
  "VALIDATION",
  "TEAM",
  "API_SPECS",
  "DATABASE_MODELS",
  "VERSION_HISTORY",
  "IMPACT",
  "GRAPH",
];

export function buildReportPlan(
  sections: string[],
  analysis: AnalysisResult,
  content: ExportSnapshot,
): ReportPlan {
  const sel = new Set((sections || []).map((s) => s.toUpperCase()));
  // Empty scope = full report (back-compat: older exports stored no sections).
  const all = sel.size === 0;
  const has = (cap: string): boolean =>
    all || (TOKEN_ALIASES[cap] ?? [cap]).some((t) => sel.has(t));
  const empty = analysis.meta.emptyProject;

  const diagrams = has("DIAGRAMS");
  const anyArch = ARCH_CAPS.some((c) => has(c));
  const diagramsOnly = diagrams && !anyArch && !all;

  // Traceability needs actual rows, else skip entirely (spec rule).
  const tr = analysis.traceability;
  const hasTraceData =
    tr.requirementCoverage != null ||
    tr.resourceLinkage != null ||
    tr.unimplementedRequirements.length > 0 ||
    tr.unlinkedResources.length > 0;

  const include = {
    executiveSummary: has("ARTIFACTS") || has("RELATIONS") || has("VALIDATION") || has("TEAM") || has("API_SPECS") || has("DATABASE_MODELS") || has("VERSION_HISTORY"),
    healthDashboard: has("ARTIFACTS") && !empty,
    narrative: has("ARTIFACTS") && has("RELATIONS") && !empty,
    documentationCoverage: has("ARTIFACTS"),
    graphInsights: has("RELATIONS"),
    risks: has("VALIDATION") && has("ARTIFACTS") && has("RELATIONS"),
    validationFindings: has("VALIDATION"),
    traceability: has("ARTIFACTS") && has("RELATIONS") && hasTraceData,
    governance: has("TEAM"),
    versionHistory: has("VERSION_HISTORY"),
    diagrams,
    appendixArtifacts: has("ARTIFACTS"),
    appendixApi: has("API_SPECS"),
    appendixDb: has("DATABASE_MODELS"),
    appendixValidation: has("VALIDATION"),
    appendix: false,
  };
  include.appendix =
    include.appendixArtifacts || include.appendixApi || include.appendixDb || include.appendixValidation;

  return {
    diagramsOnly,
    reportTitle: diagramsOnly ? "Architecture Diagram Report" : "Architecture Intelligence Report",
    include,
    cover: {
      showHealth: include.healthDashboard,
      showDocumented: has("ARTIFACTS") && !empty,
      showRelations: has("RELATIONS") && !empty,
      showFindings: has("VALIDATION") && !empty,
      showDiagramCount: diagrams,
    },
  };
}
