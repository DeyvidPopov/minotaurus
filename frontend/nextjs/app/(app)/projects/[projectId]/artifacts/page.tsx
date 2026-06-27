// app/(app)/projects/[projectId]/artifacts/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Unlink, Network, Link2, X } from "lucide-react";
import { PageHeader, FILL_ACTIONS_MOBILE } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Card } from "@/components/ui/card";
import { TypeChip } from "@/components/ui/type-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { ARTIFACT_TYPES, TYPE_INFO } from "@/lib/mock-data";
import { artifactsApi } from "@/lib/api/artifacts";
import { projectsApi } from "@/lib/api/projects";
import { timeAgo } from "@/lib/utils";
import type { Artifact, Project } from "@/lib/types";
import ArtifactsSkeleton from "./skeleton";

// A relation count is interpreted with two conservative architecture signals:
// 0 → "Orphan" (nothing links to it), >= HUB_THRESHOLD → "Hub" (highly
// connected). Counts in between get no badge. Uses only the existing
// relationCount — no graph analytics, no backend calc.
const HUB_THRESHOLD = 5;

type SortKey = "attention" | "updated" | "name" | "issues" | "relations";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "attention", label: "Needs attention" },
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name (A–Z)" },
  { value: "issues", label: "Most issues" },
  { value: "relations", label: "Most relations" },
];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  DEPRECATED: "Deprecated",
};

const issuesOf = (a: Artifact) => a.validationIssueCount ?? 0;
const relationsOf = (a: Artifact) => a.relationCount ?? 0;
const updatedMs = (a: Artifact) => {
  const t = new Date(a.updatedAt).getTime();
  return Number.isFinite(t) ? t : 0;
};

// Seed/import filler such as "Public Web App — testbed artifact." (or
// "— testbed model./spec./diagram.") repeats the title and says nothing. We
// also treat an empty string or a bare title-echo as filler. Conservative on
// purpose: a real, informative description never matches and is always shown.
function isFillerDescription(title: string, description: string): boolean {
  const d = description.trim();
  if (!d) return true;
  const t = title.trim().toLowerCase();
  const dl = d.toLowerCase();
  if (dl === t) return true;
  if (dl.startsWith(t) && /—\s*testbed\s+\w+\.?$/i.test(d)) return true;
  return false;
}

function exactTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function sortArtifacts(list: Artifact[], key: SortKey): Artifact[] {
  const byTitle = (a: Artifact, b: Artifact) => a.title.localeCompare(b.title);
  const copy = [...list];
  switch (key) {
    case "name":
      return copy.sort(byTitle);
    case "updated":
      return copy.sort((a, b) => updatedMs(b) - updatedMs(a) || byTitle(a, b));
    case "issues":
      return copy.sort((a, b) => issuesOf(b) - issuesOf(a) || byTitle(a, b));
    case "relations":
      return copy.sort((a, b) => relationsOf(b) - relationsOf(a) || byTitle(a, b));
    case "attention":
    default:
      // Risk-first: most issues, then orphans (0 relations), then most-recent.
      return copy.sort((a, b) => {
        const di = issuesOf(b) - issuesOf(a);
        if (di) return di;
        const orphanA = relationsOf(a) === 0 ? 0 : 1;
        const orphanB = relationsOf(b) === 0 ? 0 : 1;
        if (orphanA !== orphanB) return orphanA - orphanB;
        return updatedMs(b) - updatedMs(a) || byTitle(a, b);
      });
  }
}

function RelationSignal({ count }: { count: number }) {
  if (count === 0)
    return (
      <Badge tone="default">
        <Unlink size={10} aria-hidden="true" />
        Orphan
      </Badge>
    );
  if (count >= HUB_THRESHOLD)
    return (
      <Badge tone="info">
        <Network size={10} aria-hidden="true" />
        Hub
      </Badge>
    );
  return null;
}

function IssueBadge({ count }: { count: number }) {
  return (
    <Badge tone="warning">
      <AlertTriangle size={11} aria-hidden="true" />
      {count}
    </Badge>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 h-6 pl-2 pr-1.5 rounded-full border border-border bg-panel-2 text-[11.5px] text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
    >
      <span>{label}</span>
      <X size={11} aria-hidden="true" />
    </button>
  );
}

