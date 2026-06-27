// app/(app)/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Plus, Folder, Box, Shield, Activity, Users, Star, RotateCw,
  ChevronRight, Network, Package,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { ProjectMark } from "@/components/ui/project-mark";
import { Empty } from "@/components/ui/empty";
import { OpenLink } from "@/components/ui/open-link";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { projectsApi } from "@/lib/api/projects";
import { dashboardApi, type DashboardSummary, type DashboardTrendStat } from "@/lib/api/dashboard";
import { versionsApi, type VersionEvent } from "@/lib/api/versions";
import { ActivityRow } from "@/components/activity/activity-row";
import { groupActivityRuns } from "@/lib/activity";
import { useAuth } from "@/lib/auth-context";
import { timeAgo } from "@/lib/utils";
import type { Project } from "@/lib/types";

const RECENT_LIMIT = 6;
const ACTIVITY_PROJECTS = 5;
const ACTIVITY_LIMIT = 8;
// Fetched per project before consecutive validation runs are collapsed — a
// generous window so non-validation events can backfill the rows a collapsed
// run frees (otherwise a burst of reruns could be all that's fetched).
const ACTIVITY_FETCH_PER_PROJECT = 15;

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<VersionEvent[] | null>(null);
  const [activityNonce, setActivityNonce] = useState(0);
  const greeting = useGreeting();

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => setProjects([]));
    dashboardApi.summary().then(setSummary).catch(() => setSummary(null));
  }, []);

  const recent = useMemo(
    () =>
      [...(projects ?? [])].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [projects],
  );
  const gridProjects = useMemo(
    () => [...recent].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0)).slice(0, RECENT_LIMIT),
    [recent],
  );
  const projectsById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects ?? []) m.set(p.id, p);
    return m;
  }, [projects]);

  // Cross-project activity — merged client-side from per-project version history
  // (no global feed endpoint by design), bounded to the most recent projects.
  // Stored sorted-but-ungrouped; RecentActivity collapses consecutive runs and
  // caps to ACTIVITY_LIMIT rows (so collapsing can backfill freed slots).
  useEffect(() => {
    if (!projects) return;
    if (projects.length === 0) { setActivity([]); return; }
    let cancelled = false;
    setActivity(null);
    const top = recent.slice(0, ACTIVITY_PROJECTS);
    Promise.all(top.map((p) => versionsApi.list(p.id, { limit: ACTIVITY_FETCH_PER_PROJECT }).catch(() => [] as VersionEvent[])))
      .then((lists) => {
        if (cancelled) return;
        setActivity(
          lists.flat()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        );
      })
      .catch(() => { if (!cancelled) setActivity([]); });
    return () => { cancelled = true; };
  }, [projects, recent, activityNonce]);

  const totalIssues = (projects ?? []).reduce((s, p) => s + p.validationIssueCount, 0);
  const isEmpty = projects !== null && projects.length === 0;
  const hasProjects = projects !== null && projects.length > 0;

  return (
    <div className="page-shell">
      <PageHeader
        title={`${greeting}${user ? `, ${user.firstName}` : ""}`}
        subtitle={
          isEmpty
            ? "Your single source of truth for system architecture, validation, and traceability."
            : projects === null
              ? "Loading your workspace…"
              : <>You have <strong className="text-fg">{totalIssues} open validation issue{totalIssues === 1 ? "" : "s"}</strong> across {projects.length} project{projects.length === 1 ? "" : "s"}.</>
        }
        actions={
          isEmpty ? undefined : (
            <Link href="/projects/new">
              <Button variant="primary">New project</Button>
            </Link>
          )
        }
      />

      {projects === null && <StatSkeleton />}
      {hasProjects && <StatBand summary={summary} projects={projects} totalIssues={totalIssues} />}

      {isEmpty && <OnboardingStepper />}
      {isEmpty && <PlatformIntro />}

      {hasProjects && (
        <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
          <div className="flex flex-col gap-6 min-w-0">
            <section>
              <div className="flex items-center mb-3">
                <h2 className="m-0 text-base font-semibold tracking-tight">Your projects</h2>
                <div className="flex-1" />
                <OpenLink href="/projects" label="View all" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {gridProjects.map((p) => <ProjectCard key={p.id} p={p} />)}
              </div>
            </section>

            <ValidationTable summary={summary} projects={projects} projectsById={projectsById} />
          </div>

          <div className="flex flex-col gap-5 min-w-0">
            <RecentActivity
              events={activity}
              projectsById={projectsById}
              onRefresh={() => setActivityNonce((n) => n + 1)}
            />
            <TipsCard />
          </div>
        </div>
      )}

      {isEmpty && (
        <>
          <div className="flex items-center mb-3 mt-6">
            <h2 className="m-0 text-base font-semibold tracking-tight">Recent projects</h2>
          </div>
          <Card>
            <Empty
              title="No projects yet"
              message="Create your first project to start documenting your architecture."
              action={
                <Link href="/projects/new">
                  <Button variant="primary">New project</Button>
                </Link>
              }
            />
          </Card>
        </>
      )}
    </div>
  );
}

