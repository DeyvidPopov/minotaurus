// workflow-infer.ts — pure deterministic business-workflow inference for an
// endpoint. Output is layered, confidence-graded, and ALWAYS carries a `basis`
// (explainability is mandatory). No AI, no persistence — these are read-only
// inferred insights, never stored workflow definitions.

import { ACTION_VERBS, WORKFLOW_KIND_ORDER, CREDENTIAL_TOKENS } from "./api-intel.constants.js";
import { CONFIDENCE_RANK, type WorkflowKind, type WorkflowSignal } from "./api-intel.types.js";
import { titleCase, type ParsedPath } from "./text.js";

export interface WorkflowContext {
  method: string;
  path: ParsedPath;
  requiresAuth: boolean;
  /** Resolved primary object — a matched entity name, else Title(resource). */
  primaryObject: string | null;
  primaryEntityId?: string;
  /** Whether the primary object resolved to a real DB entity (high vs medium). */
  primaryMatched: boolean;
  /** Secondary entities referenced via id-like fields. */
  references: { object: string; entityId?: string }[];
  requestFields: Set<string>; // normalized
  responseFields: Set<string>; // normalized
  availabilityRef?: { object: string };
}

const AUTH_ACTIONS = new Set(["login", "signin", "logout", "signout", "refresh"]);

export function inferWorkflow(ctx: WorkflowContext): WorkflowSignal[] {
  const out: WorkflowSignal[] = [];
  const method = (ctx.method ?? "").toUpperCase();
  const action = ctx.path.action;
  const actionVerb = action ? ACTION_VERBS[action] : undefined;
  const suppressCrud = actionVerb?.nonCrud === true;
  const obj = ctx.primaryObject ?? "Resource";
  const conf = ctx.primaryMatched ? "high" : "medium";
  const resourceLabel = ctx.path.resource ?? "resource";

  // 1. Method-derived CRUD on the primary object.
  if (!suppressCrud && ctx.primaryObject) {
    if (method === "POST" && ctx.path.scope === "collection") {
      out.push({
        kind: "CREATE",
        label: `Creates ${obj}`,
        object: obj,
        entityId: ctx.primaryEntityId,
        confidence: conf,
        basis: `POST collection /${resourceLabel}${ctx.primaryMatched ? ` + ${obj} entity matched` : ""}`,
      });
    } else if (method === "PUT" || method === "PATCH") {
      out.push({
        kind: "UPDATE",
        label: `Updates ${obj}`,
        object: obj,
        entityId: ctx.primaryEntityId,
        confidence: conf,
        basis: `${method} /${resourceLabel}/{id}${ctx.primaryMatched ? ` + ${obj} entity matched` : ""}`,
      });
    } else if (method === "DELETE") {
      out.push({
        kind: "DELETE",
        label: `Deletes ${obj}`,
        object: obj,
        entityId: ctx.primaryEntityId,
        confidence: conf,
        basis: `DELETE /${resourceLabel}/{id}`,
      });
    } else if (method === "GET") {
      out.push({
        kind: "READ",
        label: `Reads ${obj}`,
        object: obj,
        entityId: ctx.primaryEntityId,
        confidence: "low",
        basis: `GET /${resourceLabel}`,
      });
    }
  }

  // Sub-resource create implies a parent update (e.g. POST /doctors/{id}/slots).
  if (!suppressCrud && method === "POST" && ctx.path.scope === "collection" && ctx.path.parent) {
    const parentObj = titleCase(ctx.path.parent);
    out.push({
      kind: "UPDATE",
      label: `Updates ${parentObj}`,
      object: parentObj,
      confidence: "low",
      basis: `POST nested under /${ctx.path.parent}/{id}`,
    });
  }

  // 2. Action-verb additive signal (login → Authenticates, register → Starts Onboarding…).
  if (actionVerb) {
    out.push({
      kind: actionVerb.kind,
      label: actionVerb.label(obj),
      object: obj,
      confidence: actionVerb.confidence,
      basis: actionVerb.basis,
    });
  }

  // 3. References from id-like fields (structural → high).
  for (const r of ctx.references) {
    out.push({
      kind: "REFERENCE",
      label: `References ${r.object}`,
      object: r.object,
      entityId: r.entityId,
      confidence: "high",
      basis: `id-like field references ${r.object} entity`,
    });
  }

  // 4. Field-driven signals.
  const responseHasToken = [...ctx.responseFields].some(
    (f) => f.includes("token") || f.includes("jwt") || f.includes("accesstoken"),
  );
  if (responseHasToken) {
    out.push({
      kind: "GENERATE",
      label: "Generates Access Token",
      object: "Access Token",
      confidence: "medium",
      basis: "token field present in response payload",
    });
  }
  if (action === "login" || action === "signin") {
    out.push({
      kind: "START",
      label: "Starts User Session",
      object: "User Session",
      confidence: "medium",
      basis: "login action endpoint",
    });
  }

  const isAuthAction = action != null && AUTH_ACTIONS.has(action);
  if (ctx.requiresAuth) {
    out.push({
      kind: "REQUIRE",
      label: "Requires Authentication",
      object: "Authentication",
      confidence: "medium",
      basis: "endpoint marked requiresAuth=true",
    });
  } else if (!isAuthAction && [...ctx.requestFields].some((f) => CREDENTIAL_TOKENS.some((t) => f.includes(t)))) {
    // A PUBLIC endpoint that takes a credential in its request is *handling* a
    // credential (e.g. registration sets a password) — it does not "require
    // authentication". Label it accurately so it doesn't read as a control gap.
    out.push({
      kind: "REQUIRE",
      label: "Handles Credentials",
      object: "Credentials",
      confidence: "low",
      basis: "credential field present in request payload",
    });
  }

  const hasEmail = [...ctx.requestFields, ...ctx.responseFields].some((f) => f.includes("email"));
  if (hasEmail && (action === "register" || action === "signup" || action === "verify")) {
    out.push({
      kind: "TRIGGER",
      label: "Triggers Email Verification",
      object: "Email Verification",
      confidence: "low",
      basis: `${action} action + email field detected`,
    });
  }

  if (ctx.availabilityRef) {
    out.push({
      kind: "UPDATE",
      label: "Updates Availability",
      object: "Availability",
      confidence: "low",
      basis: `references ${ctx.availabilityRef.object} which has an availability field`,
    });
  }

  return dedupeAndSort(out);
}

/** Dedupe by label (keep highest confidence) then sort by kind order → confidence → label. */
function dedupeAndSort(signals: WorkflowSignal[]): WorkflowSignal[] {
  const byLabel = new Map<string, WorkflowSignal>();
  for (const s of signals) {
    const existing = byLabel.get(s.label);
    if (!existing || CONFIDENCE_RANK[s.confidence] < CONFIDENCE_RANK[existing.confidence]) {
      byLabel.set(s.label, s);
    }
  }
  const kindRank = (k: WorkflowKind) => {
    const i = WORKFLOW_KIND_ORDER.indexOf(k);
    return i < 0 ? WORKFLOW_KIND_ORDER.length : i;
  };
  return Array.from(byLabel.values()).sort(
    (a, b) =>
      kindRank(a.kind) - kindRank(b.kind) ||
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
      (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
  );
}
