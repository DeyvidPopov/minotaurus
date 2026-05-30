// Export Engine V2 — PDF renderer types.
//
// The renderer is presentation-only. It consumes:
//   • `analysis`  — the deterministic AnalysisResult (all scores/metrics)
//   • `content`   — the persisted SSOT snapshot (raw lists for appendix tables)
//   • `meta`      — ExportPackage identity (id, format, sections, createdAt)
// It NEVER recomputes a score. Any number shown comes from `analysis` or is a
// direct presentation of `content` (e.g. listing artifacts in the appendix).

import type { AnalysisResult, ExportSnapshot } from "../analysis/analysis.types.js";

export interface ExportMeta {
  id: string;
  format: string;
  sections: string[];
  createdAt: string;
}

export interface RenderInput {
  content: ExportSnapshot;
  analysis: AnalysisResult;
  meta: ExportMeta;
}
