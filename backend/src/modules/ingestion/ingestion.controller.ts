import type { Response } from "express";
import { z } from "zod";
import {
  ArtifactType,
  ArtifactStatus,
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
  const desiredTitle = parsed.data.artifactTitle.trim() || stored.title || "Imported Markdown";
  const newArtifact = await prisma.artifact.create({
    data: {
      projectId: row.projectId,
      title: desiredTitle,
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
