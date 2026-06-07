// app/(app)/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Plus, Box, Shield, ShieldAlert, Star, Sprout, ArrowRight, Clock,
  Network, History, Gauge, Package,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectMark } from "@/components/ui/project-mark";
import { Empty } from "@/components/ui/empty";
import { OpenLink } from "@/components/ui/open-link";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { useTweaks } from "@/components/providers";
import { projectsApi } from "@/lib/api/projects";
import { artifactsApi } from "@/lib/api/artifacts";
import { graphApi } from "@/lib/api";
import { versionsApi, type VersionEvent, type VersionAction, type VersionEntityType } from "@/lib/api/versions";
import { aiApi, type ReviewResult } from "@/lib/api/ai";
import { useAuth } from "@/lib/auth-context";
import { cn, timeAgo } from "@/lib/utils";
import type { Project, Artifact, Relation } from "@/lib/types";

const DEMO_PROJECT_NAME = "Online Shop Platform";
const RECENT_LIMIT = 6;
const ACTIVITY_PROJECTS = 5; // how many recent projects to merge activity from
const ACTIVITY_LIMIT = 10; // merged events shown
const IDENTITY = "Your single source of truth for system architecture, validation, and traceability.";

// State sentinels: keep loading / empty / unavailable distinct from real data
// so each section can degrade honestly instead of pretending it has data.
type HealthState = ReviewResult | "loading" | "none" | "idle";
type GraphData = { artifacts: Artifact[]; relations: Relation[] };
type GraphState = GraphData | "loading" | "none" | null;

