// Pure export payload builder — shared by the HTTP handler and the seed
// script. Reads from Postgres via Prisma; does not write.

import type { Artifact, ExportFormat } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export const EXPORT_FORMATS: ExportFormat[] = ["JSON", "MARKDOWN", "PDF", "ZIP"];

export function serializeArtifactForExport(a: Artifact) {
  const { documentationContent, ...rest } = a;
  const out: Record<string, unknown> = { ...rest };
  if (documentationContent && documentationContent.trim()) {
    out.documentation = {
      markdownContent: documentationContent,
      updatedAt: a.updatedAt,
    };
  }
  return out;
}

export async function buildExportContent(
  projectId: string,
  format: ExportFormat,
  sections: string[],
): Promise<unknown> {
  const [project, artifacts, allRelations, issues, apiSpecs, apiEndpoints, databaseModels, databaseEntities, databaseFields, diagrams, versionEvents] =
    await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.artifact.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
      prisma.artifactRelation.findMany({
        where: { sourceArtifact: { projectId } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.validationIssue.findMany({ where: { projectId } }),
      prisma.apiSpec.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
      prisma.apiEndpoint.findMany({ where: { apiSpec: { projectId } } }),
      prisma.databaseModel.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
      prisma.databaseEntity.findMany({ where: { databaseModel: { projectId } } }),
      prisma.databaseField.findMany({ where: { entity: { databaseModel: { projectId } } } }),
      prisma.diagram.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
      prisma.versionEvent.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const artifactIds = new Set(artifacts.map((a) => a.id));
  const relations = allRelations.filter(
    (r) => artifactIds.has(r.sourceArtifactId) && artifactIds.has(r.targetArtifactId),
  );

  const wanted = new Set(sections.map((s) => s.toUpperCase()));
  const wantsArtifacts = wanted.has("ARTIFACTS") || wanted.has("DOCUMENTATION");
  const wantsValidation =
    wanted.has("VALIDATION") ||
    wanted.has("VALIDATION_ISSUES") ||
    wanted.has("VALIDATION_REPORT");
  const wantsGraph = wanted.has("GRAPH");
  const wantsApiSpecs = wanted.has("API_SPECS") || wanted.has("API_ENDPOINTS");
  const wantsDatabaseModels = wanted.has("DATABASE_MODELS") || wanted.has("DATABASE_ENTITIES");
  const wantsDiagrams = wanted.has("DIAGRAMS");
  const wantsVersionHistory = wanted.has("VERSION_HISTORY") || wanted.has("RECENT_CHANGES");
  const wantsImpact = wanted.has("IMPACT_ANALYSIS") || wanted.has("IMPACT");

  const payload: Record<string, unknown> = {
    project,
    generatedAt: new Date().toISOString(),
  };

  if (wantsArtifacts) payload.artifacts = artifacts.map(serializeArtifactForExport);
  if (wanted.has("RELATIONS")) {
    payload.relations = relations.map((r) => ({
      id: r.id,
      sourceArtifactId: r.sourceArtifactId,
      targetArtifactId: r.targetArtifactId,
      relationType: r.relationType,
      description: r.description,
      createdBy: r.createdById,
      createdAt: r.createdAt,
    }));
  }
  if (wantsValidation) {
    payload.validationIssues = issues.map((v) => ({ ...v }));
  }

  if (wantsVersionHistory) {
    payload.versionHistory = versionEvents.slice(0, 100).map((e) => ({
      id: e.id,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      title: e.title,
      description: e.description,
      triggeredBy: e.triggeredById,
      metadata: e.metadata,
      createdAt: e.createdAt,
    }));
    payload.recentChanges = payload.versionHistory;
  }

  if (wantsImpact) {
    const artifactsById = new Map(artifacts.map((a) => [a.id, a]));
    payload.impactAnalysis = artifacts.map((a) => {
      const outgoing = relations.filter((r) => r.sourceArtifactId === a.id);
      const incoming = relations.filter((r) => r.targetArtifactId === a.id);
      const linkedSpecs = apiSpecs.filter((s) => s.artifactId === a.id).length;
      const linkedDbs = databaseModels.filter((m) => m.artifactId === a.id).length;
      const linkedDiagrams = diagrams.filter((d) => d.artifactId === a.id).length;
      return {
        artifact: { id: a.id, title: a.title, type: a.type, status: a.status },
        directDependencies: outgoing.map((r) => ({
          id: r.id,
          targetArtifactId: r.targetArtifactId,
          targetTitle: artifactsById.get(r.targetArtifactId)?.title ?? null,
          relationType: r.relationType,
        })),
        dependentArtifacts: incoming.map((r) => ({
          id: r.id,
          sourceArtifactId: r.sourceArtifactId,
          sourceTitle: artifactsById.get(r.sourceArtifactId)?.title ?? null,
          relationType: r.relationType,
        })),
        impactSummary: {
          affectedArtifacts: outgoing.length + incoming.length,
          affectedApis: linkedSpecs,
          affectedDatabases: linkedDbs,
          affectedDiagrams: linkedDiagrams,
        },
      };
    });
  }

  if (wantsDatabaseModels) {
    const entityNameById = new Map(databaseEntities.map((e) => [e.id, e.name]));
    payload.databaseModels = databaseModels.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      artifactId: m.artifactId,
      title: m.title,
      databaseType: m.databaseType,
      description: m.description,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      linkedArtifact: m.artifactId
        ? (() => {
            const a = artifacts.find((x) => x.id === m.artifactId);
            return a ? { id: a.id, title: a.title, type: a.type } : null;
          })()
        : null,
      entities: databaseEntities
        .filter((e) => e.databaseModelId === m.id)
        .map((e) => ({
          id: e.id,
          name: e.name,
          description: e.description,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          fields: databaseFields
            .filter((f) => f.entityId === e.id)
            .map((f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              required: f.required,
              isPrimaryKey: f.isPrimaryKey,
              isForeignKey: f.isForeignKey,
              referencesEntityId: f.referencesEntityId,
              referencesEntityName: f.referencesEntityId
                ? entityNameById.get(f.referencesEntityId) ?? null
                : null,
              description: f.description,
            })),
        })),
    }));
  }

  if (wantsApiSpecs) {
    payload.apiSpecs = apiSpecs.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      artifactId: s.artifactId,
      title: s.title,
      version: s.version,
      baseUrl: s.baseUrl,
      description: s.description,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      linkedArtifact: s.artifactId
        ? (() => {
            const a = artifacts.find((x) => x.id === s.artifactId);
            return a ? { id: a.id, title: a.title, type: a.type } : null;
          })()
        : null,
      endpoints: apiEndpoints
        .filter((e) => e.apiSpecId === s.id)
        .map((e) => ({
          id: e.id,
          path: e.path,
          method: e.method,
          summary: e.summary,
          requestSchema: e.requestSchema,
          responseSchema: e.responseSchema,
          requiresAuth: e.requiresAuth,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        })),
    }));
  }

  if (wantsDiagrams) {
    payload.diagrams = diagrams.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      artifactId: d.artifactId,
      title: d.title,
      type: d.type,
      mermaidSource: d.mermaidSource,
      description: d.description,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      linkedArtifact: d.artifactId
        ? (() => {
            const a = artifacts.find((x) => x.id === d.artifactId);
            return a ? { id: a.id, title: a.title, type: a.type } : null;
          })()
        : null,
    }));
  }

  if (wantsGraph) {
    payload.graph = {
      nodes: artifacts.map((a) => ({
        id: a.id,
        label: a.title,
        type: a.type,
        status: a.status,
        gx: a.gx,
        gy: a.gy,
      })),
      edges: relations.map((r) => ({
        id: r.id,
        source: r.sourceArtifactId,
        target: r.targetArtifactId,
        type: r.relationType,
      })),
    };
  }

  if (format === "MARKDOWN") {
    const lines: string[] = [];
    lines.push(`# ${project?.name ?? "Project"}\n`);
    if (project?.description) lines.push(project.description + "\n");
    if (wantsArtifacts) {
      lines.push("## Artifacts\n");
      for (const a of artifacts) {
        lines.push(`### ${a.title}`);
        lines.push(`_${a.type} · ${a.status}_\n`);
        if (a.description) lines.push(`${a.description}\n`);
        if (a.documentationContent && a.documentationContent.trim()) {
          lines.push(`#### Documentation`);
          lines.push(a.documentationContent.trim() + "\n");
        }
      }
    }
    if (wantsDiagrams && diagrams.length > 0) {
      lines.push("\n## Diagrams\n");
      const titleById = new Map(artifacts.map((a) => [a.id, a.title]));
      for (const d of diagrams) {
        lines.push(`### ${d.title}  \`${d.type}\``);
        if (d.artifactId) lines.push(`Linked artifact: **${titleById.get(d.artifactId) ?? d.artifactId}**`);
        if (d.description) lines.push(`\n${d.description}`);
        if (d.mermaidSource && d.mermaidSource.trim()) {
          lines.push("\n```mermaid");
          lines.push(d.mermaidSource.trim());
          lines.push("```\n");
        } else {
          lines.push("\n_No Mermaid source._\n");
        }
      }
    }
    if (wantsDatabaseModels && databaseModels.length > 0) {
      lines.push("\n## Database models\n");
      const titleById = new Map(artifacts.map((a) => [a.id, a.title]));
      const entityNameById = new Map(databaseEntities.map((e) => [e.id, e.name]));
      for (const m of databaseModels) {
        lines.push(`### ${m.title}  \`${m.databaseType}\``);
        if (m.artifactId) lines.push(`Linked artifact: **${titleById.get(m.artifactId) ?? m.artifactId}**`);
        if (m.description) lines.push(`\n${m.description}`);
        const modelEntities = databaseEntities.filter((e) => e.databaseModelId === m.id);
        if (modelEntities.length === 0) {
          lines.push("\n_No entities._");
        } else {
          for (const e of modelEntities) {
            lines.push(`\n#### ${e.name}`);
            if (e.description) lines.push(e.description);
            const fields = databaseFields.filter((f) => f.entityId === e.id);
            if (fields.length === 0) {
              lines.push("_No fields._");
            } else {
              for (const f of fields) {
                const flags: string[] = [];
                if (f.isPrimaryKey) flags.push("PK");
                if (f.isForeignKey || f.referencesEntityId) {
                  const target = f.referencesEntityId ? entityNameById.get(f.referencesEntityId) : null;
                  flags.push(`FK → ${target ?? "?"}`);
                }
                if (f.required) flags.push("required");
                lines.push(`- \`${f.name}: ${f.type}\`${flags.length ? "  _" + flags.join(", ") + "_" : ""}`);
              }
            }
          }
        }
        lines.push("");
      }
    }
    if (wantsApiSpecs && apiSpecs.length > 0) {
      lines.push("\n## API specs\n");
      const titleById = new Map(artifacts.map((a) => [a.id, a.title]));
      for (const s of apiSpecs) {
        lines.push(`### ${s.title}  \`v${s.version}\``);
        if (s.baseUrl) lines.push(`Base URL: \`${s.baseUrl}\``);
        if (s.artifactId) lines.push(`Linked artifact: **${titleById.get(s.artifactId) ?? s.artifactId}**`);
        if (s.description) lines.push(`\n${s.description}`);
        const specEps = apiEndpoints.filter((e) => e.apiSpecId === s.id);
        if (specEps.length === 0) {
          lines.push("\n_No endpoints._");
        } else {
          lines.push("");
          for (const e of specEps) {
            lines.push(
              `- **${e.method} ${e.path}** — ${e.summary || "_no summary_"}${e.requiresAuth ? " · 🔒 auth required" : ""}`,
            );
          }
        }
        lines.push("");
      }
    }
    if (wanted.has("RELATIONS")) {
      lines.push("\n## Relations\n");
      const titleById = new Map(artifacts.map((a) => [a.id, a.title]));
      for (const r of relations) {
        lines.push(
          `- ${titleById.get(r.sourceArtifactId) ?? r.sourceArtifactId} —[${r.relationType}]→ ${titleById.get(r.targetArtifactId) ?? r.targetArtifactId}`,
        );
      }
    }
    if (wantsVersionHistory && versionEvents.length > 0) {
      lines.push("\n## Version history\n");
      for (const e of versionEvents.slice(0, 100)) {
        const day = e.createdAt.toISOString().slice(0, 10);
        lines.push(`- [${day}] **${e.action}** ${e.entityType} — ${e.title}${e.description ? "  _" + e.description + "_" : ""}`);
      }
    }
    if (wantsValidation && issues.length > 0) {
      lines.push("\n## Validation report\n");
      const titleById = new Map(artifacts.map((a) => [a.id, a.title]));
      for (const v of issues) {
        lines.push(
          `- **${v.severity}** [${v.category}] ${v.message} — _${titleById.get(v.artifactId) ?? v.artifactId}_`,
        );
      }
    }
    return lines.join("\n");
  }

  return payload;
}
