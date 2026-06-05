// api-metrics.ts — Phase 5: deterministic API payload metrics for the export
// analysis engine. Pure (no AI, no IO, no Date.now). Returns raw counts + capped
// lists; the analysis engine derives the coverage percentages. Reuses the Phase
// 1/4 analyzer primitives so the heuristics never drift.

import { buildEntityMatcher, extractFieldNames, sensitiveKind } from "./payload-analyzer.js";
import { analyzeApiValidation } from "./api-validation.js";
import { idStem } from "./text.js";
import type {
  ApiIntelCounts,
  ApiIntelExposure,
  ApiIntelRisk,
  ApiValidationInput,
} from "./api-intel.types.js";

const LIST_CAP = 12;

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function analyzeApiIntelCounts(input: ApiValidationInput): ApiIntelCounts {
  const matchesEntity = buildEntityMatcher(input.models);

  let totalEndpoints = 0;
  let endpointsWithPayload = 0;
  let idLikeFieldTotal = 0;
  let mappedFieldTotal = 0;
  const exposures: ApiIntelExposure[] = [];

  for (const spec of input.specs) {
    for (const ep of spec.endpoints) {
      totalEndpoints += 1;
      if (ep.requestSchema.trim() !== "" || ep.responseSchema.trim() !== "") endpointsWithPayload += 1;

      const fields = [
        ...extractFieldNames(ep.requestSchema, "request"),
        ...extractFieldNames(ep.responseSchema, "response"),
      ];
      const seenSensitive = new Set<string>();
      for (const f of fields) {
        const stem = idStem(f.name);
        if (stem) {
          idLikeFieldTotal += 1;
          if (matchesEntity(stem)) mappedFieldTotal += 1;
        }
        const kind = sensitiveKind(f.name);
        if (kind) {
          const key = `${f.location}:${f.name.toLowerCase()}`;
          if (!seenSensitive.has(key)) {
            seenSensitive.add(key);
            exposures.push({ method: ep.method, path: ep.path, field: f.name, location: f.location, kind });
          }
        }
      }
    }
  }

  exposures.sort((a, b) => cmp(a.path, b.path) || cmp(a.location, b.location) || cmp(a.field, b.field));

  const risks: ApiIntelRisk[] = analyzeApiValidation(input)
    .filter((f) => f.category === "SECURITY")
    .map((f) => ({ code: f.code, severity: f.severity, method: f.method, path: f.path, message: f.message }));

  return {
    totalEndpoints,
    endpointsWithPayload,
    idLikeFieldTotal,
    mappedFieldTotal,
    sensitiveExposureCount: exposures.length,
    publicEndpointRiskCount: risks.length,
    sensitiveExposures: exposures.slice(0, LIST_CAP),
    risks: risks.slice(0, LIST_CAP),
  };
}
