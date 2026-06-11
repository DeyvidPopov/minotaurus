// Mermaid ingestion: parse a Mermaid source into a preview, then confirm it into
// a new Diagram (optionally linked to an artifact).
import type { Response } from "express";
import { z } from "zod";
import { DiagramType, IngestionSourceType, IngestionStatus, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { MermaidParseError, parseMermaid, type MermaidPreview } from "./mermaid.engine.js";
import { INCLUDE_USER, loadIngestionForMutation, serializeRecord } from "./ingestion.shared.js";

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
