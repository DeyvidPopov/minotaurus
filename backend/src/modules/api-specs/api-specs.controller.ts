import type { Response } from "express";
import { z } from "zod";
import { HttpMethod, Prisma, ProjectRole, type ApiEndpoint, type ApiSpec } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";

const METHODS = Object.values(HttpMethod) as [HttpMethod, ...HttpMethod[]];

async function serializeSpec(spec: ApiSpec) {
  const endpointCount = await prisma.apiEndpoint.count({ where: { apiSpecId: spec.id } });
  return {
    id: spec.id,
    projectId: spec.projectId,
    artifactId: spec.artifactId,
    title: spec.title,
    version: spec.version,
    baseUrl: spec.baseUrl,
    description: spec.description,
    createdBy: spec.createdById,
    createdAt: spec.createdAt,
    updatedAt: spec.updatedAt,
    endpointCount,
  };
}

function serializeEndpoint(ep: ApiEndpoint) {
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

async function projectAccess(projectId: string, userId: string, minRole: ProjectRole = "VIEWER"): Promise<"ok" | "not_found" | "forbidden"> {
  const a = await getProjectAccess(projectId, userId);
  if (a.status !== "ok") return a.status;
  return hasAtLeast(a.role!, minRole) ? "ok" : "forbidden";
}

async function findSpecForUser(apiSpecId: string, userId: string, minRole: ProjectRole = "VIEWER") {
  const row = await prisma.apiSpec.findUnique({ where: { id: apiSpecId } });
  if (!row) return { error: "not_found" as const };
  const a = await getProjectAccess(row.projectId, userId);
  if (a.status === "not_found") return { error: "not_found" as const };
  if (a.status !== "ok" || !hasAtLeast(a.role!, minRole)) return { error: "forbidden" as const };
  return { row };
}

async function findEndpointForUser(endpointId: string, userId: string, minRole: ProjectRole = "VIEWER") {
  const row = await prisma.apiEndpoint.findUnique({ where: { id: endpointId } });
  if (!row) return { error: "not_found" as const };
  const spec = await prisma.apiSpec.findUnique({ where: { id: row.apiSpecId } });
  if (!spec) return { error: "not_found" as const };
  const a = await getProjectAccess(spec.projectId, userId);
  if (a.status === "not_found") return { error: "not_found" as const };
  if (a.status !== "ok" || !hasAtLeast(a.role!, minRole)) return { error: "forbidden" as const };
  return { row, spec };
}

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

export async function listSpecs(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccess(projectId, req.user!.userId);
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const { search, q, artifactId } = req.query as Record<string, string | undefined>;
  const specs = await prisma.apiSpec.findMany({
    where: {
      projectId,
      ...(artifactId ? { artifactId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  const term = (search || q || "").toLowerCase().trim();
  const filtered = term
    ? specs.filter(
        (s) =>
          s.title.toLowerCase().includes(term) ||
          s.description.toLowerCase().includes(term) ||
          s.baseUrl.toLowerCase().includes(term),
      )
    : specs;
  const serialized = await Promise.all(filtered.map((s) => serializeSpec(s)));
  return ok(res, serialized, "OK");
}

export async function createSpec(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccess(projectId, req.user!.userId, "DEVELOPER");
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createSpecSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  if (parsed.data.artifactId) {
    const artifact = await prisma.artifact.findUnique({
      where: { id: parsed.data.artifactId },
    });
    if (!artifact || artifact.projectId !== projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to the same project");
    }
  }

  const spec = await prisma.apiSpec.create({
    data: {
      projectId,
      artifactId: parsed.data.artifactId ?? null,
      title: parsed.data.title,
      version: parsed.data.version,
      baseUrl: parsed.data.baseUrl,
      description: parsed.data.description,
      createdById: req.user!.userId,
    },
  });
  await recordVersionEvent({
    projectId,
    entityType: "API_SPEC",
    entityId: spec.id,
    action: "CREATED",
    title: spec.title,
    description: `v${spec.version}${spec.baseUrl ? " · " + spec.baseUrl : ""}`,
    triggeredBy: req.user!.userId,
    metadata: { version: spec.version, baseUrl: spec.baseUrl },
  });
  return created(res, await serializeSpec(spec), "API spec created");
}

export async function getSpec(req: AuthedRequest, res: Response) {
  const result = await findSpecForUser(req.params.apiSpecId, req.user!.userId);
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "API spec not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  return ok(res, await serializeSpec(result.row), "OK");
}

export async function patchSpec(req: AuthedRequest, res: Response) {
  const parsed = patchSpecSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = await findSpecForUser(req.params.apiSpecId, req.user!.userId, "DEVELOPER");
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "API spec not found")
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

  const updated = await prisma.apiSpec.update({
    where: { id: row.id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.version !== undefined ? { version: parsed.data.version } : {}),
      ...(parsed.data.baseUrl !== undefined ? { baseUrl: parsed.data.baseUrl } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.artifactId !== undefined ? { artifactId: parsed.data.artifactId } : {}),
    },
  });
  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "API_SPEC",
    entityId: row.id,
    action: "UPDATED",
    title: updated.title,
    description: Object.keys(parsed.data).join(", "),
    triggeredBy: req.user!.userId,
    metadata: { changed: Object.keys(parsed.data) },
  });
  return ok(res, await serializeSpec(updated), "API spec updated");
}

export async function deleteSpec(req: AuthedRequest, res: Response) {
  const result = await findSpecForUser(req.params.apiSpecId, req.user!.userId, "DEVELOPER");
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "API spec not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const row = result.row;
  await prisma.apiSpec.delete({ where: { id: row.id } });
  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "API_SPEC",
    entityId: row.id,
    action: "DELETED",
    title: row.title,
    description: "API spec removed",
    triggeredBy: req.user!.userId,
  });
  return ok(res, null, "API spec deleted");
}

