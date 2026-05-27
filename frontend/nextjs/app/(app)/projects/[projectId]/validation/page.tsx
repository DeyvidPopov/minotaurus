// app/(app)/projects/[projectId]/validation/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Play, Check, MinusCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES_LIST } from "@/lib/mock-data-extra";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { TypeChip } from "@/components/ui/type-chip";
import { Empty } from "@/components/ui/empty";
import { validationApi } from "@/lib/api";
import { projectsApi } from "@/lib/api/projects";
import { artifactsApi } from "@/lib/api/artifacts";
import { ApiError } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils";
import type { Artifact, IssueStatus, Project, ValidationIssue } from "@/lib/types";

export default function ValidationPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;

  const [project, setProject] = useState<Project | null>(null);
  const [artifactsById, setArtifactsById] = useState<Record<string, Artifact>>({});
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);

  const [sev, setSev] = useState("ALL");
  const [cat, setCat] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [running, setRunning] = useState(false);

  const load = async () => {
    try {
      const [p, arts, vi] = await Promise.all([
        projectsApi.get(projectId),
        artifactsApi.list(projectId),
        validationApi.list(projectId),
      ]);
      setProject(p);
      setArtifactsById(Object.fromEntries(arts.map((a) => [a.id, a])));
      setIssues(vi);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load validation");
      setIssues([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const items = issues ?? [];
  const visible = items.filter((i) =>
    (sev === "ALL" || i.severity === sev) &&
    (cat === "ALL" || i.category === cat) &&
    (statusFilter === "ALL" || i.status === statusFilter)
  );

  const stats = {
    CRITICAL: items.filter((i) => i.status === "OPEN" && i.severity === "CRITICAL").length,
    ERROR:    items.filter((i) => i.status === "OPEN" && i.severity === "ERROR").length,
    WARNING:  items.filter((i) => i.status === "OPEN" && i.severity === "WARNING").length,
    INFO:     items.filter((i) => i.status === "OPEN" && i.severity === "INFO").length,
  };

  const openCount = items.filter((i) => i.status === "OPEN").length;

  const runValidation = async () => {
    setRunning(true);
    try {
      await validationApi.run(projectId);
      toast.success("Validation complete");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Validation failed");
    } finally {
      setRunning(false);
    }
  };

  const updateStatus = async (id: string, status: IssueStatus) => {
    try {
      await validationApi.update(id, { status });
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update issue");
    }
  };

  return (
    <div className="px-8 py-6">
      <PageHeader
        title="Validation"
        subtitle={
          issues === null
            ? "Loading…"
            : `${openCount} open issue${openCount === 1 ? "" : "s"} · ${project?.name ?? ""}`
        }
        actions={
          <Button variant="primary" icon={<Play size={14} />} onClick={runValidation} disabled={running}>
            {running ? "Running…" : "Run validation"}
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {([
          ["Critical", stats.CRITICAL, "var(--c-danger)"],
          ["Errors",   stats.ERROR,    "var(--c-danger)"],
          ["Warnings", stats.WARNING,  "var(--c-warning)"],
          ["Info",     stats.INFO,     "var(--c-info)"],
        ] as const).map(([lbl, n, c]) => (
          <div key={lbl} className="bg-panel border border-border rounded-lg p-4">
            <div className="text-[12px] text-fg-muted">{lbl}</div>
            <div className="text-[28px] font-semibold tabular-nums" style={{ color: n > 0 ? c : "var(--fg)" }}>{n}</div>
          </div>
        ))}
      </div>

      {issues !== null && items.length === 0 ? (
        <Empty
          title="No validation issues yet"
          message="Run validation to check this project against the rules."
          action={<Button variant="primary" icon={<Play size={14} />} onClick={runValidation} disabled={running}>Run validation</Button>}
        />
      ) : (
        <Card padded={false} title="All issues" action={
          <div className="flex items-center gap-2">
            <select value={sev} onChange={(e) => setSev(e.target.value)} className="h-8 px-2 pr-7 bg-panel border border-border rounded-sm text-[12.5px]">
              <option value="ALL">All severities</option>
              {["CRITICAL","ERROR","WARNING","INFO"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-8 px-2 pr-7 bg-panel border border-border rounded-sm text-[12.5px]">
              <option value="ALL">All categories</option>
              {CATEGORIES_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 px-2 pr-7 bg-panel border border-border rounded-sm text-[12.5px]">
              <option value="ALL">All status</option>
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
              <option value="IGNORED">Ignored</option>
            </select>
          </div>
        }>
          {visible.length === 0 ? (
            <div className="p-8 text-center text-fg-muted">No issues match these filters.</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-panel">
                <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Severity</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Category</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Message</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Artifact</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Created</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Status</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => {
                  const art = artifactsById[i.artifactId];
                  return (
                    <tr key={i.id} className="border-b border-border last:border-0 hover:bg-panel-hover">
                      <td className="px-3.5 py-3"><SeverityBadge severity={i.severity} /></td>
                      <td className="px-3.5 py-3"><Badge mono>{i.category}</Badge></td>
                      <td className="px-3.5 py-3">{i.message}</td>
                      <td className="px-3.5 py-3">{art && <div className="flex items-center gap-2"><TypeChip type={art.type} /><span className="font-medium">{art.title}</span></div>}</td>
                      <td className="px-3.5 py-3 text-fg-muted text-[12.5px]">{timeAgo(i.createdAt)}</td>
                      <td className="px-3.5 py-3"><StatusBadge status={i.status} /></td>
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-1.5">
                          {i.status !== "RESOLVED" && (
                            <button onClick={() => updateStatus(i.id, "RESOLVED")} title="Mark resolved"
                              className="p-1 text-fg-muted hover:text-fg rounded hover:bg-panel-hover"><Check size={13} /></button>
                          )}
                          {i.status !== "IGNORED" && (
                            <button onClick={() => updateStatus(i.id, "IGNORED")} title="Ignore"
                              className="p-1 text-fg-muted hover:text-fg rounded hover:bg-panel-hover"><MinusCircle size={13} /></button>
                          )}
                          {i.status !== "OPEN" && (
                            <button onClick={() => updateStatus(i.id, "OPEN")} title="Reopen"
                              className="p-1 text-fg-muted hover:text-fg rounded hover:bg-panel-hover"><RotateCcw size={13} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
