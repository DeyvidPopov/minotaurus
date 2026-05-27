import type { Response } from "express";
import { z } from "zod";
import type { Project } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function colorFromId(id: string): string {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return COLORS[sum % COLORS.length];
}

export async function serializeProject(p: Project) {
  const [artifactCount, validationIssueCount] = await Promise.all([
    prisma.artifact.count({ where: { projectId: p.id } }),
    prisma.validationIssue.count({ where: { projectId: p.id, status: "OPEN" } }),
  ]);
  return {
    id: p.id,
    name: p.name,
    slug: slugify(p.name),
    description: p.description,
    ownerId: p.ownerId,
    artifactCount,
    validationIssueCount,
    members: 1,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    starred: false,
    color: colorFromId(p.id),
  };
}

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export async function listProjects(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  const projects = await prisma.project.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
  });
  const serialized = await Promise.all(projects.map((p) => serializeProject(p)));
  return ok(res, serialized, "OK");
}

export async function createProject(req: AuthedRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      ownerId: req.user!.userId,
    },
  });
  return created(res, await serializeProject(project), "Project created");
}

export async function getProject(req: AuthedRequest, res: Response) {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return fail(res, 404, "NOT_FOUND", "Project not found");
  if (project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  }
  return ok(res, await serializeProject(project), "OK");
}

export async function updateProject(req: AuthedRequest, res: Response) {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return fail(res, 404, "NOT_FOUND", "Project not found");
  if (project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  }
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    },
  });
  return ok(res, await serializeProject(updated), "Project updated");
}

export async function deleteProject(req: AuthedRequest, res: Response) {
  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) return fail(res, 404, "NOT_FOUND", "Project not found");
  if (project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  }
  await prisma.project.delete({ where: { id: project.id } });
  return ok(res, null, "Project deleted");
}
