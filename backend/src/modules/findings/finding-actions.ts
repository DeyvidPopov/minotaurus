// finding-actions.ts — Quick Fix Action framework (V1).
//
// Maps a finding CODE (+ its resolved navigation target) to a deterministic list
// of "Quick Fix" actions a user could take to address the finding. This is the
// FRAMEWORK ONLY: each action is a declarative descriptor ({ id, label, kind });
// nothing here executes a fix. The frontend renders these as buttons —
//   - NAVIGATE  → reuses the finding's existing navigation link (target href);
//   - everything else → V1 placeholder ("Not implemented yet").
//
// Deliberately NON-AI and NON-mutating: getFindingActions is a pure function over
// the code + target (no IO, no clock, no randomness, no DB). Same input → deep-
// equal output. Keep it that way — real fix execution is future work and must go
// through the existing deterministic controllers, never a parallel path here.
//
// Layering: this sits in the shared findings base (depends only on finding
// types/catalog/quick-fix). The validation presenter resolves a concrete target
// and calls getFindingActions; analysis/AI/etc. may reuse it without Express.

import { getQuickFixIdForCode, type QuickFixId } from "./quick-fix.js";
import { getRelationRemediationIdForCode, type RelationRemediationId } from "./relation-remediation.js";

export type FindingActionKind = "NAVIGATE" | "GENERATE" | "CREATE_RELATION" | "CREATE_CONTENT";

// AVAILABLE = a real, wired action (NAVIGATE always works; a fix slot backed by a
// deterministic SAFE quick fix or a REVIEW-required remediation). PLANNED =
// framework placeholder the UI surfaces as "Not implemented yet". DISABLED =
// reserved for an action that exists but is not currently applicable.
export type FindingActionStatus = "AVAILABLE" | "PLANNED" | "DISABLED";

export type FixId = QuickFixId | RelationRemediationId;

export interface FindingAction {
  /** Stable, code-scoped id (e.g. "navigate", "add-relation"). */
  id: string;
  /** Human button label. */
  label: string;
  kind: FindingActionKind;
  status: FindingActionStatus;
  /**
   * When true the fix is NOT auto-applied: the user must review deterministic
   * candidates and confirm a selection (relation remediations). When false/absent
   * the fix is a one-click safe apply (doc template, starter diagram).
   */
  requiresReview?: boolean;
  /** Present iff a deterministic fix backs this action (status AVAILABLE). */
  fixId?: FixId;
}

// Minimal structural view of a resolved navigation target. Matches the presenter's
// IssueTarget (validation.presenter.ts) without importing it — the findings module
// must not depend on validation. `id === null` means the resource was deleted /
// unresolved; the NAVIGATE action is still offered (the frontend link falls back
// to the relevant module index).
export interface FindingActionTarget {
  kind: "TEAM" | "ARTIFACT" | "API_SPEC" | "DATABASE_MODEL" | "DIAGRAM";
  id: string | null;
}

const NAVIGATE_LABEL: Record<FindingActionTarget["kind"], string> = {
  TEAM: "Open Team",
  ARTIFACT: "Open artifact",
  API_SPEC: "Open API spec",
  DATABASE_MODEL: "Open database model",
  DIAGRAM: "Open diagram",
};

