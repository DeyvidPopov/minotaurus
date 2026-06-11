// quick-fix.controller.ts — Deterministic Quick Fixes V1.
//
// Exposes two endpoints on a single validation issue:
//   GET  /validation-issues/:issueId/quick-fix/preview  (VIEWER+, read-only)
//   POST /validation-issues/:issueId/quick-fix/apply    (ARCHITECT+, mutates)
//
// Only the two safe deterministic fixes from findings/quick-fix.ts are supported
// (MISSING_DOCUMENTATION → doc template, DIAGRAM_EMPTY → starter graph). The
// content is re-derived server-side from the fixId — the client's preview is
// never trusted. Apply mirrors the documentation/diagram update controllers
// (prisma update + a VersionEvent, origin "QUICK_FIX"), then re-runs validation
// so the resolved finding disappears, and returns the refreshed, enriched issues.
//
// Apply is ARCHITECT+ because it also re-runs validation (an ARCHITECT-gated
// operation), and ARCHITECT ⊇ the DEVELOPER floor the doc/diagram mutations need.

import type { Response } from "express";
import type { ValidationIssue } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { projectAccessStatus } from "../../lib/project-access.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { classifyFindingFromIssue } from "../findings/finding-classifier.js";
import {
  buildQuickFixPreview,
  getQuickFixIdForCode,
  quickFixContent,
  starterDiagramSupportsType,
  type QuickFixId,
} from "../findings/quick-fix.js";
import { runValidationForProject } from "./validation.engine.js";
import { enrichIssues } from "./validation.controller.js";

interface ResolvedTarget {
  kind: "ARTIFACT" | "DIAGRAM";
  id: string;
  title: string;
}

// Outcome of resolving an issue's quick fix against the live resource.
type Resolution =
  | { ok: false; status: number; code: string; message: string }
  | {
      ok: true;
      fixId: QuickFixId;
      target: ResolvedTarget;
      applicable: boolean;
      reason: string | null;
      // Performs the mutation + version event. Only called by apply, and only when
      // `applicable` was true at read time. The write itself is an ATOMIC
      // conditional update (no-clobber even under a concurrent writer): it returns
      // false when the resource is no longer empty (the write matched 0 rows), so
      // the caller can 409 instead of overwriting content written in the gap.
      apply: (userId: string) => Promise<boolean>;
    };

/**
 * Resolve the deterministic quick fix for an issue: classify → map to a fixId →
 * locate the concrete resource → decide whether the fix is currently applicable
 * (precondition: the resource is still empty / eligible). Pure of side effects;
 * the returned `apply` closure is what mutates.
 */
