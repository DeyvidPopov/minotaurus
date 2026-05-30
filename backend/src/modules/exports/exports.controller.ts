import type { Response } from "express";
import { z } from "zod";
import { ProjectRole, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { EXPORT_FORMATS, buildExportContent } from "./exports.engine.js";
import { recordVersionEvent } from "../versions/versions.engine.js";
import { getProjectAccess, hasAtLeast } from "../../lib/project-access.js";
import { analyzeExportSnapshot } from "./analysis/metrics.engine.js";
import { renderArchitecturePdf } from "./pdf/pdf.renderer.js";

// `diagramSvgs` is an optional map of diagramId -> client-rendered SVG markup.
// Mermaid only renders in a browser DOM, so the frontend captures the SVG at
// export time; the backend freezes it into the persisted snapshot so the PDF
// stays deterministic. Bounded to keep payloads sane.
const MAX_SVG_LEN = 1_500_000;
const createSchema = z.object({
  format: z.enum(EXPORT_FORMATS as [(typeof EXPORT_FORMATS)[number], ...(typeof EXPORT_FORMATS)[number][]]),
  sections: z.array(z.string()).optional().default(["ARTIFACTS", "RELATIONS"]),
  diagramSvgs: z.record(z.string(), z.string().max(MAX_SVG_LEN)).optional(),
});

// Inject captured SVGs into the assembled snapshot's diagrams (presentation
// data only — does not touch buildExportContent / SSOT assembly).
function attachDiagramSvgs(content: unknown, svgs?: Record<string, string>): unknown {
  if (!svgs || !content || typeof content !== "object") return content;
  const c = content as { diagrams?: Array<{ id?: string; renderedSvg?: string | null }> };
  if (!Array.isArray(c.diagrams)) return content;
  for (const d of c.diagrams) {
    if (d && d.id && typeof svgs[d.id] === "string") d.renderedSvg = svgs[d.id];
  }
  return content;
}

async function projectAccess(projectId: string, userId: string, minRole: ProjectRole = "VIEWER"): Promise<"ok" | "not_found" | "forbidden"> {
  const a = await getProjectAccess(projectId, userId);
  if (a.status !== "ok") return a.status;
  return hasAtLeast(a.role!, minRole) ? "ok" : "forbidden";
}

export async function createExport(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await projectAccess(projectId, req.user!.userId, "ARCHITECT");
  if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const content = await buildExportContent(projectId, parsed.data.format, parsed.data.sections);
  // PDF embeds rendered diagrams; merge any client-captured SVGs (other formats
  // ignore them — Markdown returns a string, JSON keeps the field harmlessly).
  const finalContent =
    parsed.data.format === "PDF" ? attachDiagramSvgs(content, parsed.data.diagramSvgs) : content;
  const exportRow = await prisma.exportPackage.create({
    data: {
      projectId,
      format: parsed.data.format,
      sections: parsed.data.sections,
      content: finalContent as Prisma.InputJsonValue,
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

function safeFilename(s: string): string {
  return (s || "export").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "export";
}

// GET /exports/:exportId/download — streams the export as a downloadable file.
// PDF is rendered on demand from the persisted SSOT snapshot (Export Engine V2);
// JSON/MARKDOWN stream the stored content verbatim. Read access mirrors getExport.
export async function downloadExport(req: AuthedRequest, res: Response) {
  const exp = await prisma.exportPackage.findUnique({ where: { id: req.params.exportId } });
  if (!exp) return fail(res, 404, "NOT_FOUND", "Export not found");
  const access = await projectAccess(exp.projectId, req.user!.userId);
  if (access !== "ok") return fail(res, 403, "FORBIDDEN", "Forbidden");

  const base = safeFilename(`export-${exp.id}`);

  if (exp.format === "PDF") {
    const analysis = analyzeExportSnapshot(exp.content);
    let pdf: Buffer;
    try {
      pdf = await renderArchitecturePdf({
        content: (exp.content && typeof exp.content === "object" ? exp.content : {}) as never,
        analysis,
        meta: {
          id: exp.id,
          format: exp.format,
          sections: exp.sections,
          createdAt: exp.createdAt.toISOString(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "PDF generation failed";
      return fail(res, 500, "PDF_RENDER_FAILED", message);
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${base}.pdf"`);
    res.setHeader("Content-Length", String(pdf.length));
    return res.end(pdf);
  }

  if (exp.format === "MARKDOWN") {
    const body = typeof exp.content === "string" ? exp.content : String(exp.content ?? "");
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${base}.md"`);
    return res.end(body);
  }

  // JSON (and ZIP fallback) — stream the stored snapshot as JSON.
  const json = JSON.stringify(exp.content ?? {}, null, 2);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${base}.json"`);
  return res.end(json);
}
