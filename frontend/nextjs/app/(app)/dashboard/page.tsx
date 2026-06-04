// app/(app)/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Folder, Box, Shield, Star, Sprout, Terminal, ArrowRight, Network } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { ProjectMark } from "@/components/ui/project-mark";
import { Empty } from "@/components/ui/empty";
import { OpenLink } from "@/components/ui/open-link";
import { projectsApi } from "@/lib/api/projects";
import { useAuth } from "@/lib/auth-context";
import { timeAgo } from "@/lib/utils";
import type { Project } from "@/lib/types";

const DEMO_PROJECT_NAME = "Online Shop Platform";

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => setProjects([]));
  }, []);

  const totalArtifacts = (projects ?? []).reduce((s, p) => s + p.artifactCount, 0);
  const totalIssues = (projects ?? []).reduce((s, p) => s + p.validationIssueCount, 0);
  const demoProject = useMemo(
    () => (projects ?? []).find((p) => p.name === DEMO_PROJECT_NAME) ?? null,
    [projects],
  );

  return (
    <div className="px-8 py-7 max-w-[1320px] mx-auto">
      <PageHeader
        title={user ? `Welcome, ${user.firstName}` : "Welcome"}
        subtitle={
          projects === null ? (
            <>Loading your workspace…</>
          ) : projects.length === 0 ? (
            <>Start by creating a project, or load the demo dataset to explore an example architecture.</>
          ) : (
            <>You have <strong className="text-fg">{totalIssues} open validation issue{totalIssues === 1 ? "" : "s"}</strong> across {projects.length} project{projects.length === 1 ? "" : "s"}.</>
          )
        }
        actions={<>
          <Link href="/projects"><Button icon={<Network size={14} />}>All projects</Button></Link>
          <Link href="/projects/new"><Button variant="primary" icon={<Plus size={14} />}>New project</Button></Link>
        </>}
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat label="Projects"    value={projects?.length ?? 0} icon={<Folder size={13} />} />
        <Stat label="Artifacts"   value={totalArtifacts}        icon={<Box size={13} />} />
        <Stat label="Open issues" value={totalIssues}           icon={<Shield size={13} />} />
      </div>

      {projects !== null && (
        <DemoCallout demoProject={demoProject} />
      )}

      {projects !== null && projects.length === 0 && (
        <Card title="What does Minotaurus do?" subtitle="A quick map of the workspace before you create your first project." className="mb-6">
          <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-[13.5px] text-fg-muted list-disc list-inside">
            <li><strong className="text-fg">Artifacts</strong> — services, APIs, databases, docs, diagrams (11 typed kinds)</li>
            <li><strong className="text-fg">Relations</strong> — DEPENDS_ON, USES, EXPOSES, SECURES, DOCUMENTS, …</li>
            <li><strong className="text-fg">Documentation</strong> — Markdown per artifact with live preview</li>
            <li><strong className="text-fg">API specs &amp; endpoints</strong> — title, version, base URL, methods, schemas</li>
            <li><strong className="text-fg">Database models</strong> — entities, fields, PK/FK, auto-generated Mermaid ERD</li>
            <li><strong className="text-fg">Diagrams</strong> — Mermaid editor with live preview and templates</li>
            <li><strong className="text-fg">Validation</strong> — rule-based checks across the above</li>
            <li><strong className="text-fg">Version history &amp; impact</strong> — every CUD is recorded; per-artifact blast radius</li>
            <li><strong className="text-fg">SSOT export</strong> — JSON or Markdown bundle of the whole project</li>
            <li><strong className="text-fg">Manual modelling only</strong> — no auto-import from repos or files (yet)</li>
          </ul>
        </Card>
      )}

      <div className="flex items-center mb-3">
        <h2 className="m-0 text-base font-semibold tracking-tight">Your projects</h2>
        <div className="flex-1" />
        <OpenLink href="/projects" label="View all" />
      </div>

      {projects && projects.length === 0 ? (
        <Card>
          <Empty
            title="No projects yet"
            message="Create your first project to start documenting your architecture."
            action={<Link href="/projects/new"><Button variant="primary" icon={<Plus size={14} />}>New project</Button></Link>}
          />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(projects ?? []).map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="block bg-panel border border-border rounded-lg p-[18px] hover:border-border-strong transition-colors">
              <div className="flex items-center gap-2.5 mb-3">
                <ProjectMark color={p.color} size={28} letter={p.name[0]?.toUpperCase() || "P"} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[14px] tracking-tight">{p.name}</div>
                  <div className="text-[12px] text-fg-subtle font-mono truncate">{p.slug}</div>
                </div>
                {p.starred && <Star size={14} className="text-warning" />}
              </div>
              <div className="text-fg-muted text-[12.5px] mb-3.5 leading-relaxed min-h-8">{p.description || "No description"}</div>
              <div className="flex items-center gap-3 text-[12px] text-fg-muted">
                <span className="flex items-center gap-1"><Box size={12} />{p.artifactCount}</span>
                <span className="flex items-center gap-1"><Shield size={12} />{p.validationIssueCount}</span>
                <span className="ml-auto text-[11.5px] text-fg-subtle">updated {timeAgo(p.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function DemoCallout({ demoProject }: { demoProject: Project | null }) {
  if (demoProject) {
    return (
      <div className="bg-panel border border-border rounded-lg p-4 mb-6 flex items-center gap-4 flex-wrap">
        <div className="w-9 h-9 rounded-md bg-accent-soft text-accent grid place-items-center">
          <Sprout size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-[14px]">Demo project</span>
            <Badge tone="success">Loaded</Badge>
          </div>
          <div className="text-[12.5px] text-fg-muted leading-relaxed">
            <strong className="text-fg">{demoProject.name}</strong> is seeded with 10 artifacts, 10 relations,
            four documented services, a deliberate deprecated-dependency error, and one JSON + one Markdown SSOT export.
          </div>
        </div>
        <Link href={`/projects/${demoProject.id}`}>
          <Button variant="primary" icon={<ArrowRight size={14} />}>Open Demo Project</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-border rounded-lg p-4 mb-6 flex items-center gap-4 flex-wrap">
      <div className="w-9 h-9 rounded-md bg-accent-soft text-accent grid place-items-center">
        <Terminal size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-[14px]">Demo project missing</span>
        </div>
        <div className="text-[12.5px] text-fg-muted leading-relaxed">
          Run <code className="font-mono bg-panel-2 border border-border rounded px-1 py-0.5 text-[12px]">npm run seed</code> in the <code className="font-mono bg-panel-2 border border-border rounded px-1 py-0.5 text-[12px]">backend</code> directory to load the <strong className="text-fg">{DEMO_PROJECT_NAME}</strong> walkthrough,
          then restart the backend so the new data is loaded.
        </div>
      </div>
    </div>
  );
}
