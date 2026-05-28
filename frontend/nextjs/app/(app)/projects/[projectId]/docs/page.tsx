// app/(app)/projects/[projectId]/docs/page.tsx — Documentation Hub
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus, ExternalLink, FileText, Info } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { TypeChip } from "@/components/ui/type-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Empty } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { projectsApi } from "@/lib/api/projects";
import { documentationApi, type DocumentationOverview } from "@/lib/api/documentation";
import { ApiError } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils";
import type { Project } from "@/lib/types";

type Filter = "all" | "documented" | "missing";

export default function DocumentationHubPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [project, setProject] = useState<Project | null>(null);
  const [overview, setOverview] = useState<DocumentationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, o] = await Promise.all([
          projectsApi.get(projectId),
          documentationApi.overview(projectId),
        ]);
        if (cancelled) return;
        setProject(p);
        setOverview(o);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "Failed to load documentation";
        setError(message);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const matchedDocuments = useMemo(() => {
    if (!overview) return [];
    const q = query.trim().toLowerCase();
    return overview.documents.filter((d) =>
      !q || d.artifactTitle.toLowerCase().includes(q) || d.excerpt.toLowerCase().includes(q),
    );
  }, [overview, query]);

  const matchedMissing = useMemo(() => {
    if (!overview) return [];
    const q = query.trim().toLowerCase();
    return overview.missing.filter((m) => !q || m.artifactTitle.toLowerCase().includes(q));
  }, [overview, query]);

  if (error) {
    return (
      <div className="px-8 py-6">
        <Empty title="Documentation unavailable" message={error} />
      </div>
    );
  }
  if (!project || !overview) {
    return <div className="px-8 py-6 text-fg-muted">Loading…</div>;
  }

  const { summary } = overview;
  const showDocuments = filter !== "missing";
  const showMissing = filter !== "documented";

  return (
    <div className="px-8 py-6">
      <PageHeader
        title={
          <div>
            <h1 className="text-2xl font-semibold tracking-tight m-0 flex items-center gap-2.5">
              <BookOpen size={22} className="text-accent" />
              Documentation
              <span className="text-fg-muted text-[14px] font-normal">{project.name}</span>
            </h1>
            <div className="text-fg-muted text-[13.5px] mt-1">
              {summary.coveragePercent}% coverage · {summary.documentedArtifacts} of {summary.totalArtifacts} artifacts documented
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
        <Stat label="Total artifacts" value={summary.totalArtifacts} icon={<FileText size={12} />} />
        <Stat label="Documented" value={summary.documentedArtifacts} />
        <Stat label="Missing" value={summary.missingDocumentation} />
        <Stat label="Coverage" value={`${summary.coveragePercent}%`} />
      </div>

      <div className="bg-panel-2 border border-border rounded-md px-3.5 py-2 mb-5 flex items-start gap-2 text-[12.5px] text-fg-muted">
        <Info size={13} className="mt-0.5 shrink-0" />
        <div>
          Documentation is stored on each artifact (one Markdown page per artifact). Run validation to surface
          DOCUMENTATION-type artifacts that have empty bodies.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by title…" className="flex-1 min-w-[260px] max-w-[420px]" />
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all",        label: `All (${summary.totalArtifacts})` },
            { value: "documented", label: `Documented (${summary.documentedArtifacts})` },
            { value: "missing",    label: `Missing (${summary.missingDocumentation})` },
          ]}
        />
      </div>

      {summary.totalArtifacts === 0 && (
        <Empty
          title="No artifacts yet"
          message="Create your first artifact, then add documentation from its Documentation tab."
        />
      )}

      {summary.totalArtifacts > 0 && summary.documentedArtifacts === 0 && summary.missingDocumentation > 0 && filter === "all" && (
        <div className="mb-5">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-accent-soft text-accent grid place-items-center">
                <BookOpen size={16} />
              </div>
              <div className="flex-1">
                <div className="text-[13.5px] font-medium">No documentation yet</div>
                <div className="text-[12.5px] text-fg-muted">Pick any artifact below and open its Documentation tab to start writing.</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {showDocuments && (
        <section className="mb-7">
          <SectionHeader
            title="Documented artifacts"
            count={matchedDocuments.length}
            total={summary.documentedArtifacts}
          />
          {matchedDocuments.length === 0 ? (
            <Empty
              title={summary.documentedArtifacts === 0 ? "Nothing documented yet" : "No matches"}
              message={summary.documentedArtifacts === 0
                ? "Open an artifact and use its Documentation tab to write a Markdown page."
                : "No documented artifacts match your search."}
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {matchedDocuments.map((d) => (
                <Card key={d.artifactId}>
                  <div className="flex items-start gap-2.5 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold truncate">{d.artifactTitle}</div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <TypeChip type={d.artifactType} />
                        <StatusBadge status={d.artifactStatus} />
                      </div>
                    </div>
                  </div>
                  <p className="text-[13px] text-fg leading-relaxed mb-3 min-h-[2.5em]">
                    {d.excerpt || <span className="text-fg-muted italic">No prose excerpt — the doc may be header-only.</span>}
                  </p>
                  <div className="flex items-center gap-2 text-[11.5px] text-fg-subtle mb-3">
                    Updated {timeAgo(d.updatedAt)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/projects/${projectId}/artifacts/${d.artifactId}?tab=documentation`}>
                      <Button size="sm" variant="primary" icon={<BookOpen size={13} />}>Open documentation</Button>
                    </Link>
                    <Link href={`/projects/${projectId}/artifacts/${d.artifactId}`}>
                      <Button size="sm" variant="ghost" icon={<ExternalLink size={13} />}>Open artifact</Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {showMissing && (
        <section className="mb-7">
          <SectionHeader
            title="Missing documentation"
            count={matchedMissing.length}
            total={summary.missingDocumentation}
          />
          {matchedMissing.length === 0 ? (
            <Empty
              title={summary.missingDocumentation === 0 ? "All artifacts documented" : "No matches"}
              message={summary.missingDocumentation === 0
                ? "Every artifact in this project has documentation. Nice."
                : "Every artifact missing docs is already filtered out by your search."}
            />
          ) : (
            <Card padded={false}>
              <ul className="divide-y divide-border">
                {matchedMissing.map((m) => (
                  <li key={m.artifactId} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium truncate">{m.artifactTitle}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <TypeChip type={m.artifactType} />
                        <StatusBadge status={m.artifactStatus} />
                      </div>
                    </div>
                    <Link href={`/projects/${projectId}/artifacts/${m.artifactId}?tab=documentation`}>
                      <Button size="sm" icon={<Plus size={13} />}>Add documentation</Button>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}

function SectionHeader({ title, count, total }: { title: string; count: number; total: number }) {
  const showFiltered = count !== total;
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[15px] font-semibold tracking-tight m-0">{title}</h2>
      <span className="text-[12px] text-fg-muted">
        {showFiltered ? `${count} of ${total}` : `${total}`}
      </span>
    </div>
  );
}
