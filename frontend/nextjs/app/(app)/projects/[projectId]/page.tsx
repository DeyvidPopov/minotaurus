// app/(app)/projects/[projectId]/page.tsx — workspace overview
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw, Upload, Sparkles, Plus, Star, Box, Network, Shield, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FILL_ACTIONS_MOBILE } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { ProjectMark } from "@/components/ui/project-mark";
import { Empty } from "@/components/ui/empty";
import { OpenLink } from "@/components/ui/open-link";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { ClampedText } from "@/components/ui/clamped-text";
import { useTweaks } from "@/components/providers";
import { BootstrapWizard } from "@/components/ai/bootstrap-wizard";
import { projectsApi } from "@/lib/api/projects";
import { artifactsApi } from "@/lib/api/artifacts";
import { validationApi } from "@/lib/api";
import { versionsApi, type VersionEvent } from "@/lib/api/versions";
import { ActivityRow } from "@/components/activity/activity-row";
import { groupActivityRuns } from "@/lib/activity";
import { apiClient } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import type { Artifact, Project, Relation, Severity, ValidationIssue } from "@/lib/types";

type ProjectRelation = {
  id: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  relationType: Relation["type"];
};

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 };

export default function WorkspacePage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const { graphNodeStyle } = useTweaks();
  const [project, setProject] = useState<Project | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [recentEvents, setRecentEvents] = useState<VersionEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const refresh = async () => {
    try {
      const [p, arts, graph, vi, events] = await Promise.all([
        projectsApi.get(projectId),
        artifactsApi.list(projectId),
        apiClient.get<{ nodes: unknown[]; edges: ProjectRelation[] | { id: string; source: string; target: string; type: Relation["type"] }[] }>(`/projects/${projectId}/graph`),
        validationApi.list(projectId),
        versionsApi.list(projectId, { limit: 12 }),
      ]);
      setProject(p);
      setArtifacts(arts);
      // Graph endpoint returns edges as { id, source, target, type } — match Relation shape
      const edges = (graph.edges as { id: string; source: string; target: string; type: Relation["type"] }[]) || [];
      setRelations(edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type })));
      setIssues(vi);
      setRecentEvents(events);
    } catch (err) {
      const message = errorMessage(err, "Failed to load project");
      setError(message);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (error) {
    return (
      <div className="px-8 py-6">
        <Empty title="Project unavailable" message={error} />
      </div>
    );
  }

  if (!project) {
    return <div className="px-8 py-6 text-fg-muted">Loading…</div>;
  }

  const openIssues = issues.filter((i) => i.status === "OPEN");
  const sortedIssues = [...openIssues].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const errorLike = openIssues.filter((i) => i.severity === "ERROR" || i.severity === "CRITICAL").length;
  const findingsColor = errorLike > 0 ? "var(--c-danger)" : openIssues.length > 0 ? "var(--c-warning)" : "var(--fg)";
  const documentedCount = artifacts.filter((a) => (a.documentationContent ?? "").trim().length > 0).length;

  const summary: { label: string; value: number; href: string; icon: React.ReactNode; color?: string }[] = [
    { label: "Artifacts",     value: artifacts.length,  href: `/projects/${project.id}/artifacts`,  icon: <Box size={15} /> },
    { label: "Relations",     value: relations.length,  href: `/projects/${project.id}/graph`,       icon: <Network size={15} /> },
    { label: "Open findings", value: openIssues.length, href: `/projects/${project.id}/validation`,  icon: <Shield size={15} />, color: findingsColor },
    { label: "Documented",    value: documentedCount,   href: `/projects/${project.id}/docs`,         icon: <BookOpen size={15} /> },
  ];

  const runValidation = async () => {
    setRunning(true);
    try {
      await validationApi.run(projectId);
      toast.success("Validation complete");
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Validation failed"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        {/* Header: title + actions. Stacks on mobile, single row from sm up. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <ProjectMark color={project.color} size={42} seed={project.id} />
            <div className="flex items-center gap-2.5 min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight m-0 truncate min-w-0">{project.name}</h1>
              <StatusBadge status="ACTIVE" />
              {project.starred && <Star size={16} className="text-warning shrink-0" />}
            </div>
          </div>
          <div className={`flex items-center gap-2 flex-wrap sm:shrink-0 ${FILL_ACTIONS_MOBILE}`}>
            <Button icon={<RefreshCw size={14} />} onClick={runValidation} disabled={running}>
              {running ? "Validating…" : "Run validation"}
            </Button>
            <Link href={`/projects/${project.id}/export`}><Button icon={<Upload size={14} />}>Export SSOT</Button></Link>
            <Link href={`/projects/${project.id}/artifacts/new`}><Button variant="primary">New artifact</Button></Link>
          </div>
        </div>
        {/* Description: full-width row underneath, capped for readability */}
        <ClampedText
          text={project.description || "No description"}
          lines={3}
          className="text-fg-muted text-[13.5px] mt-3"
        />
      </div>

      {artifacts.length === 0 ? (
        <div className={`rounded-lg border border-border bg-panel mt-2 mx-auto ${wizardOpen ? "max-w-3xl p-5 sm:p-6" : "max-w-2xl p-8 text-center"}`}>
          {wizardOpen ? (
            // In place of a modal, the empty-project card becomes the AI flow;
            // Cancel/close returns it to the initial state below.
            <BootstrapWizard
              inline
              projectId={project.id}
              onClose={() => setWizardOpen(false)}
              onApplied={refresh}
            />
          ) : (
            <>
              <div className="w-12 h-12 rounded-lg bg-accent-soft text-accent grid place-items-center mx-auto mb-4">
                <Network size={22} />
              </div>
              <h2 className="text-[17px] font-semibold tracking-tight m-0">Your project is currently empty</h2>
              <p className="text-fg-muted text-[13.5px] mt-1.5 mb-5 max-w-md mx-auto">
                Start manually, or generate an initial architecture draft with AI — you review and confirm every item before anything is saved.
              </p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-center gap-2.5">
                <Link href={`/projects/${project.id}/artifacts/new`} className="w-full sm:w-auto">
                  <Button icon={<Plus size={14} />} className="w-full sm:w-auto">Start Building Manually</Button>
                </Link>
                <Button variant="primary" icon={<Sparkles size={14} />} onClick={() => setWizardOpen(true)} className="w-full sm:w-auto">
                  Generate Initial Architecture with AI
                </Button>
              </div>
              <div className="text-[11.5px] text-fg-subtle mt-3.5">
                AI creates a draft only. Nothing is saved until you confirm.
              </div>
            </>
          )}
        </div>
      ) : (
      <>
      {/* At-a-glance project summary — counts that double as navigation, not action duplicates. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-7">
        {summary.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-panel border border-border rounded-lg p-3.5 hover:border-border-strong transition-colors"
          >
            <div className="flex items-center justify-between text-fg-muted">
              <span className="text-[12px]">{s.label}</span>
              <span className="text-fg-subtle">{s.icon}</span>
            </div>
            <div className="text-[24px] font-semibold leading-none mt-2" style={{ color: s.color ?? "var(--fg)" }}>
              {s.value}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
        {/* Left: the architecture (graph) + what needs attention (validation) */}
        <div className="flex flex-col gap-5 min-w-0">
          <Card
            title="Knowledge graph"
            subtitle={`${artifacts.length} nodes · ${relations.length} relations`}
            action={<OpenLink href={`/projects/${project.id}/graph`} />}
            padded={false}
            className="min-w-0"
          >
            <div style={{ height: 380, position: "relative" }}>
              <GraphCanvas artifacts={artifacts} relations={relations} nodeStyle={graphNodeStyle} storageKey={`project:${projectId}`} showMiniMap={false} minZoom={0.05} />
            </div>
          </Card>

          <Card title="Validation snapshot" action={
            <OpenLink href={`/projects/${project.id}/validation`} />
          }>
            {/* 2×2 on phones, 1×4 from sm up — severity counts never clip. Ordered high→low severity. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3.5">
              {[
                { lbl: "Critical", n: openIssues.filter((i) => i.severity === "CRITICAL").length, c: "var(--c-danger)" },
                { lbl: "Errors",   n: openIssues.filter((i) => i.severity === "ERROR").length,    c: "var(--c-danger)" },
                { lbl: "Warnings", n: openIssues.filter((i) => i.severity === "WARNING").length,  c: "var(--c-warning)" },
                { lbl: "Info",     n: openIssues.filter((i) => i.severity === "INFO").length,     c: "var(--c-info)" },
              ].map((s) => (
                <div key={s.lbl} className="bg-panel-2 border border-border rounded-md p-2.5">
                  <div className="text-[10.5px] text-fg-subtle uppercase tracking-wider">{s.lbl}</div>
                  <div className="text-[22px] font-semibold" style={{ color: s.n > 0 ? s.c : "var(--fg-subtle)" }}>{s.n}</div>
                </div>
              ))}
            </div>
            {/* Highest-severity findings first (errors before warnings before info). */}
            {sortedIssues.slice(0, 3).map((iss) => {
              const art = artifacts.find((a) => a.id === iss.artifactId);
              const href = iss.artifactId
                ? `/projects/${project.id}/artifacts/${iss.artifactId}`
                : `/projects/${project.id}/validation`;
              return (
                <Link key={iss.id} href={href} className="flex items-center gap-2.5 py-2 border-b border-border last:border-0">
                  <SeverityBadge severity={iss.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] truncate">{iss.message}</div>
                    {art?.title && <div className="text-[11.5px] text-fg-muted truncate">{art.title}</div>}
                  </div>
                </Link>
              );
            })}
            {openIssues.length > 3 && (
              <Link
                href={`/projects/${project.id}/validation`}
                className="block text-[12.5px] text-accent hover:underline pt-2.5"
              >
                +{openIssues.length - 3} more findings
              </Link>
            )}
            {openIssues.length === 0 && (
              <div className="text-fg-muted text-[13px] py-3">No open findings.</div>
            )}
          </Card>
        </div>

        {/* Right: traceability — a tall, narrow activity list that fills its column */}
        <div className="flex flex-col gap-5 min-w-0">
          <Card
            title="Recent changes"
            subtitle={
              recentEvents === null
                ? "Loading…"
                : recentEvents.length === 0
                ? "No changes yet"
                : "Newest first"
            }
            action={<OpenLink href={`/projects/${project.id}/versions`} />}
            padded={false}
          >
            {recentEvents === null ? (
              <div className="px-3.5 py-6 text-fg-muted text-[13px]">Loading recent changes…</div>
            ) : recentEvents.length === 0 ? (
              <div className="px-3.5 py-6 text-fg-muted text-[13px]">No changes have been recorded yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {groupActivityRuns(recentEvents).map((g) => (
                  <ActivityRow key={g.event.id} event={g.event} count={g.count} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

