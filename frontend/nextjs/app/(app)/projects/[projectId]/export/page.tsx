// app/(app)/projects/[projectId]/export/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Download, Package, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { diagramsApi } from "@/lib/api/diagrams";
import { renderMermaidToSvg } from "@/components/mermaid-preview";
import { ExportPreview, type ExportPreviewModel } from "@/components/export-preview";
import type { ExportFormat } from "@/lib/types";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

interface ExportSummary {
  id: string;
  projectId: string;
  format: ExportFormat;
  sections: string[];
  createdAt: string;
}

interface ExportDetail extends ExportSummary, ExportPreviewModel {
  content: unknown;
}

const SECTIONS = [
  { id: "TEAM", label: "Team & roles" },
  { id: "ARTIFACTS", label: "Artifacts (includes documentation)" },
  { id: "RELATIONS", label: "Relations" },
  { id: "API_SPECS", label: "API specs & endpoints" },
  { id: "DATABASE_MODELS", label: "Database models" },
  { id: "DIAGRAMS", label: "Diagrams" },
  { id: "VALIDATION", label: "Validation issues" },
  { id: "VERSION_HISTORY", label: "Version history / recent changes" },
  { id: "IMPACT_ANALYSIS", label: "Impact analysis (per artifact)" },
  { id: "AI_REVIEW", label: "AI Review / Advisor" },
];