export async function listEndpoints(req: AuthedRequest, res: Response) {
  const specResult = await findSpecForUser(req.params.apiSpecId, req.user!.userId);
  if ("error" in specResult) {
    return specResult.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "API spec not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  const items = await prisma.apiEndpoint.findMany({
    where: { apiSpecId: specResult.row.id },
    orderBy: { createdAt: "asc" },
  });
  return ok(res, items.map(serializeEndpoint), "OK");
}

export async function createEndpoint(req: AuthedRequest, res: Response) {
  const specResult = await findSpecForUser(req.params.apiSpecId, req.user!.userId, "DEVELOPER");
  if ("error" in specResult) {
    return specResult.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "API spec not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }

  const parsed = createEndpointSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  let ep: ApiEndpoint;
  try {
    ep = await prisma.apiEndpoint.create({
      data: {
        apiSpecId: specResult.row.id,
        path: parsed.data.path,
        method: parsed.data.method,
        summary: parsed.data.summary,
        requestSchema: parsed.data.requestSchema,
        responseSchema: parsed.data.responseSchema,
        requiresAuth: parsed.data.requiresAuth,
      },
    });
  } catch (err) {
    // DB-enforced @@unique([apiSpecId, method, path]) — clean 409, race-safe.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return fail(res, 409, "ENDPOINT_EXISTS", `An endpoint ${parsed.data.method} ${parsed.data.path} already exists in this spec.`);
    }
    throw err;
  }
  await prisma.apiSpec.update({
    where: { id: specResult.row.id },
    data: { updatedAt: new Date() },
  });
  await recordVersionEvent({
    projectId: specResult.row.projectId,
    entityType: "API_ENDPOINT",
    entityId: ep.id,
    action: "CREATED",
    title: `${ep.method} ${ep.path}`,
    description: `Added to "${specResult.row.title}"`,
    triggeredBy: req.user!.userId,
    metadata: { specId: specResult.row.id, method: ep.method, path: ep.path },
  });
  return created(res, serializeEndpoint(ep), "Endpoint created");
}

export async function patchEndpoint(req: AuthedRequest, res: Response) {
  const parsed = patchEndpointSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const result = await findEndpointForUser(req.params.endpointId, req.user!.userId, "DEVELOPER");
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Endpoint not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  let updated: ApiEndpoint;
  try {
    updated = await prisma.apiEndpoint.update({
      where: { id: result.row.id },
      data: {
        ...(parsed.data.path !== undefined ? { path: parsed.data.path } : {}),
        ...(parsed.data.method !== undefined ? { method: parsed.data.method } : {}),
        ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
        ...(parsed.data.requestSchema !== undefined
          ? { requestSchema: parsed.data.requestSchema }
          : {}),
        ...(parsed.data.responseSchema !== undefined
          ? { responseSchema: parsed.data.responseSchema }
          : {}),
        ...(parsed.data.requiresAuth !== undefined
          ? { requiresAuth: parsed.data.requiresAuth }
          : {}),
      },
    });
  } catch (err) {
    // A method/path change can collide with a sibling endpoint (DB @@unique).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return fail(res, 409, "ENDPOINT_EXISTS", "An endpoint with this method and path already exists in this spec.");
    }
    throw err;
  }
  await prisma.apiSpec.update({
    where: { id: result.spec.id },
    data: { updatedAt: new Date() },
  });
  await recordVersionEvent({
    projectId: result.spec.projectId,
    entityType: "API_ENDPOINT",
    entityId: updated.id,
    action: "UPDATED",
    title: `${updated.method} ${updated.path}`,
    description: Object.keys(parsed.data).join(", "),
    triggeredBy: req.user!.userId,
    metadata: { specId: result.spec.id, changed: Object.keys(parsed.data) },
  });
  return ok(res, serializeEndpoint(updated), "Endpoint updated");
}

export async function deleteEndpoint(req: AuthedRequest, res: Response) {
  const result = await findEndpointForUser(req.params.endpointId, req.user!.userId, "DEVELOPER");
  if ("error" in result) {
    return result.error === "not_found"
      ? fail(res, 404, "NOT_FOUND", "Endpoint not found")
      : fail(res, 403, "FORBIDDEN", "Forbidden");
  }
  await prisma.apiEndpoint.delete({ where: { id: result.row.id } });
  await prisma.apiSpec.update({
    where: { id: result.spec.id },
    data: { updatedAt: new Date() },
  });
  await recordVersionEvent({
    projectId: result.spec.projectId,
    entityType: "API_ENDPOINT",
    entityId: result.row.id,
    action: "DELETED",
    title: `${result.row.method} ${result.row.path}`,
    description: `Removed from "${result.spec.title}"`,
    triggeredBy: req.user!.userId,
    metadata: { specId: result.spec.id, method: result.row.method, path: result.row.path },
  });
  return ok(res, null, "Endpoint deleted");
}
