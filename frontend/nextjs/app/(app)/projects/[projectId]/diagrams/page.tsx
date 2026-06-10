// app/(app)/projects/[projectId]/diagrams/page.tsx — visual diagram gallery
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GitMerge, X, Info } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Empty } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { TypeChip } from "@/components/ui/type-chip";
import { OpenLink } from "@/components/ui/open-link";
import { MermaidPreview } from "@/components/mermaid-preview";
import { artifactsApi } from "@/lib/api/artifacts";
import {
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_BLURBS,
  DIAGRAM_PURPOSES,
  diagramsApi,
  type Diagram,
  type DiagramPurpose,
  type DiagramType,
} from "@/lib/api/diagrams";
import { ApiError } from "@/lib/api/client";
import type { Artifact } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export default function DiagramsListPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const router = useRouter();

  const [diagrams, setDiagrams] = useState<Diagram[] | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | DiagramType>("ALL");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const [list, arts] = await Promise.all([
        diagramsApi.list(projectId),
        artifactsApi.list(projectId),
      ]);
      setDiagrams(list);
      setArtifacts(arts);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load diagrams");
      setDiagrams([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (diagrams ?? []).filter(
      (d) =>
        (typeFilter === "ALL" || d.type === typeFilter) &&
        (!term ||
          d.title.toLowerCase().includes(term) ||
          d.description.toLowerCase().includes(term)),
    );
  }, [diagrams, q, typeFilter]);

  const artifactsById = useMemo(() => new Map(artifacts.map((a) => [a.id, a])), [artifacts]);

  return (
    <div className="px-4 py-6 md:px-8 max-w-[1280px] mx-auto">
      <PageHeader
        title="Diagrams"
        subtitle={diagrams === null ? "Loading…" : `${diagrams.length} diagram${diagrams.length === 1 ? "" : "s"} · architecture visualisations`}
        actions={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Search by title…" className="w-full sm:w-[220px]" />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "ALL" | DiagramType)}
              className="h-8 px-2.5 pr-7 bg-panel border border-border rounded-sm text-[13.5px]">
              <option value="ALL">All types</option>
              {DIAGRAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Button variant="primary" onClick={() => setCreating(true)}>
              New diagram
            </Button>
          </>
        }
      />

      {typeFilter !== "ALL" && (
        <div className="mb-4 inline-flex items-start gap-2 px-3 py-2 rounded-md bg-panel-2 border border-border text-[12.5px] text-fg-muted">
          <Info size={13} className="mt-0.5 shrink-0 text-accent" />
          <span><strong className="text-fg">{typeFilter}:</strong> {DIAGRAM_TYPE_BLURBS[typeFilter]}</span>
        </div>
      )}

      {diagrams !== null && diagrams.length === 0 ? (
        <Empty
          icon={<GitMerge size={28} />}
          title="No diagrams yet"
          message="Use Mermaid to sketch flows, sequences, ER diagrams or component layouts. Pick a starter template to begin."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              New diagram
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <Empty title="No diagrams match" message="Try a different filter." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => (
            <DiagramCard
              key={d.id}
              diagram={d}
              linkedArtifact={d.artifactId ? artifactsById.get(d.artifactId) ?? null : null}
              projectId={projectId}
            />
          ))}
        </div>
      )}

      {creating && (
        <NewDiagramModal
          projectId={projectId}
          artifacts={artifacts}
          onClose={() => setCreating(false)}
          onCreated={(d) => {
            setCreating(false);
            router.push(`/projects/${projectId}/diagrams/${d.id}?edit=1`);
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────── Gallery card ──────────────────────────────

function DiagramCard({
  diagram,
  linkedArtifact,
  projectId,
}: {
  diagram: Diagram;
  linkedArtifact: Artifact | null;
  projectId: string;
}) {
  const href = `/projects/${projectId}/diagrams/${diagram.id}`;
  return (
    <article className="group bg-panel border border-border rounded-lg overflow-hidden flex flex-col hover:border-border-strong transition-colors">
      <a
        href={href}
        className="block bg-panel-2 border-b border-border h-[160px] overflow-hidden relative"
        aria-label={`Open ${diagram.title}`}
      >
        {diagram.mermaidSource.trim() ? (
          <div className="absolute inset-0 flex items-center justify-center p-3 pointer-events-none [&_svg]:max-h-[140px] [&_svg]:max-w-full">
            <DiagramThumb source={diagram.mermaidSource} fallbackType={diagram.type} fallbackTitle={diagram.title} />
          </div>
        ) : (
          <DiagramFallback type={diagram.type} title={diagram.title} />
        )}
      </a>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start gap-2">
          <div className="font-semibold text-[14px] tracking-tight flex-1 truncate" title={diagram.title}>
            {diagram.title}
          </div>
          <Badge mono>{diagram.type}</Badge>
        </div>
        <div className="text-[12.5px] text-fg-muted leading-relaxed line-clamp-2 min-h-[2.6em]">
          {diagram.description || <em className="text-fg-subtle">No description</em>}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[12px] text-fg-muted">
          {linkedArtifact ? (
            <span className="inline-flex items-center gap-1.5">
              <TypeChip type={linkedArtifact.type} />
              <span className="truncate max-w-[160px]" title={linkedArtifact.title}>{linkedArtifact.title}</span>
            </span>
          ) : (
            <span className="text-fg-subtle">No linked artifact</span>
          )}
        </div>
        <div className="flex items-center justify-between pt-2 mt-auto border-t border-border">
          <span className="text-[11.5px] text-fg-subtle">Updated {timeAgo(diagram.updatedAt)}</span>
          <OpenLink href={href} />
        </div>
      </div>
    </article>
  );
}

function DiagramThumb({
  source,
  fallbackType,
  fallbackTitle,
}: {
  source: string;
  fallbackType: DiagramType;
  fallbackTitle: string;
}) {
  // The shared MermaidPreview lazily loads Mermaid on first render. For the
  // gallery we render it directly — Mermaid handles its own errors and we
  // fall back to a text card if rendering fails entirely. The container
  // clamps the SVG height via CSS so the thumbnail stays consistent.
  return (
    <div className="w-full h-full pointer-events-none select-none">
      <MermaidPreview source={source} center={true} />
      <noscript>
        <DiagramFallback type={fallbackType} title={fallbackTitle} />
      </noscript>
    </div>
  );
}

function DiagramFallback({ type, title }: { type: DiagramType; title: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-fg-subtle">
      <GitMerge size={28} />
      <Badge mono>{type}</Badge>
      <div className="text-[12px] text-fg-muted px-3 text-center truncate max-w-full">{title}</div>
    </div>
  );
}

// ────────────────────────────── New diagram (purpose picker) ──────────────────────────────

function NewDiagramModal({
  projectId,
  artifacts,
  onClose,
  onCreated,
}: {
  projectId: string;
  artifacts: Artifact[];
  onClose: () => void;
  onCreated: (d: Diagram) => void;
}) {
  const [purpose, setPurpose] = useState<DiagramPurpose | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [artifactId, setArtifactId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const pickPurpose = (p: DiagramPurpose) => {
    setPurpose(p);
    if (!title.trim()) setTitle(p.label);
    if (!description.trim()) setDescription(p.description);
  };

  const create = async () => {
    if (!purpose) {
      toast.error("Pick a purpose first.");
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    setBusy(true);
    try {
      const d = await diagramsApi.create(projectId, {
        title: title.trim(),
        type: purpose.diagramType,
        description: description.trim(),
        artifactId: artifactId || null,
        mermaidSource: purpose.mermaidSource,
      });
      toast.success(`Created "${d.title}"`);
      onCreated(d);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create diagram");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/55 px-4" onClick={onClose}>
      <div
        className="bg-panel border border-border rounded-lg w-full max-w-[860px] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-panel">
          <div className="font-semibold text-[14px]">New diagram</div>
          <button onClick={onClose} className="w-7 h-7 grid place-items-center rounded-sm text-fg-muted hover:bg-panel-hover hover:text-fg" aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-4">
          {!purpose ? (
            <>
              <div className="text-[12.5px] text-fg-muted">
                What is this diagram for? Pick a purpose — Minotaurus will set the diagram type and seed an editable template.
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {DIAGRAM_PURPOSES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPurpose(p)}
                    className="text-left bg-panel-2 border border-border rounded-md p-3 hover:border-border-strong transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-[13.5px]">{p.label}</span>
                      <Badge mono>{p.diagramType}</Badge>
                    </div>
                    <div className="text-[12px] text-fg-muted leading-relaxed">{p.description}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPurpose(null)}>← Change purpose</Button>
                <div className="text-[13px] font-medium">{purpose.label}</div>
                <Badge mono>{purpose.diagramType}</Badge>
              </div>
              <div className="bg-panel-2 border border-border rounded-md px-3 py-2 text-[12.5px] text-fg-muted">
                <strong className="text-fg">{purpose.diagramType}:</strong> {DIAGRAM_TYPE_BLURBS[purpose.diagramType]}
              </div>
              <Field label="Title">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={purpose.label}
                  className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
              </Field>
              <Field label="Description">
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this diagram show?"
                  className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent min-h-[72px]" />
              </Field>
              <Field label="Linked artifact (optional)">
                <select value={artifactId} onChange={(e) => setArtifactId(e.target.value)}
                  className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
                  <option value="">— None —</option>
                  {artifacts.map((a) => (
                    <option key={a.id} value={a.id}>{a.title} ({a.type})</option>
                  ))}
                </select>
              </Field>
              <details className="text-[12.5px] text-fg-muted">
                <summary className="cursor-pointer select-none text-fg-muted hover:text-fg">Preview template Mermaid source</summary>
                <pre className="mt-2 bg-panel-2 border border-border rounded-md p-2.5 text-[12px] font-mono overflow-auto" style={{ maxHeight: 220 }}>
                  {purpose.mermaidSource}
                </pre>
              </details>
              <div className="flex justify-end gap-2 mt-1">
                <Button onClick={onClose} disabled={busy}>Cancel</Button>
                <Button variant="primary" onClick={create} disabled={busy || !title.trim()}>
                  {busy ? "Creating…" : "Create diagram"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] text-fg-muted font-medium">{label}</label>
      {children}
    </div>
  );
}