export default function DashboardPage() {
  const { user } = useAuth();
  const { graphNodeStyle } = useTweaks();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [activity, setActivity] = useState<VersionEvent[] | null>(null);
  const [health, setHealth] = useState<HealthState>("idle");
  const [graph, setGraph] = useState<GraphState>(null);

  // Live React Flow is desktop-only — on phones the knowledge graph degrades to
  // a link card (touch + perf), and we skip its fetch entirely.
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => setProjects([]));
  }, []);

  const demoProject = useMemo(
    () => (projects ?? []).find((p) => p.name === DEMO_PROJECT_NAME) ?? null,
    [projects],
  );

  // Recency-first ordering powers the "Last activity" signal and the activity merge.
  const recent = useMemo(
    () =>
      [...(projects ?? [])].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [projects],
  );

  // Recent projects grid: starred first, then by recency (Phase 3). Stable sort
  // preserves the recency order within each star group.
  const gridProjects = useMemo(
    () => [...recent].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0)).slice(0, RECENT_LIMIT),
    [recent],
  );

  const projectsById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects ?? []) m.set(p.id, p);
    return m;
  }, [projects]);

  // Focus project = the user's default workspace if it still exists, else the
  // most recently updated. Drives the Health + Knowledge-graph cards.
  const focusId = useMemo(() => {
    if (!projects || projects.length === 0) return null;
    const def = user?.defaultProjectId;
    if (def && projects.some((p) => p.id === def)) return def;
    return recent[0]?.id ?? null;
  }, [projects, recent, user]);
  const focusProject = useMemo(
    () => (focusId ? projectsById.get(focusId) ?? null : null),
    [focusId, projectsById],
  );

  // Cross-project recent activity — merged client-side from per-project version
  // history (there is no global feed endpoint, by design). Bounded to the top
  // few projects so the fan-out stays small.
  useEffect(() => {
    if (!projects) return;
    if (projects.length === 0) { setActivity([]); return; }
    let cancelled = false;
    const top = recent.slice(0, ACTIVITY_PROJECTS);
    Promise.all(top.map((p) => versionsApi.list(p.id, { limit: 6 }).catch(() => [] as VersionEvent[])))
      .then((lists) => {
        if (cancelled) return;
        const merged = lists
          .flat()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, ACTIVITY_LIMIT);
        setActivity(merged);
      })
      .catch(() => { if (!cancelled) setActivity([]); });
    return () => { cancelled = true; };
  }, [projects, recent]);

  // Deterministic architecture health for the focus project. Reuses the read-only
  // review/latest GET (no AI call); empty/absent/forbidden all degrade to "none".
  useEffect(() => {
    if (!focusId) { setHealth("idle"); return; }
    let cancelled = false;
    setHealth("loading");
    aiApi.getLatestReview(focusId)
      .then((r) => {
        if (cancelled) return;
        setHealth(r && r.analysis?.health?.score != null ? r : "none");
      })
      .catch(() => { if (!cancelled) setHealth("none"); });
    return () => { cancelled = true; };
  }, [focusId]);

  // Knowledge-graph glimpse data — desktop only.
  useEffect(() => {
    if (!isDesktop || !focusId) return;
    let cancelled = false;
    setGraph("loading");
    Promise.all([
      artifactsApi.list(focusId),
      graphApi.get(focusId).catch(() => ({ nodes: [], edges: [] })),
    ])
      .then(([arts, g]) => {
        if (cancelled) return;
        const edges = (g.edges as { id: string; source: string; target: string; type: Relation["type"] }[]) || [];
        setGraph({ artifacts: arts, relations: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type })) });
      })
      .catch(() => { if (!cancelled) setGraph("none"); });
    return () => { cancelled = true; };
  }, [isDesktop, focusId]);

  const isEmpty = projects !== null && projects.length === 0;
  const hasProjects = projects !== null && projects.length > 0;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1320px] mx-auto">
      <PageHeader
        title={user ? `Welcome, ${user.firstName}` : "Welcome"}
        subtitle={IDENTITY}
        actions={
          isEmpty ? undefined : (
            <Link href="/projects/new">
              <Button variant="primary" icon={<Plus size={14} />}>New project</Button>
            </Link>
          )
        }
      />

      {projects === null && <SignalSkeleton />}
      {hasProjects && <SignalBand projects={projects} recent={recent} />}

      {isEmpty && <OnboardingStepper />}
      {isEmpty && <PlatformIntro />}

      {hasProjects && (
        <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4 sm:gap-5 items-start mb-6">
          <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
            <NeedsAttention projects={projects} />
            <RecentActivity events={activity} projectsById={projectsById} />
          </div>
          <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
            <HealthCard state={health} focusProject={focusProject} />
            <GraphGlimpse focusProject={focusProject} graph={graph} isDesktop={isDesktop} graphNodeStyle={graphNodeStyle} />
          </div>
        </div>
      )}

      {demoProject && <DemoCallout demoProject={demoProject} />}

      <div className="flex items-center mb-3 mt-6">
        <h2 className="m-0 text-base font-semibold tracking-tight">Recent projects</h2>
        <div className="flex-1" />
        {hasProjects && <OpenLink href="/projects" label="View all projects" />}
      </div>

      {isEmpty ? (
        <Card>
          <Empty
            title="No projects yet"
            message="Create your first project to start documenting your architecture."
            action={
              <Link href="/projects/new">
                <Button variant="primary" icon={<Plus size={14} />}>New project</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {gridProjects.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Signals (Phase 1) ───────────────────────────────────────────────────────
   Decision-oriented signals from data already on the project list — no new
   endpoints. Severity breakdown isn't cheaply available, so signals stay honest:
   projects needing attention, total open issues, and last workspace change. */
function SignalBand({ projects, recent }: { projects: Project[]; recent: Project[] }) {
  const attention = projects.filter((p) => p.validationIssueCount > 0).length;
  const totalIssues = projects.reduce((s, p) => s + p.validationIssueCount, 0);
  const last = recent[0] ?? null;
  const projectWord = `${projects.length} project${projects.length === 1 ? "" : "s"}`;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
      <Signal
        icon={<ShieldAlert size={13} />}
        label="Projects needing attention"
        value={attention}
        tone={attention > 0 ? "warning" : undefined}
        sub={attention === 0 ? "All projects clear" : `of ${projectWord}`}
      />
      <Signal
        icon={<Shield size={13} />}
        label="Open validation issues"
        value={totalIssues}
        tone={totalIssues > 0 ? "warning" : undefined}
        sub={`across ${projectWord}`}
      />
      <Signal
        icon={<Clock size={13} />}
        label="Last activity"
        value={last ? timeAgo(last.updatedAt) : "—"}
        sub={last?.name}
        href={last ? `/projects/${last.id}` : undefined}
      />
    </div>
  );
}

function Signal({
  icon, label, value, sub, href, tone,
}: {
  icon: ReactNode; label: string; value: ReactNode; sub?: string; href?: string; tone?: "warning";
}) {
  const inner = (
    <>
      <div className="text-[12px] text-fg-muted flex items-center gap-1.5">{icon}{label}</div>
      <div className={cn("text-[22px] font-semibold tracking-tight leading-tight mt-1 tabular-nums", tone === "warning" && "text-warning")}>
        {value}
      </div>
      {sub && <div className="text-[12px] text-fg-subtle mt-0.5 truncate">{sub}</div>}
    </>
  );
  const base = "block bg-panel border border-border rounded-lg p-4";
  return href ? (
    <Link href={href} className={cn(base, "hover:border-border-strong transition-colors")}>{inner}</Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

function SignalSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skel border border-border rounded-lg h-[84px]" />
      ))}
    </div>
  );
}

