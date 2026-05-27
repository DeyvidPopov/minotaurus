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
  const apiSpecs = state.apiSpecs.filter((s) => s.projectId === projectId);
  const apiSpecIds = new Set(apiSpecs.map((s) => s.id));
  const apiEndpoints = state.apiEndpoints.filter((e) => apiSpecIds.has(e.apiSpecId));

  const wanted = new Set(sections.map((s) => s.toUpperCase()));
  // DOCUMENTATION implies ARTIFACTS — docs live inside artifact objects.
  const wantsArtifacts = wanted.has("ARTIFACTS") || wanted.has("DOCUMENTATION");
  const wantsValidation =
    wanted.has("VALIDATION") ||
    wanted.has("VALIDATION_ISSUES") ||
    wanted.has("VALIDATION_REPORT");
  const wantsGraph = wanted.has("GRAPH");
  const wantsApiSpecs = wanted.has("API_SPECS") || wanted.has("API_ENDPOINTS");

  const payload: Record<string, unknown> = {
    project,
    generatedAt: new Date().toISOString(),
  };
  if (wantsArtifacts) payload.artifacts = artifacts.map(serializeArtifactForExport);
  if (wanted.has("RELATIONS")) payload.relations = relations;
  if (wantsValidation) payload.validationIssues = issues;
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
      linkedArtifact:
        s.artifactId
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
