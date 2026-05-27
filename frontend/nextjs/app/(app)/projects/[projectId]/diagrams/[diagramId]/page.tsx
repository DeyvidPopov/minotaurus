// app/(app)/projects/[projectId]/diagrams/[diagramId]/page.tsx — diagram detail
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Trash2, Save, X, Copy, Maximize2, Minimize2, Wand2, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
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
import { MermaidPreview, type MermaidStatus } from "@/components/mermaid-preview";

const TEMPLATE_BLURBS: Record<DiagramType, string> = {
  FLOWCHART: "Top-down boxes and arrows. Best for request flows and architectures.",
  SEQUENCE: "Vertical lifelines showing interaction order between actors.",
  ERD: "Entity-relationship boxes with cardinality. Use for data models.",
  CLASS: "OOP class diagrams with attributes, methods and relations.",
  STATE: "State machine with transitions between named states.",
  GANTT: "Time-based project plan with tasks, sections and dependencies.",
  ARCHITECTURE: "Left-to-right component flow. Good for high-level system shape.",
};

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
  const [templateModal, setTemplateModal] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<{ type: DiagramType; source: string } | null>(null);
  const [status, setStatus] = useState<MermaidStatus>("idle");
  const [statusError, setStatusError] = useState<string | null>(null);

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

  const onStatusChange = useCallback((s: MermaidStatus, err: string | null) => {
    setStatus(s);
    setStatusError(err);
  }, []);

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

  const applyTemplate = (type: DiagramType) => {
    const tpl = MERMAID_TEMPLATES[type];
    if (source.trim()) {
      // confirmation modal instead of an immediate overwrite
      setTemplateModal(false);
      setConfirmReplace({ type, source: tpl });
      return;
    }
    setSource(tpl);
    setTemplateModal(false);
    toast.success(`Inserted ${type} template`);
  };

  const confirmApplyTemplate = () => {
    if (!confirmReplace) return;
    setSource(confirmReplace.source);
    toast.success(`Replaced source with ${confirmReplace.type} template`);
    setConfirmReplace(null);
  };

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[120] bg-bg flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <Badge mono>{diagram.type}</Badge>
          <div className="font-semibold text-[14px]">{diagram.title}</div>
          <StatusPill status={status} />
          <div className="flex-1" />
          <Button icon={<Minimize2 size={13} />} onClick={() => setFullscreen(false)}>Exit fullscreen</Button>
        </div>
        <div className="flex-1 overflow-auto p-6 bg-panel-2">
          <MermaidPreview source={source} onStatusChange={onStatusChange} />
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
        title={
          <div className="flex items-center gap-2 flex-wrap">
            <span>Mermaid editor</span>
            <StatusPill status={status} error={statusError} />
            {dirty && <Badge tone="warning">Unsaved</Badge>}
          </div>
        }
        subtitle="Edit the source on the left; preview updates automatically on the right."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" icon={<Wand2 size={12} />} onClick={() => setTemplateModal(true)}>Templates…</Button>
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
            className="min-h-[480px] bg-panel-2 border-0 border-r border-border outline-none px-4 py-3 text-[13px] font-mono leading-[1.6] resize-none"
          />
          <div className="min-h-[480px] p-4 overflow-auto bg-bg">
            {source.trim() ? (
              <MermaidPreview source={source} onStatusChange={onStatusChange} />
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

      {templateModal && (
        <TemplatePickerModal
          currentType={diagram.type}
          onClose={() => setTemplateModal(false)}
          onApply={applyTemplate}
        />
      )}

      {confirmReplace && (
        <ConfirmReplaceModal
          type={confirmReplace.type}
          onCancel={() => setConfirmReplace(null)}
          onConfirm={confirmApplyTemplate}
        />
      )}
    </div>
  );
}

// ─────────────────────── status pill ───────────────────────

function StatusPill({ status, error }: { status: MermaidStatus; error?: string | null }) {
  if (status === "idle") {
    return <span className="text-[11px] text-fg-subtle inline-flex items-center gap-1">— no preview —</span>;
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-muted">
        <Loader2 size={11} className="animate-spin" /> rendering…
      </span>
    );
  }
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] px-1.5 py-0.5 rounded font-medium"
        style={{ color: "var(--c-success)", border: "1px solid color-mix(in srgb, var(--c-success) 30%, transparent)", background: "color-mix(in srgb, var(--c-success) 10%, transparent)" }}>
        <CheckCircle2 size={11} /> Valid Mermaid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] px-1.5 py-0.5 rounded font-medium"
      title={error ?? undefined}
      style={{ color: "var(--c-warning)", border: "1px solid color-mix(in srgb, var(--c-warning) 30%, transparent)", background: "color-mix(in srgb, var(--c-warning) 10%, transparent)" }}>
      <AlertTriangle size={11} /> Invalid Mermaid
    </span>
  );
}

// ─────────────────────── template picker ───────────────────────

function TemplatePickerModal({
  currentType,
  onClose,
  onApply,
}: {
  currentType: DiagramType;
  onClose: () => void;
  onApply: (type: DiagramType) => void;
}) {
  const [picked, setPicked] = useState<DiagramType>(currentType);
  return (
    <Modal title="Insert a template" onClose={onClose}>
      <div className="grid sm:grid-cols-2 gap-2 mb-4">
        {DIAGRAM_TYPES.map((t) => {
          const active = picked === t;
          return (
            <button
              key={t}
              onClick={() => setPicked(t)}
              className="text-left bg-panel-2 rounded-md p-3 border transition-colors"
              style={{
                borderColor: active ? "var(--accent)" : "var(--border)",
                boxShadow: active ? "0 0 0 3px var(--accent-soft)" : "none",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Badge mono>{t}</Badge>
                {active && <span className="text-[11px] text-accent">selected</span>}
              </div>
              <div className="text-[12.5px] text-fg-muted leading-relaxed">{TEMPLATE_BLURBS[t]}</div>
            </button>
          );
        })}
      </div>
      <div className="bg-panel-2 border border-border rounded-md mb-3 overflow-hidden">
        <div className="px-3 py-2 text-[11.5px] text-fg-muted border-b border-border">
          Preview source for <span className="font-mono">{picked}</span>
        </div>
        <pre className="px-3 py-2 text-[12px] font-mono overflow-auto" style={{ maxHeight: 180 }}>
          {MERMAID_TEMPLATES[picked]}
        </pre>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => onApply(picked)}>Apply template</Button>
      </div>
    </Modal>
  );
}

function ConfirmReplaceModal({
  type,
  onCancel,
  onConfirm,
}: {
  type: DiagramType;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Replace current Mermaid source?" onClose={onCancel}>
      <p className="text-[13.5px] text-fg-muted mb-4">
        Inserting the <Badge mono>{type}</Badge> template will overwrite the current editor content.
        This cannot be undone unless you re-paste the previous source. The diagram has not been saved yet.
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onConfirm}>Replace</Button>
      </div>
    </Modal>
  );
}

// ─────────────────────── edit metadata ───────────────────────

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
    <Modal title="Edit diagram" onClose={onClose}>
      <div className="flex flex-col gap-3">
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
    </Modal>
  );
}

// ─────────────────────── shared ───────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="w-[560px] max-w-[92vw] bg-panel border border-border rounded-lg shadow-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center sticky top-0 bg-panel">
          <div className="font-semibold">{title}</div>
          <button className="ml-auto text-fg-muted hover:text-fg" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="p-4">{children}</div>
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
