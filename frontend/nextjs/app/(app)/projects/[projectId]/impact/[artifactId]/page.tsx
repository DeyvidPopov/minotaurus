// app/(app)/projects/[projectId]/impact/[artifactId]/page.tsx — change-impact analysis
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Box, Network, BookOpen, Plug, Database, GitMerge, Info, History, ListChecks, ShieldCheck, Check, Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TypeChip } from "@/components/ui/type-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Empty } from "@/components/ui/empty";
import { OpenLink } from "@/components/ui/open-link";
import { Segmented } from "@/components/ui/segmented";
import { GraphCanvas, type InferredGraphEdge } from "@/components/graph/graph-canvas";
import { useTweaks } from "@/components/providers";
import { versionsApi, type ImpactResponse, type ImpactArtifactRef, type ImpactRelation, type VersionEvent } from "@/lib/api/versions";
import { validationApi } from "@/lib/api";
import { artifactsApi } from "@/lib/api/artifacts";
import { diagramsApi, type Diagram } from "@/lib/api/diagrams";
import { apiIntelApi, type InferredEdgeKind } from "@/lib/api/api-intel";
import { apiClient, ApiError } from "@/lib/api/client";
import type { Artifact, ArtifactType, ArtifactStatus, Relation, RelationType, User, ValidationIssue, Severity } from "@/lib/types";
import { ACTION_COLOR, ACTION_VERB, entityTypeLabel } from "@/lib/activity";
import { assessImpact, type RiskBand, type DeletionVerdict, type ImpactAssessment } from "@/lib/impact-risk";
import { computeTransitiveReach } from "@/lib/impact-graph";
import { findRenameReferences } from "@/lib/impact-rename";
import { buildImpactReportMarkdown } from "@/lib/impact-report";
import { timeAgo } from "@/lib/utils";

// The blast-radius graph reuses GraphCanvas, which expects full Artifact objects
// but only reads type/title/status/position. When the full project artifact list
// is available we feed it real objects; the 1-hop fallback (from the impact
// payload alone) needs this never-rendered author placeholder.
const GRAPH_NODE_AUTHOR: User = {
  id: "",
  firstName: "",
  lastName: "",
  email: "",
  role: "ENGINEER",
  initials: "",
  defaultProjectId: null,
};

function toGraphNode(ref: ImpactArtifactRef, gx: number, gy: number): Artifact {
  return {
    id: ref.id,
    title: ref.title,
    type: ref.type as ArtifactType,
    status: ref.status as ArtifactStatus,
    description: "",
    tags: [],
    gx,
    gy,
    createdAt: "",
    updatedAt: "",
    author: GRAPH_NODE_AUTHOR,
  };
}

function humanizeRelation(t: string): string {
  return t.toLowerCase().replace(/_/g, " ");
}

interface GraphEdge { id: string; source: string; target: string; type: RelationType }
const INFERRED_KIND_LABEL: Record<InferredEdgeKind, string> = {
  TOUCHES: "touches",
  SECURED_BY: "secured by",
  DOCUMENTED_BY: "documented by",
  RELATED: "related",
};

interface AuxData {
  artifacts: Artifact[];
  relations: Relation[];
  inferred: InferredGraphEdge[];
  diagrams: Diagram[];
  graphReady: boolean;
  scanReady: boolean;
}
const EMPTY_AUX: AuxData = { artifacts: [], relations: [], inferred: [], diagrams: [], graphReady: false, scanReady: false };

const BAND_COLOR: Record<RiskBand, string> = {
  NONE: "var(--fg-muted)",
  LOW: "var(--c-success)",
  MEDIUM: "var(--c-warning)",
  HIGH: "var(--c-danger)",
};
const BAND_LABEL: Record<RiskBand, string> = {
  NONE: "Minimal",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};
const verdictColor = (v: DeletionVerdict): string => (v === "SAFE" ? "var(--c-success)" : BAND_COLOR[v]);
const verdictLabel = (v: DeletionVerdict): string => (v === "SAFE" ? "Safe" : BAND_LABEL[v]);

const SEVERITY_TONE: Record<Severity, "info" | "warning" | "danger"> = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "danger",
  CRITICAL: "danger",
};

