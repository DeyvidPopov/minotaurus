// Pure export payload builder — shared by the HTTP handler and the seed
// script. Reads from Postgres via Prisma; does not write.

import type { Artifact, ExportFormat } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { formatSchemaForExport } from "./format-schema.js";
import type {
  AiReviewExportAdvisory,
  AiReviewExportBlock,
  AiReviewExportFinding,
  AiReviewExportReview,
} from "./analysis/analysis.types.js";

export const EXPORT_FORMATS: ExportFormat[] = ["JSON", "MARKDOWN", "PDF"];

// Render an endpoint payload schema as a fenced JSON code block indented two
// spaces so GitHub-flavored Markdown nests it under its `- ` endpoint bullet.
function pushMarkdownSchemaBlock(lines: string[], label: string, formatted: string): void {
  lines.push("");
  lines.push(`  _${label}_`);
  lines.push("");
  lines.push("  ```json");
  for (const ln of formatted.split("\n")) lines.push("  " + ln);
  lines.push("  ```");
}

// Render one AI finding group (strengths / risks / recommendations / …) as a
// `####` subsection with a bullet per item. Badge (severity/priority) is bold-
// prefixed; an optional recommendation and an "unverified" marker drop below.
function pushAiFindingGroup(lines: string[], heading: string, items: AiReviewExportFinding[]): void {
  if (items.length === 0) return;
  lines.push(`\n#### ${heading}`);
  for (const f of items) {
    const badge = f.badge ? `**[${f.badge}]** ` : "";
    lines.push(`- ${badge}**${f.title}** — ${f.observation}${f.unverified ? "  _(unverified)_" : ""}`);
    if (f.recommendation) lines.push(`  - _Recommendation:_ ${f.recommendation}`);
  }
}

