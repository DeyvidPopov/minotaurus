import type { Response } from "express";
import { z } from "zod";
import {
  db,
  persist,
  type ApiEndpointRow,
  type ApiSpecRow,
  type HttpMethod,
} from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

// ───────────────────── serializers ─────────────────────

export function serializeSpec(spec: ApiSpecRow) {
  const state = db();
  const endpointCount = state.apiEndpoints.filter((e) => e.apiSpecId === spec.id).length;
  return {
    id: spec.id,
    projectId: spec.projectId,
    artifactId: spec.artifactId,
    title: spec.title,
    version: spec.version,
    baseUrl: spec.baseUrl,
    description: spec.description,
    createdBy: spec.createdBy,
    createdAt: spec.createdAt,
    updatedAt: spec.updatedAt,
    endpointCount,
  };
}

export function serializeEndpoint(ep: ApiEndpointRow) {
  return {
    id: ep.id,
    apiSpecId: ep.apiSpecId,
    path: ep.path,
    method: ep.method,
    summary: ep.summary,
    requestSchema: ep.requestSchema,
    responseSchema: ep.responseSchema,
    requiresAuth: ep.requiresAuth,
    createdAt: ep.createdAt,
    updatedAt: ep.updatedAt,
  };
}

// ───────────────────── access ─────────────────────

function projectAccess(projectId: string, userId: string): "ok" | "not_found" | "forbidden" {
  const project = db().projects.find((p) => p.id === projectId);
  if (!project) return "not_found";
  return project.ownerId === userId ? "ok" : "forbidden";
}

function findSpecForUser(
  apiSpecId: string,
  userId: string,
): { row: ApiSpecRow } | { error: "not_found" | "forbidden" } {
  const row = db().apiSpecs.find((s) => s.id === apiSpecId);
  if (!row) return { error: "not_found" };
  const project = db().projects.find((p) => p.id === row.projectId);
  if (!project || project.ownerId !== userId) return { error: "forbidden" };
  return { row };
}

function findEndpointForUser(
  endpointId: string,
  userId: string,
): { row: ApiEndpointRow; spec: ApiSpecRow } | { error: "not_found" | "forbidden" } {
  const row = db().apiEndpoints.find((e) => e.id === endpointId);
  if (!row) return { error: "not_found" };
  const spec = db().apiSpecs.find((s) => s.id === row.apiSpecId);
  if (!spec) return { error: "not_found" };
  const project = db().projects.find((p) => p.id === spec.projectId);
  if (!project || project.ownerId !== userId) return { error: "forbidden" };
  return { row, spec };
}

// ───────────────────── schemas ─────────────────────

const createSpecSchema = z.object({
  title: z.string().min(1),
  version: z.string().optional().default("1.0.0"),
  baseUrl: z.string().optional().default(""),
  description: z.string().optional().default(""),
  artifactId: z.string().nullable().optional(),
});

const patchSpecSchema = z.object({
  title: z.string().min(1).optional(),
  version: z.string().optional(),
  baseUrl: z.string().optional(),
  description: z.string().optional(),
  artifactId: z.string().nullable().optional(),
});

const createEndpointSchema = z.object({
  path: z.string().min(1),
  method: z.enum(METHODS),
  summary: z.string().optional().default(""),
  requestSchema: z.string().optional().default(""),
  responseSchema: z.string().optional().default(""),
  requiresAuth: z.boolean().optional().default(false),
});

const patchEndpointSchema = z.object({
  path: z.string().min(1).optional(),
  method: z.enum(METHODS).optional(),
  summary: z.string().optional(),
  requestSchema: z.string().optional(),
  responseSchema: z.string().optional(),
  requiresAuth: z.boolean().optional(),
});

// ───────────────────── spec handlers ─────────────────────

export function listSpecs(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { search, q, artifactId } = req.query as Record<string, string | undefined>;
  let items = db().apiSpecs.filter((s) => s.projectId === projectId);
  if (artifactId) items = items.filter((s) => s.artifactId === artifactId);
  const term = (search || q || "").toLowerCase().trim();
  if (term) {
    items = items.filter(
      (s) =>
        s.title.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term) ||
        s.baseUrl.toLowerCase().includes(term),
    );
  }
  return ok(res, items.map(serializeSpec), "OK");
}

export function createSpec(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createSpecSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  if (parsed.data.artifactId) {
    const artifact = db().artifacts.find((a) => a.id === parsed.data.artifactId);
    if (!artifact || artifact.projectId !== projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to the same project");
    }
  }

  const now = new Date().toISOString();
  const spec: ApiSpecRow = {
    id: newId(),
    projectId,
    artifactId: parsed.data.artifactId ?? null,
    title: parsed.data.title,
    version: parsed.data.version,
    baseUrl: parsed.data.baseUrl,
    description: parsed.data.description,
    createdBy: req.user!.userId,
    createdAt: now,
    updatedAt: now,
  };
  db().apiSpecs.push(spec);
  persist();
  return created(res, serializeSpec(spec), "API spec created");
}

