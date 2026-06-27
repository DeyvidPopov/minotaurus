// app/(app)/projects/[projectId]/artifacts/[artifactId]/page.tsx — artifact detail
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Edit, Link as LinkIcon, Trash2, X, Plug, Database, GitMerge, Activity, AlertTriangle, CheckCircle2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { TypeChip } from "@/components/ui/type-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTweaks } from "@/components/providers";
import { artifactsApi, relationsApi } from "@/lib/api/artifacts";
import { apiSpecsApi, type ApiSpec } from "@/lib/api/api-specs";
import { databaseModelsApi, type DatabaseModel } from "@/lib/api/database-models";
import { diagramsApi, type Diagram } from "@/lib/api/diagrams";
import { validationApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/error-message";
import { EDGE_COLOR } from "@/lib/mock-data";
import ArtifactDetailSkeleton from "./skeleton";

// Heavy, tab-gated widgets are code-split out of the detail page's first-load
// bundle: the relations subgraph (reactflow + dagre) only renders on the
// Relations tab when there's more than one node, and the Markdown editor
// (react-markdown + remark-gfm) only on the Documentation tab. Both are
// client-only, so ssr:false.
const GraphCanvas = dynamic(
  () => import("@/components/graph/graph-canvas").then((m) => m.GraphCanvas),
  { ssr: false, loading: () => <div className="h-full w-full" /> },
);
const DocumentationEditor = dynamic(
  () => import("@/components/documentation-editor").then((m) => m.DocumentationEditor),
  { ssr: false },
);

// Backend-supported relation types only (omits GENERATES, DEPLOYED_TO).
const SUPPORTED_RELATION_TYPES: RelationType[] = [
  "DEPENDS_ON",
  "DOCUMENTS",
  "IMPLEMENTS",
  "USES",
  "EXPOSES",
  "BELONGS_TO",
  "SECURES",
  "VALIDATES",
  "COMMUNICATES_WITH",
];
import type {
  ArtifactStatus,
  Artifact,
  Relation,
  RelationType,
  ValidationIssue,
} from "@/lib/types";
import { timeAgo, formatDate, isPlaceholderDescription, cn } from "@/lib/utils";

interface BackendRelation {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  description?: string;
}

const VALID_TABS = new Set(["overview", "relations", "documentation", "validation"]);

export default function ArtifactDetailPage({ params }: { params: { projectId: string; artifactId: string } }) {
  const { projectId, artifactId } = params;
  const { graphNodeStyle } = useTweaks();
  const router = useRouter();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const initialTab = (() => {
    const t = searchParams?.get("tab") ?? "";
    return VALID_TABS.has(t) ? t : "overview";
  })();

  const [a, setA] = useState<Artifact | null>(null);
  const [incoming, setIncoming] = useState<BackendRelation[]>([]);
  const [outgoing, setOutgoing] = useState<BackendRelation[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [siblings, setSiblings] = useState<Artifact[]>([]);
  const [linkedSpecs, setLinkedSpecs] = useState<ApiSpec[]>([]);
  const [linkedDbModels, setLinkedDbModels] = useState<DatabaseModel[]>([]);
  const [linkedDiagrams, setLinkedDiagrams] = useState<Diagram[]>([]);
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    const t = searchParams?.get("tab") ?? "";
    if (t && VALID_TABS.has(t) && t !== tab) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);

  const load = async () => {
    try {
      const [art, rels, vi, sibs, specs, models, diagrams] = await Promise.all([
        artifactsApi.get(artifactId),
        relationsApi.list(artifactId) as Promise<{ incoming: BackendRelation[]; outgoing: BackendRelation[] }>,
        validationApi.list(projectId, { artifactId }),
        artifactsApi.list(projectId),
        apiSpecsApi.list(projectId, { artifactId }),
        databaseModelsApi.list(projectId, { artifactId }),
        diagramsApi.list(projectId, { artifactId }),
      ]);
      setA(art);
      setIncoming(rels.incoming);
      setOutgoing(rels.outgoing);
      setIssues(vi.filter((v) => v.artifactId === art.id));
      setSiblings(sibs);
      setLinkedSpecs(specs);
      setLinkedDbModels(models);
      setLinkedDiagrams(diagrams);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to load artifact"));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactId]);

  const subgraph = useMemo(() => {
    if (!a) return { nodes: [] as Artifact[], rels: [] as Relation[] };
    const byId = new Map(siblings.map((s) => [s.id, s]));
    const ids = Array.from(new Set([
      ...incoming.map((r) => r.source),
      ...outgoing.map((r) => r.target),
    ])).filter((id) => id !== a.id);
    const radius = 180;
    const items = ids.map((id, i) => {
      const n = byId.get(id);
      if (!n) return null;
      const ang = (i / Math.max(ids.length, 1)) * Math.PI * 2;
      return { ...n, gx: Math.cos(ang) * radius, gy: Math.sin(ang) * radius } as Artifact;
    }).filter(Boolean) as Artifact[];
    const center: Artifact = { ...a, gx: 0, gy: 0 };
    const rels: Relation[] = [...incoming, ...outgoing].map((r) => ({
      id: r.id,
      source: r.source,
      target: r.target,
      type: r.type,
      description: r.description,
    }));
    return { nodes: [center, ...items], rels };
  }, [a, siblings, incoming, outgoing]);

  if (!a) {
    return <ArtifactDetailSkeleton />;
  }

  const byId = new Map(siblings.map((s) => [s.id, s]));

  const onDelete = async () => {
    if (!(await confirm({
      title: "Delete artifact",
      message: `This permanently deletes the artifact "${a.title}" and cannot be undone.`,
      confirmLabel: "Delete artifact",
      destructive: true,
      confirmPhrase: a.title,
    }))) return;
    try {
      await artifactsApi.remove(a.id);
      toast.success("Artifact deleted");
      router.push(`/projects/${projectId}/artifacts`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete"));
    }
  };

  const onDeleteRelation = async (rel: Relation, otherTitle: string) => {
    if (!(await confirm({
      title: "Remove relationship",
      message: `Remove the "${rel.type.toLowerCase().replace(/_/g, " ")}" relationship to "${otherTitle}"? You can re-add it with the Add button.`,
      confirmLabel: "Remove",
      destructive: true,
    }))) return;
    try {
      await relationsApi.remove(rel.id);
      toast.success("Relation removed");
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove relation"));
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow={<>
          <TypeChip type={a.type} />
          <StatusBadge status={a.status} />
          {a.tags.map((t) => <Badge key={t} mono>{t}</Badge>)}
        </>}
        title={a.title}
        subtitle={isPlaceholderDescription(a.description, a.title) ? undefined : a.description}
        actions={<>
          <Link href={`/projects/${projectId}/impact/${a.id}`}>
            <Button variant="primary" icon={<Activity size={13} />}>Analyze impact</Button>
          </Link>
          <Button icon={<Edit size={13} />} onClick={() => setEditing(true)}>Edit</Button>
          <Button icon={<LinkIcon size={13} />} onClick={() => setLinking(true)}>Link</Button>
          <Button variant="danger" icon={<Trash2 size={13} />} onClick={onDelete}>Delete</Button>
        </>}
      >
        <div className="flex items-center gap-x-4 gap-y-1.5 text-[12px] text-fg-muted mt-2 flex-wrap">
          <span className="flex items-center gap-1.5"><Avatar user={a.author} size={14} /> {a.author.firstName} {a.author.lastName}</span>
          <span title={formatDate(a.updatedAt)}>Updated {timeAgo(a.updatedAt)}</span>
          <ValidationChip issues={issues} onOpen={() => setTab("validation")} />
        </div>
      </PageHeader>

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "overview", label: "Overview" },
        { id: "relations", label: "Relations", count: incoming.length + outgoing.length },
        { id: "documentation", label: "Documentation" },
        { id: "validation", label: "Validation", count: issues.length, countTone: validationTone(issues) },
      ]} />

      {tab === "overview" && (
        <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5 items-start">
          <div className="flex flex-col gap-5 min-w-0">
            <Card title="Mini-graph" subtitle="This artifact and its direct neighbors" padded={false} className="min-w-0">
              <div style={{ height: 300, position: "relative" }}>
                {subgraph.nodes.length <= 1 ? (
                  <div className="h-full flex items-center justify-center text-fg-muted text-[13px] px-4 text-center">
                    No relations yet. Use Link to connect this artifact to another.
                  </div>
                ) : (
                  <GraphCanvas artifacts={subgraph.nodes} relations={subgraph.rels} selectedId={a.id} nodeStyle={graphNodeStyle} draggable={false} fitView highlightSelected={false} showMiniMap={false} autoLayout="LR" />
                )}
              </div>
            </Card>
            <Card title="Description"><div className="text-[14px] leading-relaxed">{isPlaceholderDescription(a.description, a.title) ? <span className="text-fg-muted">No description provided.</span> : a.description}</div></Card>
          </div>
          <div className="flex flex-col gap-5 min-w-0">
            <Card title="Metadata" className="min-w-0">
              <Meta k="Created" v={<span className="text-[13px] text-fg-muted" title={timeAgo(a.createdAt)}>{formatDate(a.createdAt)}</span>} />
              <Meta k="ID"      v={<CopyableId id={a.id} />} last />
            </Card>
            {(linkedSpecs.length > 0 || linkedDbModels.length > 0 || linkedDiagrams.length > 0) && (
              <Card title="Linked resources">
                {linkedSpecs.map((s) => (
                  <Link key={s.id} href={`/projects/${projectId}/api/${s.id}`} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                    <Plug size={13} className="text-accent shrink-0" />
                    <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{s.title}</span>
                    <Badge mono>v{s.version}</Badge>
                    <Badge tone="success">{s.endpointCount}</Badge>
                  </Link>
                ))}
                {linkedDbModels.map((m) => (
                  <Link key={m.id} href={`/projects/${projectId}/database/${m.id}`} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                    <Database size={13} className="text-accent shrink-0" />
                    <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{m.title}</span>
                    <Badge mono>{m.databaseType}</Badge>
                    <Badge tone="success">{m.entityCount}</Badge>
                  </Link>
                ))}
                {linkedDiagrams.map((d) => (
                  <Link key={d.id} href={`/projects/${projectId}/diagrams/${d.id}`} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                    <GitMerge size={13} className="text-accent shrink-0" />
                    <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{d.title}</span>
                    <Badge mono>{d.type}</Badge>
                  </Link>
                ))}
              </Card>
            )}
            <Card title={`Linked (${incoming.length + outgoing.length})`}>
              {[...outgoing, ...incoming].slice(0, 6).map((r) => {
                const isOut = r.source === a.id;
                const otherId = isOut ? r.target : r.source;
                const other = byId.get(otherId);
                if (!other) return null;
                return (
                  <Link key={r.id} href={`/projects/${projectId}/artifacts/${other.id}`} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                    <TypeChip type={other.type} />
                    <span className="flex-1 min-w-0 text-[13px] truncate">{other.title}</span>
                    <span className="font-mono text-[10.5px] px-1.5 py-px rounded" style={{ color: EDGE_COLOR[r.type], border: `1px solid ${EDGE_COLOR[r.type]}33` }}>
                      {isOut ? "→ " : "← "}{r.type}
                    </span>
                  </Link>
                );
              })}
              {(incoming.length + outgoing.length) === 0 && (
                <div className="text-fg-muted text-[13px]">No links yet.</div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "relations" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card title={`Outgoing (${outgoing.length})`} action={
            <Button size="sm" icon={<LinkIcon size={12} />} onClick={() => setLinking(true)}>Add</Button>
          }>
            {outgoing.length === 0 ? <div className="text-fg-muted text-[13px]">No outgoing relations.</div> :
              outgoing.map((r) => (
                <div key={r.id} className="flex items-center gap-2.5 py-2.5 border-b border-border last:border-0">
                  <span className="font-mono text-[10.5px] px-1.5 py-px rounded shrink-0" style={{ color: EDGE_COLOR[r.type], border: `1px solid ${EDGE_COLOR[r.type]}33` }}>{r.type}</span>
                  <Link href={`/projects/${projectId}/artifacts/${r.target}`} className="flex items-center gap-2 min-w-0 flex-1">
                    <TypeChip type={byId.get(r.target)?.type ?? "SERVICE"} />
                    <span className="text-[13px] font-medium truncate">{byId.get(r.target)?.title ?? r.target}</span>
                  </Link>
                  <button className="text-fg-muted hover:text-danger" onClick={() => onDeleteRelation(r, byId.get(r.target)?.title ?? r.target)} title="Remove">
                    <X size={14} />
                  </button>
                </div>
              ))
            }
          </Card>
          <Card title={`Incoming (${incoming.length})`}>
            {incoming.length === 0 ? <div className="text-fg-muted text-[13px]">No incoming relations.</div> :
              incoming.map((r) => (
                <div key={r.id} className="flex items-center gap-2.5 py-2.5 border-b border-border last:border-0">
                  <span className="font-mono text-[10.5px] px-1.5 py-px rounded shrink-0" style={{ color: EDGE_COLOR[r.type], border: `1px solid ${EDGE_COLOR[r.type]}33` }}>{r.type}</span>
                  <Link href={`/projects/${projectId}/artifacts/${r.source}`} className="flex items-center gap-2 min-w-0 flex-1">
                    <TypeChip type={byId.get(r.source)?.type ?? "SERVICE"} />
                    <span className="text-[13px] font-medium truncate">{byId.get(r.source)?.title ?? r.source}</span>
                  </Link>
                </div>
              ))
            }
          </Card>
        </div>
      )}

      {tab === "documentation" && (
        <DocumentationEditor projectId={projectId} artifactId={a.id} />
      )}

      {tab === "validation" && (
        issues.length === 0 ? <Empty title="No issues for this artifact" message="Run validation from the project overview to refresh." /> : (
          <Card padded={false}>
            <table className="w-full text-[13px]">
              <thead className="bg-panel"><tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
                <th className="text-left px-3.5 py-2.5 border-b border-border">Severity</th>
                <th className="text-left px-3.5 py-2.5 border-b border-border">Category</th>
                <th className="text-left px-3.5 py-2.5 border-b border-border">Message</th>
                <th className="text-left px-3.5 py-2.5 border-b border-border">Status</th>
              </tr></thead>
              <tbody>{issues.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0">
                  <td className="px-3.5 py-3"><SeverityBadge severity={i.severity} /></td>
                  <td className="px-3.5 py-3"><Badge mono>{i.category}</Badge></td>
                  <td className="px-3.5 py-3">{i.message}</td>
                  <td className="px-3.5 py-3"><StatusBadge status={i.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        )
      )}

      {editing && (
        <EditArtifactDialog
          artifact={a}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}

      {linking && (
        <LinkArtifactDialog
          artifact={a}
          siblings={siblings.filter((s) => s.id !== a.id)}
          onClose={() => setLinking(false)}
          onCreated={() => { setLinking(false); load(); }}
        />
      )}
    </div>
  );
}

function Meta({ k, v, last }: { k: string; v: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center py-2 ${last ? "" : "border-b border-border"}`}>
      <span className="w-[84px] text-[12px] text-fg-muted shrink-0">{k}</span>
      <span className="min-w-0">{v}</span>
    </div>
  );
}

// Worst severity present, used to tint the Validation tab count. Undefined ⇒ clean.
function validationTone(issues: ValidationIssue[]): "danger" | "warning" | "info" | undefined {
  if (issues.some((i) => i.severity === "ERROR" || i.severity === "CRITICAL")) return "danger";
  if (issues.some((i) => i.severity === "WARNING")) return "warning";
  if (issues.length > 0) return "info";
  return undefined;
}

// Lightweight, always-visible validation signal in the header. Reads the issue set
// already loaded for this artifact (no extra request); clicking opens the Validation tab.
function ValidationChip({ issues, onOpen }: { issues: ValidationIssue[]; onOpen: () => void }) {
  if (issues.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-success" title="No validation findings for this artifact">
        <CheckCircle2 size={13} /> Validated
      </span>
    );
  }
  const errors = issues.filter((i) => i.severity === "ERROR" || i.severity === "CRITICAL").length;
  const warnings = issues.filter((i) => i.severity === "WARNING").length;
  const infos = issues.filter((i) => i.severity === "INFO").length;
  const parts: string[] = [];
  if (errors) parts.push(`${errors} error${errors > 1 ? "s" : ""}`);
  if (warnings) parts.push(`${warnings} warning${warnings > 1 ? "s" : ""}`);
  if (infos && !errors && !warnings) parts.push(`${infos} info`);
  const toneClass = errors ? "text-danger" : warnings ? "text-warning" : "text-info";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("inline-flex items-center gap-1.5 hover:underline", toneClass)}
      title="View validation findings"
    >
      <AlertTriangle size={13} /> {parts.join(" · ") || `${issues.length} issue${issues.length > 1 ? "s" : ""}`}
    </button>
  );
}

// De-emphasized, copyable artifact ID — kept for support/debugging without competing
// with real metadata in the header.
function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(id).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 1200); },
        () => toast.error("Could not copy ID"),
      )}
      className="inline-flex items-center gap-1.5 max-w-full font-mono text-[11.5px] text-fg-muted hover:text-fg"
      title="Copy ID"
    >
      <span className="truncate">{id}</span>
      {copied ? <Check size={12} className="text-success shrink-0" /> : <Copy size={12} className="shrink-0 opacity-60" />}
    </button>
  );
}

function EditArtifactDialog({ artifact, onClose, onSaved }: { artifact: Artifact; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(artifact.title);
  const [status, setStatus] = useState<ArtifactStatus>(artifact.status);
  const [description, setDescription] = useState(artifact.description);
  const [busy, setBusy] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  const save = async () => {
    setTitleError(null);
    setBusy(true);
    try {
      await artifactsApi.update(artifact.id, { title: title.trim(), status, description });
      toast.success("Artifact updated");
      onSaved();
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: { code?: string } } | undefined)?.error?.code : null;
      const msg = errorMessage(err, "Could not update");
      if (code === "ARTIFACT_TITLE_TAKEN") setTitleError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit artifact" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="text-[12.5px] text-fg-muted font-medium">Title</label>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(null); }}
          aria-invalid={titleError ? true : undefined}
          className={`bg-panel border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent ${titleError ? "border-danger" : "border-border"}`}
        />
        {titleError && <div className="text-[12px] text-danger">{titleError}</div>}
        <label className="text-[12.5px] text-fg-muted font-medium">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as ArtifactStatus)}
          className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="DEPRECATED">Deprecated</option>
        </select>
        <label className="text-[12.5px] text-fg-muted font-medium">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
          className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent min-h-[96px]" />
        <div className="flex justify-end gap-2 mt-1">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function LinkArtifactDialog({ artifact, siblings, onClose, onCreated }: {
  artifact: Artifact;
  siblings: Artifact[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [target, setTarget] = useState<string>(siblings[0]?.id ?? "");
  const [type, setType] = useState<RelationType>("DEPENDS_ON");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!target) {
      toast.error("Pick a target artifact");
      return;
    }
    setBusy(true);
    try {
      await relationsApi.create(artifact.id, { targetArtifactId: target, relationType: type, description: desc });
      toast.success("Relation created");
      onCreated();
    } catch (err) {
      toast.error(errorMessage(err, "Could not create relation"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Link this artifact" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="text-[12.5px] text-fg-muted font-medium">Target artifact</label>
        <select value={target} onChange={(e) => setTarget(e.target.value)}
          className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
          {siblings.length === 0 && <option value="">No other artifacts in this project</option>}
          {siblings.map((s) => (
            <option key={s.id} value={s.id}>{s.title} — {s.type}</option>
          ))}
        </select>
        <label className="text-[12.5px] text-fg-muted font-medium">Relation type</label>
        <select value={type} onChange={(e) => setType(e.target.value as RelationType)}
          className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
          {SUPPORTED_RELATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="text-[12.5px] text-fg-muted font-medium">Description (optional)</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)}
          className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
        <div className="flex justify-end gap-2 mt-1">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={busy || siblings.length === 0}>
            {busy ? "Linking…" : "Create relation"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="w-[460px] max-w-[92vw] bg-panel border border-border rounded-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center">
          <div className="font-semibold">{title}</div>
          <button className="ml-auto text-fg-muted hover:text-fg" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
