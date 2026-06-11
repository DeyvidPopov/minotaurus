// bootstrap.apply.ts — the ONLY path from an AI proposal to the database
// (AI Safety & Determinism Rule 1). It consumes an already-validated,
// user-selected proposal and creates real artifacts / relations / diagrams through
// the same fields the regular controllers use — so title normalization, version
// events and DRAFT status all apply. No AI/model logic lives here.
//
// Determinism boundary: the proposal is re-validated server-side (never trusting
// the client); only `accepted` items are created; everything else is reported as
// skipped. Artifacts are created as DRAFT and carry no AI prose in their fields —
// the rationale lives only in the audit snapshot (AiSession.proposal).

import { ArtifactStatus, AiSessionStatus, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { isUniqueViolation } from "../../../utils/prisma-errors.js";
import { normalizeArtifactTitle } from "../../artifacts/artifact-title.js";
import { resolvePreciseFkFieldId } from "../../database-models/fk-resolve.js";
import { parseMermaid } from "../../ingestion/mermaid.engine.js";
import { recordVersionEvent } from "../../versions/versions.engine.js";
import { validateBootstrapProposal, type ValidationContext } from "./bootstrap.validator.js";
import { normalizeMermaidSource } from "./mermaid-normalize.js";
import type { ApplyResult, BootstrapProposal, SkippedItem, ValidationReport } from "../ai.types.js";

export class BootstrapValidationError extends Error {
  constructor(public report: ValidationReport) {
    super("AI proposal failed deterministic validation");
    this.name = "BootstrapValidationError";
  }
}

export class BootstrapConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapConflictError";
  }
}

export interface ApplyParams {
  projectId: string;
  userId: string;
  proposal: BootstrapProposal;
  /** Links the apply to the propose-time AiSession for audit; optional. */
  sessionId?: string | null;
}

const AI_TAGS = ["ai", "bootstrap"];

function gxgy() {
  return {
    gx: Math.floor(Math.random() * 600) + 50,
    gy: Math.floor(Math.random() * 400) + 50,
  };
}

function buildSkipped(report: ValidationReport): SkippedItem[] {
  const out: SkippedItem[] = [];
  for (const a of report.artifacts) {
    if (!a.accepted) out.push({ kind: "ARTIFACT", label: a.title, reason: a.reason ?? "skipped" });
  }
  for (const r of report.relations) {
    if (!r.accepted) {
      out.push({
        kind: "RELATION",
        label: `${r.sourceTitle} → ${r.targetTitle} (${r.relationType})`,
        reason: r.reason ?? "skipped",
      });
    }
  }
  for (const d of report.diagrams) {
    if (!d.accepted) out.push({ kind: "DIAGRAM", label: d.title, reason: d.reason ?? "skipped" });
  }
  for (const m of report.databaseModels) {
    if (!m.accepted) {
      out.push({ kind: "DATABASE_MODEL", label: m.title, reason: m.reason ?? "skipped" });
      continue;
    }
    for (const e of m.entities) {
      if (!e.accepted) {
        out.push({ kind: "DATABASE_ENTITY", label: `${m.title} / ${e.name}`, reason: e.reason ?? "skipped" });
        continue;
      }
      for (const f of e.fields) {
        if (!f.accepted) {
          out.push({ kind: "DATABASE_FIELD", label: `${m.title} / ${e.name}.${f.name}`, reason: f.reason ?? "skipped" });
        }
      }
    }
  }
  for (const s of report.apiSpecs) {
    if (!s.accepted) {
      out.push({ kind: "API_SPEC", label: s.title, reason: s.reason ?? "skipped" });
      continue;
    }
    for (const ep of s.endpoints) {
      if (!ep.accepted) {
        out.push({ kind: "API_ENDPOINT", label: `${s.title} / ${ep.method} ${ep.path}`, reason: ep.reason ?? "skipped" });
      }
    }
  }
  return out;
}

