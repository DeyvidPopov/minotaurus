// OpenAPI JSON ingestion: parse an OpenAPI document into an endpoint preview,
// then confirm it into a new ApiSpec + its ApiEndpoints (one transaction).
import type { Response } from "express";
import { z } from "zod";
import { IngestionSourceType, IngestionStatus, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { OpenApiParseError, parseOpenApi, type OpenApiPreview } from "./openapi.engine.js";
import { INCLUDE_USER, loadIngestionForMutation, serializeRecord } from "./ingestion.shared.js";

const parseOpenApiSchema = z.object({
  openapiJson: z.string().min(1, "openapiJson body is required"),
});

const confirmOpenApiSchema = z.object({
  mode: z.literal("CREATE_API_SPEC"),
  artifactId: z.string().uuid().nullable().optional(),
  baseUrl: z.string().max(500).optional(),
});

interface StoredOpenApiResult extends OpenApiPreview {
  source: "OPENAPI_JSON";
}

export async function parseOpenApiJsonEndpoint(req: AuthedRequest, res: Response) {
  const row = await loadIngestionForMutation(req, res);
  if (!row) return;

  if (row.sourceType !== IngestionSourceType.OPENAPI_JSON) {
    return fail(res, 400, "UNSUPPORTED_SOURCE", `Parser does not support ${row.sourceType}`);
  }
  if (row.status === IngestionStatus.CONFIRMED) {
    return fail(res, 400, "ALREADY_CONFIRMED", "Ingestion record is already confirmed");
  }

  const parsed = parseOpenApiSchema.safeParse(req.body);
  if (!parsed.success) {
    await prisma.ingestionRecord.update({
      where: { id: row.id },
      data: { status: IngestionStatus.FAILED, errorMessage: parsed.error.message },
    });
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }

  let preview: OpenApiPreview;
  try {
    preview = parseOpenApi(parsed.data.openapiJson);
  } catch (err) {
    const message =
      err instanceof OpenApiParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : "OpenAPI parse failed";
    await prisma.ingestionRecord.update({
      where: { id: row.id },
      data: { status: IngestionStatus.FAILED, errorMessage: message },
    });
    return fail(res, 422, "PARSE_FAILED", message);
  }

  const nextTitle = row.title && row.title.trim() ? row.title : preview.title;
  const stored: StoredOpenApiResult = { ...preview, source: "OPENAPI_JSON" };
  const updated = await prisma.ingestionRecord.update({
    where: { id: row.id },
    data: {
      status: IngestionStatus.PARSED,
      title: nextTitle,
      parserResult: stored as unknown as Prisma.InputJsonValue,
      errorMessage: "",
    },
    include: INCLUDE_USER,
  });

  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "PROJECT",
    entityId: row.projectId,
    action: "UPDATED",
    title: `OpenAPI JSON parsed · ${preview.title}`,
    description: `${preview.endpointCount} endpoint${preview.endpointCount === 1 ? "" : "s"} · v${preview.version}`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      endpointCount: preview.endpointCount,
      version: preview.version,
      baseUrl: preview.baseUrl,
    },
  });

  return ok(res, { record: serializeRecord(updated), preview }, "OpenAPI JSON parsed");
}

export async function confirmOpenApiJsonEndpoint(req: AuthedRequest, res: Response) {
  const row = await loadIngestionForMutation(req, res);
  if (!row) return;

  if (row.sourceType !== IngestionSourceType.OPENAPI_JSON) {
    return fail(res, 400, "UNSUPPORTED_SOURCE", `Confirm does not support ${row.sourceType}`);
  }
  if (row.status !== IngestionStatus.PARSED) {
    return fail(res, 400, "NOT_PARSED", "Run parse-openapi-json before confirming");
  }
  const stored = row.parserResult as Partial<StoredOpenApiResult> | null;
  if (!stored || stored.source !== "OPENAPI_JSON" || !Array.isArray(stored.endpoints)) {
    return fail(res, 400, "EMPTY_PARSE", "Parser result is missing or malformed");
  }

  const parsed = confirmOpenApiSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  let linkedArtifactId: string | null = null;
  if (parsed.data.artifactId) {
    const artifact = await prisma.artifact.findUnique({ where: { id: parsed.data.artifactId } });
    if (!artifact || artifact.projectId !== row.projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to this project");
    }
    linkedArtifactId = artifact.id;
  }

  const title = stored.title?.trim() || "Imported API";
  const version = stored.version?.trim() || "1.0.0";
  const overrideBaseUrl =
    typeof parsed.data.baseUrl === "string" ? parsed.data.baseUrl.trim() : undefined;
  const baseUrl = overrideBaseUrl !== undefined ? overrideBaseUrl : (stored.baseUrl ?? "");
  const description = stored.description ?? "";

  const result = await prisma.$transaction(async (tx) => {
    const spec = await tx.apiSpec.create({
      data: {
        projectId: row.projectId,
        artifactId: linkedArtifactId,
        title,
        version,
        baseUrl,
        description,
        createdById: req.user!.userId,
      },
    });
    const createdEndpoints: { id: string; method: string; path: string }[] = [];
    for (const ep of stored.endpoints!) {
      const created = await tx.apiEndpoint.create({
        data: {
          apiSpecId: spec.id,
          path: ep.path,
          method: ep.method,
          summary: ep.summary ?? "",
          requestSchema: ep.requestSchema ?? "",
          responseSchema: ep.responseSchema ?? "",
          requiresAuth: !!ep.requiresAuth,
        },
      });
      createdEndpoints.push({ id: created.id, method: created.method, path: created.path });
    }
    return { spec, createdEndpoints };
  });

  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "API_SPEC",
    entityId: result.spec.id,
    action: "CREATED",
    title: `${result.spec.title} (imported)`,
    description: `v${result.spec.version}${result.spec.baseUrl ? " · " + result.spec.baseUrl : ""} · ${result.createdEndpoints.length} endpoints`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      endpointCount: result.createdEndpoints.length,
      linkedArtifactId,
    },
  });
  for (const ep of result.createdEndpoints) {
    await recordVersionEvent({
      projectId: row.projectId,
      entityType: "API_ENDPOINT",
      entityId: ep.id,
      action: "CREATED",
      title: `${ep.method} ${ep.path}`,
      description: `Added from OpenAPI import "${result.spec.title}"`,
      triggeredBy: req.user!.userId,
      metadata: { specId: result.spec.id, ingestionId: row.id, method: ep.method, path: ep.path },
    });
  }

  const createdRecords = [
    { type: "API_SPEC", id: result.spec.id, mode: "CREATE_API_SPEC" as const },
    ...result.createdEndpoints.map((ep) => ({ type: "API_ENDPOINT" as const, id: ep.id })),
  ];

  const updatedRecord = await prisma.ingestionRecord.update({
    where: { id: row.id },
    data: {
      status: IngestionStatus.CONFIRMED,
      createdRecords: createdRecords as unknown as Prisma.InputJsonValue,
      errorMessage: "",
    },
    include: INCLUDE_USER,
  });

  return ok(
    res,
    {
      record: serializeRecord(updatedRecord),
      apiSpec: {
        id: result.spec.id,
        title: result.spec.title,
        version: result.spec.version,
        baseUrl: result.spec.baseUrl,
        endpointCount: result.createdEndpoints.length,
        linkedArtifactId,
      },
    },
    "OpenAPI spec imported",
  );
}