// Per-code "fix" actions beyond plain navigation. Order is load-bearing — it is
// the render order, and the NAVIGATE action (derived from the target) is always
// prepended before these. A code absent from this map exposes only its NAVIGATE
// action. Every key MUST be a real catalog code (finding-actions.test.ts pins
// this).
//
// `status: "AVAILABLE"` + `fixId` marks a slot wired to a deterministic quick fix
// (preview/apply works). Everything else is `"PLANNED"` — a framework slot whose
// button surfaces "Not implemented yet". Only MISSING_DOCUMENTATION and
// DIAGRAM_EMPTY are AVAILABLE in V1 (the only safe deterministic fixes — see the
// audit). The `fixId` here MUST agree with quick-fix.ts's FIX_BY_CODE
// (finding-actions.test.ts cross-checks this).
export const FIX_ACTIONS: Record<string, readonly FindingAction[]> = {
  // ── CREATE_RELATION / link — REVIEW-required remediations (deterministic
  //    candidates, human confirms; never auto-applied). Backed by relation-
  //    remediation.ts; the fixId must match getRelationRemediationIdForCode. ──
  ORPHAN_ARTIFACT: [{ id: "link-orphan", label: "Link artifact", kind: "CREATE_RELATION", status: "AVAILABLE", requiresReview: true, fixId: "LINK_ORPHAN_ARTIFACT" }],
  SECURITY_POLICY_NOT_LINKED: [{ id: "link-secures", label: "Link security policy", kind: "CREATE_RELATION", status: "AVAILABLE", requiresReview: true, fixId: "LINK_SECURITY_POLICY" }],
  DIAGRAM_UNLINKED: [{ id: "link-diagram", label: "Link to artifact", kind: "CREATE_RELATION", status: "AVAILABLE", requiresReview: true, fixId: "LINK_DIAGRAM_ARTIFACT" }],
  UNIMPLEMENTED_REQUIREMENT: [{ id: "add-implements-relation", label: "Add IMPLEMENTS relation", kind: "CREATE_RELATION", status: "PLANNED" }],

  // ── GENERATE ──
  // MISSING_DOCUMENTATION: deterministic template fix (no AI) — AVAILABLE.
  MISSING_DOCUMENTATION: [{ id: "generate-documentation", label: "Generate documentation template", kind: "GENERATE", status: "AVAILABLE", fixId: "GENERATE_DOCUMENTATION_TEMPLATE" }],
  UNDOCUMENTED_SECURITY_POLICY: [{ id: "generate-documentation", label: "Generate documentation", kind: "GENERATE", status: "PLANNED" }],

  // ── CREATE_CONTENT — adding a missing child resource ──
  API_SPEC_NO_ENDPOINTS: [{ id: "add-endpoint", label: "Add endpoint", kind: "CREATE_CONTENT", status: "PLANNED" }],
  ENDPOINT_NO_SUMMARY: [{ id: "add-summary", label: "Add summary", kind: "CREATE_CONTENT", status: "PLANNED" }],
  DB_MODEL_NO_ENTITIES: [{ id: "add-entity", label: "Add entity", kind: "CREATE_CONTENT", status: "PLANNED" }],
  DB_ENTITY_NO_FIELDS: [{ id: "add-field", label: "Add field", kind: "CREATE_CONTENT", status: "PLANNED" }],
  // DIAGRAM_EMPTY: deterministic starter-graph fix (no AI) — AVAILABLE.
  DIAGRAM_EMPTY: [{ id: "add-mermaid", label: "Generate starter diagram", kind: "CREATE_CONTENT", status: "AVAILABLE", fixId: "GENERATE_STARTER_DIAGRAM" }],
};

/**
 * Quick Fix actions for a finding. The NAVIGATE action (when the finding has a
 * target) is first, followed by any code-specific fix actions in declared order.
 * Returns [] when there is no target and the code exposes no fix slots.
 *
 * The fix-slot `status`/`fixId` are sourced from FIX_ACTIONS, but cross-checked
 * here against the quick-fix registry so the two can't silently drift: a slot is
 * only emitted AVAILABLE when quick-fix.ts actually backs that code.
 *
 * Pure + deterministic. V1: descriptors only — nothing here executes a fix.
 */
export function getFindingActions(code: string, target: FindingActionTarget | null): FindingAction[] {
  const actions: FindingAction[] = [];

  if (target) {
    actions.push({ id: "navigate", label: NAVIGATE_LABEL[target.kind], kind: "NAVIGATE", status: "AVAILABLE" });
  }

  const safeFixId = getQuickFixIdForCode(code);
  const reviewFixId = getRelationRemediationIdForCode(code);
  for (const a of FIX_ACTIONS[code] ?? []) {
    // Only honour AVAILABLE/fixId when the backing registry agrees this code is
    // wired AND the fixId matches — a SAFE quick fix (no review) or a REVIEW-
    // required remediation. Otherwise downgrade to PLANNED. This cross-check keeps
    // the action registry and the fix registries from silently drifting apart.
    const wiredSafe = a.status === "AVAILABLE" && !a.requiresReview && a.fixId != null && a.fixId === safeFixId;
    const wiredReview = a.status === "AVAILABLE" && a.requiresReview === true && a.fixId != null && a.fixId === reviewFixId;
    if (wiredSafe) {
      actions.push({ id: a.id, label: a.label, kind: a.kind, status: "AVAILABLE", fixId: a.fixId });
    } else if (wiredReview) {
      actions.push({ id: a.id, label: a.label, kind: a.kind, status: "AVAILABLE", requiresReview: true, fixId: a.fixId });
    } else {
      actions.push({ id: a.id, label: a.label, kind: a.kind, status: "PLANNED" });
    }
  }

  return actions;
}