export async function applyBootstrap(params: ApplyParams): Promise<ApplyResult> {
  const { projectId, userId } = params;
  // AI Mermaid is structure-only: strip any styling before validation + persistence.
  const proposal: BootstrapProposal = {
    ...params.proposal,
    diagrams: params.proposal.diagrams.map((d) => ({
      ...d,
      mermaidSource: normalizeMermaidSource(d.mermaidSource),
    })),
  };

  // ── Re-validate against the live project (authoritative) ──
  const [existingArtifacts, existingRelations] = await Promise.all([
    prisma.artifact.findMany({
      where: { projectId },
      select: { id: true, normalizedTitle: true },
    }),
    prisma.artifactRelation.findMany({
      where: { sourceArtifact: { projectId } },
      select: { sourceArtifactId: true, targetArtifactId: true, relationType: true },
    }),
  ]);
  const ctx: ValidationContext = { existingArtifacts, existingRelations };
  const report = validateBootstrapProposal(proposal, ctx);
  if (!report.ok) throw new BootstrapValidationError(report);

  // ── Create accepted items, reusing the standard creation fields ──
  let created: {
    artifacts: { id: string; title: string; type: BootstrapProposal["artifacts"][number]["type"] }[];
    relations: {
      id: string;
      sourceTitle: string;
      targetTitle: string;
      relationType: BootstrapProposal["relations"][number]["relationType"];
      sourceArtifactId: string;
      targetArtifactId: string;
    }[];
    diagrams: { id: string; title: string }[];
    databaseModels: {
      id: string;
      title: string;
      databaseType: BootstrapProposal["databaseModels"][number]["databaseType"];
      entityCount: number;
      fieldCount: number;
    }[];
    databaseEntities: { id: string; name: string; modelTitle: string; databaseModelId: string }[];
    databaseFields: {
      id: string;
      entityName: string;
      fieldName: string;
      type: string;
      isPrimaryKey: boolean;
      isForeignKey: boolean;
      entityId: string;
      databaseModelId: string;
    }[];
    apiSpecs: { id: string; title: string; version: string; baseUrl: string; endpointCount: number }[];
    apiEndpoints: {
      id: string;
      specTitle: string;
      apiSpecId: string;
      method: BootstrapProposal["apiSpecs"][number]["endpoints"][number]["method"];
      path: string;
    }[];
  };
  try {
    created = await prisma.$transaction(async (tx) => {
      const normToId = new Map<string, string>();
      for (const e of existingArtifacts) normToId.set(e.normalizedTitle, e.id);

      const artifacts: typeof created.artifacts = [];
      for (let i = 0; i < proposal.artifacts.length; i++) {
        if (!report.artifacts[i].accepted) continue;
        const a = proposal.artifacts[i];
        const norm = normalizeArtifactTitle(a.title);
        const row = await tx.artifact.create({
          data: {
            projectId,
            title: a.title.trim(),
            normalizedTitle: norm,
            type: a.type,
            status: ArtifactStatus.DRAFT, // AI-proposed content stays a draft until promoted
            description: "", // never copy AI rationale onto the entity
            tags: AI_TAGS,
            ...gxgy(),
            createdById: userId,
          },
        });
        normToId.set(norm, row.id);
        artifacts.push({ id: row.id, title: row.title, type: row.type });
      }

      const relations: typeof created.relations = [];
      for (let i = 0; i < proposal.relations.length; i++) {
        if (!report.relations[i].accepted) continue;
        const r = proposal.relations[i];
        const sid = normToId.get(normalizeArtifactTitle(r.sourceTitle));
        const tid = normToId.get(normalizeArtifactTitle(r.targetTitle));
        if (!sid || !tid) continue; // defensive — validator already guaranteed this
        const row = await tx.artifactRelation.create({
          data: {
            sourceArtifactId: sid,
            targetArtifactId: tid,
            relationType: r.relationType,
            description: "",
            createdById: userId,
          },
        });
        relations.push({
          id: row.id,
          sourceTitle: r.sourceTitle,
          targetTitle: r.targetTitle,
          relationType: r.relationType,
          sourceArtifactId: sid,
          targetArtifactId: tid,
        });
      }

      const diagrams: typeof created.diagrams = [];
      for (let i = 0; i < proposal.diagrams.length; i++) {
        if (!report.diagrams[i].accepted) continue;
        const d = proposal.diagrams[i];
        const parsed = parseMermaid(d.mermaidSource); // deterministic; type + clean source
        const row = await tx.diagram.create({
          data: {
            projectId,
            artifactId: null,
            title: d.title.trim() || parsed.title || "Diagram",
            type: parsed.diagramType,
            mermaidSource: parsed.mermaidSource,
            description: "",
            createdById: userId,
          },
        });
        diagrams.push({ id: row.id, title: row.title });
      }

      // ── Database models (two-pass per model so FKs can reference any sibling) ──
      const databaseModels: typeof created.databaseModels = [];
      const databaseEntities: typeof created.databaseEntities = [];
      const databaseFields: typeof created.databaseFields = [];
      for (let i = 0; i < proposal.databaseModels.length; i++) {
        const dec = report.databaseModels[i];
        if (!dec.accepted) continue;
        const m = proposal.databaseModels[i];
        const linkId =
          dec.artifactLinked && m.artifactTitle
            ? normToId.get(normalizeArtifactTitle(m.artifactTitle)) ?? null
            : null;
        const modelRow = await tx.databaseModel.create({
          data: {
            projectId,
            artifactId: linkId,
            title: m.title.trim(),
            databaseType: m.databaseType,
            description: "", // never copy AI prose onto the entity
            createdById: userId,
          },
        });

        // Pass A — create all entities first, so a FK may reference an entity that
        // appears later in the array; build the name→id map the FKs resolve through.
        const entityNameToId = new Map<string, string>();
        // Per-entity created columns (for resolving a FK's PRECISE target column in
        // Pass C) + the FK fields to resolve once every column exists.
        const fieldsByEntityId = new Map<string, { id: string; name: string; isPrimaryKey: boolean }[]>();
        const fkToResolve: { fieldId: string; refEntityId: string; refFieldName: string | null }[] = [];
        let modelEntityCount = 0;
        let modelFieldCount = 0;
        for (let j = 0; j < m.entities.length; j++) {
          if (!dec.entities[j].accepted) continue;
          const e = m.entities[j];
          const entityRow = await tx.databaseEntity.create({
            data: { databaseModelId: modelRow.id, name: e.name.trim(), description: "" },
          });
          entityNameToId.set(normalizeArtifactTitle(e.name), entityRow.id);
          databaseEntities.push({ id: entityRow.id, name: entityRow.name, modelTitle: modelRow.title, databaseModelId: modelRow.id });
          modelEntityCount++;
        }

        // Pass B — create fields, mapping referencesEntityName → referencesEntityId.
        for (let j = 0; j < m.entities.length; j++) {
          const entDec = dec.entities[j];
          if (!entDec.accepted) continue;
          const e = m.entities[j];
          const entityId = entityNameToId.get(normalizeArtifactTitle(e.name));
          if (!entityId) continue; // defensive — Pass A created every accepted entity
          for (let k = 0; k < e.fields.length; k++) {
            if (!entDec.fields[k].accepted) continue;
            const f = e.fields[k];
            const ref = (f.referencesEntityName ?? "").trim();
            const refId = ref ? entityNameToId.get(normalizeArtifactTitle(ref)) ?? null : null;
            const fieldRow = await tx.databaseField.create({
              data: {
                entityId,
                name: f.name.trim(),
                type: (f.type ?? "text").trim() || "text",
                required: !!f.required,
                isPrimaryKey: !!f.isPrimaryKey,
                isForeignKey: !!f.isForeignKey || !!refId, // controller parity
                referencesEntityId: refId,
                // referencesFieldId resolved in Pass C, once every column exists.
                description: "",
                position: k, // preserve the proposal's field order (gaps from skips are fine)
              },
            });
            const meta = fieldsByEntityId.get(entityId) ?? [];
            meta.push({ id: fieldRow.id, name: fieldRow.name, isPrimaryKey: fieldRow.isPrimaryKey });
            fieldsByEntityId.set(entityId, meta);
            if (refId) {
              fkToResolve.push({ fieldId: fieldRow.id, refEntityId: refId, refFieldName: f.referencesFieldName ?? null });
            }
            databaseFields.push({
              id: fieldRow.id,
              entityName: e.name.trim(),
              fieldName: fieldRow.name,
              type: fieldRow.type,
              isPrimaryKey: fieldRow.isPrimaryKey,
              isForeignKey: fieldRow.isForeignKey,
              entityId,
              databaseModelId: modelRow.id,
            });
            modelFieldCount++;
          }
        }

        // Pass C — every column now exists, so resolve each FK's PRECISE target
        // column: match the AI-given referencesFieldName, else fall back to the
        // referenced entity's single primary key. If neither resolves, leave
        // referencesFieldId NULL (the validation engine flags the precision gap).
        for (const fk of fkToResolve) {
          const { fieldId } = resolvePreciseFkFieldId(fk.refFieldName, fieldsByEntityId.get(fk.refEntityId));
          if (fieldId) {
            await tx.databaseField.update({ where: { id: fk.fieldId }, data: { referencesFieldId: fieldId } });
          }
        }

        databaseModels.push({
          id: modelRow.id,
          title: modelRow.title,
          databaseType: modelRow.databaseType,
          entityCount: modelEntityCount,
          fieldCount: modelFieldCount,
        });
      }

      // ── API catalog (spec → endpoints; no request/response bodies) ──
      const apiSpecs: typeof created.apiSpecs = [];
      const apiEndpoints: typeof created.apiEndpoints = [];
      for (let i = 0; i < proposal.apiSpecs.length; i++) {
        const dec = report.apiSpecs[i];
        if (!dec.accepted) continue;
        const s = proposal.apiSpecs[i];
        const linkId =
          dec.artifactLinked && s.artifactTitle
            ? normToId.get(normalizeArtifactTitle(s.artifactTitle)) ?? null
            : null;
        const specRow = await tx.apiSpec.create({
          data: {
            projectId,
            artifactId: linkId,
            title: s.title.trim(),
            version: (s.version ?? "").trim() || "1.0.0",
            baseUrl: (s.baseUrl ?? "").trim(),
            description: (s.description ?? "").trim(),
            createdById: userId,
          },
        });

        let endpointCount = 0;
        for (let k = 0; k < s.endpoints.length; k++) {
          if (!dec.endpoints[k].accepted) continue;
          const ep = s.endpoints[k];
          const epRow = await tx.apiEndpoint.create({
            data: {
              apiSpecId: specRow.id,
              path: ep.path.trim(),
              method: ep.method,
              summary: (ep.summary ?? "").trim(),
              requestSchema: "", // Phase 2: catalog only — no schema bodies
              responseSchema: "",
              requiresAuth: ep.requiresAuth !== false, // default secured
            },
          });
          apiEndpoints.push({
            id: epRow.id,
            specTitle: specRow.title,
            apiSpecId: specRow.id,
            method: epRow.method,
            path: epRow.path,
          });
          endpointCount++;
        }

        apiSpecs.push({
          id: specRow.id,
          title: specRow.title,
          version: specRow.version,
          baseUrl: specRow.baseUrl,
          endpointCount,
        });
      }

      return { artifacts, relations, diagrams, databaseModels, databaseEntities, databaseFields, apiSpecs, apiEndpoints };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new BootstrapConflictError(
        "A title collided while applying (the project changed since the proposal). Reload and try again.",
      );
    }
    throw err;
  }

  // ── Version events (provenance) — recorded after commit, like the other modules ──
  const meta = (extra: Record<string, string | number | boolean>) => ({
    origin: "AI",
    source: "BOOTSTRAP_WIZARD",
    confirmedBy: userId,
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...extra,
  });
  for (const a of created.artifacts) {
    await recordVersionEvent({
      projectId,
      entityType: "ARTIFACT",
      entityId: a.id,
      action: "CREATED",
      title: a.title,
      description: "Created via AI Bootstrap Wizard",
      triggeredBy: userId,
      metadata: meta({ type: a.type }),
    });
  }
  for (const r of created.relations) {
    await recordVersionEvent({
      projectId,
      entityType: "RELATION",
      entityId: r.id,
      action: "LINKED",
      title: `${r.sourceTitle} → ${r.targetTitle}`,
      description: r.relationType,
      triggeredBy: userId,
      metadata: meta({ relationType: r.relationType, sourceArtifactId: r.sourceArtifactId, targetArtifactId: r.targetArtifactId }),
    });
  }
  for (const d of created.diagrams) {
    await recordVersionEvent({
      projectId,
      entityType: "DIAGRAM",
      entityId: d.id,
      action: "CREATED",
      title: d.title,
      description: "Created via AI Bootstrap Wizard",
      triggeredBy: userId,
      metadata: meta({}),
    });
  }
  for (const m of created.databaseModels) {
    await recordVersionEvent({
      projectId,
      entityType: "DATABASE_MODEL",
      entityId: m.id,
      action: "CREATED",
      title: m.title,
      description: m.databaseType,
      triggeredBy: userId,
      metadata: meta({ databaseType: m.databaseType, entityCount: m.entityCount, fieldCount: m.fieldCount }),
    });
  }
  for (const e of created.databaseEntities) {
    await recordVersionEvent({
      projectId,
      entityType: "DATABASE_ENTITY",
      entityId: e.id,
      action: "CREATED",
      title: e.name,
      description: `Added to "${e.modelTitle}"`,
      triggeredBy: userId,
      metadata: meta({ databaseModelId: e.databaseModelId }),
    });
  }
  for (const f of created.databaseFields) {
    await recordVersionEvent({
      projectId,
      entityType: "DATABASE_FIELD",
      entityId: f.id,
      action: "CREATED",
      title: `${f.entityName}.${f.fieldName}`,
      description: `${f.type}${f.isPrimaryKey ? " · PK" : ""}${f.isForeignKey ? " · FK" : ""}`,
      triggeredBy: userId,
      metadata: meta({ entityId: f.entityId, databaseModelId: f.databaseModelId }),
    });
  }
  for (const s of created.apiSpecs) {
    await recordVersionEvent({
      projectId,
      entityType: "API_SPEC",
      entityId: s.id,
      action: "CREATED",
      title: s.title,
      description: `v${s.version}${s.baseUrl ? " · " + s.baseUrl : ""}`,
      triggeredBy: userId,
      metadata: meta({ version: s.version, baseUrl: s.baseUrl, endpointCount: s.endpointCount }),
    });
  }
  for (const ep of created.apiEndpoints) {
    await recordVersionEvent({
      projectId,
      entityType: "API_ENDPOINT",
      entityId: ep.id,
      action: "CREATED",
      title: `${ep.method} ${ep.path}`,
      description: `Added to "${ep.specTitle}"`,
      triggeredBy: userId,
      metadata: meta({ specId: ep.apiSpecId, method: ep.method, path: ep.path }),
    });
  }

  // ── Audit: mark the session APPLIED (or create one if applied without propose) ──
  const counts = {
    artifactsCreated: created.artifacts.length,
    relationsCreated: created.relations.length,
    diagramsCreated: created.diagrams.length,
    databaseModelsCreated: created.databaseModels.length,
    databaseEntitiesCreated: created.databaseEntities.length,
    databaseFieldsCreated: created.databaseFields.length,
    apiSpecsCreated: created.apiSpecs.length,
    apiEndpointsCreated: created.apiEndpoints.length,
  };
  const priorId = params.sessionId ?? null;
  const existingSession = priorId
    ? await prisma.aiSession.findUnique({ where: { id: priorId } })
    : null;
  let resolvedSessionId: string;
  if (existingSession && existingSession.projectId === projectId) {
    await prisma.aiSession.update({
      where: { id: existingSession.id },
      data: { status: AiSessionStatus.APPLIED, appliedById: userId, ...counts },
    });
    resolvedSessionId = existingSession.id;
  } else {
    const fresh = await prisma.aiSession.create({
      data: {
        projectId,
        status: AiSessionStatus.APPLIED,
        idea: "",
        proposal: proposal as unknown as Prisma.InputJsonValue,
        artifactsProposed: proposal.artifacts.length,
        relationsProposed: proposal.relations.length,
        diagramsProposed: proposal.diagrams.length,
        databaseModelsProposed: proposal.databaseModels.length,
        databaseEntitiesProposed: proposal.databaseModels.reduce((n, m) => n + m.entities.length, 0),
        databaseFieldsProposed: proposal.databaseModels.reduce(
          (n, m) => n + m.entities.reduce((k, e) => k + e.fields.length, 0),
          0,
        ),
        apiSpecsProposed: proposal.apiSpecs.length,
        apiEndpointsProposed: proposal.apiSpecs.reduce((n, s) => n + s.endpoints.length, 0),
        ...counts,
        createdById: userId,
        appliedById: userId,
      },
    });
    resolvedSessionId = fresh.id;
  }

  return {
    sessionId: resolvedSessionId,
    applied: created,
    skipped: buildSkipped(report),
    validation: report,
  };
}
