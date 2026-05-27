import type { Response } from "express";
import { z } from "zod";
import { DiagramType, type Diagram } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

const DIAGRAM_TYPES = Object.values(DiagramType) as [DiagramType, ...DiagramType[]];

export function serializeDiagram(d: Diagram) {
  return {
    id: d.id,
    projectId: d.projectId,
    artifactId: d.artifactId,
    title: d.title,
    type: d.type,
    mermaidSource: d.mermaidSource,
    description: d.description,
    createdBy: d.createdById,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

async function projectAccess(projectId: string, userId: string): Promise<"ok" | "not_found" | "forbidden"> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return "not_found";
  return project.ownerId === userId ? "ok" : "forbidden";
}

async function findDiagramForUser(diagramId: string, userId: string) {
  const row = await prisma.diagram.findUnique({ where: { id: diagramId } });
  if (!row) return { error: "not_found" as const };
  const project = await prisma.project.findUnique({ where: { id: row.projectId } });
  if (!project || project.ownerId !== userId) return { error: "forbidden" as const };
  return { row };
}

const createSchema = z.object({
  title: z.string().min(1),
  type: z.enum(DIAGRAM_TYPES).optional().default("FLOWCHART"),
  mermaidSource: z.string().optional().default(""),
  description: z.string().optional().default(""),
  artifactId: z.string().nullable().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(DIAGRAM_TYPES).optional(),
  mermaidSource: z.string().optional(),
  description: z.string().optional(),
  artifactId: z.string().nullable().optional(),
});

export async function listDiagrams(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { search, q, artifactId, type } = req.query as Record<string, string | undefined>;
  const items = await prisma.diagram.findMany({
    where: {
      projectId,
      ...(artifactId ? { artifactId } : {}),
      ...(type ? { type: type as DiagramType } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  const term = (search || q || "").toLowerCase().trim();
  const filtered = term
    ? items.filter(
        (d) =>
          d.title.toLowerCase().includes(term) ||
          d.description.toLowerCase().includes(term),
      )
    : items;
  return ok(res, filtered.map(serializeDiagram), "OK");
}

export async function createDiagram(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  if (parsed.data.artifactId) {
    const artifact = await prisma.artifact.findUnique({
      where: { id: parsed.data.artifactId },
    });
    if (!artifact || artifact.projectId !== projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to the same project");
    }
  }

  const row = await prisma.diagram.create({
    data: {
      projectId,
      artifactId: parsed.data.artifactId ?? null,
      title: parsed.data.title,
      type: parsed.data.type,
      mermaidSource: parsed.data.mermaidSource,
      description: parsed.data.description,
      createdById: req.user!.userId,
    },
  });
  await recordVersionEvent({
    projectId,
    entityType: "DIAGRAM",
    entityId: row.id,
    action: "CREATED",
    title: row.title,
    description: row.type,
    triggeredBy: req.user!.userId,
    metadata: { type: row.type },
  });
  return created(res, serializeDiagram(row), "Diagram created");
}

export async function getDiagram(req: AuthedRequest, res: Response) {
  const result = await findDiagramForUser(req.params.diagramId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Diagram not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  return ok(res, serializeDiagram(result.row), "OK");
}

export async function patchDiagram(req: AuthedRequest, res: Response) {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = await findDiagramForUser(req.params.diagramId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Diagram not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const row = result.row;

  if (parsed.data.artifactId !== undefined && parsed.data.artifactId !== null) {
    const artifact = await prisma.artifact.findUnique({
      where: { id: parsed.data.artifactId },
    });
    if (!artifact || artifact.projectId !== row.projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to the same project");
    }
  }

  const updated = await prisma.diagram.update({
    where: { id: row.id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
      ...(parsed.data.mermaidSource !== undefined
        ? { mermaidSource: parsed.data.mermaidSource }
        : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.artifactId !== undefined ? { artifactId: parsed.data.artifactId } : {}),
    },
  });
  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "DIAGRAM",
    entityId: row.id,
    action: "UPDATED",
    title: updated.title,
    description: Object.keys(parsed.data).join(", "),
    triggeredBy: req.user!.userId,
    metadata: { changed: Object.keys(parsed.data) },
  });
  return ok(res, serializeDiagram(updated), "Diagram updated");
}

export async function deleteDiagram(req: AuthedRequest, res: Response) {
  const result = await findDiagramForUser(req.params.diagramId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Diagram not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const row = result.row;
  await prisma.diagram.delete({ where: { id: row.id } });
  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "DIAGRAM",
    entityId: row.id,
    action: "DELETED",
    title: row.title,
    description: "Diagram removed",
    triggeredBy: req.user!.userId,
  });
  return ok(res, null, "Diagram deleted");
}
