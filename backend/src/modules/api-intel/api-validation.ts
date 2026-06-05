// api-validation.ts — Phase 4: deterministic API security/mapping rules derived
// from endpoint payloads. Pure (no AI, no IO, no DB); the validation engine owns
// persistence. Reuses the Phase 1 analyzer primitives so heuristics never drift.

import { buildEntityMatcher, extractFieldNames, sensitiveKind } from "./payload-analyzer.js";
import { AUTH_ACTIONS, idStem, normalizeToken, parsePath } from "./text.js";
import { USER_SCOPED_STEMS } from "./api-intel.constants.js";
import type {
  ApiValidationCode,
  ApiValidationFinding,
  ApiValidationInput,
  EndpointInput,
  IssueCategory,
  IssueSeverity,
  SpecInput,
} from "./api-intel.types.js";

// The auth-endpoint allow-list lives in text.ts (`AUTH_ACTIONS`) so the API
// validation rules AND the rule-based validation engine share one definition.

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function uniqSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort(cmp);
}

/** Run all four deterministic API validation rules over the project's payloads. */
export function analyzeApiValidation(input: ApiValidationInput): ApiValidationFinding[] {
  const matchesEntity = buildEntityMatcher(input.models);
  const findings: ApiValidationFinding[] = [];
  const specs = [...input.specs].sort((a, b) => cmp(a.id, b.id));

  for (const spec of specs) {
    const endpoints = [...spec.endpoints].sort((a, b) => cmp(a.id, b.id));
    for (const ep of endpoints) {
      const parsed = parsePath(ep.path);
      const isAuthAction = parsed.action != null && AUTH_ACTIONS.has(parsed.action);
      const reqFields = extractFieldNames(ep.requestSchema, "request");
      const resFields = extractFieldNames(ep.responseSchema, "response");
      const allFields = [...reqFields, ...resFields];

      // 1. API_FIELD_UNMAPPED — an id-like field resolving to no entity (advisory).
      const unmapped: string[] = [];
      for (const f of allFields) {
        const stem = idStem(f.name);
        if (stem && !matchesEntity(stem)) unmapped.push(f.name);
      }
      for (const field of uniqSorted(unmapped)) {
        push(findings, spec, ep, "API_FIELD_UNMAPPED", "INFO", "API",
          `field "${field}" looks like an entity reference but maps to no database entity`);
      }

      // 2. PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD — public, non-auth endpoint
      //    that accepts a sensitive field in the REQUEST without authentication.
      if (!ep.requiresAuth && !isAuthAction) {
        const sensitive = reqFields.filter((f) => sensitiveKind(f.name) !== null).map((f) => f.name);
        for (const field of uniqSorted(sensitive)) {
          push(findings, spec, ep, "PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD", "WARNING", "SECURITY",
            `public endpoint accepts sensitive field "${field}" without authentication`);
        }
      }

      // 3. USER_SCOPED_ENDPOINT_WITHOUT_AUTH — public, non-auth endpoint operating
      //    on user-owned data (a user-scoped id field, or /{resource}/{id} where
      //    the resource is user-scoped).
      if (!ep.requiresAuth && !isAuthAction) {
        const userScopedFields = allFields
          .filter((f) => {
            const stem = idStem(f.name);
            return stem != null && USER_SCOPED_STEMS.has(normalizeToken(stem));
          })
          .map((f) => f.name);
        const uniqUserFields = uniqSorted(userScopedFields);
        const pathScoped =
          parsed.resource != null && USER_SCOPED_STEMS.has(parsed.resource) && parsed.scope === "single";
        if (uniqUserFields.length > 0 || pathScoped) {
          const reason = uniqUserFields.length > 0
            ? `user-scoped field "${uniqUserFields[0]}"`
            : `user-scoped resource "${parsed.resource}"`;
          push(findings, spec, ep, "USER_SCOPED_ENDPOINT_WITHOUT_AUTH", "ERROR", "SECURITY",
            `operates on ${reason} but requires no authentication`);
        }
      }

      // 4. RESPONSE_EXPOSES_TOKEN_OR_SECRET — a credential field in the RESPONSE
      //    of a non-auth endpoint (login legitimately returns a token → excluded).
      if (!isAuthAction) {
        const credentials = resFields.filter((f) => sensitiveKind(f.name) === "credential").map((f) => f.name);
        for (const field of uniqSorted(credentials)) {
          push(findings, spec, ep, "RESPONSE_EXPOSES_TOKEN_OR_SECRET", "WARNING", "SECURITY",
            `response exposes credential field "${field}"`);
        }
      }
    }
  }

  return findings.sort(
    (a, b) => cmp(a.apiSpecId, b.apiSpecId) || cmp(a.path, b.path) || cmp(a.code, b.code) || cmp(a.message, b.message),
  );
}

function push(
  out: ApiValidationFinding[],
  spec: SpecInput,
  ep: EndpointInput,
  code: ApiValidationCode,
  severity: IssueSeverity,
  category: IssueCategory,
  detail: string,
): void {
  out.push({
    code,
    severity,
    category,
    apiSpecId: spec.id,
    endpointId: ep.id,
    method: ep.method,
    path: ep.path,
    message: `${ep.method} ${ep.path}: ${detail}`,
  });
}
