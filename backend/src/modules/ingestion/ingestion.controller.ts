import type { Response } from "express";
import { z } from "zod";
import {
  ArtifactType,
  ArtifactStatus,
  DatabaseType,
  DiagramType,
  IngestionSourceType,
  IngestionStatus,
  type IngestionRecord,
  type Prisma,
  type User,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { parseMarkdown } from "./markdown.engine.js";
import { OpenApiParseError, parseOpenApi, type OpenApiPreview } from "./openapi.engine.js";
import { MermaidParseError, parseMermaid, type MermaidPreview } from "./mermaid.engine.js";
import { SqlParseError, parseSqlSchema, type SqlSchemaPreview } from "./sql.engine.js";
import {
  ARTIFACT_TITLE_TAKEN_MESSAGE,
  checkArtifactTitleConflict,
} from "../artifacts/artifact-title.js";

const ARTIFACT_TYPES = Object.values(ArtifactType) as [ArtifactType, ...ArtifactType[]];

const SOURCE_TYPES = [
  IngestionSourceType.MARKDOWN,
  IngestionSourceType.OPENAPI_JSON,
  IngestionSourceType.MERMAID,
  IngestionSourceType.SQL_SCHEMA,
] as const;

const draftSchema = z.object({
  sourceType: z.enum([
    "MARKDOWN",
    "OPENAPI_JSON",
    "MERMAID",
    "SQL_SCHEMA",
  ]),
  title: z.string().min(1).max(160),
  sourceName: z.string().max(240).optional().default(""),
});

type RecordWithUser = IngestionRecord & {
  createdBy: Pick<User, "id" | "firstName" | "lastName" | "email"> | null;
};

function serializeRecord(r: RecordWithUser) {
  const u = r.createdBy;
  const name = u ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() : "";
  return {
    id: r.id,
    projectId: r.projectId,
    sourceType: r.sourceType,
    status: r.status,
    title: r.title,
    sourceName: r.sourceName,
    createdRecords: r.createdRecords,
    parserResult: r.parserResult,
    errorMessage: r.errorMessage,
    createdById: r.createdById,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: u
      ? {
          id: u.id,
          email: u.email,
          name: name || null,
          initials:
            `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase() || null,
        }
      : null,
  };
}

const INCLUDE_USER = {
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

export async function listIngestionRecords(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await getProjectAccess(projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Not a member of this project");

  const rows = await prisma.ingestionRecord.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  return ok(res, rows.map(serializeRecord), "OK");
}

export async function createDraft(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await getProjectAccess(projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  if (!hasAtLeast(access.role!, "DEVELOPER")) {
    return fail(res, 403, "INSUFFICIENT_ROLE", "Requires DEVELOPER or higher");
  }

  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  if (!SOURCE_TYPES.includes(parsed.data.sourceType as IngestionSourceType)) {
    return fail(res, 400, "VALIDATION_ERROR", "Invalid source type");
  }

  const row = await prisma.ingestionRecord.create({
    data: {
      projectId,
      sourceType: parsed.data.sourceType as IngestionSourceType,
      status: IngestionStatus.DRAFT,
      title: parsed.data.title,
      sourceName: parsed.data.sourceName ?? "",
      createdRecords: [],
      createdById: req.user!.userId,
    },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  await recordVersionEvent({
    projectId,
    entityType: "PROJECT",
    entityId: projectId,
    action: "CREATED",
    title: "Ingestion draft created",
    description: `${row.sourceType} · ${row.title}`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      sourceType: row.sourceType,
      sourceName: row.sourceName,
    },
  });

  return created(res, serializeRecord(row), "Ingestion draft created");
}

export async function getIngestionRecord(req: AuthedRequest, res: Response) {
  const row = await prisma.ingestionRecord.findUnique({
    where: { id: req.params.ingestionId },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!row) return fail(res, 404, "NOT_FOUND", "Ingestion record not found");
  const access = await getProjectAccess(row.projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  return ok(res, serializeRecord(row), "OK");
}

export async function deleteIngestionRecord(req: AuthedRequest, res: Response) {
  const row = await prisma.ingestionRecord.findUnique({
    where: { id: req.params.ingestionId },
  });
  if (!row) return fail(res, 404, "NOT_FOUND", "Ingestion record not found");
  const access = await getProjectAccess(row.projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Not a member of this project");
  if (!hasAtLeast(access.role!, "DEVELOPER")) {
    return fail(res, 403, "INSUFFICIENT_ROLE", "Requires DEVELOPER or higher");
  }

  await prisma.ingestionRecord.delete({ where: { id: row.id } });

  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "PROJECT",
    entityId: row.projectId,
    action: "DELETED",
    title: "Ingestion draft deleted",
    description: `${row.sourceType} · ${row.title}`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      sourceType: row.sourceType,
      sourceName: row.sourceName,
      previousStatus: row.status,
    },
  });

  return ok(res, null, "Ingestion record deleted");
}

// ────────────────────────────── Markdown parse / confirm ──────────────────────────────

const parseMarkdownSchema = z.object({
  markdown: z.string().min(1, "markdown body is required"),
});

const confirmMarkdownSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("LINK_EXISTING"),
    artifactId: z.string().uuid(),
  }),
  z.object({
    mode: z.literal("CREATE_NEW"),
    artifactTitle: z.string().min(1).max(160),
    artifactType: z.enum(ARTIFACT_TYPES).optional().default("DOCUMENTATION"),
  }),
]);

async function loadIngestionForMutation(req: AuthedRequest, res: Response) {
  const row = await prisma.ingestionRecord.findUnique({
    where: { id: req.params.ingestionId },
  });
  if (!row) {
    fail(res, 404, "NOT_FOUND", "Ingestion record not found");
    return null;
  }
  const access = await getProjectAccess(row.projectId, req.user!.userId);
  if (access.status === "not_found") {
    fail(res, 404, "NOT_FOUND", "Project not found");
    return null;
  }
  if (access.status !== "ok" || !hasAtLeast(access.role!, "DEVELOPER")) {
    fail(res, 403, "INSUFFICIENT_ROLE", "Requires DEVELOPER or higher");
    return null;
  }
  return row;
}

export async function parseMarkdownEndpoint(req: AuthedRequest, res: Response) {
  const row = await loadIngestionForMutation(req, res);
  if (!row) return;

  if (row.sourceType !== IngestionSourceType.MARKDOWN) {
    return fail(res, 400, "UNSUPPORTED_SOURCE", `Parser does not support ${row.sourceType}`);
  }
  if (row.status === IngestionStatus.CONFIRMED) {
    return fail(res, 400, "ALREADY_CONFIRMED", "Ingestion record is already confirmed");
  }

  const parsed = parseMarkdownSchema.safeParse(req.body);
  if (!parsed.success) {
    await prisma.ingestionRecord.update({
      where: { id: row.id },
      data: { status: IngestionStatus.FAILED, errorMessage: parsed.error.message },
    });
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }

  let preview: ReturnType<typeof parseMarkdown>;
  try {
    preview = parseMarkdown(parsed.data.markdown);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Markdown parse failed";
    await prisma.ingestionRecord.update({
      where: { id: row.id },
      data: { status: IngestionStatus.FAILED, errorMessage: message },
    });
    return fail(res, 422, "PARSE_FAILED", message);
  }

  const nextTitle = row.title && row.title.trim() ? row.title : preview.title;
  const updated = await prisma.ingestionRecord.update({
    where: { id: row.id },
    data: {
      status: IngestionStatus.PARSED,
      title: nextTitle,
      parserResult: {
        title: preview.title,
        excerpt: preview.excerpt,
        headings: preview.headings,
        wordCount: preview.wordCount,
        suggestedArtifactType: preview.suggestedArtifactType,
        markdown: parsed.data.markdown,
      } as Prisma.InputJsonValue,
      errorMessage: "",
    },
    include: INCLUDE_USER,
  });

  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "PROJECT",
    entityId: row.projectId,
    action: "UPDATED",
    title: `Markdown parsed · ${preview.title}`,
    description: `${preview.wordCount} words · ${preview.headings.length} headings`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      wordCount: preview.wordCount,
      headingCount: preview.headings.length,
    },
  });

  return ok(
    res,
    {
      record: serializeRecord(updated),
      preview,
    },
    "Markdown parsed",
  );
}

export async function confirmMarkdownEndpoint(req: AuthedRequest, res: Response) {
  const row = await loadIngestionForMutation(req, res);
  if (!row) return;

  if (row.sourceType !== IngestionSourceType.MARKDOWN) {
    return fail(res, 400, "UNSUPPORTED_SOURCE", `Confirm does not support ${row.sourceType}`);
  }
  if (row.status !== IngestionStatus.PARSED) {
    return fail(res, 400, "NOT_PARSED", "Run parse-markdown before confirming");
  }
  const stored = row.parserResult as
    | { markdown?: string; title?: string; excerpt?: string; headings?: string[]; wordCount?: number }
    | null;
  if (!stored || typeof stored.markdown !== "string" || !stored.markdown.trim()) {
    return fail(res, 400, "EMPTY_BODY", "Parser result is missing the Markdown body");
  }

  const parsed = confirmMarkdownSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const markdown = stored.markdown;

  if (parsed.data.mode === "LINK_EXISTING") {
    const artifact = await prisma.artifact.findUnique({ where: { id: parsed.data.artifactId } });
    if (!artifact || artifact.projectId !== row.projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Target artifact must belong to this project");
    }
    const updatedArtifact = await prisma.artifact.update({
      where: { id: artifact.id },
      data: { documentationContent: markdown },
    });
    await recordVersionEvent({
      projectId: row.projectId,
      entityType: "DOCUMENTATION",
      entityId: artifact.id,
      action: artifact.documentationContent && artifact.documentationContent.trim() ? "UPDATED" : "CREATED",
      title: `Markdown imported into ${artifact.title}`,
      description: `${stored.wordCount ?? 0} words · ${(stored.headings?.length ?? 0)} headings`,
      triggeredBy: req.user!.userId,
      metadata: { ingestionId: row.id, artifactId: artifact.id, length: markdown.length },
    });
    const updatedRecord = await prisma.ingestionRecord.update({
      where: { id: row.id },
      data: {
        status: IngestionStatus.CONFIRMED,
        createdRecords: [
          { type: "ARTIFACT", id: artifact.id, mode: "LINK_EXISTING" },
        ] as Prisma.InputJsonValue,
        errorMessage: "",
      },
      include: INCLUDE_USER,
    });
    return ok(
      res,
      {
        record: serializeRecord(updatedRecord),
        artifact: { id: updatedArtifact.id, title: updatedArtifact.title, type: updatedArtifact.type },
      },
      "Markdown imported into existing artifact",
    );
  }

  // CREATE_NEW
  const desiredTitle = (parsed.data.artifactTitle.trim() || stored.title || "Imported Markdown").trim();
  const titleCheck = await checkArtifactTitleConflict(row.projectId, desiredTitle);
  if (titleCheck.conflict) {
    return fail(res, 409, "ARTIFACT_TITLE_TAKEN", ARTIFACT_TITLE_TAKEN_MESSAGE);
  }
  const newArtifact = await prisma.artifact.create({
    data: {
      projectId: row.projectId,
      title: desiredTitle,
      normalizedTitle: titleCheck.normalized,
      type: parsed.data.artifactType ?? ArtifactType.DOCUMENTATION,
      status: ArtifactStatus.ACTIVE,
      description: stored.excerpt && stored.excerpt.trim() ? stored.excerpt.slice(0, 240) : "Imported from Markdown",
      tags: ["imported"],
      gx: 0,
      gy: 0,
      createdById: req.user!.userId,
      documentationContent: markdown,
    },
  });
  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "ARTIFACT",
    entityId: newArtifact.id,
    action: "CREATED",
    title: newArtifact.title,
    description: `Imported from Markdown · ${stored.wordCount ?? 0} words`,
    triggeredBy: req.user!.userId,
    metadata: { ingestionId: row.id, type: newArtifact.type, length: markdown.length },
  });
  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "DOCUMENTATION",
    entityId: newArtifact.id,
    action: "CREATED",
    title: `Documentation attached to ${newArtifact.title}`,
    description: `Imported from Markdown`,
    triggeredBy: req.user!.userId,
    metadata: { ingestionId: row.id, length: markdown.length },
  });
  const updatedRecord = await prisma.ingestionRecord.update({
    where: { id: row.id },
    data: {
      status: IngestionStatus.CONFIRMED,
      createdRecords: [
        { type: "ARTIFACT", id: newArtifact.id, mode: "CREATE_NEW" },
      ] as Prisma.InputJsonValue,
      errorMessage: "",
    },
    include: INCLUDE_USER,
  });
  return ok(
    res,
    {
      record: serializeRecord(updatedRecord),
      artifact: { id: newArtifact.id, title: newArtifact.title, type: newArtifact.type },
    },
    "Markdown imported into new artifact",
  );
}

// ────────────────────────────── OpenAPI JSON parse / confirm ──────────────────────────────

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

// ────────────────────────────── Mermaid parse / confirm ──────────────────────────────

const DIAGRAM_TYPES = Object.values(DiagramType) as [DiagramType, ...DiagramType[]];

const parseMermaidEndpointSchema = z.object({
  mermaidSource: z.string().min(1, "mermaidSource is required"),
});

const confirmMermaidSchema = z.object({
  mode: z.literal("CREATE_DIAGRAM"),
  artifactId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(160),
  diagramType: z.enum(DIAGRAM_TYPES),
});

export async function parseMermaidEndpoint(req: AuthedRequest, res: Response) {
  const row = await loadIngestionForMutation(req, res);
  if (!row) return;

  if (row.sourceType !== IngestionSourceType.MERMAID) {
    return fail(res, 400, "UNSUPPORTED_SOURCE", `Parser does not support ${row.sourceType}`);
  }
  if (row.status === IngestionStatus.CONFIRMED) {
    return fail(res, 400, "ALREADY_CONFIRMED", "Ingestion record is already confirmed");
  }

  const parsed = parseMermaidEndpointSchema.safeParse(req.body);
  if (!parsed.success) {
    await prisma.ingestionRecord.update({
      where: { id: row.id },
      data: { status: IngestionStatus.FAILED, errorMessage: parsed.error.message },
    });
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }

  let preview: MermaidPreview;
  try {
    preview = parseMermaid(parsed.data.mermaidSource, { sourceName: row.sourceName });
  } catch (err) {
    const message =
      err instanceof MermaidParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Mermaid parse failed";
    await prisma.ingestionRecord.update({
      where: { id: row.id },
      data: { status: IngestionStatus.FAILED, errorMessage: message },
    });
    return fail(res, 422, "PARSE_FAILED", message);
  }

  const nextTitle = row.title && row.title.trim() ? row.title : preview.title;
  const updated = await prisma.ingestionRecord.update({
    where: { id: row.id },
    data: {
      status: IngestionStatus.PARSED,
      title: nextTitle,
      parserResult: preview as unknown as Prisma.InputJsonValue,
      errorMessage: "",
    },
    include: INCLUDE_USER,
  });

  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "PROJECT",
    entityId: row.projectId,
    action: "UPDATED",
    title: `Mermaid parsed · ${preview.title}`,
    description: `${preview.diagramType} · ${preview.lineCount} lines`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      diagramType: preview.diagramType,
      lineCount: preview.lineCount,
      nodeHintCount: preview.nodeHints.length,
    },
  });

  return ok(res, { record: serializeRecord(updated), preview }, "Mermaid parsed");
}

export async function confirmMermaidEndpoint(req: AuthedRequest, res: Response) {
  const row = await loadIngestionForMutation(req, res);
  if (!row) return;

  if (row.sourceType !== IngestionSourceType.MERMAID) {
    return fail(res, 400, "UNSUPPORTED_SOURCE", `Confirm does not support ${row.sourceType}`);
  }
  if (row.status !== IngestionStatus.PARSED) {
    return fail(res, 400, "NOT_PARSED", "Run parse-mermaid before confirming");
  }
  const stored = row.parserResult as Partial<MermaidPreview> | null;
  if (!stored || stored.source !== "MERMAID" || !stored.mermaidSource) {
    return fail(res, 400, "EMPTY_PARSE", "Parser result is missing or malformed");
  }

  const parsed = confirmMermaidSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  let linkedArtifactId: string | null = null;
  if (parsed.data.artifactId) {
    const artifact = await prisma.artifact.findUnique({ where: { id: parsed.data.artifactId } });
    if (!artifact || artifact.projectId !== row.projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to this project");
    }
    linkedArtifactId = artifact.id;
  }

  const diagram = await prisma.diagram.create({
    data: {
      projectId: row.projectId,
      artifactId: linkedArtifactId,
      title: parsed.data.title.trim() || stored.title || "Imported Mermaid Diagram",
      type: parsed.data.diagramType,
      mermaidSource: stored.mermaidSource,
      description: "Imported from Mermaid source",
      createdById: req.user!.userId,
    },
  });

  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "DIAGRAM",
    entityId: diagram.id,
    action: "CREATED",
    title: `Mermaid diagram imported · ${diagram.title}`,
    description: `${diagram.type}`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      diagramType: diagram.type,
      linkedArtifactId,
      lineCount: stored.lineCount ?? 0,
    },
  });

  const updatedRecord = await prisma.ingestionRecord.update({
    where: { id: row.id },
    data: {
      status: IngestionStatus.CONFIRMED,
      createdRecords: [
        { type: "DIAGRAM", id: diagram.id, mode: "CREATE_DIAGRAM" as const },
      ] as unknown as Prisma.InputJsonValue,
      errorMessage: "",
    },
    include: INCLUDE_USER,
  });

  return ok(
    res,
    {
      record: serializeRecord(updatedRecord),
      diagram: { id: diagram.id, title: diagram.title, type: diagram.type, linkedArtifactId },
    },
    "Mermaid diagram imported",
  );
}

// ────────────────────────────── SQL schema parse / confirm ──────────────────────────────

const DATABASE_TYPES = Object.values(DatabaseType) as [DatabaseType, ...DatabaseType[]];

const parseSqlSchemaSchema = z.object({
  sql: z.string().min(1, "sql is required"),
});

const confirmSqlSchemaSchema = z.object({
  mode: z.literal("CREATE_DATABASE_MODEL"),
  artifactId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(160),
  databaseType: z.enum(DATABASE_TYPES),
});

export async function parseSqlSchemaEndpoint(req: AuthedRequest, res: Response) {
  const row = await loadIngestionForMutation(req, res);
  if (!row) return;

  if (row.sourceType !== IngestionSourceType.SQL_SCHEMA) {
    return fail(res, 400, "UNSUPPORTED_SOURCE", `Parser does not support ${row.sourceType}`);
  }
  if (row.status === IngestionStatus.CONFIRMED) {
    return fail(res, 400, "ALREADY_CONFIRMED", "Ingestion record is already confirmed");
  }

  const parsed = parseSqlSchemaSchema.safeParse(req.body);
  if (!parsed.success) {
    await prisma.ingestionRecord.update({
      where: { id: row.id },
      data: { status: IngestionStatus.FAILED, errorMessage: parsed.error.message },
    });
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }

  let preview: SqlSchemaPreview;
  try {
    preview = parseSqlSchema(parsed.data.sql);
  } catch (err) {
    const message =
      err instanceof SqlParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : "SQL parse failed";
    await prisma.ingestionRecord.update({
      where: { id: row.id },
      data: { status: IngestionStatus.FAILED, errorMessage: message },
    });
    return fail(res, 422, "PARSE_FAILED", message);
  }

  // Stash the original SQL alongside the parsed preview so the confirm step
  // (and the detail modal) can show it without a second upload.
  const stored = { ...preview, rawSql: parsed.data.sql };
  const nextTitle = row.title && row.title.trim() ? row.title : preview.title;
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
    title: `SQL schema parsed · ${preview.entityCount} entities`,
    description: `${preview.fieldCount} fields · ${preview.relationships.length} relationships`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      entityCount: preview.entityCount,
      fieldCount: preview.fieldCount,
      relationshipCount: preview.relationships.length,
    },
  });

  return ok(res, { record: serializeRecord(updated), preview }, "SQL schema parsed");
}

export async function confirmSqlSchemaEndpoint(req: AuthedRequest, res: Response) {
  const row = await loadIngestionForMutation(req, res);
  if (!row) return;

  if (row.sourceType !== IngestionSourceType.SQL_SCHEMA) {
    return fail(res, 400, "UNSUPPORTED_SOURCE", `Confirm does not support ${row.sourceType}`);
  }
  if (row.status !== IngestionStatus.PARSED) {
    return fail(res, 400, "NOT_PARSED", "Run parse-sql-schema before confirming");
  }
  const stored = row.parserResult as Partial<SqlSchemaPreview> | null;
  if (!stored || stored.source !== "SQL_SCHEMA" || !Array.isArray(stored.entities)) {
    return fail(res, 400, "EMPTY_PARSE", "Parser result is missing or malformed");
  }

  const parsed = confirmSqlSchemaSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  let linkedArtifactId: string | null = null;
  if (parsed.data.artifactId) {
    const artifact = await prisma.artifact.findUnique({ where: { id: parsed.data.artifactId } });
    if (!artifact || artifact.projectId !== row.projectId) {
      return fail(res, 400, "INVALID_ARTIFACT", "Linked artifact must belong to this project");
    }
    linkedArtifactId = artifact.id;
  }

  const result = await prisma.$transaction(async (tx) => {
    const model = await tx.databaseModel.create({
      data: {
        projectId: row.projectId,
        artifactId: linkedArtifactId,
        title: parsed.data.title.trim() || stored.title || "Imported Database Schema",
        databaseType: parsed.data.databaseType,
        description: `Imported via ingestion · ${stored.entities!.length} entities`,
        createdById: req.user!.userId,
      },
    });
    // First pass: create entities with no field references.
    const entityIds = new Map<string, string>();
    const created: { entityId: string; fields: { id: string; name: string }[] }[] = [];
    for (const e of stored.entities!) {
      const ent = await tx.databaseEntity.create({
        data: {
          databaseModelId: model.id,
          name: e.name,
          description: e.description ?? "",
        },
      });
      entityIds.set(e.name, ent.id);
      const createdFields: { id: string; name: string }[] = [];
      for (const f of e.fields ?? []) {
        const field = await tx.databaseField.create({
          data: {
            entityId: ent.id,
            name: f.name,
            type: f.type || "text",
            required: !!f.required,
            isPrimaryKey: !!f.isPrimaryKey,
            isForeignKey: !!f.isForeignKey,
            description: f.description ?? "",
            // referencesEntityId left null in pass 1; pass 2 resolves them.
          },
        });
        createdFields.push({ id: field.id, name: field.name });
      }
      created.push({ entityId: ent.id, fields: createdFields });
    }
    // Second pass: resolve FK referencesEntityId.
    for (let i = 0; i < stored.entities!.length; i++) {
      const e = stored.entities![i];
      const entityId = created[i].entityId;
      for (const f of e.fields ?? []) {
        if (!f.isForeignKey || !f.referencesEntity) continue;
        const targetEntityId = entityIds.get(f.referencesEntity);
        if (!targetEntityId) continue;
        const dbField = created[i].fields.find((cf) => cf.name === f.name);
        if (!dbField) continue;
        await tx.databaseField.update({
          where: { id: dbField.id },
          data: { referencesEntityId: targetEntityId },
        });
      }
      void entityId;
    }
    return { model, created };
  });

  await recordVersionEvent({
    projectId: row.projectId,
    entityType: "DATABASE_MODEL",
    entityId: result.model.id,
    action: "CREATED",
    title: `${result.model.title} (imported)`,
    description: `${result.created.length} entities · ${stored.fieldCount ?? 0} fields`,
    triggeredBy: req.user!.userId,
    metadata: {
      ingestionId: row.id,
      databaseType: result.model.databaseType,
      linkedArtifactId,
    },
  });
  for (const c of result.created) {
    await recordVersionEvent({
      projectId: row.projectId,
      entityType: "DATABASE_ENTITY",
      entityId: c.entityId,
      action: "CREATED",
      title: stored.entities!.find((_, i) => result.created[i].entityId === c.entityId)?.name || "entity",
      description: `Added to ${result.model.title}`,
      triggeredBy: req.user!.userId,
      metadata: { databaseModelId: result.model.id, ingestionId: row.id },
    });
  }

  const createdRecords = [
    { type: "DATABASE_MODEL" as const, id: result.model.id, mode: "CREATE_DATABASE_MODEL" as const },
    ...result.created.map((c) => ({ type: "DATABASE_ENTITY" as const, id: c.entityId })),
    ...result.created.flatMap((c) => c.fields.map((f) => ({ type: "DATABASE_FIELD" as const, id: f.id }))),
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
      databaseModel: {
        id: result.model.id,
        title: result.model.title,
        databaseType: result.model.databaseType,
        entityCount: result.created.length,
        linkedArtifactId,
      },
    },
    "SQL schema imported",
  );
}
