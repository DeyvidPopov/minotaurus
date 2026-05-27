// app/(app)/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Sparkles, Folder, Box, Shield, ChevronRight, Star, Sprout, Terminal, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { ProjectMark } from "@/components/ui/project-mark";
import { Empty } from "@/components/ui/empty";
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
          ) : (
            <>You have <strong className="text-fg">{totalIssues} open validation issues</strong> across {projects.length} projects.</>
          )
        }
        actions={<>
          <Button icon={<Sparkles size={14} />}>Ask Minotaurus</Button>
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

      <div className="flex items-center mb-3">
        <h2 className="m-0 text-base font-semibold tracking-tight">Your projects</h2>
        <div className="flex-1" />
        <Link href="/projects" className="text-[12.5px] text-fg-muted hover:text-fg flex items-center gap-1">View all <ChevronRight size={12} /></Link>
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