export default function ExportPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [exports, setExports] = useState<ExportSummary[] | null>(null);
  const [exportsError, setExportsError] = useState<string | null>(null);
  const [format, setFormat] = useState<ExportFormat>("JSON");
  const [picked, setPicked] = useState<Set<string>>(new Set(["ARTIFACTS", "RELATIONS", "VALIDATION"]));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ExportDetail | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "error">("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Whether a Full Review or Advisor exists — gates the opt-in "AI Review" section
  // (null = still probing). The /latest endpoints 404 when none has been generated.
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

  const load = async () => {
    setExportsError(null);
    try {
      const list = await apiClient.get<ExportSummary[]>(`/projects/${projectId}/exports`);
      setExports(list);
    } catch (err) {
      const msg = errorMessage(err, "Failed to load exports");
      setExportsError(msg);
      toast.error(msg);
      setExports([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Probe whether an AI review/advisory exists, so the section is only offered
  // when there's something to include. A 404 (or 403 for low roles) → unavailable.
  useEffect(() => {
    let cancelled = false;
    const probe = async (path: string) => {
      try { await apiClient.get(path); return true; } catch { return false; }
    };
    (async () => {
      const [hasReview, hasAdvisor] = await Promise.all([
        probe(`/projects/${projectId}/ai/review/latest`),
        probe(`/projects/${projectId}/ai/advisor/latest`),
      ]);
      if (!cancelled) setAiAvailable(hasReview || hasAdvisor);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // For PDF, render each diagram's Mermaid to SVG in-browser (Mermaid needs a
  // DOM) so the backend can embed real vector diagrams deterministically.
  // Best-effort: any diagram that fails simply falls back to its source block.
  const captureDiagramSvgs = async (): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    try {
      const diagrams = await diagramsApi.list(projectId);
      const rendered = await Promise.all(
        diagrams.map(async (d) => ({ id: d.id, svg: await renderMermaidToSvg(d.mermaidSource) })),
      );
      for (const r of rendered) if (r.svg) out[r.id] = r.svg;
    } catch {
      /* non-fatal — export proceeds with source-only diagrams */
    }
    return out;
  };

  const create = async () => {
    setBusy(true);
    try {
      const diagramSvgs = format === "PDF" ? await captureDiagramSvgs() : undefined;
      const created = await apiClient.post<{ id: string }>(`/projects/${projectId}/export`, {
        format,
        sections: Array.from(picked),
        ...(diagramSvgs && Object.keys(diagramSvgs).length > 0 ? { diagramSvgs } : {}),
      });
      toast.success("Export created");
      await load();
      // Auto-open the freshly-created export so the user sees what they made
      if (created?.id) await open(created.id);
    } catch (err) {
      toast.error(errorMessage(err, "Could not create export"));
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    setPreviewState("loading");
    setPreviewError(null);
    setPreview(null);
    try {
      const detail = await apiClient.get<ExportDetail>(`/exports/${id}`);
      setPreview(detail);
      setPreviewState("idle");
    } catch (err) {
      const msg = errorMessage(err, "Could not load export");
      setPreviewError(msg);
      setPreviewState("error");
      toast.error(msg);
    }
  };

  // PDF is rendered server-side (Export Engine V2) and streamed through the
  // authenticated download route. JSON/Markdown keep the local-blob behavior.
  const downloadFromServer = async (id: string, ext: string) => {
    const base =
      process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "/api";
    const token = typeof window !== "undefined" ? localStorage.getItem("mino:token") : null;
    const res = await fetch(`${base}/exports/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const download = async () => {
    if (!preview) return;
    if (preview.format === "PDF") {
      try {
        await downloadFromServer(preview.id, "pdf");
      } catch {
        toast.error("Could not download PDF");
      }
      return;
    }
    const isMarkdown = preview.format === "MARKDOWN";
    const body = isMarkdown
      ? String(preview.content ?? "")
      : JSON.stringify(preview.content ?? {}, null, 2);
    const blob = new Blob([body], { type: isMarkdown ? "text/markdown" : "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${preview.id}.${isMarkdown ? "md" : "json"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Export SSOT"
        subtitle="Bundle the project's artifacts, relations and validation issues into a single document."
      />

      <Card title="Create export">
        <div className="grid sm:grid-cols-[1fr_2fr] gap-4 items-start">
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[12.5px] text-fg-muted font-medium block mb-1.5">Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}
                className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
                <option value="JSON">JSON</option>
                <option value="MARKDOWN">Markdown</option>
                <option value="PDF">PDF — Architecture Intelligence Report</option>
              </select>
              <p className="text-[11.5px] text-fg-subtle mt-1">PDF generates a presentation-grade architecture report. Download it from the preview panel below.</p>
            </div>
          </div>
          <div>
            <label className="text-[12.5px] text-fg-muted font-medium block mb-1.5">Sections</label>
            <div className="grid sm:grid-cols-3 gap-1.5">
              {SECTIONS.map((s) => {
                const isAi = s.id === "AI_REVIEW";
                const disabled = isAi && aiAvailable === false;
                return (
                  <label
                    key={s.id}
                    title={disabled ? "Generate an AI Review or Advisor first" : undefined}
                    className={`flex items-center gap-2 text-[13px] bg-panel-2 border border-border rounded-md px-2.5 py-2 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <input type="checkbox" disabled={disabled} checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                    {s.label}{isAi && aiAvailable === false ? " (none yet)" : ""}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="primary" icon={<Package size={14} />} onClick={create} disabled={busy || picked.size === 0}>
            {busy ? "Creating…" : "Create export"}
          </Button>
        </div>
      </Card>

      <div className="mt-5">
        <Card padded={false} title="Recent exports">
          {exports === null ? (
            <div className="p-4"><SkeletonTable cols={4} rows={3} /></div>
          ) : exportsError ? (
            <div className="p-6 text-danger text-[13px]">{exportsError}</div>
          ) : exports.length === 0 ? (
            <Empty title="No exports yet" message="Create your first export above." />
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-panel">
                <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Format</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Sections</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Created</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">ID</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {exports.map((e) => (
                  <tr key={e.id} className={`border-b border-border last:border-0 ${preview?.id === e.id ? "bg-panel-hover" : ""}`}>
                    <td className="px-3.5 py-3"><Badge mono>{e.format}</Badge></td>
                    <td className="px-3.5 py-3 text-fg-muted">{e.sections.join(", ")}</td>
                    <td className="px-3.5 py-3 text-fg-muted text-[12.5px]">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="px-3.5 py-3 font-mono text-[11.5px] text-fg-muted">{e.id}</td>
                    <td className="px-3.5 py-3 text-right">
                      <Button size="sm" onClick={() => open(e.id)} disabled={previewState === "loading" && preview?.id !== e.id}>
                        {preview?.id === e.id ? "Open" : "View"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="mt-5">
        {previewState === "loading" ? (
          <Card>
            <Skeleton className="h-[280px] w-full" />
          </Card>
        ) : previewState === "error" ? (
          <Card>
            <div className="text-danger text-[13.5px]">{previewError}</div>
          </Card>
        ) : preview ? (
          <Card
            title="Preview"
            subtitle={`${preview.format} · sections: ${preview.sections.join(", ") || "—"}`}
            action={
              <div className="flex items-center gap-2">
                <Button size="sm" icon={<Download size={13} />} onClick={download}>Download</Button>
                <Button size="sm" icon={<X size={13} />} onClick={() => { setPreview(null); }}>Close</Button>
              </div>
            }
          >
            <ExportPreview preview={preview} />
          </Card>
        ) : (
          <Card>
            <div className="text-fg-muted text-[13px]">Pick an export above to preview it, or create a new one.</div>
          </Card>
        )}
      </div>
    </div>
  );
}
