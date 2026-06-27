// app/(app)/projects/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Select, type SelectOption } from "@/components/ui/select";
import { ProjectMark } from "@/components/ui/project-mark";
import { Empty } from "@/components/ui/empty";
import { projectsApi } from "@/lib/api/projects";
import { timeAgo } from "@/lib/utils";
import type { Project } from "@/lib/types";
import ProjectsSkeleton from "./skeleton";

const SORTS: SelectOption[] = [
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name" },
  { value: "attention", label: "Needs attention" },
  { value: "issues", label: "Most issues" },
];

export default function ProjectsPage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("updated");
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    projectsApi.list().then(setProjects).catch(() => setProjects([]));
  }, []);

  if (projects === null) return <ProjectsSkeleton />;

  const items = projects ?? [];
  const ql = q.trim().toLowerCase();
  const list = items.filter(
    (p) =>
      !ql ||
      p.name.toLowerCase().includes(ql) ||
      p.slug.toLowerCase().includes(ql) ||
      p.description.toLowerCase().includes(ql),
  );
  list.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "issues") return b.validationIssueCount - a.validationIssueCount || a.name.localeCompare(b.name);
    if (sort === "attention") {
      // Triage order: projects with open issues first, then by issue count, then recency.
      const ah = a.validationIssueCount > 0 ? 1 : 0;
      const bh = b.validationIssueCount > 0 ? 1 : 0;
      if (ah !== bh) return bh - ah;
      if (b.validationIssueCount !== a.validationIssueCount) return b.validationIssueCount - a.validationIssueCount;
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const isEmpty = projects !== null && projects.length === 0;
  const hasProjects = projects !== null && projects.length > 0;

  return (
    <div className="page-shell">
      <PageHeader
        title="Projects"
        subtitle={
          projects === null
            ? "Loading…"
            : `${items.length} project${items.length === 1 ? "" : "s"} · ${items.reduce((s, p) => s + p.artifactCount, 0)} artifacts`
        }
      />

      {isEmpty && (
        <Empty
          title="No projects yet"
          message="Get started by creating your first project."
          action={<Link href="/projects/new"><Button variant="primary">New project</Button></Link>}
        />
      )}

      {hasProjects && (
        <>
          {/* Toolbar — mobile: search full-width on its own row, then [ sort ] [ new ].
              Desktop: search grows, sort + new stay compact on one row. */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 mb-5">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search by name, slug, or description…"
              className="w-full lg:flex-1 lg:max-w-md"
            />
            <div className="flex items-center gap-2.5 lg:ml-auto">
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                options={SORTS}
                aria-label="Sort projects"
                className="flex-1 lg:flex-none lg:w-[180px]"
              />
              <Link href="/projects/new" className="shrink-0">
                <Button variant="primary" className="h-9">New project</Button>
              </Link>
            </div>
          </div>

          {list.length === 0 ? (
            <Empty title="No matches" message={`No projects match “${q}”.`} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {list.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="block bg-panel border border-border rounded-lg p-[18px] hover:border-border-strong transition-colors"
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <ProjectMark color={p.color} size={32} seed={p.id} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[14.5px] tracking-tight truncate">{p.name}</div>
                      <div className="text-[12px] text-fg-subtle font-mono truncate">{p.slug}</div>
                    </div>
                  </div>
                  <div className="text-fg-muted text-[13px] mb-4 leading-relaxed line-clamp-3 h-[60px]">{p.description || "No description"}</div>
                  <div className="grid grid-cols-2 gap-2.5 mb-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1">Artifacts</div>
                      <div className="text-base font-semibold">{p.artifactCount}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1">Issues</div>
                      <div className={`text-base font-semibold ${p.validationIssueCount > 0 ? "text-warning" : ""}`}>{p.validationIssueCount}</div>
                    </div>
                  </div>
                  <hr className="border-border" />
                  <div className="flex items-center justify-end mt-3">
                    <span className="text-[11.5px] text-fg-subtle">updated {timeAgo(p.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