export default function ImpactPage({ params }: { params: { projectId: string; artifactId: string } }) {
  const { projectId, artifactId } = params;
  const { graphNodeStyle } = useTweaks();
  const [data, setData] = useState<ImpactResponse | null>(null);
  const [findings, setFindings] = useState<ValidationIssue[]>([]);
  const [aux, setAux] = useState<AuxData>(EMPTY_AUX);
  const [error, setError] = useState<string | null>(null);
  const [depth, setDepth] = useState<"1" | "2" | "3">("1");
  const [showInferred, setShowInferred] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Impact is primary; everything else is a supplementary signal composed in
    // (no backend change) and best-effort — allSettled keeps them independent so
    // any one failing never breaks the page.
    Promise.allSettled([
      versionsApi.impact(projectId, artifactId),
      validationApi.list(projectId, { status: "OPEN" }),
      artifactsApi.list(projectId),
      apiClient.get<{ nodes: unknown[]; edges: GraphEdge[] }>(`/projects/${projectId}/graph`),
      apiIntelApi.get(projectId),
      diagramsApi.list(projectId),
    ]).then(([impactRes, valRes, artsRes, graphRes, intelRes, diagRes]) => {
      if (cancelled) return;
      if (impactRes.status === "rejected") {
        const err = impactRes.reason;
        const msg = err instanceof ApiError ? err.message : "Could not load impact analysis";
        setError(msg);
        toast.error(msg);
        return;
      }
      setData(impactRes.value);
      setFindings(
        valRes.status === "fulfilled"
          ? valRes.value.filter((i) => i.status === "OPEN" && (i.artifactId === artifactId || i.subjectId === artifactId))
          : [],
      );
      setAux({
        artifacts: artsRes.status === "fulfilled" ? artsRes.value : [],
        relations:
          graphRes.status === "fulfilled"
            ? graphRes.value.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type }))
            : [],
        inferred:
          intelRes.status === "fulfilled"
            ? intelRes.value.inferredEdges.map((e) => ({
                id: `inf-${e.source}-${e.target}-${e.kind}`,
                source: e.source,
                target: e.target,
                kind: INFERRED_KIND_LABEL[e.kind] ?? "inferred",
                confidence: e.confidence,
                basis: e.basis,
              }))
            : [],
        diagrams: diagRes.status === "fulfilled" ? diagRes.value : [],
        graphReady: artsRes.status === "fulfilled" && graphRes.status === "fulfilled",
        scanReady: artsRes.status === "fulfilled" || diagRes.status === "fulfilled",
      });
    });
    return () => { cancelled = true; };
  }, [projectId, artifactId]);

  // Deterministic risk assessment — from the impact payload plus this artifact's
  // open validation findings. nowMs is injected so the model stays pure.
  const assessment = useMemo<ImpactAssessment | null>(
    () =>
      data
        ? assessImpact(data, Date.now(), findings.map((f) => ({ severity: f.severity, code: f.meta?.code ?? null })))
        : null,
    [data, findings],
  );

  // 1-hop fallback subgraph from the impact payload alone (used until the full
  // project graph loads, or if it fails).
  const oneHopGraph = useMemo(() => {
    if (!data) return { nodes: [] as Artifact[], rels: [] as Relation[] };
    const center = toGraphNode(data.artifact, 0, 0);
    const neighborRefs = new Map<string, ImpactArtifactRef>();
    for (const r of [...data.dependentArtifacts, ...data.directDependencies]) {
      if (r.artifact.id !== center.id) neighborRefs.set(r.artifact.id, r.artifact);
    }
    const refs = [...neighborRefs.values()];
    const radius = 180;
    const nodes: Artifact[] = [
      center,
      ...refs.map((ref, i) => {
        const ang = (i / Math.max(refs.length, 1)) * Math.PI * 2;
        return toGraphNode(ref, Math.cos(ang) * radius, Math.sin(ang) * radius);
      }),
    ];
    const rels: Relation[] = [];
    const seen = new Set<string>();
    for (const r of data.dependentArtifacts) {
      if (r.artifact.id === center.id || seen.has(r.relationId)) continue;
      seen.add(r.relationId);
      rels.push({ id: r.relationId, source: r.artifact.id, target: center.id, type: r.relationType as RelationType });
    }
    for (const r of data.directDependencies) {
      if (r.artifact.id === center.id || seen.has(r.relationId)) continue;
      seen.add(r.relationId);
      rels.push({ id: r.relationId, source: center.id, target: r.artifact.id, type: r.relationType as RelationType });
    }
    return { nodes, rels };
  }, [data]);

  // Transitive reachability over the full project relation set, depth-limited.
  const reach = useMemo(
    () => (aux.graphReady ? computeTransitiveReach(artifactId, aux.relations, Number(depth)) : null),
    [aux.graphReady, aux.relations, depth, artifactId],
  );

  // The graph the Blast Radius card renders: transitive (depth-limited) when the
  // full graph is available, else the 1-hop fallback.
  const blastGraph = useMemo(() => {
    if (reach && data) {
      const artMap = new Map(aux.artifacts.map((a) => [a.id, a]));
      const nodes: Artifact[] = [];
      if (!artMap.has(artifactId)) nodes.push(toGraphNode(data.artifact, 0, 0));
      for (const id of reach.reached) {
        const a = artMap.get(id);
        if (a) nodes.push(a);
      }
      const rels = aux.relations.filter((r) => reach.reached.has(r.source) && reach.reached.has(r.target));
      return { nodes, rels };
    }
    return oneHopGraph;
  }, [reach, data, aux.artifacts, aux.relations, artifactId, oneHopGraph]);

  const inferredForGraph = useMemo(() => {
    if (!showInferred) return undefined;
    const visible = new Set(blastGraph.nodes.map((n) => n.id));
    return aux.inferred.filter((e) => visible.has(e.source) && visible.has(e.target));
  }, [showInferred, aux.inferred, blastGraph]);

  const renameRefs = useMemo(
    () => (aux.scanReady && data ? findRenameReferences(artifactId, data.artifact.title, aux.diagrams, aux.artifacts) : []),
    [aux.scanReady, aux.diagrams, aux.artifacts, data, artifactId],
  );

  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <Empty title="Impact unavailable" message={error} />
      </div>
    );
  }
  if (!data || !assessment) return <div className="px-4 sm:px-6 lg:px-8 py-6 text-fg-muted">Loading…</div>;

  const dependents = data.dependentArtifacts;
  const dependencies = data.directDependencies;
  const hasRelationships = dependents.length > 0 || dependencies.length > 0;
  const hasAssets =
    data.apiSpecs.length > 0 ||
    data.databaseModels.length > 0 ||
    data.diagrams.length > 0 ||
    data.documentation.length > 0;
  const m = assessment.metrics;
  const depthNum = Number(depth);
  const indirectDependents = reach ? Math.max(0, reach.dependents.size - dependents.length) : 0;

  const downloadReport = () => {
    const md = buildImpactReportMarkdown({
      data,
      assessment,
      findings: findings.map((f) => ({ severity: f.severity, message: f.meta?.cleanMessage || f.message, code: f.meta?.code ?? null })),
      renameRefs: renameRefs.map((r) => ({ kind: r.kind, title: r.title })),
      reach: reach
        ? { directDependents: dependents.length, indirectDependents, directDependencies: dependencies.length, depth: depthNum }
        : null,
      generatedAt: new Date().toISOString(),
    });
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `impact-${data.artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "artifact"}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      <PageHeader
        eyebrow={
          <>
            <Badge mono>IMPACT</Badge>
            <TypeChip type={data.artifact.type as ArtifactType} />
            <StatusBadge status={data.artifact.status as ArtifactStatus} />
          </>
        }
        title={data.artifact.title}
        subtitle={data.artifact.description || "What happens if this artifact changes?"}
        actions={
          <>
            <Button icon={<Download size={13} />} onClick={downloadReport}>Download report</Button>
            <Link href={`/projects/${projectId}/artifacts/${data.artifact.id}`}>
              <Button icon={<ArrowLeft size={13} />}>Back to artifact</Button>
            </Link>
          </>
        }
      />

      {/* Scope note — set honest expectations about what the analysis knows. */}
      <div className="flex items-start gap-2 text-[12.5px] text-fg-muted bg-panel-2 border border-border rounded-md px-3 py-2 mb-5">
        <Info size={13} className="mt-0.5 shrink-0 text-fg-subtle" />
        <span>
          The risk verdict is computed from <strong className="font-medium text-fg">direct (1-hop) relationships</strong>. The
          Blast Radius graph can be expanded to multiple hops for visualisation; deeper hops do not change the verdict.
        </span>
      </div>

      {/* ❶ IMPACT SUMMARY — the deterministic verdict. Always shown. */}
      <Card title="Impact summary" subtitle="What happens if this artifact changes?" className="mb-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div
            className="rounded-md border p-3"
            style={{
              borderColor: `color-mix(in srgb, ${BAND_COLOR[assessment.overall]} 45%, var(--border))`,
              background: `color-mix(in srgb, ${BAND_COLOR[assessment.overall]} 7%, transparent)`,
            }}
          >
            <div className="text-[11px] uppercase tracking-wide text-fg-muted">Overall risk</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: BAND_COLOR[assessment.overall] }} />
              <span className="text-[20px] font-semibold leading-none" style={{ color: BAND_COLOR[assessment.overall] }}>
                {BAND_LABEL[assessment.overall]}
              </span>
            </div>
          </div>

          <VerdictTile label="If deleted" color={verdictColor(assessment.deletion.verdict)} value={verdictLabel(assessment.deletion.verdict)} reason={assessment.deletion.reason} />
          <VerdictTile label="If modified" color={BAND_COLOR[assessment.modification.band]} value={BAND_LABEL[assessment.modification.band]} reason={assessment.modification.reason} />

          <div className="rounded-md border border-border p-3 bg-panel-2">
            <div className="text-[11px] uppercase tracking-wide text-fg-muted mb-1.5">At a glance</div>
            <div className="flex flex-col gap-1 text-[12px]">
              <Glance k="Dependents" v={m.dependents} />
              <Glance k="Dependencies" v={m.dependencies} />
              <Glance k="Assets to review" v={m.assetsToReview} />
              <Glance k="Open findings" v={m.openFindings} />
              <Glance k="Last changed" v={m.lastChangeAt ? timeAgo(m.lastChangeAt) : "—"} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-4">
          <span className="text-[12px] text-fg-muted">Why:</span>
          {assessment.reasons.map((r, i) => <Badge key={i}>{r}</Badge>)}
          {m.lastChangeAt && <Badge>Changed {timeAgo(m.lastChangeAt)}</Badge>}
        </div>
        <details className="mt-3">
          <summary className="text-[12px] text-accent cursor-pointer select-none w-fit">How is this calculated?</summary>
          <ul className="mt-2 flex flex-col gap-1 text-[12px] text-fg-muted border-l-2 border-border pl-3 font-mono">
            {assessment.rules.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <p className="text-[11.5px] text-fg-subtle mt-2 max-w-2xl">
            Deterministic — derived only from this artifact&apos;s recorded relationships, linked assets, documentation,
            recent changes and open validation findings. No AI, no subjective scoring; identical project state always
            produces the identical verdict.
          </p>
        </details>
      </Card>

      {hasRelationships || hasAssets ? (
        <div className="flex flex-col gap-5">
          {/* ❷ BLAST RADIUS — the graph as the centerpiece, with depth + inferred overlay. */}
          {blastGraph.nodes.length > 1 && (
            <Card
              title="Blast radius"
              subtitle={
                aux.graphReady
                  ? `${dependents.length} direct dependent${dependents.length === 1 ? "" : "s"}${indirectDependents > 0 ? ` · ${indirectDependents} indirect within ${depthNum} hop${depthNum === 1 ? "" : "s"}` : ""} · ${dependencies.length} direct dependenc${dependencies.length === 1 ? "y" : "ies"}`
                  : "This artifact (center) with its direct dependents and dependencies."
              }
              padded={false}
              action={
                <div className="flex items-center gap-2 flex-wrap">
                  {aux.graphReady && (
                    <Segmented
                      value={depth}
                      onChange={(v) => setDepth(v)}
                      options={[
                        { value: "1", label: "1 hop" },
                        { value: "2", label: "2 hops" },
                        { value: "3", label: "3 hops" },
                      ]}
                    />
                  )}
                  {aux.inferred.length > 0 && (
                    <Segmented
                      value={showInferred ? "both" : "real"}
                      onChange={(v) => setShowInferred(v === "both")}
                      options={[
                        { value: "real", label: "Real" },
                        { value: "both", label: "+ Inferred" },
                      ]}
                    />
                  )}
                </div>
              }
            >
              <div style={{ height: 380, position: "relative" }}>
                <GraphCanvas
                  artifacts={blastGraph.nodes}
                  relations={blastGraph.rels}
                  inferredEdges={inferredForGraph}
                  selectedId={data.artifact.id}
                  nodeStyle={graphNodeStyle}
                  draggable={false}
                  fitView
                  highlightSelected
                  showMiniMap={false}
                  autoLayout="LR"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-t border-border text-[11.5px] text-fg-muted">
                <span className="inline-flex items-center gap-1"><ArrowRight size={11} className="rotate-180" /> depends on this (would break)</span>
                <span className="inline-flex items-center gap-1"><ArrowRight size={11} /> this depends on</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} /> selected artifact</span>
                {showInferred && (
                  inferredForGraph && inferredForGraph.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-fg-subtle italic">⤳ {inferredForGraph.length} inferred link{inferredForGraph.length === 1 ? "" : "s"} (api-intel)</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-fg-subtle italic">No inferred links among the artifacts shown — try a wider depth or a different artifact.</span>
                  )
                )}
              </div>
            </Card>
          )}

          {/* ❸ / ❹ — what breaks vs what constrains, side by side on desktop. */}
          {hasRelationships && (
            <div className="grid lg:grid-cols-2 gap-5 items-start">
              <Card
                className="border-accent"
                title={
                  <span className="flex items-center gap-2">
                    <Network size={14} className="text-accent" />
                    Impacted components
                    <Badge tone="accent" mono>{dependents.length}</Badge>
                  </span>
                }
                subtitle="What relies on this artifact and may break if it changes — the blast radius."
              >
                {dependents.length === 0 ? (
                  <div className="text-fg-muted text-[13px]">
                    Nothing depends on this artifact — changing it has no recorded direct downstream impact.
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {dependents.map((r) => (
                      <ImpactRow key={r.relationId} projectId={projectId} rel={r} side="in" />
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title={
                  <span className="flex items-center gap-2">
                    Dependencies
                    <Badge mono>{dependencies.length}</Badge>
                  </span>
                }
                subtitle="What this artifact relies on — changing or removing those upstream artifacts could affect this one."
              >
                {dependencies.length === 0 ? (
                  <div className="text-fg-muted text-[13px]">This artifact has no outgoing dependencies — it is a leaf in the graph.</div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {dependencies.map((r) => (
                      <ImpactRow key={r.relationId} projectId={projectId} rel={r} side="out" />
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ❺ REQUIRED UPDATES — one unified surface for linked assets. */}
          {hasAssets && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  <ListChecks size={14} className="text-accent" />
                  Required updates
                  <Badge mono>{m.assetsToReview}</Badge>
                </span>
              }
              subtitle="Assets attached to this artifact — review and update these alongside any change. (Linked, not transitive impact.)"
            >
              <div className="flex flex-col gap-4">
                {data.apiSpecs.length > 0 && (
                  <UpdateGroup icon={<Plug size={13} />} label="API specs" count={data.apiSpecs.length}>
                    {data.apiSpecs.map((s) => (
                      <Link key={s.id} href={`/projects/${projectId}/api/${s.id}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-panel-hover">
                        <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{s.title}</span>
                        <Badge mono>v{s.version}</Badge>
                        <Badge mono>{s.endpointCount} ep</Badge>
                      </Link>
                    ))}
                  </UpdateGroup>
                )}
                {data.databaseModels.length > 0 && (
                  <UpdateGroup icon={<Database size={13} />} label="Database models" count={data.databaseModels.length}>
                    {data.databaseModels.map((md2) => (
                      <Link key={md2.id} href={`/projects/${projectId}/database/${md2.id}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-panel-hover">
                        <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{md2.title}</span>
                        <Badge mono>{md2.databaseType}</Badge>
                        <Badge mono>{md2.entityCount} ent</Badge>
                      </Link>
                    ))}
                  </UpdateGroup>
                )}
                {data.diagrams.length > 0 && (
                  <UpdateGroup icon={<GitMerge size={13} />} label="Diagrams" count={data.diagrams.length}>
                    {data.diagrams.map((d) => (
                      <Link key={d.id} href={`/projects/${projectId}/diagrams/${d.id}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-panel-hover">
                        <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{d.title}</span>
                        <Badge mono>{d.type}</Badge>
                      </Link>
                    ))}
                  </UpdateGroup>
                )}
                {data.documentation.length > 0 && (
                  <UpdateGroup icon={<BookOpen size={13} />} label="Documentation" count={data.documentation.length}>
                    {data.documentation.map((d, i) => (
                      <Link key={i} href={`/projects/${projectId}/artifacts/${d.artifactId}`} className="block py-1.5 px-2 rounded hover:bg-panel-hover">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium truncate">{d.title}</span>
                          <Badge mono>{d.source === "self" ? "self" : "documents this"}</Badge>
                        </div>
                        <div className="text-[12px] text-fg-muted leading-relaxed line-clamp-2 mt-0.5">
                          {d.excerpt || <em className="text-fg-subtle">No excerpt</em>}
                        </div>
                      </Link>
                    ))}
                  </UpdateGroup>
                )}
              </div>
            </Card>
          )}
        </div>
      ) : (
        /* ❻ ZERO-STATE — meaningful, with recommendations. */
        <div className="border border-dashed border-border-strong rounded-lg p-10 text-center bg-panel-2">
          <div className="text-fg-subtle mb-3 inline-block"><Network size={28} /></div>
          <h3 className="text-base font-semibold mb-1.5">No relationships modeled yet</h3>
          <p className="text-fg-muted text-[13.5px] max-w-xl mx-auto mb-5">
            This artifact has no recorded dependencies or dependents, so impact analysis cannot determine what a change would
            affect. Model its relationships to unlock blast-radius and change-risk analysis.
          </p>
          <div className="text-left max-w-md mx-auto mb-6 bg-panel border border-border rounded-md p-4">
            <div className="text-[12px] font-semibold text-fg-muted uppercase tracking-wide mb-2">To enable impact analysis</div>
            <ul className="text-[13px] text-fg-muted flex flex-col gap-1.5 list-disc pl-4">
              <li>Link it to the components it uses, or that use it, in the Relations tab.</li>
              <li>Attach its API specs, database models, or diagrams.</li>
              <li>Run validation to surface structural risks (orphans, high fan-out, deprecated links).</li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link href={`/projects/${projectId}/artifacts/${data.artifact.id}?tab=relations`}>
              <Button variant="primary" icon={<Network size={13} />}>Manage relationships</Button>
            </Link>
            <Link href={`/projects/${projectId}/validation`}>
              <Button>Run validation</Button>
            </Link>
          </div>
        </div>
      )}

      {/* RENAME IMPACT — textual references the relation graph can't see. */}
      {aux.scanReady && (
        <div className="mt-5">
          <Card
            title={
              <span className="flex items-center gap-2">
                Rename impact
                {renameRefs.length > 0 && <Badge mono>{renameRefs.length}</Badge>}
              </span>
            }
            subtitle="Where this artifact&apos;s current title appears by name — these references may break if you rename it."
          >
            {renameRefs.length === 0 ? (
              <div className="text-[13px] text-fg-muted inline-flex items-center gap-1.5">
                <Check size={13} className="text-success" /> No references to this title found in diagrams or documentation.
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {renameRefs.map((r, i) => (
                  <Link
                    key={i}
                    href={r.kind === "DIAGRAM" ? `/projects/${projectId}/diagrams/${r.id}` : `/projects/${projectId}/artifacts/${r.id}`}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-panel-hover"
                  >
                    {r.kind === "DIAGRAM" ? <GitMerge size={13} className="text-accent shrink-0" /> : <BookOpen size={13} className="text-accent shrink-0" />}
                    <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{r.title}</span>
                    <Badge mono>{r.kind === "DIAGRAM" ? "diagram" : "documentation"}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* CHANGE SIGNALS — validation findings + recency, framed as change-confidence
          inputs (not a changelog). Both reuse existing SSOT data. */}
      {(data.recentEvents.length > 0 || findings.length > 0) && (
        <div className="mt-5">
          <Card
            title="Change signals"
            subtitle="Signals that affect how confidently you can change this artifact."
            action={<OpenLink href={`/projects/${projectId}/versions`} label="All versions" />}
          >
            <div className="mb-4">
              <div className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted mb-2 flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-fg-subtle" /> Validation
              </div>
              {findings.length === 0 ? (
                <div className="text-[13px] text-fg-muted inline-flex items-center gap-1.5">
                  <Check size={13} className="text-success" /> No open validation findings on this artifact.
                </div>
              ) : (
                <>
                  <ul className="flex flex-col gap-1.5">
                    {findings.map((f) => (
                      <li key={f.id} className="flex items-start gap-2 text-[13px]">
                        <Badge tone={SEVERITY_TONE[f.severity]} mono>{f.severity}</Badge>
                        <span className="min-w-0 flex-1">
                          <span className="text-fg">{f.meta?.cleanMessage || f.message}</span>
                          {f.meta?.code && <span className="text-[11px] text-fg-subtle font-mono ml-1.5">{f.meta.code}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2">
                    <OpenLink href={`/projects/${projectId}/validation`} label="Open validation" />
                  </div>
                </>
              )}
            </div>

            <div>
              <div className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted mb-2 flex items-center gap-1.5">
                <History size={13} className="text-fg-subtle" /> Recency
              </div>
              <div className="text-[13px] mb-2">
                {m.lastChangeAt ? (
                  <span>
                    <strong className="font-semibold">Changed {timeAgo(m.lastChangeAt)}</strong>
                    <span className="text-fg-muted"> · {m.changes30d} change{m.changes30d === 1 ? "" : "s"} in the last 30 days</span>
                  </span>
                ) : (
                  <span className="text-fg-muted">No changes recorded.</span>
                )}
              </div>
              {data.recentEvents.length > 0 && (
                <ul className="divide-y divide-border">
                  {data.recentEvents.slice(0, 5).map((e) => (
                    <ActivityRow key={e.id} event={e} />
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function VerdictTile({ label, color, value, reason }: { label: string; color: string; value: string; reason: string }) {
  return (
    <div className="rounded-md border border-border p-3 bg-panel-2">
      <div className="text-[11px] uppercase tracking-wide text-fg-muted">{label}</div>
      <div className="text-[15px] font-semibold mt-1" style={{ color }}>{value}</div>
      <div className="text-[11.5px] text-fg-muted mt-1 leading-snug line-clamp-3">{reason}</div>
    </div>
  );
}

function Glance({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-fg-muted">{k}</span>
      <span className="font-medium tabular-nums">{v}</span>
    </div>
  );
}

function ImpactRow({ projectId, rel, side }: { projectId: string; rel: ImpactRelation; side: "in" | "out" }) {
  const a = rel.artifact;
  const why = side === "in" ? "would break if this is removed" : "this relies on it";
  return (
    <div className="flex items-start gap-2.5 py-2 px-2 rounded hover:bg-panel-hover">
      <Box size={13} className="text-accent shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/projects/${projectId}/artifacts/${a.id}`} className="text-[13px] font-medium truncate hover:underline">{a.title}</Link>
          <TypeChip type={a.type as ArtifactType} />
          <StatusBadge status={a.status as ArtifactStatus} />
        </div>
        <div className="text-[11.5px] text-fg-muted mt-0.5 inline-flex items-center gap-1">
          {side === "out" ? <ArrowRight size={10} className="shrink-0" /> : <ArrowRight size={10} className="rotate-180 shrink-0" />}
          <span className="font-mono">{humanizeRelation(rel.relationType)}</span>
          <span className="text-fg-subtle">· {why}</span>
        </div>
      </div>
      {side === "in" && (
        <OpenLink href={`/projects/${projectId}/impact/${a.id}`} label="Impact" className="shrink-0 mt-0.5" />
      )}
    </div>
  );
}

function UpdateGroup({ icon, label, count, children }: { icon: React.ReactNode; label: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-fg-muted mb-1.5">
        <span className="text-fg-subtle">{icon}</span>
        {label}
        <span className="font-normal normal-case text-fg-subtle">({count})</span>
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function ActivityRow({ event }: { event: VersionEvent }) {
  return (
    <li className="flex items-center gap-2.5 py-2 text-[13px]">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ACTION_COLOR[event.action] }} />
      <span className="text-fg-muted shrink-0">
        {ACTION_VERB[event.action]}
        {event.entityType !== "ARTIFACT" ? ` ${entityTypeLabel(event.entityType)}` : ""}
      </span>
      <span className="flex-1 min-w-0 truncate font-medium">{event.title}</span>
      <span className="text-[11.5px] text-fg-subtle font-mono shrink-0">{timeAgo(event.createdAt)}</span>
    </li>
  );
}
