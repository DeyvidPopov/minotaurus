// Pure export payload builder — shared by the HTTP handler and the seed
// script. Reads from the in-memory db; does not write.

import { db, type ArtifactRow } from "../../db/json-db.js";

export const EXPORT_FORMATS = ["JSON", "MARKDOWN", "PDF", "ZIP"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// Strip the raw `documentationContent` field and surface it as a structured
// `documentation` object iff non-empty. Keeps the canonical storage on the
// artifact row — no duplicate documentation tree.
export function serializeArtifactForExport(a: ArtifactRow) {
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

export function buildExportContent(
  projectId: string,
  format: ExportFormat,
  sections: string[],
): unknown {
  const state = db();
  const project = state.projects.find((p) => p.id === projectId);
  const artifacts = state.artifacts.filter((a) => a.projectId === projectId);
  const ids = new Set(artifacts.map((a) => a.id));
  const relations = state.relations.filter(
    (r) => ids.has(r.sourceArtifactId) && ids.has(r.targetArtifactId),
  );
  const issues = state.validationIssues.filter((v) => v.projectId === projectId);

  const wanted = new Set(sections.map((s) => s.toUpperCase()));
  // DOCUMENTATION implies ARTIFACTS — docs live inside artifact objects.
  const wantsArtifacts = wanted.has("ARTIFACTS") || wanted.has("DOCUMENTATION");
  const wantsValidation =
    wanted.has("VALIDATION") ||
    wanted.has("VALIDATION_ISSUES") ||
    wanted.has("VALIDATION_REPORT");
  const wantsGraph = wanted.has("GRAPH");

  const payload: Record<string, unknown> = {
    project,
    generatedAt: new Date().toISOString(),
  };
  if (wantsArtifacts) payload.artifacts = artifacts.map(serializeArtifactForExport);
  if (wanted.has("RELATIONS")) payload.relations = relations;
  if (wantsValidation) payload.validationIssues = issues;
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
    if (wanted.has("RELATIONS")) {
      lines.push("\n## Relations\n");
      const titleById = new Map(artifacts.map((a) => [a.id, a.title]));
      for (const r of relations) {
        lines.push(
          `- ${titleById.get(r.sourceArtifactId) ?? r.sourceArtifactId} —[${r.relationType}]→ ${titleById.get(r.targetArtifactId) ?? r.targetArtifactId}`,
        );
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