/* ── Stat band (real trends) ─────────────────────────────────────────────────
   Uses the deterministic /dashboard/summary trends when available; falls back
   to live counts from the project list (no spark/delta) so the band is never
   blank or fabricated. */
function StatBand({
  summary, projects, totalIssues,
}: {
  summary: DashboardSummary | null;
  projects: Project[];
  totalIssues: number;
}) {
  const s = summary?.stats;
  const totalArtifacts = projects.reduce((acc, p) => acc + p.artifactCount, 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      <Stat
        label="Projects" icon={<Folder size={13} />} value={s?.projects.total ?? projects.length}
        {...trendProps(s?.projects, true)}
      />
      <Stat
        label="Artifacts" icon={<Box size={13} />} value={s?.artifacts.total ?? totalArtifacts}
        {...trendProps(s?.artifacts, true)}
      />
      <Stat
        label="Open issues" icon={<Shield size={13} />} value={s?.openIssues.total ?? totalIssues}
        {...trendProps(s?.openIssues, false)}
      />
      <Stat
        label="Changes" icon={<Activity size={13} />} value={s?.changes.total ?? "—"}
        delta={s ? "last 7 days" : undefined} deltaDir="flat" spark={s?.changes.spark}
      />
    </div>
  );
}

// Build the delta label + direction for a trend tile. `goodWhenUp` keeps the
// green up-arrow off metrics where "more" is bad (open issues stay neutral).
function trendProps(
  t: DashboardTrendStat | undefined,
  goodWhenUp: boolean,
): { delta?: string; deltaDir: "up" | "dn" | "flat"; spark?: number[] } {
  if (!t) return { deltaDir: "flat" };
  const unit = t.deltaUnit === "month" ? "this month" : "this week";
  if (t.delta <= 0) return { delta: `No change ${unit}`, deltaDir: "flat", spark: t.spark };
  return {
    delta: `+${t.delta} ${goodWhenUp ? "" : "new "}${unit}`,
    deltaDir: goodWhenUp ? "up" : "flat",
    spark: t.spark,
  };
}

function StatSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {[0, 1, 2, 3].map((i) => <div key={i} className="skel border border-border rounded-lg h-[92px]" />)}
    </div>
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
        <span className="flex items-center gap-1" title="Artifacts"><Box size={12} />{p.artifactCount}</span>
        <span className="flex items-center gap-1" title="Open issues"><Shield size={12} />{p.validationIssueCount}</span>
        <span className="flex items-center gap-1" title="Members"><Users size={12} />{p.members}</span>
        <span className="ml-auto text-[11.5px] text-fg-subtle">updated {timeAgo(p.updatedAt)}</span>
      </div>
    </Link>
  );
}

