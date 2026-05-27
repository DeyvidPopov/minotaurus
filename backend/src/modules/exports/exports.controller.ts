import type { Response } from "express";
import { z } from "zod";
import {
  db,
  persist,
  type ExportPackageRow,
} from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";

const FORMATS = ["JSON", "MARKDOWN", "PDF", "ZIP"] as const;

const createSchema = z.object({
  format: z.enum(FORMATS),
  sections: z.array(z.string()).optional().default(["ARTIFACTS", "RELATIONS"]),
});

function projectAccess(projectId: string, userId: string): "ok" | "not_found" | "forbidden" {
  const project = db().projects.find((p) => p.id === projectId);
  if (!project) return "not_found";
  return project.ownerId === userId ? "ok" : "forbidden";
}

function buildContent(
  projectId: string,
  format: (typeof FORMATS)[number],
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
  const payload: Record<string, unknown> = {
    project,
    generatedAt: new Date().toISOString(),
  };
  if (wanted.has("ARTIFACTS")) payload.artifacts = artifacts;
  if (wanted.has("RELATIONS")) payload.relations = relations;
  if (wanted.has("VALIDATION") || wanted.has("VALIDATION_ISSUES"))
    payload.validationIssues = issues;

  if (format === "MARKDOWN") {
    const lines: string[] = [];
    lines.push(`# ${project?.name ?? "Project"}\n`);
    if (project?.description) lines.push(project.description + "\n");
    if (wanted.has("ARTIFACTS")) {
      lines.push("## Artifacts\n");
      for (const a of artifacts) {
        lines.push(`- **${a.title}** (${a.type}, ${a.status}) — ${a.description}`);
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
    return lines.join("\n");
  }

  return payload;
}

export function createExport(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const exportRow: ExportPackageRow = {
    id: newId(),
    projectId,
    format: parsed.data.format,
    sections: parsed.data.sections,
    content: buildContent(projectId, parsed.data.format, parsed.data.sections),
    createdBy: req.user!.userId,
    createdAt: new Date().toISOString(),
  };
  db().exports.push(exportRow);
  persist();
  return created(
    res,
    {
      id: exportRow.id,
      status: "READY",
      format: exportRow.format,
      sections: exportRow.sections,
      createdAt: exportRow.createdAt,
    },
    "Export created",
  );
}

export function listExports(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const items = db()
    .exports.filter((e) => e.projectId === projectId)
    .map((e) => ({
      id: e.id,
      projectId: e.projectId,
      format: e.format,
      sections: e.sections,
      createdAt: e.createdAt,
    }));
  return ok(res, items, "OK");
}

export function getExport(req: AuthedRequest, res: Response) {
  const exp = db().exports.find((e) => e.id === req.params.exportId);
  if (!exp) return fail(res, 404, "NOT_FOUND", "Export not found");
  const access = projectAccess(exp.projectId, req.user!.userId);
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");
  return ok(res, exp, "OK");
}
