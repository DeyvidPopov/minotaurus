import type { Response } from "express";
import { z } from "zod";
import { db, persist, type ExportPackageRow } from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { EXPORT_FORMATS, buildExportContent } from "./exports.engine.js";

const createSchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  sections: z.array(z.string()).optional().default(["ARTIFACTS", "RELATIONS"]),
});

function projectAccess(projectId: string, userId: string): "ok" | "not_found" | "forbidden" {
  const project = db().projects.find((p) => p.id === projectId);
  if (!project) return "not_found";
  return project.ownerId === userId ? "ok" : "forbidden";
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
    content: buildExportContent(projectId, parsed.data.format, parsed.data.sections),
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
