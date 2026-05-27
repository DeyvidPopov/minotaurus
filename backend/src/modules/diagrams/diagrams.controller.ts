import type { Response } from "express";
import { z } from "zod";
import {
  db,
  persist,
  type DiagramRow,
  type DiagramType,
} from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

const DIAGRAM_TYPES: DiagramType[] = [
  "FLOWCHART",
  "SEQUENCE",
  "ERD",
  "CLASS",
  "STATE",
  "GANTT",
  "ARCHITECTURE",
];

export function serializeDiagram(d: DiagramRow) {
  return {
    id: d.id,
    projectId: d.projectId,
    artifactId: d.artifactId,
    title: d.title,
    type: d.type,
    mermaidSource: d.mermaidSource,
    description: d.description,
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function projectAccess(projectId: string, userId: string): "ok" | "not_found" | "forbidden" {
  const project = db().projects.find((p) => p.id === projectId);
  if (!project) return "not_found";
  return project.ownerId === userId ? "ok" : "forbidden";
}

function findDiagramForUser(
  diagramId: string,
  userId: string,
): { row: DiagramRow } | { error: "not_found" | "forbidden" } {
  const row = db().diagrams.find((d) => d.id === diagramId);
  if (!row) return { error: "not_found" };
  const project = db().projects.find((p) => p.id === row.projectId);
  if (!project || project.ownerId !== userId) return { error: "forbidden" };
  return { row };
}

const createSchema = z.object({
  title: z.string().min(1),
  type: z.enum(DIAGRAM_TYPES as [DiagramType, ...DiagramType[]]).optional().default("FLOWCHART"),
  mermaidSource: z.string().optional().default(""),
  description: z.string().optional().default(""),
  artifactId: z.string().nullable().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(DIAGRAM_TYPES as [DiagramType, ...DiagramType[]]).optional(),
  mermaidSource: z.string().optional(),
  description: z.string().optional(),
  artifactId: z.string().nullable().optional(),
});

export function listDiagrams(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { search, q, artifactId, type } = req.query as Record<string, string | undefined>;
  let items = db().diagrams.filter((d) => d.projectId === projectId);
  if (artifactId) items = items.filter((d) => d.artifactId === artifactId);
  if (type) items = items.filter((d) => d.type === type);
  const term = (search || q || "").toLowerCase().trim();
  if (term) {
    items = items.filter(
      (d) =>
        d.title.toLowerCase().includes(term) ||
        d.description.toLowerCase().includes(term),
    );
  }
  return ok(res, items.map(serializeDiagram), "OK");
}

export function createDiagram(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  if (parsed.data.artifactId) {
    const artifact = db().artifacts.find((a) => a.id === parsed.data.artifactId);
    if (!artifact || artifact.projectId !== projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to the same project");
    }
  }

  const now = new Date().toISOString();
  const row: DiagramRow = {
    id: newId(),
    projectId,
    artifactId: parsed.data.artifactId ?? null,
    title: parsed.data.title,
    type: parsed.data.type,
    mermaidSource: parsed.data.mermaidSource,
    description: parsed.data.description,
    createdBy: req.user!.userId,
    createdAt: now,
    updatedAt: now,
  };
  db().diagrams.push(row);
  recordVersionEvent({
    projectId,
    entityType: "DIAGRAM",
    entityId: row.id,
    action: "CREATED",
    title: row.title,
    description: row.type,
    triggeredBy: req.user!.userId,
    metadata: { type: row.type },
  });
  persist();
  return created(res, serializeDiagram(row), "Diagram created");
}

export function getDiagram(req: AuthedRequest, res: Response) {
  const result = findDiagramForUser(req.params.diagramId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Diagram not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  return ok(res, serializeDiagram(result.row), "OK");
}

export function patchDiagram(req: AuthedRequest, res: Response) {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = findDiagramForUser(req.params.diagramId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Diagram not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const row = result.row;

  if (parsed.data.artifactId !== undefined && parsed.data.artifactId !== null) {
    const artifact = db().artifacts.find((a) => a.id === parsed.data.artifactId);
    if (!artifact || artifact.projectId !== row.projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to the same project");
    }
  }

  if (parsed.data.title !== undefined) row.title = parsed.data.title;
  if (parsed.data.type !== undefined) row.type = parsed.data.type;
  if (parsed.data.mermaidSource !== undefined) row.mermaidSource = parsed.data.mermaidSource;
  if (parsed.data.description !== undefined) row.description = parsed.data.description;
  if (parsed.data.artifactId !== undefined) row.artifactId = parsed.data.artifactId;
  row.updatedAt = new Date().toISOString();
  recordVersionEvent({
    projectId: row.projectId,
    entityType: "DIAGRAM",
    entityId: row.id,
    action: "UPDATED",
    title: row.title,
    description: Object.keys(parsed.data).join(", "),
    triggeredBy: req.user!.userId,
    metadata: { changed: Object.keys(parsed.data) },
  });
  persist();
  return ok(res, serializeDiagram(row), "Diagram updated");
}

export function deleteDiagram(req: AuthedRequest, res: Response) {
  const state = db();
  const idx = state.diagrams.findIndex((d) => d.id === req.params.diagramId);
  if (idx === -1) return fail(res, 404, "NOT_FOUND", "Diagram not found");
  const row = state.diagrams[idx];
  const project = state.projects.find((p) => p.id === row.projectId);
  if (!project || project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  state.diagrams.splice(idx, 1);
  recordVersionEvent({
    projectId: row.projectId,
    entityType: "DIAGRAM",
    entityId: row.id,
    action: "DELETED",
    title: row.title,
    description: "Diagram removed",
    triggeredBy: req.user!.userId,
  });
  persist();
  return ok(res, null, "Diagram deleted");
}
