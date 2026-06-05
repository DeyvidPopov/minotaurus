// app/(app)/projects/[projectId]/graph/page.tsx — full-screen knowledge graph
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Link as LinkIcon, LayoutGrid, Share2, ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { ARTIFACT_TYPES, EDGE_COLOR } from "@/lib/mock-data";
import type { Artifact, ArtifactType, Project, Relation, RelationType } from "@/lib/types";
import { GraphCanvas, type InferredGraphEdge } from "@/components/graph/graph-canvas";
import { apiIntelApi, type InferredEdgeKind } from "@/lib/api/api-intel";
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

const INFERRED_KIND_LABEL: Record<InferredEdgeKind, string> = {
  TOUCHES: "touches",
  SECURED_BY: "secured by",
  DOCUMENTED_BY: "documented by",
  RELATED: "related",
};

export default function GraphPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const { graphNodeStyle, graphLegendOpen, set } = useTweaks();
  const [project, setProject] = useState<Project | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [typeFilter, setTypeFilter] = useState<Set<string> | null>(null);
  const [selected, setSelected] = useState<Artifact | null>(null);
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [relayoutSignal, setRelayoutSignal] = useState(0);
  const [inferredEdges, setInferredEdges] = useState<InferredGraphEdge[]>([]);
  const [showReal, setShowReal] = useState(true);
  const [showInferred, setShowInferred] = useState(false);

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
    // API Payload Intelligence overlay — read-only, best-effort, never blocks the graph.
    try {
      const intel = await apiIntelApi.get(projectId);
      setInferredEdges(
        intel.inferredEdges.map((e) => ({
          id: `inf-${e.source}-${e.target}-${e.kind}`,
          source: e.source,
          target: e.target,
          kind: INFERRED_KIND_LABEL[e.kind] ?? "inferred",
          confidence: e.confidence,
          basis: e.basis,
        })),
      );
    } catch {
      /* intel overlay is optional */
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // One-shot auto-relayout: after an AI Bootstrap apply (which creates artifacts with
  // scatter positions), the wizard sets a flag so the graph arranges itself cleanly the
  // first time it opens — instead of landing on an overlapping mess. The flag is consumed
  // once, so manual drag positions are respected on every subsequent visit.
  useEffect(() => {
    if (artifacts.length === 0 || typeof window === "undefined") return;
    const key = `mino:graph:relayout:${projectId}`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      setRelayoutSignal((n) => n + 1);
    }
  }, [artifacts.length, projectId]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    artifacts.forEach((a) => { m[a.type] = (m[a.type] || 0) + 1; });
    return m;
  }, [artifacts]);

  // The canvas always receives the full real `relations` (so the dagre layout
  // stays stable regardless of edge visibility — `hideRealEdges` controls
  // rendering, not layout). `edgesHidden` = nothing is drawn.
  const edgesHidden = !showReal && !showInferred;

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
          <div className="text-[12px] text-fg-muted whitespace-nowrap">
            {artifacts.length} artifacts · {relations.length} relations
            {inferredEdges.length > 0 && ` · ${inferredEdges.length} inferred`}
          </div>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Find a node…" className="w-[200px] ml-1" />
        <div className="flex-1" />
        <span className="text-[12px] text-fg-muted whitespace-nowrap">Node style</span>
        <Segmented value={graphNodeStyle} onChange={(v) => set("graphNodeStyle", v)} options={[
          { value: "shape", label: "Shape" },
          { value: "color", label: "Color" },
          { value: "minimal", label: "Minimal" },
        ]} />
        <Button
          icon={<LayoutGrid size={14} />}
          onClick={() => setRelayoutSignal((n) => n + 1)}
          title="Auto-arrange nodes left → right"
        >
          Relayout
        </Button>
        <EdgesDropdown
          showReal={showReal}
          showInferred={showInferred}
          inferredCount={inferredEdges.length}
          onChange={(real, inferred) => { setShowReal(real); setShowInferred(inferred); }}
        />
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
              hideRealEdges={!showReal}
              inferredEdges={showInferred ? inferredEdges : undefined}
              selectedId={selected?.id || null}
              onSelect={setSelected}
              typeFilter={typeFilter}
              nodeStyle={graphNodeStyle}
              storageKey={`project:${projectId}`}
              relayoutSignal={relayoutSignal}
            />
            {/* Edge legend explains only the VISIBLE edge types. It appears only
                when it adds information — when inferred edges are shown (to
                distinguish solid vs dashed) or when both sets are hidden (the
                state hint). A default real-only view shows no chip, as before. */}
            {(showInferred || edgesHidden) && (
              <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 text-[11px] text-fg-muted bg-panel/90 border border-border rounded-md px-2.5 py-1.5 backdrop-blur-sm">
                {edgesHidden ? (
                  <span className="text-fg-subtle">Edges hidden — showing artifacts only.</span>
                ) : (
                  <>
                    {showReal && (
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-5 border-t-2 border-fg-muted" />
                        Real relations
                      </span>
                    )}
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-5 border-t border-dashed border-fg-subtle" />
                      Inferred API links — not saved
                    </span>
                  </>
                )}
              </div>
            )}
            <GraphLegend
              typeFilter={typeFilter}
              onToggle={toggleType}
              counts={counts}
              open={graphLegendOpen}
              onToggleOpen={() => set("graphLegendOpen", !graphLegendOpen)}
            />
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

/** Single edge-visibility control: a dropdown over the four (real × inferred) states. */
function EdgesDropdown({
  showReal,
  showInferred,
  inferredCount,
  onChange,
}: {
  showReal: boolean;
  showInferred: boolean;
  inferredCount: number;
  onChange: (real: boolean, inferred: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const hasInferred = inferredCount > 0;
  const options = [
    { real: true, inferred: false, label: "Real relations", needsInferred: false },
    { real: false, inferred: true, label: `Inferred links${hasInferred ? ` (${inferredCount})` : ""}`, needsInferred: true },
    { real: true, inferred: true, label: "Real + inferred", needsInferred: true },
    { real: false, inferred: false, label: "No edges", needsInferred: false },
  ];
  const current = options.find((o) => o.real === showReal && o.inferred === showInferred) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <Button
        variant={showInferred ? "primary" : "default"}
        icon={<Share2 size={14} />}
        iconRight={<ChevronDown size={13} />}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Choose which edges are drawn (real relations / inferred API links)"
      >
        Edges: {current.label}
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 z-20 min-w-[200px] bg-panel border border-border rounded-md shadow-lg py-1">
          {options.map((o) => {
            const active = o.real === showReal && o.inferred === showInferred;
            const disabled = o.needsInferred && !hasInferred;
            return (
              <button
                key={o.label}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => { onChange(o.real, o.inferred); setOpen(false); }}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-[12.5px] text-fg hover:bg-panel-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={13} className={active ? "opacity-100 text-accent" : "opacity-0"} />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
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
