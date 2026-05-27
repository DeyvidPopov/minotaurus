// app/(app)/projects/[projectId]/diagrams/[diagramId]/page.tsx — diagram detail
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Trash2, Save, X, Copy, Maximize2, Minimize2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { MermaidPreview } from "@/components/mermaid-preview";

export default function DiagramDetailPage({
  params,
}: {
  params: { projectId: string; diagramId: string };
}) {
  const { projectId, diagramId } = params;
  const router = useRouter();

  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [source, setSource] = useState("");
  const [savedSource, setSavedSource] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);

  const load = async () => {
    try {
      const [d, arts] = await Promise.all([
        diagramsApi.get(diagramId),
        artifactsApi.list(projectId),
      ]);
      setDiagram(d);
      setSource(d.mermaidSource);
      setSavedSource(d.mermaidSource);
      setArtifacts(arts);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load diagram");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId]);

  const linkedArtifact = useMemo(
    () => (diagram?.artifactId ? artifacts.find((a) => a.id === diagram.artifactId) ?? null : null),
    [diagram, artifacts],
  );

  if (!diagram) {
    return <div className="px-8 py-6 text-fg-muted">Loading…</div>;
  }

  const dirty = source !== savedSource;

  const save = async () => {
    setSaving(true);
    try {
      const updated = await diagramsApi.update(diagram.id, { mermaidSource: source });
      setDiagram(updated);
      setSavedSource(updated.mermaidSource);
      toast.success("Diagram saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirm(`Delete diagram "${diagram.title}"? This cannot be undone.`)) return;
    try {
      await diagramsApi.remove(diagram.id);
      toast.success("Diagram deleted");
      router.push(`/projects/${projectId}/diagrams`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  };

  const copySource = () => {
    navigator.clipboard.writeText(source).then(
      () => toast.success("Mermaid source copied"),
      () => toast.error("Clipboard blocked"),
    );
  };

  const loadTemplate = () => {
    if (dirty && !confirm("Replace the current source with the template for this type?")) return;
    setSource(MERMAID_TEMPLATES[diagram.type]);
  };

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[120] bg-bg flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <Badge mono>{diagram.type}</Badge>
          <div className="font-semibold text-[14px]">{diagram.title}</div>
          <div className="flex-1" />
          <Button icon={<Minimize2 size={13} />} onClick={() => setFullscreen(false)}>Exit fullscreen</Button>
        </div>
        <div className="flex-1 overflow-auto p-6 grid place-items-center bg-panel-2">
          <MermaidPreview source={source} className="max-w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6 max-w-[1280px] mx-auto">
      <PageHeader
        eyebrow={
          <>
            <Badge mono>DIAGRAM</Badge>
            <Badge mono>{diagram.type}</Badge>
          </>
        }
        title={diagram.title}
        subtitle={diagram.description || "No description"}
        actions={
          <>
            <Button icon={<Edit size={13} />} onClick={() => setEditingMeta(true)}>Edit</Button>
            <Button icon={<Trash2 size={13} />} onClick={onDelete}>Delete</Button>
          </>
        }
      >
        <div className="flex items-center gap-4 text-[12px] text-fg-muted mt-2 flex-wrap">
          {linkedArtifact ? (
            <Link href={`/projects/${projectId}/artifacts/${linkedArtifact.id}`} className="flex items-center gap-1.5 hover:text-fg">
              <span>Linked to</span>
              <TypeChip type={linkedArtifact.type} />
              <strong className="text-fg">{linkedArtifact.title}</strong>
            </Link>
          ) : (
            <span className="text-fg-subtle">No linked artifact</span>
          )}
          <span>Updated {timeAgo(diagram.updatedAt)}</span>
          <span className="font-mono text-[11.5px]">{diagram.id}</span>
        </div>
      </PageHeader>

      <Card
        title="Mermaid editor"
        subtitle="Edit the source on the left; preview updates automatically on the right."
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" icon={<Wand2 size={12} />} onClick={loadTemplate}>Load template</Button>
            <Button size="sm" icon={<Copy size={12} />} onClick={copySource}>Copy</Button>
            <Button size="sm" icon={<Maximize2 size={12} />} onClick={() => setFullscreen(true)}>Fullscreen</Button>
            <Button size="sm" variant="primary" icon={<Save size={12} />} onClick={save} disabled={saving || !dirty}>
              {saving ? "Saving…" : dirty ? "Save" : "Saved"}
            </Button>
          </div>
        }
        padded={false}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            placeholder="flowchart TD&#10;  A --> B"
            className="min-h-[460px] bg-panel-2 border-0 border-r border-border outline-none p-4 text-[13px] font-mono leading-relaxed resize-none"
          />
          <div className="min-h-[460px] p-4 overflow-auto bg-bg">
            {source.trim() ? (
              <MermaidPreview source={source} />
            ) : (
              <div className="text-fg-subtle text-[13px] italic">Add Mermaid source to see a preview.</div>
            )}
          </div>
        </div>
      </Card>

      {editingMeta && (
        <EditMetaModal
          diagram={diagram}
          artifacts={artifacts}
          onClose={() => setEditingMeta(false)}
          onSaved={(updated) => { setEditingMeta(false); setDiagram(updated); }}
        />
      )}
    </div>
  );
}

function EditMetaModal({
  diagram,
  artifacts,
  onClose,
  onSaved,
}: {
  diagram: Diagram;
  artifacts: Artifact[];
  onClose: () => void;
  onSaved: (d: Diagram) => void;
}) {
  const [title, setTitle] = useState(diagram.title);
  const [type, setType] = useState<DiagramType>(diagram.type);
  const [description, setDescription] = useState(diagram.description);
  const [artifactId, setArtifactId] = useState<string>(diagram.artifactId ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setBusy(true);
    try {
      const updated = await diagramsApi.update(diagram.id, {
        title: title.trim(),
        type,
        description: description.trim(),
        artifactId: artifactId || null,
      });
      toast.success("Diagram updated");
      onSaved(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="w-[520px] max-w-[92vw] bg-panel border border-border rounded-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center">
          <div className="font-semibold">Edit diagram</div>
          <button className="ml-auto text-fg-muted hover:text-fg" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
          </Field>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as DiagramType)}
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
              {DIAGRAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Linked artifact">
            <select value={artifactId} onChange={(e) => setArtifactId(e.target.value)}
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
              <option value="">— None —</option>
              {artifacts.map((a) => (
                <option key={a.id} value={a.id}>{a.title} ({a.type})</option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent min-h-[80px]" />
          </Field>
          <div className="flex justify-end gap-2 mt-1">
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" icon={<Save size={13} />} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
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