/* ── Needs attention (Phase 2) ───────────────────────────────────────────────
   Cheap, list-derived ranking of projects with open validation issues — the
   actionable counterpart to the "needing attention" signal. Each row links
   straight to that project's validation page. */
function NeedsAttention({ projects }: { projects: Project[] }) {
  const flagged = projects
    .filter((p) => p.validationIssueCount > 0)
    .sort((a, b) => b.validationIssueCount - a.validationIssueCount)
    .slice(0, 5);

  return (
    <Card
      title="Needs attention"
      subtitle={
        flagged.length === 0
          ? "No open validation issues"
          : `${flagged.length} project${flagged.length === 1 ? "" : "s"} with open issues`
      }
      padded={false}
    >
      {flagged.length === 0 ? (
        <div className="px-4 py-7 text-center text-fg-muted text-[13px]">
          <Shield size={20} className="mx-auto mb-2 text-fg-subtle" />
          Everything looks healthy. Run validation on a project to keep this current.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {flagged.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}/validation`}
                className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-panel-hover transition-colors"
              >
                <ProjectMark color={p.color} size={22} seed={p.id} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{p.name}</div>
                  <div className="text-[11.5px] text-fg-subtle">Updated {timeAgo(p.updatedAt)}</div>
                </div>
                <Badge tone="warning">{p.validationIssueCount} open</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Recent activity (Phase 2) ───────────────────────────────────────────────
   Cross-project traceability timeline merged from per-project version history. */
function RecentActivity({
  events, projectsById,
}: {
  events: VersionEvent[] | null;
  projectsById: Map<string, Project>;
}) {
  return (
    <Card
      title="Recent activity"
      subtitle={
        events === null ? "Loading…" : events.length === 0 ? "No activity yet" : "Across your most recent projects"
      }
      action={<History size={15} className="text-fg-subtle" />}
      padded={false}
    >
      {events === null ? (
        <div className="px-3.5 py-3 flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skel h-7 rounded-md" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="px-4 py-7 text-center text-fg-muted text-[13px]">
          Changes you make across projects will show up here.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {events.map((e) => (
            <ActivityRow key={e.id} event={e} project={projectsById.get(e.projectId)} />
          ))}
        </ul>
      )}
    </Card>
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
  CREATED: "created", UPDATED: "updated", DELETED: "deleted", LINKED: "linked",
  UNLINKED: "unlinked", VALIDATED: "validated", EXPORTED: "exported",
};
function entityTypeLabel(t: VersionEntityType): string {
  return t.toLowerCase().replace(/_/g, " ");
}
function authorName(event: VersionEvent): string {
  return event.triggeredByName?.trim() || "Someone";
}

function ActivityRow({ event, project }: { event: VersionEvent; project?: Project }) {
  const color = ACTION_COLOR[event.action] ?? "var(--fg-muted)";
  return (
    <li>
      <Link
        href={`/projects/${event.projectId}/versions`}
        className="flex items-start gap-2.5 px-3.5 py-2.5 hover:bg-panel-hover transition-colors"
      >
        <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-snug truncate">
            <strong className="text-fg font-semibold">{authorName(event)}</strong>{" "}
            <span className="text-fg-muted">{ACTION_VERB[event.action]}</span>{" "}
            <span className="text-fg">{event.title?.trim() || entityTypeLabel(event.entityType)}</span>
          </div>
          <div className="text-[11.5px] text-fg-subtle flex items-center gap-1.5 mt-0.5 min-w-0">
            {project && (
              <>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: project.color }} aria-hidden />
                <span className="truncate max-w-[150px]">{project.name}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className="shrink-0">{timeAgo(event.createdAt)}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}

/* ── Architecture health (Phase 2) ───────────────────────────────────────────
   Deterministic health score for the focus project, surfaced where a review
   already exists (read-only). No score is computed here — Safety Rule 3. */
function scoreColor(score: number | null): string {
  if (score == null) return "var(--border-strong)";
  if (score >= 75) return "var(--c-success)";
  if (score >= 60) return "var(--c-info)";
  if (score >= 40) return "var(--c-warning)";
  return "var(--c-danger)";
}

function HealthCard({ state, focusProject }: { state: HealthState; focusProject: Project | null }) {
  if (!focusProject) return null;
  const reviewHref = `/projects/${focusProject.id}/review`;
  const hasReview = typeof state === "object";

  return (
    <Card
      title="Architecture health"
      subtitle={focusProject.name}
      action={
        hasReview ? <OpenLink href={reviewHref} label="AI Review" /> : <Gauge size={15} className="text-fg-subtle" />
      }
    >
      {state === "loading" ? (
        <div className="skel h-[96px] rounded-md" />
      ) : hasReview ? (
        (() => {
          const h = state.analysis.health;
          const color = scoreColor(h.score);
          const pct = Math.max(0, Math.min(100, h.score ?? 0));
          return (
            <div>
              <div className="flex items-end gap-3">
                <span className="text-[40px] font-semibold tabular-nums leading-none" style={{ color }}>
                  {h.score ?? "—"}
                </span>
                <div className="pb-1 min-w-0">
                  <div className="text-[13px] font-medium">{h.label}</div>
                  <div className="text-[11.5px] text-fg-subtle">Grade {h.grade}</div>
                </div>
              </div>
              <div
                className="h-1.5 rounded-full mt-3 overflow-hidden"
                style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
              >
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
              </div>
              <div className="flex items-center gap-2 mt-3 text-[11.5px] text-fg-subtle">
                {state.stale
                  ? <Badge tone="warning">Project changed since this review</Badge>
                  : <Badge tone="success">Current</Badge>}
                <span>Generated {timeAgo(state.generatedAt)}</span>
              </div>
            </div>
          );
        })()
      ) : (
        <div className="text-center py-3">
          <Gauge size={22} className="mx-auto mb-2 text-fg-subtle" />
          <div className="text-[13px] text-fg-muted mb-3">
            No architecture review yet. Run one to get a deterministic health score for {focusProject.name}.
          </div>
          <Link href={reviewHref}>
            <Button size="sm" icon={<ArrowRight size={13} />}>Open AI Review</Button>
          </Link>
        </div>
      )}
    </Card>
  );
}

/* ── Knowledge-graph glimpse (Phase 2) ───────────────────────────────────────
   Reuses GraphCanvas for the focus project on desktop; a link card on mobile. */
function GraphGlimpse({
  focusProject, graph, isDesktop, graphNodeStyle,
}: {
  focusProject: Project | null;
  graph: GraphState;
  isDesktop: boolean;
  graphNodeStyle: "shape" | "color" | "minimal";
}) {
  if (!focusProject) return null;
  const href = `/projects/${focusProject.id}/graph`;
  const data = typeof graph === "object" && graph !== null ? graph : null;

  if (!isDesktop) {
    return (
      <Card title="Knowledge graph" subtitle={focusProject.name} action={<OpenLink href={href} />}>
        <Link
          href={href}
          className="flex items-center gap-3 rounded-md border border-border bg-panel-2 px-3.5 py-3 hover:border-border-strong transition-colors"
        >
          <div className="w-8 h-8 rounded-md bg-accent-soft text-accent grid place-items-center shrink-0">
            <Network size={16} />
          </div>
          <div className="text-[13px] text-fg-muted flex-1 min-w-0">
            Open the interactive knowledge graph for {focusProject.name}.
          </div>
          <ArrowRight size={15} className="text-fg-subtle shrink-0" />
        </Link>
      </Card>
    );
  }

  return (
    <Card
      title="Knowledge graph"
      subtitle={data ? `${data.artifacts.length} nodes · ${data.relations.length} relations` : focusProject.name}
      action={<OpenLink href={href} />}
      padded={false}
    >
      <div style={{ height: 300, position: "relative" }}>
        {graph === "loading" || graph === null ? (
          <div className="h-full skel" />
        ) : graph === "none" || (data && data.artifacts.length === 0) ? (
          <div className="h-full flex items-center justify-center text-fg-muted text-[13px] px-4 text-center">
            No artifacts yet — start building to see the graph.
          </div>
        ) : data ? (
          <GraphCanvas
            artifacts={data.artifacts}
            relations={data.relations}
            nodeStyle={graphNodeStyle}
            storageKey={`project:${focusProject.id}`}
            showMiniMap={false}
            draggable={false}
            minZoom={0.05}
          />
        ) : null}
      </div>
    </Card>
  );
}

/* ── Onboarding (Phase 2) — the actual workflow, for empty accounts ──────────── */
const STEPS: { icon: ReactNode; label: string; desc: string }[] = [
  { icon: <Plus size={16} />, label: "Create a project", desc: "Set up a workspace for your system." },
  { icon: <Box size={16} />, label: "Model artifacts", desc: "Add services, APIs, databases, docs." },
  { icon: <Network size={16} />, label: "Connect relations", desc: "Link artifacts into a knowledge graph." },
  { icon: <Shield size={16} />, label: "Validate", desc: "Run deterministic architecture checks." },
  { icon: <Package size={16} />, label: "Export SSOT", desc: "Generate a single-source-of-truth bundle." },
];

function OnboardingStepper() {
  return (
    <Card
      title="How Minotaurus works"
      subtitle="Five steps from an idea to a validated single source of truth."
      className="mb-6"
    >
      <ol className="grid gap-4 sm:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={i} className="flex sm:flex-col gap-3 sm:gap-2">
            <div className="w-8 h-8 rounded-md bg-accent-soft text-accent grid place-items-center shrink-0">
              {s.icon}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-fg-subtle uppercase tracking-wider">Step {i + 1}</div>
              <div className="text-[13.5px] font-medium">{s.label}</div>
              <div className="text-[12px] text-fg-muted mt-0.5">{s.desc}</div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ProjectCard({ p }: { p: Project }) {
  return (
    <Link
      href={`/projects/${p.id}`}
      className="block bg-panel border border-border rounded-lg p-[18px] hover:border-border-strong transition-colors"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <ProjectMark color={p.color} size={28} seed={p.id} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[14px] tracking-tight truncate">{p.name}</div>
          <div className="text-[12px] text-fg-subtle font-mono truncate">{p.slug}</div>
        </div>
        {p.starred && <Star size={14} className="text-warning shrink-0" />}
      </div>
      <div className="text-fg-muted text-[12.5px] mb-3.5 leading-relaxed line-clamp-2 min-h-[34px]">
        {p.description || "No description"}
      </div>
      <div className="flex items-center gap-3 text-[12px] text-fg-muted">
        <span className="flex items-center gap-1"><Box size={12} />{p.artifactCount}</span>
        <span className="flex items-center gap-1"><Shield size={12} />{p.validationIssueCount}</span>
        <span className="ml-auto text-[11.5px] text-fg-subtle">updated {timeAgo(p.updatedAt)}</span>
      </div>
    </Link>
  );
}

function DemoCallout({ demoProject }: { demoProject: Project }) {
  return (
    <div className="bg-panel border border-border rounded-lg p-4 mb-6 flex items-center gap-4 flex-wrap">
      <div className="w-9 h-9 rounded-md bg-accent-soft text-accent grid place-items-center shrink-0">
        <Sprout size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-[14px]">Sample architecture</span>
          <Badge tone="success">Ready</Badge>
        </div>
        <div className="text-[12.5px] text-fg-muted leading-relaxed">
          Explore <strong className="text-fg">{demoProject.name}</strong> — a sample architecture with
          connected artifacts, validation findings, diagrams, and exportable documentation.
        </div>
      </div>
      <Link href={`/projects/${demoProject.id}`} className="shrink-0">
        <Button icon={<ArrowRight size={14} />}>Open sample project</Button>
      </Link>
    </div>
  );
}

function PlatformIntro() {
  return (
    <Card
      title="What you can build here"
      subtitle="A quick map of the workspace before you create your first project."
      className="mb-6"
    >
      <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-[13.5px] text-fg-muted list-disc list-inside">
        <li><strong className="text-fg">Artifacts</strong> — services, APIs, databases, docs, diagrams (11 typed kinds)</li>
        <li><strong className="text-fg">Relations</strong> — DEPENDS_ON, USES, EXPOSES, SECURES, DOCUMENTS, …</li>
        <li><strong className="text-fg">Documentation</strong> — Markdown per artifact with live preview</li>
        <li><strong className="text-fg">API specs &amp; endpoints</strong> — title, version, base URL, methods, schemas</li>
        <li><strong className="text-fg">Database models</strong> — entities, fields, PK/FK, auto-generated ERD</li>
        <li><strong className="text-fg">Diagrams</strong> — Mermaid editor with live preview and templates</li>
        <li><strong className="text-fg">Validation</strong> — rule-based checks across the above</li>
        <li><strong className="text-fg">Version history &amp; impact</strong> — every change is recorded; per-artifact blast radius</li>
        <li><strong className="text-fg">SSOT export</strong> — JSON or Markdown bundle of the whole project</li>
      </ul>
    </Card>
  );
}

/* SSR-safe media query: false on the server + first paint, then upgrades after
   mount. Used to keep React Flow off mobile. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return matches;
}
