// app/(app)/projects/[projectId]/validation/page.tsx
"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Play, Check, MinusCircle, RotateCcw, ChevronRight, Info, Crosshair, Wrench, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES_LIST } from "@/lib/mock-data-extra";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { TypeChip } from "@/components/ui/type-chip";
import { ProjectChip } from "@/components/ui/project-chip";
import { OpenLink } from "@/components/ui/open-link";
import { Empty } from "@/components/ui/empty";
import { validationApi } from "@/lib/api";
import { projectsApi } from "@/lib/api/projects";
import { artifactsApi } from "@/lib/api/artifacts";
import { ApiError } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils";
import type { Artifact, IssueStatus, IssueTarget, Project, ValidationIssue } from "@/lib/types";

// Mirrors PROJECT_LEVEL_PREFIX in backend validation.engine.ts: project-level
// issues are not artifact-scoped, so they carry this prefix and store the
// projectId in artifactId (which never resolves to an artifact). Keep in sync.
const PROJECT_LEVEL_PREFIX = "PROJECT_LEVEL · ";

const KIND_LABEL: Record<IssueTarget["kind"], string> = {
  TEAM: "Team",
  ARTIFACT: "artifact",
  API_SPEC: "API spec",
  DATABASE_MODEL: "database model",
  DIAGRAM: "diagram",
};

// Map a resolved issue target to its in-app route. A null id (resource not
// found / deleted) falls back to the relevant module index page.
function targetHref(projectId: string, t: IssueTarget): string {
  switch (t.kind) {
    case "TEAM":
      return `/projects/${projectId}/team`;
    case "ARTIFACT":
      return t.id
        ? `/projects/${projectId}/artifacts/${t.id}${t.tab ? `?tab=${t.tab}` : ""}`
        : `/projects/${projectId}/graph`;
    case "API_SPEC":
      return t.id ? `/projects/${projectId}/api/${t.id}` : `/projects/${projectId}/api`;
    case "DATABASE_MODEL":
      return t.id ? `/projects/${projectId}/database/${t.id}` : `/projects/${projectId}/database`;
    case "DIAGRAM":
      return t.id ? `/projects/${projectId}/diagrams/${t.id}` : `/projects/${projectId}/diagrams`;
  }
}

// Human description of the affected target for the details panel.
function targetDescription(t: IssueTarget): string {
  if (t.kind === "TEAM") return "Project · Team";
  const noun = KIND_LABEL[t.kind];
  const head = t.title ? `${noun} “${t.title}”` : `${noun} (unresolved)`;
  return t.endpoint ? `${head} · ${t.endpoint.method} ${t.endpoint.path}` : head;
}

function DetailSection({
  icon: Icon,
  label,
  accent = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  accent?: boolean;
  children: ReactNode;
}) {
  const accentStyle = accent ? { color: "var(--accent)" } : undefined;
  return (
    <div className="flex gap-2.5">
      <Icon
        size={14}
        className={`mt-0.5 shrink-0 ${accent ? "" : "text-fg-subtle"}`}
        style={accentStyle}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div
          className={`text-[10.5px] uppercase tracking-wider mb-0.5 ${accent ? "" : "text-fg-subtle"}`}
          style={accentStyle}
        >
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ValidationPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;

  const [project, setProject] = useState<Project | null>(null);
  const [artifactsById, setArtifactsById] = useState<Record<string, Artifact>>({});
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);

  const [sev, setSev] = useState("ALL");
  const [cat, setCat] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
                  <th className="w-8 px-2 py-2.5 border-b border-border" aria-label="Expand" />
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
                  const isProjectLevel = i.message.startsWith(PROJECT_LEVEL_PREFIX);
                  const message =
                    i.meta?.cleanMessage ??
                    (isProjectLevel ? i.message.slice(PROJECT_LEVEL_PREFIX.length) : i.message);
                  const art = isProjectLevel ? undefined : artifactsById[i.artifactId];
                  const meta = i.meta;
                  const target = meta?.target ?? null;
                  const isOpen = expanded.has(i.id);
                  return (
                    <Fragment key={i.id}>
                    <tr
                      className="border-b border-border hover:bg-panel-hover cursor-pointer"
                      onClick={() => meta && toggleExpanded(i.id)}
                    >
                      <td className="px-2 py-3 align-middle">
                        {meta && (
                          <ChevronRight
                            size={14}
                            className={`text-fg-subtle transition-transform motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`}
                          />
                        )}
                      </td>
                      <td className="px-3.5 py-3"><SeverityBadge severity={i.severity} /></td>
                      <td className="px-3.5 py-3"><Badge mono>{i.category}</Badge></td>
                      <td className="px-3.5 py-3">{message}</td>
                      <td className="px-3.5 py-3">
                        {isProjectLevel ? (
                          <ProjectChip />
                        ) : art ? (
                          <div className="flex items-center gap-2"><TypeChip type={art.type} /><span className="font-medium">{art.title}</span></div>
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-fg-muted text-[12.5px]">{timeAgo(i.createdAt)}</td>
                      <td className="px-3.5 py-3"><StatusBadge status={i.status} /></td>
                      <td className="px-3.5 py-3" onClick={(e) => e.stopPropagation()}>
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
                    {meta && isOpen && (
                      <tr className="border-b border-border last:border-0">
                        <td colSpan={8} className="bg-panel/30 px-3.5 pt-1 pb-5">
                          <div className="grid gap-4 text-[12.5px]">
                            {/* header spans full width so "Open" sits at the right edge;
                                the body below stays max-w-3xl for readable line length */}
                            <div className="flex items-center gap-2">
                              <Badge mono>{meta.code ?? meta.ruleId}</Badge>
                              {meta.deterministic && (
                                <span
                                  className="inline-flex items-center gap-1 text-[10.5px] font-mono uppercase tracking-wider"
                                  style={{ color: "var(--c-success)" }}
                                  title="Computed by the deterministic rule engine — no AI"
                                >
                                  <ShieldCheck size={11} aria-hidden="true" /> Deterministic
                                </span>
                              )}
                              {target && (
                                <OpenLink
                                  href={targetHref(projectId, target)}
                                  label={`Open ${KIND_LABEL[target.kind]}`}
                                  className="ml-auto -mr-2 shrink-0 rounded-md px-2 py-1 hover:bg-panel-hover"
                                />
                              )}
                            </div>

                            <div className="max-w-3xl grid gap-4">
                              <DetailSection icon={Info} label="Why it fired">
                                <span className="text-fg-muted leading-relaxed">{meta.why}</span>
                              </DetailSection>

                              {target && (
                                <DetailSection icon={Crosshair} label="Affected target">
                                  {target.id ? (
                                    <Link
                                      href={targetHref(projectId, target)}
                                      className="font-medium text-fg hover:text-accent transition-colors"
                                    >
                                      {targetDescription(target)}
                                    </Link>
                                  ) : (
                                    <span className="text-fg-muted">{targetDescription(target)}</span>
                                  )}
                                </DetailSection>
                              )}

                              {/* suggested fix — the actionable part; emphasised with an
                                  accent icon + label and brighter body text, no nested box */}
                              <DetailSection icon={Wrench} label="Suggested fix" accent>
                                <p className="text-fg leading-relaxed">{meta.suggestedFix}</p>
                              </DetailSection>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
