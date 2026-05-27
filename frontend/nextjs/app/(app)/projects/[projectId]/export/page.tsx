// app/(app)/projects/[projectId]/export/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Download, Package } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { apiClient, ApiError } from "@/lib/api/client";
import type { ExportFormat } from "@/lib/types";

interface ExportSummary {
  id: string;
  projectId: string;
  format: ExportFormat;
  sections: string[];
  createdAt: string;
}

interface ExportDetail extends ExportSummary {
  content: unknown;
}

const SECTIONS = [
  { id: "ARTIFACTS", label: "Artifacts (includes documentation)" },
  { id: "RELATIONS", label: "Relations" },
  { id: "VALIDATION", label: "Validation issues" },
];

export default function ExportPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [exports, setExports] = useState<ExportSummary[] | null>(null);
  const [format, setFormat] = useState<ExportFormat>("JSON");
  const [picked, setPicked] = useState<Set<string>>(new Set(["ARTIFACTS", "RELATIONS", "VALIDATION"]));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ExportDetail | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const load = async () => {
    try {
      const list = await apiClient.get<ExportSummary[]>(`/projects/${projectId}/exports`);
      setExports(list);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load exports");
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
      await apiClient.post(`/projects/${projectId}/export`, {
        format,
        sections: Array.from(picked),
      });
      toast.success("Export created");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create export");
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    setLoadingPreview(true);
    setPreview(null);
    try {
      const detail = await apiClient.get<ExportDetail>(`/exports/${id}`);
      setPreview(detail);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not load export");
    } finally {
      setLoadingPreview(false);
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
    <div className="px-8 py-6">
      <PageHeader
        title="Export SSOT"
        subtitle="Bundle the project's artifacts, relations and validation issues into a single document."
      />

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5 mb-6">
        <Card title="Create export">
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
            <div>
              <label className="text-[12.5px] text-fg-muted font-medium block mb-1.5">Sections</label>
              <div className="flex flex-col gap-1.5">
                {SECTIONS.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-[13.5px]">
                    <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" icon={<Package size={14} />} onClick={create} disabled={busy || picked.size === 0}>
                {busy ? "Creating…" : "Create export"}
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Preview" subtitle={preview ? `${preview.format} · ${preview.sections.join(", ")}` : "Pick an export from the list"}>
          {loadingPreview ? (
            <div className="text-fg-muted text-[13px]">Loading…</div>
          ) : !preview ? (
            <div className="text-fg-muted text-[13px]">No export selected.</div>
          ) : (
            <>
              <pre className="bg-panel-2 border border-border rounded-md p-3 text-[12px] overflow-auto" style={{ maxHeight: 320 }}>
                {preview.format === "MARKDOWN"
                  ? String(preview.content ?? "")
                  : JSON.stringify(preview.content ?? {}, null, 2)}
              </pre>
              <div className="flex justify-end mt-3">
                <Button icon={<Download size={13} />} onClick={download}>Download</Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card padded={false} title="Recent exports">
        {exports === null ? (
          <div className="p-6 text-fg-muted text-[13px]">Loading…</div>
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
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-3.5 py-3"><Badge mono>{e.format}</Badge></td>
                  <td className="px-3.5 py-3 text-fg-muted">{e.sections.join(", ")}</td>
                  <td className="px-3.5 py-3 text-fg-muted text-[12.5px]">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-3.5 py-3 font-mono text-[11.5px] text-fg-muted">{e.id}</td>
                  <td className="px-3.5 py-3 text-right">
                    <Button size="sm" onClick={() => open(e.id)}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
