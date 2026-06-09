// Pure rule runner — used by the validation HTTP handler and the seed script.
// Wipes existing issues for the project, recomputes them, and writes a single
// VALIDATED version event recording the outcome.

import type { ValidationIssue, ValidationSubjectType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { analyzeApiValidation } from "../api-intel/api-validation.js";
import { isAuthActionPath } from "../api-intel/text.js";
import type { ApiValidationInput } from "../api-intel/api-intel.types.js";
import {
  buildStatusSnapshot,
  issueFingerprint,
  restoreIssueStatuses,
  selectNewErrorIssues,
} from "./validation.status.js";
import { PROJECT_LEVEL_PREFIX } from "./validation.constants.js";
import { analyzeArchitectureFindings } from "../findings/finding-rules.js";
import { getFinding } from "../findings/finding-catalog.js";
import { analyzeMissingDocumentation } from "../findings/documentation-rule.js";
import { analyzeForeignKeyFindings } from "../findings/database-fk-rule.js";

// Re-exported for back-compat; the canonical definition lives in
// validation.constants.ts (prisma-free, so the presenter can share it).
export { PROJECT_LEVEL_PREFIX };

const CHURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A newly-surfaced OPEN ERROR finding, reduced to what the notification layer needs. */
export interface NewErrorIssue {
  /** The finding's polymorphic subject id (artifact / api-spec / db-model / …). */
  subjectId: string;
  category: string;
  message: string;
}

/**
 * A validation finding's subject: the polymorphic resource it concerns. `subjectId`
 * is the resource id used for UI navigation + the rerun fingerprint; `artifactId`
 * is the real (nullable) Artifact FK, populated ONLY for ARTIFACT subjects so the
 * column stays referentially valid (an api-spec / db-model / diagram / project id
 * is NOT an artifact and would violate the FK).
 */
interface IssueSubject {
  subjectType: ValidationSubjectType;
  subjectId: string;
  artifactId: string | null;
}
const artifactSubject = (id: string): IssueSubject => ({ subjectType: "ARTIFACT", subjectId: id, artifactId: id });
const apiSpecSubject = (id: string): IssueSubject => ({ subjectType: "API_SPEC", subjectId: id, artifactId: null });
const databaseModelSubject = (id: string): IssueSubject => ({ subjectType: "DATABASE_MODEL", subjectId: id, artifactId: null });
const diagramSubject = (id: string): IssueSubject => ({ subjectType: "DIAGRAM", subjectId: id, artifactId: null });
const projectSubject = (id: string): IssueSubject => ({ subjectType: "PROJECT", subjectId: id, artifactId: null });

/**
 * Result of a validation run. `issues` is the full recomputed set (as before);
 * `newErrorIssues` are the OPEN ERROR findings that were NOT present before this
 * run — the dedup'd set the side-effect layer (validation alerts) consumes. The
 * engine stays pure of side effects: it only RETURNS this, never sends anything.
 */
export interface ValidationRunResult {
  issues: ValidationIssue[];
  newErrorIssues: NewErrorIssue[];
}

export async function runValidationForProject(
  projectId: string,
  triggeredBy?: string,
): Promise<ValidationRunResult> {
  const [project, artifacts, relations, apiSpecs, apiEndpoints, databaseModels, databaseEntities, databaseFields, diagrams, recentEvents, memberCount] =
    await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.artifact.findMany({ where: { projectId } }),
      prisma.artifactRelation.findMany({
        where: { sourceArtifact: { projectId } },
      }),
      prisma.apiSpec.findMany({ where: { projectId } }),
      prisma.apiEndpoint.findMany({ where: { apiSpec: { projectId } } }),
      prisma.databaseModel.findMany({ where: { projectId } }),
      prisma.databaseEntity.findMany({ where: { databaseModel: { projectId } } }),
      prisma.databaseField.findMany({
        where: { entity: { databaseModel: { projectId } } },
      }),
      prisma.diagram.findMany({ where: { projectId } }),
      prisma.versionEvent.findMany({
        where: {
          projectId,
          createdAt: { gte: new Date(Date.now() - CHURN_WINDOW_MS) },
          action: { in: ["CREATED", "UPDATED"] },
        },
        select: { entityId: true },
      }),
      prisma.projectMember.count({ where: { projectId } }),
    ]);

  const now = new Date();
  const artifactIds = new Set(artifacts.map((a) => a.id));
  const projectRelations = relations.filter(
    (r) => artifactIds.has(r.sourceArtifactId) && artifactIds.has(r.targetArtifactId),
  );
  type DraftIssue = Omit<ValidationIssue, "id" | "createdAt" | "updatedAt">;
  const drafts: DraftIssue[] = [];

  // Missing-documentation rule (Option B, pure): documentable, non-deprecated
  // artifacts with neither own documentationContent nor an incoming DOCUMENTS
  // relation. (Orphan / fan-out / churn / deprecated-dependency rules come from the
  // shared finding-rules engine below — ONE implementation across Validation +
  // Analysis.)
  for (const f of analyzeMissingDocumentation(
    artifacts.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      status: a.status,
      documentationContent: a.documentationContent,
    })),
    projectRelations.map((r) => ({ targetArtifactId: r.targetArtifactId, relationType: r.relationType })),
  )) {
    drafts.push({
      projectId,
      ...artifactSubject(f.artifactId),
      severity: "WARNING",
      category: "DOCUMENTATION",
      message: f.message,
      status: "OPEN",
    });
  }

  // Per-artifact security-policy rule.
  for (const a of artifacts) {
    if (a.type === "SECURITY_POLICY") {
      const secures = projectRelations.some(
        (r) => r.sourceArtifactId === a.id && r.relationType === "SECURES",
      );
      if (!secures) {
        drafts.push({
          projectId,
          ...artifactSubject(a.id),
          severity: "WARNING",
          category: "SECURITY",
          message: `Security policy "${a.title}" has no SECURES outgoing relation.`,
          status: "OPEN",
        });
      }
    }
  }

  const byId = new Map(artifacts.map((a) => [a.id, a]));

  // ── API spec rules ──
  const artifactByIdMap = byId;
  for (const spec of apiSpecs) {
    const specEndpoints = apiEndpoints.filter((e) => e.apiSpecId === spec.id);

    if (specEndpoints.length === 0) {
      drafts.push({
        projectId,
        ...apiSpecSubject(spec.artifactId ?? spec.id),
        severity: "WARNING",
        category: "API",
        message: `API spec "${spec.title}" has no endpoints.`,
        status: "OPEN",
      });
    }

    const linkedArtifact = spec.artifactId ? artifactByIdMap.get(spec.artifactId) : null;
    const isSecuritySpec =
      /\b(auth|security)/i.test(spec.title) ||
      (linkedArtifact && linkedArtifact.type === "SECURITY_POLICY");

    for (const ep of specEndpoints) {
      if (!ep.summary || !ep.summary.trim()) {
        drafts.push({
          projectId,
          ...apiSpecSubject(spec.artifactId ?? spec.id),
          severity: "WARNING",
          category: "API",
          message: `Endpoint ${ep.method} ${ep.path} in "${spec.title}" has no summary.`,
          status: "OPEN",
        });
      }
      // A public endpoint on a security-related spec is normally worth flagging —
      // EXCEPT auth-mechanism endpoints (login/register/refresh/verify/forgot-/
      // reset-password), which are public by design. Allow-list them.
      if (isSecuritySpec && !ep.requiresAuth && !isAuthActionPath(ep.path)) {
        drafts.push({
          projectId,
          ...apiSpecSubject(spec.artifactId ?? spec.id),
          severity: "WARNING",
          category: "SECURITY",
          message: `Endpoint ${ep.method} ${ep.path} on security-related spec "${spec.title}" is marked public (requiresAuth=false).`,
          status: "OPEN",
        });
      }
    }
  }

  // ── Database model rules ──
  for (const model of databaseModels) {
    const modelEntities = databaseEntities.filter((e) => e.databaseModelId === model.id);

    if (modelEntities.length === 0) {
      drafts.push({
        projectId,
        ...databaseModelSubject(model.artifactId ?? model.id),
        severity: "WARNING",
        category: "DATABASE",
        message: `Database model "${model.title}" has no entities.`,
        status: "OPEN",
      });
    }

    for (const entity of modelEntities) {
      const entityFields = databaseFields.filter((f) => f.entityId === entity.id);
      if (entityFields.length === 0) {
        drafts.push({
          projectId,
          ...databaseModelSubject(model.artifactId ?? model.id),
          severity: "WARNING",
          category: "DATABASE",
          message: `Entity "${entity.name}" in "${model.title}" has no fields.`,
          status: "OPEN",
        });
      } else if (!entityFields.some((f) => f.isPrimaryKey)) {
        drafts.push({
          projectId,
          ...databaseModelSubject(model.artifactId ?? model.id),
          severity: "WARNING",
          category: "DATABASE",
          message: `Entity "${entity.name}" in "${model.title}" has no primary key.`,
          status: "OPEN",
        });
      }

    }
  }

  // ── Foreign-key integrity (shared pure rule — ONE implementation of the FK
  //    heuristics, also unit-tested directly). Covers target existence (entity +
  //    precise column), cross-model references, column/entity mismatch, and the
  //    precise-column / non-key advisories. Severity/category come from the catalog
  //    by code so identity stays single-sourced. ──
  {
    const modelById = new Map(databaseModels.map((m) => [m.id, m]));
    const fkFindings = analyzeForeignKeyFindings({
      models: databaseModels.map((m) => ({ id: m.id, artifactId: m.artifactId })),
      entities: databaseEntities.map((e) => ({ id: e.id, name: e.name, databaseModelId: e.databaseModelId })),
      fields: databaseFields.map((f) => ({
        id: f.id,
        entityId: f.entityId,
        name: f.name,
        isPrimaryKey: f.isPrimaryKey,
        isForeignKey: f.isForeignKey,
        referencesEntityId: f.referencesEntityId,
        referencesFieldId: f.referencesFieldId,
        description: f.description,
      })),
    });
    for (const f of fkFindings) {
      const entry = getFinding(f.code)!; // every FK code is in the catalog
      const model = modelById.get(f.modelId);
      drafts.push({
        projectId,
        ...databaseModelSubject(model ? model.artifactId ?? model.id : f.modelId),
        severity: entry.severity,
        category: entry.category,
        message: f.message,
        status: "OPEN",
      });
    }
  }

  // ── Diagram rules ──
  const HEADER_BY_TYPE: Record<string, RegExp> = {
    FLOWCHART: /^\s*(flowchart|graph)\b/im,
    SEQUENCE: /^\s*sequenceDiagram\b/im,
    ERD: /^\s*erDiagram\b/im,
    CLASS: /^\s*classDiagram\b/im,
    STATE: /^\s*stateDiagram\b/im,
    GANTT: /^\s*gantt\b/im,
    ARCHITECTURE: /^\s*(flowchart|graph)\b/im,
  };
  const ARROW_RE = /(-->|->>|-->>|--x|--o|==>|\|\|--|\|\|--\|\||o--|--\|>|==>|<-->|<--|\.->|\.\.>)/;

  for (const diagram of diagrams) {
    const src = diagram.mermaidSource ?? "";
    if (!src.trim()) {
      drafts.push({
        projectId,
        ...diagramSubject(diagram.artifactId ?? diagram.id),
        severity: "WARNING",
        category: "DIAGRAM",
        message: `Diagram "${diagram.title}" has an empty Mermaid source.`,
        status: "OPEN",
      });
    } else {
      const headerRe = HEADER_BY_TYPE[diagram.type] ?? HEADER_BY_TYPE.FLOWCHART;
      const headerOk = headerRe.test(src);
      const arrowOk = ARROW_RE.test(src);
      if (!headerOk || !arrowOk) {
        const reasons: string[] = [];
        if (!headerOk) reasons.push("missing diagram-type header");
        if (!arrowOk) reasons.push("no relations/arrows detected");
        drafts.push({
          projectId,
          ...diagramSubject(diagram.artifactId ?? diagram.id),
          severity: "WARNING",
          category: "DIAGRAM",
          message: `Diagram "${diagram.title}" may be invalid Mermaid (${reasons.join(", ")}).`,
          status: "OPEN",
        });
      }
    }
    if (diagram.type === "ARCHITECTURE" && !diagram.artifactId) {
      drafts.push({
        projectId,
        ...diagramSubject(diagram.id),
        severity: "INFO",
        category: "DIAGRAM",
        message: `Architecture diagram "${diagram.title}" is not linked to an artifact.`,
        status: "OPEN",
      });
    }
  }

  // ── Architecture findings (orphan, depends-on-deprecated, fan-out, churn,
  //    deprecated-still-referenced) via the shared finding-rules engine — the
  //    single implementation also used (read-only) by the analysis engine. ──
  const churnCounts = new Map<string, number>();
  for (const e of recentEvents) {
    churnCounts.set(e.entityId, (churnCounts.get(e.entityId) ?? 0) + 1);
  }

  const archFindings = analyzeArchitectureFindings({
    artifacts: artifacts.map((a) => ({ id: a.id, title: a.title, status: a.status })),
    relations: projectRelations.map((r) => ({
      sourceArtifactId: r.sourceArtifactId,
      targetArtifactId: r.targetArtifactId,
    })),
    churnByArtifact: churnCounts,
  });
  for (const f of archFindings) {
    const entry = getFinding(f.code)!; // every architecture code is in the catalog
    drafts.push({
      projectId,
      ...artifactSubject(f.artifactId),
      severity: entry.severity,
      category: entry.category,
      message: f.message,
      status: "OPEN",
    });
  }

  // ── Collaboration / governance heuristics ──
  // This finding is project-level, not about any single artifact. It uses the
  // PROJECT subject (subjectId = projectId, artifactId = null → never resolves to an
  // artifact) and prefixes the message with PROJECT_LEVEL_PREFIX so the UI renders
  // "Project" (→ Team page) instead of falling back to an arbitrary artifact.
  if (project && artifacts.length > 0 && memberCount <= 1) {
    drafts.push({
      projectId,
      ...projectSubject(projectId),
      severity: "INFO",
      category: "ARCHITECTURE",
      message: `${PROJECT_LEVEL_PREFIX}Single-user project may reduce collaboration visibility. Consider inviting team members on the Team page.`,
      status: "OPEN",
    });
  }

  // ── API payload intelligence rules (deterministic, reuses the api-intel
  //    analyzer primitives; codes are encoded as a message prefix). ──
  const apiValidationInput: ApiValidationInput = {
    specs: apiSpecs.map((s) => ({
      id: s.id,
      artifactId: s.artifactId,
      title: s.title,
      endpoints: apiEndpoints
        .filter((e) => e.apiSpecId === s.id)
        .map((e) => ({
          id: e.id,
          method: e.method,
          path: e.path,
          summary: e.summary,
          requestSchema: e.requestSchema,
          responseSchema: e.responseSchema,
          requiresAuth: e.requiresAuth,
        })),
    })),
    models: databaseModels.map((m) => ({
      id: m.id,
      artifactId: m.artifactId,
      title: m.title,
      entities: databaseEntities
        .filter((en) => en.databaseModelId === m.id)
        .map((en) => ({
          id: en.id,
          name: en.name,
          fields: databaseFields.filter((f) => f.entityId === en.id).map((f) => ({ name: f.name })),
        })),
    })),
  };
  const specArtifactById = new Map(apiSpecs.map((s) => [s.id, s.artifactId ?? s.id]));
  for (const f of analyzeApiValidation(apiValidationInput)) {
    drafts.push({
      projectId,
      ...apiSpecSubject(specArtifactById.get(f.apiSpecId) ?? f.apiSpecId),
      severity: f.severity,
      category: f.category,
      message: `${f.code} · ${f.message}`,
      status: "OPEN",
    });
  }

  // Apply in one transaction: carry forward IGNORED (waived) decisions, wipe old
  // issues, insert new, record the run. Issue rows are recreated each run (fresh
  // ids), so a waive is preserved by fingerprint, not by id. RESOLVED is NOT
  // carried forward — a still-produced finding reopens (see validation.status.ts).
  const { issues, newErrorIssues } = await prisma.$transaction(async (tx) => {
    const previous = await tx.validationIssue.findMany({
      where: { projectId },
      select: { subjectId: true, category: true, severity: true, message: true, status: true },
    });
    const restored = restoreIssueStatuses(drafts, buildStatusSnapshot(previous));

    // Option A dedup: ERROR findings whose fingerprint was NOT present before
    // this run. Computed against `previous` (pre-wipe) so a still-open or already-
    // seen ERROR doesn't re-alert. Carried out before the wipe/insert below.
    const previousFingerprints = new Set(previous.map(issueFingerprint));
    const newErrorDrafts = selectNewErrorIssues(restored, previousFingerprints);

    await tx.validationIssue.deleteMany({ where: { projectId } });
    if (restored.length > 0) {
      await tx.validationIssue.createMany({
        data: restored.map((d) => ({ ...d, createdAt: now, updatedAt: now })),
      });
    }
    const persisted = await tx.validationIssue.findMany({ where: { projectId } });
    return {
      issues: persisted,
      newErrorIssues: newErrorDrafts.map((d) => ({
        subjectId: d.subjectId,
        category: d.category,
        message: d.message,
      })),
    };
  });

  await recordVersionEvent({
    projectId,
    entityType: "VALIDATION",
    entityId: projectId,
    action: "VALIDATED",
    title: `Validation run · ${project?.name ?? "project"}`,
    description: `${issues.length} issue${issues.length === 1 ? "" : "s"} produced`,
    triggeredBy: triggeredBy ?? project?.ownerId ?? "system",
    metadata: {
      issueCount: issues.length,
      bySeverity: issues.reduce<Record<string, number>>((acc, v) => {
        acc[v.severity] = (acc[v.severity] || 0) + 1;
        return acc;
      }, {}),
    },
  });

  return { issues, newErrorIssues };
}
