import type { Response } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { EXPORT_FORMATS, buildExportContent } from "./exports.engine.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

const createSchema = z.object({
  format: z.enum(EXPORT_FORMATS as [(typeof EXPORT_FORMATS)[number], ...(typeof EXPORT_FORMATS)[number][]]),
  sections: z.array(z.string()).optional().default(["ARTIFACTS", "RELATIONS"]),
});

async function projectAccess(projectId: string, userId: string): Promise<"ok" | "not_found" | "forbidden"> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return "not_found";
  return project.ownerId === userId ? "ok" : "forbidden";
}

export async function createExport(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const content = await buildExportContent(projectId, parsed.data.format, parsed.data.sections);
  const exportRow = await prisma.exportPackage.create({
    data: {
      projectId,
      format: parsed.data.format,
      sections: parsed.data.sections,
      content: content as Prisma.InputJsonValue,
      createdById: req.user!.userId,
    },
  });
  await recordVersionEvent({
    projectId: exportRow.projectId,
    entityType: "EXPORT",
    entityId: exportRow.id,
    action: "EXPORTED",
    title: `${exportRow.format} export`,
    description: exportRow.sections.join(", "),
    triggeredBy: req.user!.userId,
    metadata: { format: exportRow.format, sections: exportRow.sections },
  });
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

export async function listExports(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const items = await prisma.exportPackage.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return ok(
    res,
    items.map((e) => ({
      id: e.id,
      projectId: e.projectId,
      format: e.format,
      sections: e.sections,
      createdAt: e.createdAt,
    })),
    "OK",
  );
}

export async function getExport(req: AuthedRequest, res: Response) {
  const exp = await prisma.exportPackage.findUnique({ where: { id: req.params.exportId } });
  if (!exp) return fail(res, 404, "NOT_FOUND", "Export not found");
  const access = await projectAccess(exp.projectId, req.user!.userId);
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");
  return ok(res, exp, "OK");
}