export function getSpec(req: AuthedRequest, res: Response) {
  const result = findSpecForUser(req.params.apiSpecId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "API spec not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  return ok(res, serializeSpec(result.row), "OK");
}

export function patchSpec(req: AuthedRequest, res: Response) {
  const parsed = patchSpecSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = findSpecForUser(req.params.apiSpecId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "API spec not found")
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
  if (parsed.data.version !== undefined) row.version = parsed.data.version;
  if (parsed.data.baseUrl !== undefined) row.baseUrl = parsed.data.baseUrl;
  if (parsed.data.description !== undefined) row.description = parsed.data.description;
  if (parsed.data.artifactId !== undefined) row.artifactId = parsed.data.artifactId;
  row.updatedAt = new Date().toISOString();
  persist();
  return ok(res, serializeSpec(row), "API spec updated");
}

export function deleteSpec(req: AuthedRequest, res: Response) {
  const state = db();
  const idx = state.apiSpecs.findIndex((s) => s.id === req.params.apiSpecId);
  if (idx === -1) return fail(res, 404, "NOT_FOUND", "API spec not found");
  const row = state.apiSpecs[idx];
  const project = state.projects.find((p) => p.id === row.projectId);
  if (!project || project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  state.apiSpecs.splice(idx, 1);
  state.apiEndpoints = state.apiEndpoints.filter((e) => e.apiSpecId !== row.id);
  persist();
  return ok(res, null, "API spec deleted");
}

// ───────────────────── endpoint handlers ─────────────────────

export function listEndpoints(req: AuthedRequest, res: Response) {
  const specResult = findSpecForUser(req.params.apiSpecId, req.user!.userId);
  if ("error" in specResult) {
    return specResult.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "API spec not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const items = db().apiEndpoints.filter((e) => e.apiSpecId === specResult.row.id);
  return ok(res, items.map(serializeEndpoint), "OK");
}

export function createEndpoint(req: AuthedRequest, res: Response) {
  const specResult = findSpecForUser(req.params.apiSpecId, req.user!.userId);
  if ("error" in specResult) {
    return specResult.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "API spec not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }

  const parsed = createEndpointSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const now = new Date().toISOString();
  const ep: ApiEndpointRow = {
    id: newId(),
    apiSpecId: specResult.row.id,
    path: parsed.data.path,
    method: parsed.data.method as HttpMethod,
    summary: parsed.data.summary,
    requestSchema: parsed.data.requestSchema,
    responseSchema: parsed.data.responseSchema,
    requiresAuth: parsed.data.requiresAuth,
    createdAt: now,
    updatedAt: now,
  };
  db().apiEndpoints.push(ep);
  specResult.row.updatedAt = now;
  persist();
  return created(res, serializeEndpoint(ep), "Endpoint created");
}

export function patchEndpoint(req: AuthedRequest, res: Response) {
  const parsed = patchEndpointSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = findEndpointForUser(req.params.endpointId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Endpoint not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const row = result.row;

  if (parsed.data.path !== undefined) row.path = parsed.data.path;
  if (parsed.data.method !== undefined) row.method = parsed.data.method as HttpMethod;
  if (parsed.data.summary !== undefined) row.summary = parsed.data.summary;
  if (parsed.data.requestSchema !== undefined) row.requestSchema = parsed.data.requestSchema;
  if (parsed.data.responseSchema !== undefined) row.responseSchema = parsed.data.responseSchema;
  if (parsed.data.requiresAuth !== undefined) row.requiresAuth = parsed.data.requiresAuth;
  row.updatedAt = new Date().toISOString();
  result.spec.updatedAt = row.updatedAt;
  persist();
  return ok(res, serializeEndpoint(row), "Endpoint updated");
}

export function deleteEndpoint(req: AuthedRequest, res: Response) {
  const state = db();
  const idx = state.apiEndpoints.findIndex((e) => e.id === req.params.endpointId);
  if (idx === -1) return fail(res, 404, "NOT_FOUND", "Endpoint not found");
  const row = state.apiEndpoints[idx];
  const spec = state.apiSpecs.find((s) => s.id === row.apiSpecId);
  if (!spec) return fail(res, 404, "NOT_FOUND", "Endpoint not found");
  const project = state.projects.find((p) => p.id === spec.projectId);
  if (!project || project.ownerId !== req.user!.userId) {
    return fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  state.apiEndpoints.splice(idx, 1);
  spec.updatedAt = new Date().toISOString();
  persist();
  return ok(res, null, "Endpoint deleted");
}
