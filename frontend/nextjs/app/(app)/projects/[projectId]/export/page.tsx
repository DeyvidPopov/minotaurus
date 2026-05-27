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
import { apiClient, ApiError } from "@/lib/api/client";
import { ExportPreview, type ExportPreviewModel } from "@/components/export-preview";
import type { ExportFormat } from "@/lib/types";

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
  { id: "ARTIFACTS", label: "Artifacts (includes documentation)" },
  { id: "RELATIONS", label: "Relations" },
  { id: "API_SPECS", label: "API specs & endpoints" },
  { id: "DATABASE_MODELS", label: "Database models" },
  { id: "DIAGRAMS", label: "Diagrams" },
  { id: "VALIDATION", label: "Validation issues" },
  { id: "VERSION_HISTORY", label: "Version history / recent changes" },
  { id: "IMPACT_ANALYSIS", label: "Impact analysis (per artifact)" },
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

  const load = async () => {
    setExportsError(null);
    try {
      const list = await apiClient.get<ExportSummary[]>(`/projects/${projectId}/exports`);
      setExports(list);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to load exports";
      setExportsError(msg);
      toast.error(msg);
      setExports([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const create = async () => {
    setBusy(true);
    try {
      const created = await apiClient.post<{ id: string }>(`/projects/${projectId}/export`, {
        format,
        sections: Array.from(picked),
      });
      toast.success("Export created");
      await load();
      // Auto-open the freshly-created export so the user sees what they made
      if (created?.id) await open(created.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create export");
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
      const msg = err instanceof ApiError ? err.message : "Could not load export";
      setPreviewError(msg);
      setPreviewState("error");
      toast.error(msg);
    }
  };

  const download = () => {
    if (!preview) return;
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
    <div className="px-8 py-6 max-w-[1100px] mx-auto">
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
              </select>
              <p className="text-[11.5px] text-fg-subtle mt-1">PDF and ZIP are accepted by the API but rendered as JSON content in this MVP.</p>
            </div>
          </div>
          <div>
            <label className="text-[12.5px] text-fg-muted font-medium block mb-1.5">Sections</label>
            <div className="grid sm:grid-cols-3 gap-1.5">
              {SECTIONS.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-[13px] bg-panel-2 border border-border rounded-md px-2.5 py-2 cursor-pointer">
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                  {s.label}
                </label>
              ))}
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
            <div className="p-6 text-fg-muted text-[13px]">Loading…</div>
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
            <div className="text-fg-muted text-[13px]">Loading export…</div>
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