export default function ArtifactsListPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);

  const [type, setType] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("attention");

  useEffect(() => {
    projectsApi.get(projectId).then(setProject).catch(() => setProject(null));
    artifactsApi.list(projectId).then(setArtifacts).catch(() => setArtifacts([]));
  }, [projectId]);

  const items = artifacts ?? [];

  // Data-driven: only worth a column when more than one person authored.
  // Keyed on the stable `artifacts` ref so it doesn't recompute every render.
  const showAuthor = useMemo(
    () => new Set((artifacts ?? []).map((a) => a.author.id)).size > 1,
    [artifacts],
  );

  const term = q.trim().toLowerCase();
  // Memoize the filter + sort so they only recompute when their inputs change,
  // instead of on every render (e.g. a row hover / unrelated state update).
  const filtered = useMemo(
    () =>
      (artifacts ?? []).filter((a) => {
        if (type !== "ALL" && a.type !== type) return false;
        if (status !== "ALL" && a.status !== status) return false;
        if (!term) return true;
        return (
          a.title.toLowerCase().includes(term) ||
          a.description.toLowerCase().includes(term) ||
          a.type.toLowerCase().includes(term) ||
          TYPE_INFO[a.type].label.toLowerCase().includes(term)
        );
      }),
    [artifacts, type, status, term],
  );
  const list = useMemo(() => sortArtifacts(filtered, sort), [filtered, sort]);

  if (artifacts === null) return <ArtifactsSkeleton />;

  const hasActiveFilters = type !== "ALL" || status !== "ALL" || term !== "";
  const clearAll = () => {
    setType("ALL");
    setStatus("ALL");
    setQ("");
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Artifacts"
        subtitle={
          artifacts === null
            ? "Loading…"
            : `Showing ${list.length} of ${items.length} artifacts`
        }
      />

      {/* Toolbar — a full-width row below the header (not in PageHeader's actions),
          so the many controls never get squeezed beside the title at medium widths.
          Search grows to fill; filters + New flow to the right and wrap as needed. */}
      <div className={`flex flex-wrap items-center gap-2.5 mb-4 ${FILL_ACTIONS_MOBILE}`}>
        <SearchInput value={q} onChange={setQ} placeholder="Search by name, type, or description…" className="w-full sm:flex-1 sm:min-w-[200px]" />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Filter by type"
          className="h-8 px-2.5 pr-7 bg-panel border border-border rounded-sm text-[13.5px]"
        >
          <option value="ALL">All types</option>
          {ARTIFACT_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_INFO[t].label}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          className="h-8 px-2.5 pr-7 bg-panel border border-border rounded-sm text-[13.5px]"
        >
          <option value="ALL">All status</option>
          <option value="ACTIVE">Active</option>
          <option value="DRAFT">Draft</option>
          <option value="DEPRECATED">Deprecated</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort artifacts"
          title="Sort artifacts"
          className="h-8 px-2.5 pr-7 bg-panel border border-border rounded-sm text-[13.5px]"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Link href={`/projects/${projectId}/artifacts/new`}>
          <Button variant="primary">New</Button>
        </Link>
      </div>

      {hasActiveFilters && (
        <div className="-mt-2 mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-[11.5px] uppercase tracking-wider text-fg-subtle">Filters</span>
          {term !== "" && <FilterChip label={`Search: “${q.trim()}”`} onClear={() => setQ("")} />}
          {type !== "ALL" && <FilterChip label={`Type: ${TYPE_INFO[type as keyof typeof TYPE_INFO]?.label ?? type}`} onClear={() => setType("ALL")} />}
          {status !== "ALL" && <FilterChip label={`Status: ${STATUS_LABELS[status] ?? status}`} onClear={() => setStatus("ALL")} />}
          <button
            type="button"
            onClick={clearAll}
            className="text-[11.5px] text-fg-muted hover:text-fg underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {artifacts !== null && items.length === 0 ? (
        <Empty
          title="No artifacts yet"
          message="Create your first artifact to start documenting this system."
          action={<Link href={`/projects/${projectId}/artifacts/new`}><Button variant="primary">New artifact</Button></Link>}
        />
      ) : list.length === 0 ? (
        <Empty title="No artifacts match" message="Try different filters." />
      ) : (
        <>
          {/* Desktop: table (md and up). */}
          <Card padded={false} className="hidden md:block">
            <table className="w-full text-[13px]">
              <thead className="bg-panel">
                <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Artifact</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Type</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Status</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Relations</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Issues</th>
                  {showAuthor && <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Author</th>}
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Updated</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const href = `/projects/${projectId}/artifacts/${a.id}`;
                  const rel = relationsOf(a);
                  const iss = issuesOf(a);
                  const filler = isFillerDescription(a.title, a.description);
                  return (
                    <tr
                      key={a.id}
                      onClick={(e) => {
                        // Let inner links/buttons (title, issue badge) handle their own nav.
                        if ((e.target as HTMLElement).closest("a,button")) return;
                        router.push(href);
                      }}
                      className="hover:bg-panel-hover cursor-pointer"
                    >
                      <td className="px-3.5 py-3 border-b border-border">
                        <Link href={href} className="block">
                          <div className="font-medium">{a.title}</div>
                          {!filler && <div className="text-[12px] text-fg-muted truncate max-w-[460px]">{a.description}</div>}
                        </Link>
                      </td>
                      <td className="px-3.5 py-3 border-b border-border"><TypeChip type={a.type} /></td>
                      <td className="px-3.5 py-3 border-b border-border"><StatusBadge status={a.status} /></td>
                      <td className="px-3.5 py-3 border-b border-border">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums">{rel}</span>
                          <RelationSignal count={rel} />
                        </div>
                      </td>
                      <td className="px-3.5 py-3 border-b border-border tabular-nums">
                        {iss > 0 ? (
                          <Link
                            href={`${href}?tab=validation`}
                            title={`View ${iss} validation ${iss === 1 ? "issue" : "issues"}`}
                            className="inline-flex"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <IssueBadge count={iss} />
                          </Link>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      {showAuthor && (
                        <td className="px-3.5 py-3 border-b border-border">
                          <div className="flex items-center gap-2"><Avatar user={a.author} size={20} /><span className="text-[12.5px]">{a.author.firstName}</span></div>
                        </td>
                      )}
                      <td className="px-3.5 py-3 border-b border-border text-fg-muted text-[12.5px]">
                        <span title={exactTime(a.updatedAt)}>{timeAgo(a.updatedAt)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Mobile: dedicated architecture cards (below md). No horizontal scroll,
              and every architecture signal the table shows survives here. */}
          <div className="md:hidden space-y-2.5">
            {list.map((a) => {
              const href = `/projects/${projectId}/artifacts/${a.id}`;
              const rel = relationsOf(a);
              const iss = issuesOf(a);
              const filler = isFillerDescription(a.title, a.description);
              return (
                <Link
                  key={a.id}
                  href={href}
                  className="block rounded-lg border border-border bg-panel p-3 hover:bg-panel-hover transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium leading-snug min-w-0">{a.title}</div>
                    {iss > 0 && <IssueBadge count={iss} />}
                  </div>
                  {!filler && <p className="mt-1 text-[12px] text-fg-muted line-clamp-2">{a.description}</p>}
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <TypeChip type={a.type} />
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="mt-2.5 flex items-center gap-x-3 gap-y-1.5 flex-wrap text-[11.5px] text-fg-muted">
                    <span className="inline-flex items-center gap-1">
                      <Link2 size={12} aria-hidden="true" />
                      {rel} {rel === 1 ? "relation" : "relations"}
                    </span>
                    <RelationSignal count={rel} />
                    <span title={exactTime(a.updatedAt)}>{timeAgo(a.updatedAt)}</span>
                    {showAuthor && (
                      <span className="inline-flex items-center gap-1">
                        <Avatar user={a.author} size={16} />
                        {a.author.firstName}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