function pushAiReviewMarkdown(lines: string[], block: AiReviewExportBlock): void {
  lines.push("\n## AI Architecture Review\n");
  lines.push("_AI-generated interpretation of the deterministic analysis — advisory, not part of the scored assessment._\n");

  const provenance = (r: AiReviewExportReview | AiReviewExportAdvisory): string => {
    const bits = [`Model: \`${r.model}\``, `Generated: ${r.generatedAt.slice(0, 10)}`,
      r.stale ? "**⚠ Project changed since this was generated**" : "Current"];
    if (r.truncated) bits.push("_output truncated_");
    return bits.join(" · ");
  };

  const rev = block.review;
  if (rev) {
    lines.push("### Full Review");
    lines.push(provenance(rev));
    if (rev.unverifiedCount > 0) lines.push(`_${rev.unverifiedCount} finding(s) could not be evidence-verified._`);
    if (rev.executiveSummary) lines.push(`\n${rev.executiveSummary}`);
    pushAiFindingGroup(lines, "Strengths", rev.strengths);
    pushAiFindingGroup(lines, "Risks", rev.risks);
    pushAiFindingGroup(lines, "Blind spots", rev.blindSpots);
    pushAiFindingGroup(lines, "Governance review", rev.governanceReview);
    pushAiFindingGroup(lines, "Validation commentary", rev.validationCommentary);
    pushAiFindingGroup(lines, "Recommendations", rev.recommendations);
    lines.push("");
  }

  const adv = block.advisory;
  if (adv) {
    lines.push("### Advisor — Next Steps");
    lines.push(provenance(adv));
    if (adv.executiveSummary) lines.push(`\n${adv.executiveSummary}`);
    pushAiFindingGroup(lines, "Current focus areas", adv.focusAreas);
    pushAiFindingGroup(lines, "Opportunities", adv.opportunities);
    pushAiFindingGroup(lines, "Recommended next steps", adv.recommendations);
    lines.push("");
  }
}

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
  // AI Review/Advisor narrative, pre-assembled + staleness-resolved by the
  // caller (modules/ai/.../export-block.ts). Frozen into the snapshot here so the
  // renderers stay AI-free (Safety Rule 3). The engine never loads it itself.
  aiReview?: AiReviewExportBlock | null,
): Promise<unknown> {
  const [project, artifacts, allRelations, issues, apiSpecs, apiEndpoints, databaseModels, databaseEntities, databaseFields, diagrams, versionEvents, members] =
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
      // Ordered by `position` so exported ERDs/JSON match the field order users set
      // on the model page (per-entity `.filter` below preserves this relative order).
      prisma.databaseField.findMany({
        where: { entity: { databaseModel: { projectId } } },
        orderBy: [{ position: "asc" }, { name: "asc" }],
      }),
      prisma.diagram.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
      prisma.versionEvent.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.projectMember.findMany({
        where: { projectId },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      }),
    ]);

  const artifactIds = new Set(artifacts.map((a) => a.id));
  const relations = allRelations.filter(
    (r) => artifactIds.has(r.sourceArtifactId) && artifactIds.has(r.targetArtifactId),
  );

  const wanted = new Set(sections.map((s) => s.toUpperCase()));
  // Empty scope = full export. This mirrors the PDF report planner
  // (pdf/report-plan.ts), which treats an empty section list as a full report
  // for back-compat with older ExportPackage rows that stored no sections.
  // Without this parity, a `sections: []` snapshot was assembled near-empty
  // while the PDF still rendered every section heading ("No artifacts." …).
  const all = wanted.size === 0;
  const has = (token: string): boolean => all || wanted.has(token);

  const wantsArtifacts = has("ARTIFACTS") || has("DOCUMENTATION");
  const wantsValidation =
    has("VALIDATION") || has("VALIDATION_ISSUES") || has("VALIDATION_REPORT");
  const wantsGraph = has("GRAPH");
  const wantsApiSpecs = has("API_SPECS") || has("API_ENDPOINTS");
  const wantsDatabaseModels = has("DATABASE_MODELS") || has("DATABASE_ENTITIES");
  const wantsDiagrams = has("DIAGRAMS");
  const wantsVersionHistory = has("VERSION_HISTORY") || has("RECENT_CHANGES");
  const wantsImpact = has("IMPACT_ANALYSIS") || has("IMPACT");
  const wantsTeam = has("TEAM") || has("MEMBERS");
  const wantsRelations = has("RELATIONS");
  const wantsAiReview = has("AI_REVIEW");
  const aiReviewBlock =
    wantsAiReview && aiReview && (aiReview.review || aiReview.advisory) ? aiReview : null;

  const payload: Record<string, unknown> = {
    project,
    generatedAt: new Date().toISOString(),
  };

  if (wantsTeam) {
    payload.team = members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      email: m.user.email,
      name: [m.user.firstName, m.user.lastName].filter(Boolean).join(" ").trim() || null,
    }));
  }

  if (wantsArtifacts) payload.artifacts = artifacts.map(serializeArtifactForExport);
  if (wantsRelations) {
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
    const fieldNameById = new Map(databaseFields.map((f) => [f.id, f.name]));
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
              // Precise (column-level) FK target — the exact referenced column.
              referencesFieldId: f.referencesFieldId,
              referencesFieldName: f.referencesFieldId
                ? fieldNameById.get(f.referencesFieldId) ?? null
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

  // Frozen AI narrative (JSON + PDF read it from the object payload; Markdown
  // renders it below). Already staleness-resolved by the caller.
  if (aiReviewBlock) payload.aiReview = aiReviewBlock;

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
    if (wantsTeam && members.length > 0) {
      lines.push("## Team\n");
      lines.push("| Name | Email | Role | Joined |");
      lines.push("|------|-------|------|--------|");
      for (const m of members) {
        const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(" ").trim() || "—";
        const joined = m.joinedAt.toISOString().slice(0, 10);
        lines.push(`| ${name} | ${m.user.email} | ${m.role} | ${joined} |`);
      }
      lines.push("");
    }
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
      const fieldNameById = new Map(databaseFields.map((f) => [f.id, f.name]));
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
                  // Show the EXACT referenced column when pinned (referencesFieldId),
                  // else just the target entity.
                  const targetColumn = f.referencesFieldId ? fieldNameById.get(f.referencesFieldId) : null;
                  flags.push(`FK → ${target ?? "?"}${targetColumn ? `.${targetColumn}` : ""}`);
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
            const req = formatSchemaForExport(e.requestSchema);
            const resp = formatSchemaForExport(e.responseSchema);
            if (req) pushMarkdownSchemaBlock(lines, "Request payload", req);
            if (resp) pushMarkdownSchemaBlock(lines, "Response payload", resp);
          }
        }
        lines.push("");
      }
    }
    if (wantsRelations) {
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
          `- **${v.severity}** [${v.category}] ${v.message} — _${titleById.get(v.subjectId) ?? v.subjectId}_`,
        );
      }
    }
    if (aiReviewBlock) pushAiReviewMarkdown(lines, aiReviewBlock);
    return lines.join("\n");
  }

  return payload;
}
