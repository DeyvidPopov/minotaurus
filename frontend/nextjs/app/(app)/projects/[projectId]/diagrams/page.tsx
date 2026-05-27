// app/(app)/projects/[projectId]/diagrams/page.tsx — list diagrams
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronRight, X, GitMerge } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { Empty } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { TypeChip } from "@/components/ui/type-chip";
import { artifactsApi } from "@/lib/api/artifacts";
import {
  DIAGRAM_TYPES,
  MERMAID_TEMPLATES,
  diagramsApi,
  type Diagram,
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

  const filtered = (diagrams ?? []).filter(
    (d) =>
      (typeFilter === "ALL" || d.type === typeFilter) &&
      (!q.trim() ||
        d.title.toLowerCase().includes(q.toLowerCase()) ||
        d.description.toLowerCase().includes(q.toLowerCase())),
  );

  const artifactsById = new Map(artifacts.map((a) => [a.id, a]));

  return (
    <div className="px-8 py-6 max-w-[1200px] mx-auto">
      <PageHeader
        title="Diagrams"
        subtitle={diagrams === null ? "Loading…" : `${diagrams.length} diagram${diagrams.length === 1 ? "" : "s"}`}
        actions={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Filter…" className="w-[220px]" />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "ALL" | DiagramType)}
              className="h-8 px-2.5 pr-7 bg-panel border border-border rounded-sm text-[13.5px]">
              <option value="ALL">All types</option>
              {DIAGRAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
              New diagram
            </Button>
          </>
        }
      />

      {diagrams !== null && diagrams.length === 0 ? (
        <Empty
          icon={<GitMerge size={28} />}
          title="No diagrams yet"
          message="Use Mermaid to sketch flows, sequence interactions, ER diagrams or component layouts. Pick a starter template to begin."
          action={
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
              New diagram
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <Empty title="No diagrams match" message="Try a different filter." />
      ) : (
        <Card padded={false}>
          <table className="w-full text-[13px]">
            <thead className="bg-panel">
              <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
                <th className="text-left px-3.5 py-2.5 border-b border-border">Title</th>
                <th className="text-left px-3.5 py-2.5 border-b border-border">Type</th>
                <th className="text-left px-3.5 py-2.5 border-b border-border">Linked artifact</th>
                <th className="text-left px-3.5 py-2.5 border-b border-border">Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const art = d.artifactId ? artifactsById.get(d.artifactId) : null;
                return (
                  <tr key={d.id} className="hover:bg-panel-hover cursor-pointer" onClick={() => router.push(`/projects/${projectId}/diagrams/${d.id}`)}>
                    <td className="px-3.5 py-3 border-b border-border">
                      <div className="font-medium">{d.title}</div>
                      <div className="text-[12px] text-fg-muted truncate max-w-[420px]">
                        {d.description || <em className="text-fg-subtle">No description</em>}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 border-b border-border">
                      <Badge mono>{d.type}</Badge>
                    </td>
                    <td className="px-3.5 py-3 border-b border-border">
                      {art ? (
                        <div className="flex items-center gap-2">
                          <TypeChip type={art.type} />
                          <span>{art.title}</span>
                        </div>
                      ) : (
                        <span className="text-fg-subtle text-[12px]">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 border-b border-border text-fg-muted text-[12.5px]">{timeAgo(d.updatedAt)}</td>
                    <td className="px-3.5 py-3 border-b border-border">
                      <ChevronRight size={13} className="text-fg-subtle" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {creating && (
        <CreateDiagramModal
          projectId={projectId}
          artifacts={artifacts}
          onClose={() => setCreating(false)}
          onCreated={(d) => {
            setCreating(false);
            router.push(`/projects/${projectId}/diagrams/${d.id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateDiagramModal({
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
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DiagramType>("FLOWCHART");
  const [description, setDescription] = useState("");
  const [artifactId, setArtifactId] = useState<string>("");
  const [useTemplate, setUseTemplate] = useState(true);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setBusy(true);
    try {
      const d = await diagramsApi.create(projectId, {
        title: title.trim(),
        type,
        description: description.trim(),
        artifactId: artifactId || null,
        mermaidSource: useTemplate ? MERMAID_TEMPLATES[type] : "",
      });
      toast.success(`Diagram "${d.title}" created`);
      onCreated(d);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create diagram");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="w-[520px] max-w-[92vw] bg-panel border border-border rounded-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center">
          <div className="font-semibold">New diagram</div>
          <button className="ml-auto text-fg-muted hover:text-fg" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Architecture Overview"
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
          </Field>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as DiagramType)}
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
              {DIAGRAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
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
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this diagram show?"
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent min-h-[64px]" />
          </Field>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={useTemplate} onChange={(e) => setUseTemplate(e.target.checked)} />
            Start from <Badge mono>{type}</Badge> template
          </label>
          <div className="flex justify-end gap-2 mt-1">
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
          </div>
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
