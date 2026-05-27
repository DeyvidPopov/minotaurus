// app/(app)/projects/[projectId]/page.tsx — workspace overview
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RefreshCw, Upload, Plus, Box, Network, Shield, Package, ExternalLink, Star, History, Plug, Database, GitMerge, Pencil, Trash2, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { ProjectMark } from "@/components/ui/project-mark";
import { Empty } from "@/components/ui/empty";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { projectsApi } from "@/lib/api/projects";
import { artifactsApi } from "@/lib/api/artifacts";
import { validationApi } from "@/lib/api";
import { versionsApi, type VersionAction, type VersionEntityType, type VersionEvent } from "@/lib/api/versions";
import { apiClient, ApiError } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import type { Artifact, Project, Relation, ValidationIssue } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

type ProjectRelation = {
  id: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  relationType: Relation["type"];
};

export default function WorkspacePage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [project, setProject] = useState<Project | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [recentEvents, setRecentEvents] = useState<VersionEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const refresh = async () => {
    try {
      const [p, arts, graph, vi, events] = await Promise.all([
        projectsApi.get(projectId),
        artifactsApi.list(projectId),
        apiClient.get<{ nodes: unknown[]; edges: ProjectRelation[] | { id: string; source: string; target: string; type: Relation["type"] }[] }>(`/projects/${projectId}/graph`),
        validationApi.list(projectId),
        versionsApi.list(projectId, { limit: 10 }),
      ]);
      setProject(p);
      setArtifacts(arts);
      // Graph endpoint returns edges as { id, source, target, type } — match Relation shape
      const edges = (graph.edges as { id: string; source: string; target: string; type: Relation["type"] }[]) || [];
      setRelations(edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type })));
      setIssues(vi);
      setRecentEvents(events);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load project";
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

  const runValidation = async () => {
    setRunning(true);
    try {
      await validationApi.run(projectId);
      toast.success("Validation complete");
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Validation failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="px-8 py-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3 flex-wrap">
            <ProjectMark color={project.color} size={42} letter={project.name[0]?.toUpperCase() || "P"} />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight m-0 flex items-center gap-2.5">
                {project.name}
                <StatusBadge status="ACTIVE" />
                {project.starred && <Star size={16} className="text-warning" />}
              </h1>
              <div className="text-fg-muted text-[13.5px] mt-1">{project.description || "No description"}</div>
            </div>
          </div>
        }
        actions={<>
          <Button icon={<RefreshCw size={14} />} onClick={runValidation} disabled={running}>
            {running ? "Validating…" : "Run validation"}
          </Button>
          <Link href={`/projects/${project.id}/export`}><Button icon={<Upload size={14} />}>Export SSOT</Button></Link>
          <Link href={`/projects/${project.id}/artifacts/new`}><Button variant="primary" icon={<Plus size={14} />}>New artifact</Button></Link>
        </>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-7">
        {[
          { icon: <Box />,      label: "New artifact", href: `/projects/${project.id}/artifacts/new` },
          { icon: <Network />,  label: "Graph",        href: `/projects/${project.id}/graph` },
          { icon: <Shield />,   label: "Validation",   href: `/projects/${project.id}/validation` },
          { icon: <Package />,  label: "Export",       href: `/projects/${project.id}/export` },
        ].map((q, i) => (
          <Link key={i} href={q.href} className="bg-panel border border-border rounded-lg p-3.5 flex flex-col gap-2 hover:border-border-strong transition-colors">
            <div className="w-[30px] h-[30px] rounded-md bg-accent-soft text-accent grid place-items-center">
              {/* @ts-ignore */}
              {q.icon}
            </div>
            <div className="text-[13.5px] font-medium">{q.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 items-start">
        <Card
          title="Knowledge graph"
          subtitle={`${artifacts.length} nodes · ${relations.length} relations`}
          action={<Link href={`/projects/${project.id}/graph`} className="text-[12.5px] text-fg-muted hover:text-fg flex items-center gap-1">Open <ExternalLink size={12} /></Link>}
          padded={false}
        >
          <div style={{ height: 360, position: "relative" }}>
            {artifacts.length === 0 ? (
              <div className="h-full flex items-center justify-center text-fg-muted text-[13px] px-4 text-center">
                No artifacts yet — create one to start building the graph.
              </div>
            ) : (
              <GraphCanvas artifacts={artifacts} relations={relations} nodeStyle="color" storageKey={`project:${projectId}:mini`} />
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card title="Validation snapshot" action={
            <Link href={`/projects/${project.id}/validation`} className="text-[12.5px] text-fg-muted hover:text-fg flex items-center gap-1">Open <ExternalLink size={12} /></Link>
          }>
            <div className="grid grid-cols-4 gap-2 mb-3.5">
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
            {openIssues.slice(0, 3).map((iss) => {
              const art = artifacts.find((a) => a.id === iss.artifactId);
              return (
                <Link key={iss.id} href={`/projects/${project.id}/artifacts/${iss.artifactId}`} className="flex items-center gap-2.5 py-2 border-b border-border last:border-0">
                  <SeverityBadge severity={iss.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] truncate">{iss.message}</div>
                    <div className="text-[11.5px] text-fg-muted">{art?.title || ""}</div>
                  </div>
                </Link>
              );
            })}
            {openIssues.length === 0 && (
              <div className="text-fg-muted text-[13px] py-3">No open issues. Run validation to refresh.</div>
            )}
          </Card>

          <Card
            title="Recent changes"
            subtitle={
              recentEvents === null
                ? "Loading…"
                : `${recentEvents.length === 0 ? "No events yet" : "Newest first · backed by version history"}`
            }
            action={
              <Link
                href={`/projects/${project.id}/versions`}
                className="text-[12.5px] text-fg-muted hover:text-fg flex items-center gap-1"
              >
                Open <ExternalLink size={12} />
              </Link>
            }
            padded={false}
          >
            {recentEvents === null ? (
              <div className="px-3.5 py-6 text-fg-muted text-[13px]">Loading recent changes…</div>
            ) : recentEvents.length === 0 ? (
              <div className="px-3.5 py-6 text-fg-muted text-[13px]">No recent changes yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {recentEvents.map((e, i, arr) => (
                  <RecentChangeRow key={e.id} event={e} isFirst={i === 0} isLast={i === arr.length - 1} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

const ACTION_COLOR: Record<VersionAction, string> = {
  CREATED: "var(--c-success)",
  UPDATED: "var(--c-info)",
  DELETED: "var(--c-danger)",
  LINKED: "var(--c-info)",
  UNLINKED: "var(--fg-muted)",
  VALIDATED: "var(--c-warning)",
  EXPORTED: "#a78bfa",
};

const ACTION_VERB: Record<VersionAction, string> = {
  CREATED: "created",
  UPDATED: "updated",
  DELETED: "deleted",
  LINKED: "linked",
  UNLINKED: "unlinked",
  VALIDATED: "validated",
  EXPORTED: "exported",
};

// Entities whose stored `title` is already self-describing through the verb +
// entity-type line (e.g. relations render "source → target" which duplicates
// information). Hide the second line for those to match the timeline mockup.
const HIDE_SECONDARY_TITLE = new Set<VersionEntityType>(["RELATION"]);

function entityTypeLabel(t: VersionEntityType): string {
  return t.toLowerCase().replace(/_/g, " ");
}

function authorName(event: VersionEvent): string {
  return event.triggeredByName?.trim() || "Someone";
}

function RecentChangeRow({ event, isFirst, isLast }: { event: VersionEvent; isFirst: boolean; isLast: boolean }) {
  const c = ACTION_COLOR[event.action];
  const showTitle = !HIDE_SECONDARY_TITLE.has(event.entityType) && !!event.title.trim();
  return (
    <li className="relative flex items-start gap-3 pl-4 pr-3.5 py-3">
      {/* rail above the dot (omit on first row) */}
      {!isFirst && (
        <span
          aria-hidden="true"
          className="absolute left-[20.5px] top-0 h-[17px] w-px"
          style={{ background: "var(--border)" }}
        />
      )}
      {/* rail below the dot (omit on last row) */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[20.5px] top-[26px] bottom-0 w-px"
          style={{ background: "var(--border)" }}
        />
      )}
      {/* timeline dot */}
      <span
        aria-hidden="true"
        className="relative z-[1] mt-1 w-2.5 h-2.5 rounded-full shrink-0"
        style={{
          borderWidth: 2,
          borderStyle: "solid",
          borderColor: c,
          background: "var(--panel)",
        }}
        title={event.entityType}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-tight truncate">
          <strong className="text-fg font-semibold">{authorName(event)}</strong>{" "}
          <span className="text-fg-muted">{ACTION_VERB[event.action]}</span>{" "}
          <span className="font-mono text-fg-muted">{entityTypeLabel(event.entityType)}</span>
          <span className="text-fg-subtle"> · </span>
          <span className="text-fg-subtle">{timeAgo(event.createdAt)}</span>
        </div>
        {showTitle && (
          <div className="text-[13px] text-fg font-normal truncate mt-1">{event.title}</div>
        )}
      </div>
    </li>
  );
}