async function resolveQuickFix(issue: ValidationIssue): Promise<Resolution> {
  const code = classifyFindingFromIssue(issue);
  const fixId = getQuickFixIdForCode(code);
  if (!fixId) {
    return { ok: false, status: 400, code: "NO_QUICK_FIX", message: "This finding has no deterministic quick fix." };
  }

  if (fixId === "GENERATE_DOCUMENTATION_TEMPLATE") {
    // The MISSING_DOCUMENTATION rule's subject is the artifact (subjectId = its id;
    // artifactId FK is also set, but subjectId is the canonical resource pointer).
    // The rule covers any documentable type, and the doc template can be written to
    // any artifact, so applicability is just "still empty".
    const artifact = await prisma.artifact.findUnique({ where: { id: issue.subjectId } });
    if (!artifact || artifact.projectId !== issue.projectId) {
      return { ok: false, status: 404, code: "NOT_FOUND", message: "Artifact not found." };
    }
    const hasDoc = !!artifact.documentationContent?.trim();
    const applicable = !hasDoc;
    const reason = applicable ? null : "This artifact already has documentation.";
    return {
      ok: true,
      fixId,
      target: { kind: "ARTIFACT", id: artifact.id, title: artifact.title },
      applicable,
      reason,
      apply: async (userId) => {
        const content = quickFixContent(fixId);
        // Atomic no-clobber write: only fills the doc while it is still empty, so a
        // concurrent PUT /artifacts/:id/documentation in the gap can't be clobbered.
        const { count } = await prisma.artifact.updateMany({
          where: {
            id: artifact.id,
            OR: [{ documentationContent: null }, { documentationContent: "" }],
          },
          data: { documentationContent: content },
        });
        if (count !== 1) return false;
        await recordVersionEvent({
          projectId: artifact.projectId,
          entityType: "DOCUMENTATION",
          entityId: artifact.id,
          action: "UPDATED",
          title: artifact.title,
          description: "Documentation template generated",
          triggeredBy: userId,
          metadata: { origin: "QUICK_FIX", fixId, length: content.length },
        });
        return true;
      },
    };
  }

  // GENERATE_STARTER_DIAGRAM — the DIAGRAM_EMPTY rule's subjectId is
  // `diagram.artifactId ?? diagram.id`, so resolve the diagram by either.
  const diagram = await prisma.diagram.findFirst({
    where: {
      projectId: issue.projectId,
      OR: [{ id: issue.subjectId }, { artifactId: issue.subjectId }],
    },
    // Prefer the empty one if multiple diagrams share a linked artifact id.
    orderBy: { mermaidSource: "asc" },
  });
  if (!diagram) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Diagram not found." };
  }
  const isEmpty = !diagram.mermaidSource?.trim();
  const typeOk = starterDiagramSupportsType(diagram.type);
  const applicable = isEmpty && typeOk;
  const reason = !applicable
    ? !isEmpty
      ? "This diagram already has Mermaid source."
      : "The starter graph only fits flowchart/architecture diagrams; this diagram needs a type-specific starter."
    : null;
  return {
    ok: true,
    fixId,
    target: { kind: "DIAGRAM", id: diagram.id, title: diagram.title },
    applicable,
    reason,
    apply: async (userId) => {
      const content = quickFixContent(fixId);
      // Atomic no-clobber write: only seeds the diagram while its source is still
      // empty, so a concurrent diagram edit in the gap can't be clobbered.
      const { count } = await prisma.diagram.updateMany({
        where: { id: diagram.id, mermaidSource: "" },
        data: { mermaidSource: content },
      });
      if (count !== 1) return false;
      await recordVersionEvent({
        projectId: diagram.projectId,
        entityType: "DIAGRAM",
        entityId: diagram.id,
        action: "UPDATED",
        title: diagram.title,
        description: "Starter diagram generated",
        triggeredBy: userId,
        metadata: { origin: "QUICK_FIX", fixId },
      });
      return true;
    },
  };
}

export async function previewQuickFix(req: AuthedRequest, res: Response) {
  const issue = await prisma.validationIssue.findUnique({ where: { id: req.params.issueId } });
  if (!issue) return fail(res, 404, "NOT_FOUND", "Validation issue not found");

  const access = await projectAccessStatus(issue.projectId, req.user!.userId, "VIEWER");
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const resolution = await resolveQuickFix(issue);
  if (!resolution.ok) return fail(res, resolution.status, resolution.code, resolution.message);

  const preview = buildQuickFixPreview(resolution.fixId);
  return ok(
    res,
    {
      fixId: preview.fixId,
      code: preview.code,
      targetKind: preview.targetKind,
      title: preview.title,
      description: preview.description,
      contentKind: preview.contentKind,
      content: preview.content,
      target: resolution.target,
      applicable: resolution.applicable,
      reason: resolution.reason,
    },
    "OK",
  );
}

export async function applyQuickFix(req: AuthedRequest, res: Response) {
  const issue = await prisma.validationIssue.findUnique({ where: { id: req.params.issueId } });
  if (!issue) return fail(res, 404, "NOT_FOUND", "Validation issue not found");

  const access = await projectAccessStatus(issue.projectId, req.user!.userId, "ARCHITECT");
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const resolution = await resolveQuickFix(issue);
  if (!resolution.ok) return fail(res, resolution.status, resolution.code, resolution.message);
  if (!resolution.applicable) {
    // Precondition no longer holds (resource filled in / wrong type). Never clobber.
    return fail(res, 409, "QUICK_FIX_NOT_APPLICABLE", resolution.reason ?? "This quick fix no longer applies.");
  }

  // Execute the deterministic mutation + its VersionEvent, then re-run validation
  // so the resolved finding drops out. Re-run is intentional (the spec's workflow)
  // and replaces the whole issue set — the original issue id will be gone.
  // The write is atomic/no-clobber: `false` means the resource stopped being empty
  // between the applicability read and the write (a concurrent edit), so we 409
  // rather than overwrite it — nothing was mutated and no re-run is needed.
  const applied = await resolution.apply(req.user!.userId);
  if (!applied) {
    return fail(res, 409, "QUICK_FIX_NOT_APPLICABLE", "This resource is no longer empty — it may have just been edited.");
  }
  const { issues } = await runValidationForProject(issue.projectId, req.user!.userId);

  return ok(
    res,
    {
      fixId: resolution.fixId,
      target: resolution.target,
      issues: await enrichIssues(issue.projectId, issues),
    },
    "Quick fix applied",
  );
}
