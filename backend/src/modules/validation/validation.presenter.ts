// validation.presenter.ts — turns a stored ValidationIssue into actionable
// metadata: a canonical rule code, a prefix-stripped message, a plain-language
// "why", a manual "suggested fix", a determinism flag, and a resolved navigation
// target (artifact / api spec / db model / diagram / team).
//
// Identity (code, why, fix, targetKind) now comes from the shared finding
// catalog (../findings) — the single source of truth shared with Analysis, PDF
// and AI Review — instead of a local rule table. The presenter only adds the
// frontend-specific bit: resolving the catalog's targetKind to a concrete
// resource via the ResourceIndex.
//
// Pure + deterministic: no IO, no clock, no randomness.

import {
  FINDING_CODES,
  getFindingOrFallback,
} from "../findings/finding-catalog.js";
import {
  classifyFindingFromIssue,
  parseFindingCode,
} from "../findings/finding-classifier.js";
import type { FindingTargetKind } from "../findings/finding-types.js";

export type IssueTargetKind =
  | "TEAM"
  | "ARTIFACT"
  | "API_SPEC"
  | "DATABASE_MODEL"
  | "DIAGRAM";

export interface IssueTarget {
  kind: IssueTargetKind;
  /** Resource id to navigate to. null when unresolved (→ module index) or TEAM. */
  id: string | null;
  title: string | null;
  /** Optional artifact-detail tab, e.g. "documentation". */
  tab?: string;
  /** Endpoint hint parsed from the message, for API issues. */
  endpoint?: { method: string; path: string };
}

export interface IssueMeta {
  ruleId: string;
  /** Machine code when the rule emits one (api-intel rules), else null. */
  code: string | null;
  /** Message with any "CODE · " / "PROJECT_LEVEL · " prefix removed. */
  cleanMessage: string;
  why: string;
  suggestedFix: string;
  /** True for every current rule — the engine is rule-based, no AI. */
  deterministic: boolean;
  target: IssueTarget | null;
}

export interface ArtifactRef {
  id: string;
  title: string;
  type: string;
}
export interface ResourceRef {
  id: string;
  artifactId: string | null;
  title: string;
}
export interface ResourceIndex {
  artifactsById: Map<string, ArtifactRef>;
  specs: ResourceRef[];
  models: ResourceRef[];
  diagrams: ResourceRef[];
}

export interface IssueInput {
  artifactId: string;
  category: string;
  severity: string;
  message: string;
}

const ENDPOINT_RE = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s:]*)/;

// Re-exported for back-compat (tests + any caller of the old names). Identity
// logic now lives in the shared classifier.
export const parseIssueCode = parseFindingCode;
export function classifyIssue(input: IssueInput): string {
  return classifyFindingFromIssue(input);
}

function findResource(refs: ResourceRef[], artifactId: string): ResourceRef | undefined {
  // Prefer an exact own-id match (unlinked resource stored its own id), then a
  // linked-artifact match (resource linked to an artifact stored the artifact id).
  return refs.find((r) => r.id === artifactId) ?? refs.find((r) => r.artifactId === artifactId);
}

function resolveTarget(
  targetKind: FindingTargetKind,
  tab: string | undefined,
  issue: IssueInput,
  cleanMessage: string,
  index: ResourceIndex,
): IssueTarget {
  switch (targetKind) {
    case "TEAM":
    case "PROJECT": // project-scoped findings navigate to the Team page
      return { kind: "TEAM", id: null, title: null };
    case "ARTIFACT": {
      const a = index.artifactsById.get(issue.artifactId);
      return { kind: "ARTIFACT", id: a ? a.id : null, title: a ? a.title : null, ...(tab ? { tab } : {}) };
    }
    case "API_SPEC": {
      const s = findResource(index.specs, issue.artifactId);
      const ep = ENDPOINT_RE.exec(cleanMessage);
      return {
        kind: "API_SPEC",
        id: s ? s.id : null,
        title: s ? s.title : null,
        ...(ep ? { endpoint: { method: ep[1], path: ep[2] } } : {}),
      };
    }
    case "DATABASE_MODEL": {
      const mdl = findResource(index.models, issue.artifactId);
      return { kind: "DATABASE_MODEL", id: mdl ? mdl.id : null, title: mdl ? mdl.title : null };
    }
    case "DIAGRAM": {
      const d = findResource(index.diagrams, issue.artifactId);
      return { kind: "DIAGRAM", id: d ? d.id : null, title: d ? d.title : null };
    }
  }
}

/** Build the full actionable metadata for one issue. */
export function explainIssue(issue: IssueInput, index: ResourceIndex): IssueMeta {
  const { code, cleanMessage } = parseFindingCode(issue.message);
  const ruleId = classifyFindingFromIssue(issue);
  const entry = getFindingOrFallback(ruleId);
  return {
    ruleId,
    // PROJECT_LEVEL is a scope marker, not a rule code — don't surface it.
    code: code && code !== "PROJECT_LEVEL" ? code : null,
    cleanMessage,
    why: entry.why,
    suggestedFix: entry.suggestedFix,
    deterministic: true,
    target: resolveTarget(entry.targetKind, entry.tab, issue, cleanMessage, index),
  };
}

// Exposed for tests (every known code resolves through the catalog).
export const KNOWN_RULE_IDS = FINDING_CODES;
