// app/(app)/projects/[projectId]/graph/page.tsx — full-screen knowledge graph
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { ARTIFACT_TYPES, EDGE_COLOR } from "@/lib/mock-data";
import type { Artifact, ArtifactType, Project, Relation, RelationType } from "@/lib/types";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { GraphLegend } from "@/components/graph/graph-legend";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SearchInput } from "@/components/ui/search-input";
import { TypeChip } from "@/components/ui/type-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { OpenLink } from "@/components/ui/open-link";
import { useTweaks } from "@/components/providers";
import { projectsApi } from "@/lib/api/projects";
import { artifactsApi } from "@/lib/api/artifacts";
import { apiClient, ApiError } from "@/lib/api/client";
import { validationApi } from "@/lib/api";

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationType;
}

export default function GraphPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const { graphNodeStyle, set } = useTweaks();
  const [project, setProject] = useState<Project | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [typeFilter, setTypeFilter] = useState<Set<string> | null>(null);
  const [selected, setSelected] = useState<Artifact | null>(null);
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);

  const load = async () => {
    try {
      const [p, arts, graph] = await Promise.all([
        projectsApi.get(projectId),
        artifactsApi.list(projectId),
        apiClient.get<{ nodes: unknown[]; edges: GraphEdge[] }>(`/projects/${projectId}/graph`),
      ]);
      setProject(p);
      setArtifacts(arts);
      setRelations(graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type })));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load graph");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    artifacts.forEach((a) => { m[a.type] = (m[a.type] || 0) + 1; });
    return m;
  }, [artifacts]);

  const toggleType = (t: ArtifactType) => {
    setTypeFilter((prev) => {
      const set = new Set(prev || ARTIFACT_TYPES);
      if (set.has(t)) set.delete(t); else set.add(t);
      if (set.size === ARTIFACT_TYPES.length) return null;
      return set;
    });
  };

  const visibleArtifacts = useMemo(() => {
    if (!search.trim()) return artifacts;
    const q = search.toLowerCase();
    return artifacts.filter((a) => a.title.toLowerCase().includes(q));
  }, [artifacts, search]);

  const incoming = selected ? relations.filter((r) => r.target === selected.id) : [];
  const outgoing = selected ? relations.filter((r) => r.source === selected.id) : [];

  const runValidation = async () => {
    setRunning(true);
    try {
      await validationApi.run(projectId);
      toast.success("Validation complete");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Validation failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid h-full overflow-hidden" style={{ gridTemplateRows: "auto 1fr" }}>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 flex-wrap">
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold">{project?.name ?? "Project"} · Knowledge graph</div>
          <div className="text-[12px] text-fg-muted whitespace-nowrap">{artifacts.length} artifacts · {relations.length} relations</div>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Find a node…" className="w-[200px] ml-1" />
        <div className="flex-1" />
        <span className="text-[12px] text-fg-muted whitespace-nowrap">Node style</span>
        <Segmented value={graphNodeStyle} onChange={(v) => set("graphNodeStyle", v)} options={[
          { value: "shape", label: "Shape" },
          { value: "color", label: "Color" },
          { value: "minimal", label: "Minimal" },
        ]} />
        <Button icon={<RefreshCw size={14} />} onClick={runValidation} disabled={running}>
          {running ? "Validating…" : "Validate"}
        </Button>
        <Link href={`/projects/${projectId}/artifacts/new`}>
          <Button variant="primary" icon={<LinkIcon size={14} />}>Add artifact</Button>
        </Link>
      </div>

      <div className="relative overflow-hidden">
        {artifacts.length === 0 ? (
          <div className="h-full flex items-center justify-center text-fg-muted text-[14px] text-center px-6">
            <div>
              <div className="mb-2">No artifacts yet.</div>
              <Link href={`/projects/${projectId}/artifacts/new`}>
                <Button variant="primary">Create your first artifact</Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <GraphCanvas
              artifacts={visibleArtifacts}
              relations={relations}
              selectedId={selected?.id || null}
              onSelect={setSelected}
              typeFilter={typeFilter}
              nodeStyle={graphNodeStyle}
              storageKey={`project:${projectId}`}
            />
            <GraphLegend typeFilter={typeFilter} onToggle={toggleType} counts={counts} />
          </>
        )}

        <Drawer open={!!selected} onClose={() => setSelected(null)} title="Artifact details" width={400}>
          {selected && (
            <>
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <TypeChip type={selected.type} />
                  <StatusBadge status={selected.status} />
                </div>
                <div className="text-base font-semibold mb-1">{selected.title}</div>
                <div className="text-[13px] text-fg-muted">{selected.description}</div>
              </div>

              {selected.tags.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle mb-2">Tags</div>
                  <div className="flex gap-1.5 flex-wrap">{selected.tags.map((t) => <Badge key={t} mono>{t}</Badge>)}</div>
                </div>
              )}

              <RelList title={`Outgoing (${outgoing.length})`} rels={outgoing} artifacts={artifacts} project={projectId} side="out" />
              <RelList title={`Incoming (${incoming.length})`} rels={incoming} artifacts={artifacts} project={projectId} side="in" />

              <div className="flex gap-2 mt-2.5">
                <OpenLink
                  href={`/projects/${projectId}/artifacts/${selected.id}`}
                  label="Open artifact"
                />
              </div>
            </>
          )}
        </Drawer>
      </div>
    </div>
  );
}

function RelList({ title, rels, artifacts, project, side }: {
  title: string;
  rels: Relation[];
  artifacts: Artifact[];
  project: string;
  side: "in" | "out";
}) {
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  return (
    <div className="mb-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle mb-2">{title}</div>
      {rels.length === 0 && <div className="text-fg-muted text-[12.5px]">None</div>}
      {rels.map((r) => {
        const otherId = side === "out" ? r.target : r.source;
        const other = byId.get(otherId);
        if (!other) return null;
        return (
          <div key={r.id} className="flex items-center gap-2 py-1.5 text-[13px]">
            <span className="font-mono text-[10px] px-1.5 rounded" style={{
              color: EDGE_COLOR[r.type] || "#94a3b8",
              border: `1px solid ${(EDGE_COLOR[r.type] || "#94a3b8")}33`,
            }}>{r.type}</span>
            <Link href={`/projects/${project}/artifacts/${other.id}`} className="min-w-0 hover:underline truncate">{other.title}</Link>
          </div>
        );
      })}
    </div>
  );
}