/* ── Validation by project (per-project severity table) ─────────────────────── */
function ValidationTable({
  summary, projects, projectsById,
}: {
  summary: DashboardSummary | null;
  projects: Project[];
  projectsById: Map<string, Project>;
}) {
  const severityKnown = summary != null;
  const rows = useMemo(() => {
    const base = summary
      ? summary.validationByProject
      : projects.map((p) => ({ projectId: p.id, open: p.validationIssueCount, critical: 0, error: 0, warning: 0, info: 0 }));
    return [...base].sort((a, b) => b.open - a.open);
  }, [summary, projects]);

  return (
    <Card title="Validation by project" subtitle={`${rows.length} project${rows.length === 1 ? "" : "s"}`} padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-fg-subtle border-b border-border">
              <th className="text-left font-medium px-3.5 py-2.5">Project</th>
              <th className="text-center font-medium px-2 py-2.5">Open</th>
              <th className="text-center font-medium px-2 py-2.5">Critical</th>
              <th className="text-center font-medium px-2 py-2.5">Errors</th>
              <th className="text-center font-medium px-2 py-2.5">Warnings</th>
              <th className="text-center font-medium px-2 py-2.5">Info</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = projectsById.get(r.projectId);
              return (
                <tr key={r.projectId} className="border-b border-border last:border-0 hover:bg-panel-hover transition-colors">
                  <td className="px-3.5 py-2.5">
                    <Link href={`/projects/${r.projectId}/validation`} className="flex items-center gap-2 min-w-0">
                      <ProjectMark color={p?.color ?? "var(--accent)"} size={18} seed={r.projectId} />
                      <span className="truncate font-medium">{p?.name ?? "Project"}</span>
                    </Link>
                  </td>
                  <td className="text-center px-2 py-2.5 font-semibold tabular-nums" style={{ color: r.open > 0 ? "var(--fg)" : "var(--fg-subtle)" }}>{r.open}</td>
                  <Num n={r.critical} known={severityKnown} tone="danger" />
                  <Num n={r.error} known={severityKnown} tone="danger" />
                  <Num n={r.warning} known={severityKnown} tone="warning" />
                  <Num n={r.info} known={severityKnown} tone="info" />
                  <td className="text-center px-2 py-2.5">
                    <Link href={`/projects/${r.projectId}/validation`} className="inline-flex text-fg-subtle hover:text-fg">
                      <ChevronRight size={15} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Num({ n, known, tone }: { n: number; known: boolean; tone: "danger" | "warning" | "info" }) {
  if (!known) return <td className="text-center px-2 py-2.5 text-fg-subtle tabular-nums">·</td>;
  const color = n > 0
    ? tone === "danger" ? "var(--c-danger)" : tone === "warning" ? "var(--c-warning)" : "var(--c-info)"
    : "var(--fg-subtle)";
  return <td className="text-center px-2 py-2.5 tabular-nums" style={{ color }}>{n}</td>;
}

/* ── Recent activity (cross-project) ─────────────────────────────────────────── */

function RecentActivity({
  events, projectsById, onRefresh,
}: {
  events: VersionEvent[] | null;
  projectsById: Map<string, Project>;
  onRefresh: () => void;
}) {
  // Collapse consecutive validation reruns (same actor + project) into one row,
  // then cap to ACTIVITY_LIMIT rows — so a burst of reruns no longer crowds out
  // other activity (the shared lib/activity helper keeps this in step with the
  // project Overview's "Recent changes" timeline).
  const rows = useMemo(
    () => (events ? groupActivityRuns(events).slice(0, ACTIVITY_LIMIT) : null),
    [events],
  );
  return (
    <Card
      title="Recent activity"
      subtitle={rows === null ? "Loading…" : rows.length === 0 ? "No activity yet" : "Across your most recent projects"}
      action={
        <button onClick={onRefresh} aria-label="Refresh activity" className="text-fg-subtle hover:text-fg inline-flex p-0.5">
          <RotateCw size={14} />
        </button>
      }
      padded={false}
    >
      {rows === null ? (
        <div className="px-3.5 py-3 flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skel h-9 rounded-md" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-7 text-center text-fg-muted text-[13px]">
          Changes you make across projects will show up here.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((g) => {
            const project = projectsById.get(g.event.projectId);
            return (
              <ActivityRow
                key={g.event.id}
                event={g.event}
                count={g.count}
                href={`/projects/${g.event.projectId}/versions`}
                secondary={project ? (
                  <span className="text-[11.5px] text-fg-subtle flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: project.color }} aria-hidden />
                    <span className="truncate max-w-[150px]">{project.name}</span>
                  </span>
                ) : undefined}
              />
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function TipsCard() {
  return (
    <Card title="Tips">
      <div className="flex flex-col gap-2.5 text-[13px] text-fg-muted leading-relaxed">
        <div>
          Press <ShortcutHint className="kbd" /> to jump to any artifact, endpoint, or page.
          Minotaurus indexes everything you write.
        </div>
        <div>
          Reorder a database model&rsquo;s fields by pressing and holding a field row, then
          dragging it up or down — the new order saves automatically.
        </div>
      </div>
    </Card>
  );
}

/* ── Empty-state onboarding ──────────────────────────────────────────────────── */
const STEPS: { icon: ReactNode; label: string; desc: string }[] = [
  { icon: <Plus size={16} />, label: "Create a project", desc: "Set up a workspace for your system." },
  { icon: <Box size={16} />, label: "Model artifacts", desc: "Add services, APIs, databases, docs." },
  { icon: <Network size={16} />, label: "Connect relations", desc: "Link artifacts into a knowledge graph." },
  { icon: <Shield size={16} />, label: "Validate", desc: "Run deterministic architecture checks." },
  { icon: <Package size={16} />, label: "Export SSOT", desc: "Generate a single-source-of-truth bundle." },
];

function OnboardingStepper() {
  return (
    <Card title="How Minotaurus works" subtitle="Five steps from an idea to a validated single source of truth." className="mb-6">
      <ol className="grid gap-4 sm:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={i} className="flex sm:flex-col gap-3 sm:gap-2">
            <div className="w-8 h-8 rounded-md bg-accent-soft text-accent grid place-items-center shrink-0">{s.icon}</div>
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

function PlatformIntro() {
  return (
    <Card title="What you can build here" subtitle="A quick map of the workspace before you create your first project." className="mb-6">
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

// Time-of-day greeting computed after mount to avoid an SSR/client hour mismatch.
function useGreeting(): string {
  const [g, setG] = useState("Welcome");
  useEffect(() => {
    const h = new Date().getHours();
    setG(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);
  return g;
}
