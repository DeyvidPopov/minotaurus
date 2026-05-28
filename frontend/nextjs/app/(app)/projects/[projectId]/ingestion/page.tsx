// app/(app)/projects/[projectId]/ingestion/page.tsx — Ingestion Hub
"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Plug, GitMerge, Database, Trash2, ExternalLink, X, Info } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { useAuth } from "@/lib/auth-context";
import { projectsApi } from "@/lib/api/projects";
import {
  ingestionApi,
  type IngestionRecord,
  type IngestionSourceType,
  type IngestionStatus,
} from "@/lib/api/ingestion";
import { membersApi, type ProjectMember } from "@/lib/api/members";
import { ApiError } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface SourceTypeMeta {
  type: IngestionSourceType;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge: string;
}

const SOURCE_TYPES: SourceTypeMeta[] = [
  {
    type: "MARKDOWN",
    label: "Markdown Documentation",
    description: "README and design notes. Will create a DOCUMENTATION artifact per file.",
    icon: <FileText size={16} />,
    badge: "Draft workflow ready",
  },
  {
    type: "OPENAPI_JSON",
    label: "OpenAPI JSON",
    description: "API specs with endpoints. Will create an API_SPEC + ApiEndpoints.",
    icon: <Plug size={16} />,
    badge: "Coming next",
  },
  {
    type: "MERMAID",
    label: "Mermaid Diagram",
    description: "Flowchart / sequence / ERD source. Will create a Diagram (+ inferred relations).",
    icon: <GitMerge size={16} />,
    badge: "Coming next",
  },
  {
    type: "SQL_SCHEMA",
    label: "SQL Schema",
    description: "CREATE TABLE statements. Will create a DatabaseModel with entities + fields.",
    icon: <Database size={16} />,
    badge: "Coming next",
  },
];

const STATUS_TONE: Record<IngestionStatus, "default" | "warning" | "success" | "danger" | "info"> = {
  DRAFT: "warning",
  PARSED: "info",
  CONFIRMED: "success",
  FAILED: "danger",
};

function sourceMeta(t: IngestionSourceType): SourceTypeMeta | undefined {
  return SOURCE_TYPES.find((s) => s.type === t);
}

export default function IngestionHubPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const { user: me } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<IngestionRecord[] | null>(null);
  const [myMembership, setMyMembership] = useState<ProjectMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState<IngestionSourceType | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formSourceName, setFormSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<IngestionRecord | null>(null);

  const refresh = async () => {
    try {
      const [p, list, members] = await Promise.all([
        projectsApi.get(projectId),
        ingestionApi.list(projectId),
        membersApi.list(projectId),
      ]);
      setProject(p);
      setRecords(list);
      setMyMembership(members.find((m) => m.userId === me?.id) ?? null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load ingestion records";
      setError(message);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, me?.id]);

  const canMutate = useMemo(() => {
    const role = myMembership?.role;
    return role === "OWNER" || role === "ARCHITECT" || role === "DEVELOPER";
  }, [myMembership]);

  if (error) {
    return (
      <div className="px-8 py-6">
        <Empty title="Ingestion unavailable" message={error} />
      </div>
    );
  }
  if (!project || records === null) {
    return <div className="px-8 py-6 text-fg-muted">Loading…</div>;
  }

  const openDraftForm = (type: IngestionSourceType) => {
    if (!canMutate) {
      toast.error("Your role doesn't allow creating ingestion drafts.");
      return;
    }
    setFormOpen(type);
    const meta = sourceMeta(type);
    setFormTitle(meta ? `${meta.label} import` : "");
    setFormSourceName("");
  };

  const submitDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOpen) return;
    setBusy(true);
    try {
      await ingestionApi.createDraft(projectId, {
        sourceType: formOpen,
        title: formTitle.trim(),
        sourceName: formSourceName.trim() || undefined,
      });
      toast.success("Ingestion draft created");
      setFormOpen(null);
      setFormTitle("");
      setFormSourceName("");
      await refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to create draft";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const deleteRecord = async (record: IngestionRecord) => {
    if (!canMutate) {
      toast.error("Your role doesn't allow deleting ingestion drafts.");
      return;
    }
    if (!window.confirm(`Delete ingestion draft "${record.title}"?`)) return;
    try {
      await ingestionApi.remove(record.id);
      toast.success("Ingestion draft deleted");
      if (selected?.id === record.id) setSelected(null);
      await refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to delete draft";
      toast.error(msg);
    }
  };

  return (
    <div className="px-8 py-6">
      <PageHeader
        title={
          <div>
            <h1 className="text-2xl font-semibold tracking-tight m-0 flex items-center gap-2.5">
              <Download size={22} className="text-accent" />
              Ingestion
              <span className="text-fg-muted text-[14px] font-normal">{project.name}</span>
            </h1>
            <div className="text-fg-muted text-[13.5px] mt-1">
              Bring existing documentation, API specs, diagrams and database schemas into Minotaurus.
            </div>
          </div>
        }
      />

      <div className="bg-panel-2 border border-border rounded-md px-3.5 py-2.5 mb-5 flex items-start gap-2 text-[12.5px] text-fg-muted">
        <Info size={13} className="mt-0.5 shrink-0" />
        <div>
          Parsers are not implemented yet. This phase lays down the workflow: you can create drafts
          and they appear in version history, but no source content is parsed into artifacts. The
          Markdown parser ships next.
        </div>
      </div>

      <section className="mb-7">
        <h2 className="text-[15px] font-semibold tracking-tight mb-3">Source types</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SOURCE_TYPES.map((s) => (
            <div key={s.type} className="bg-panel border border-border rounded-lg p-4 flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-accent-soft text-accent grid place-items-center">
                  {s.icon}
                </div>
                <div className="text-[14px] font-semibold">{s.label}</div>
              </div>
              <div className="text-[12.5px] text-fg-muted leading-relaxed flex-1">{s.description}</div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <Badge tone={s.badge === "Draft workflow ready" ? "info" : "default"}>
                  {s.badge}
                </Badge>
                <Button size="sm" onClick={() => openDraftForm(s.type)} disabled={!canMutate}>
                  Start draft
                </Button>
              </div>
            </div>
          ))}
        </div>
        {!canMutate && (
          <div className="text-[12px] text-fg-muted mt-2.5">
            Only OWNER / ARCHITECT / DEVELOPER members can create ingestion drafts. VIEWERs can read history.
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold tracking-tight mb-3">Ingestion history</h2>
        {records.length === 0 ? (
          <Empty
            title="No ingestion records yet"
            message="Pick a source type above and click Start draft to begin."
          />
        ) : (
          <Card padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="border-b border-border bg-panel-2">
                  <tr className="text-left text-[11.5px] uppercase tracking-wider text-fg-subtle">
                    <th className="px-4 py-2.5 font-semibold">Title</th>
                    <th className="px-4 py-2.5 font-semibold">Source</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Created</th>
                    <th className="px-4 py-2.5 font-semibold">By</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const meta = sourceMeta(r.sourceType);
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-panel-hover">
                        <td className="px-4 py-2.5">
                          <div className="font-medium truncate">{r.title}</div>
                          {r.sourceName && (
                            <div className="text-[11.5px] text-fg-muted truncate font-mono">{r.sourceName}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="inline-flex items-center gap-1.5">
                            {meta?.icon}
                            <span className="text-[12.5px]">{meta?.label ?? r.sourceType}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-fg-muted text-[12.5px]">{timeAgo(r.createdAt)}</td>
                        <td className="px-4 py-2.5 text-fg-muted text-[12.5px]">
                          {r.createdBy?.name || r.createdBy?.email || "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 justify-end">
                            <Button size="sm" variant="ghost" icon={<ExternalLink size={13} />} onClick={() => setSelected(r)}>
                              Open
                            </Button>
                            {canMutate && (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Trash2 size={13} />}
                                onClick={() => deleteRecord(r)}
                                title="Delete draft"
                                aria-label={`Delete ${r.title}`}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {formOpen && (
        <Modal onClose={() => setFormOpen(null)} title={`New ${sourceMeta(formOpen)?.label ?? "ingestion"} draft`}>
          <form onSubmit={submitDraft} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-fg-muted">Title</span>
              <input
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Authentication README"
                className="h-8 px-2.5 bg-panel-2 border border-border rounded-sm text-[13px] focus:outline-none focus:border-border-strong"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-fg-muted">Source name <span className="text-fg-subtle">(optional)</span></span>
              <input
                value={formSourceName}
                onChange={(e) => setFormSourceName(e.target.value)}
                placeholder="README.md"
                className="h-8 px-2.5 bg-panel-2 border border-border rounded-sm text-[13px] font-mono focus:outline-none focus:border-border-strong"
              />
            </label>
            <div className="text-[12px] text-fg-muted">
              Source parsing isn't implemented yet — this just records the draft so the workflow can be wired up later.
            </div>
            <div className="flex items-center justify-end gap-2 mt-1">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(null)} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={busy || !formTitle.trim()}>
                {busy ? "Creating…" : "Create draft"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal onClose={() => setSelected(null)} title={selected.title}>
          <DetailView record={selected} />
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="bg-panel border border-border rounded-lg w-full max-w-[520px] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="text-[14px] font-semibold truncate">{title}</div>
          <button
            onClick={onClose}
            className="w-7 h-7 grid place-items-center rounded-sm text-fg-muted hover:bg-panel-hover hover:text-fg"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function DetailView({ record }: { record: IngestionRecord }) {
  const meta = sourceMeta(record.sourceType);
  const createdList = Array.isArray(record.createdRecords)
    ? (record.createdRecords as unknown[])
    : [];
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <DetailRow label="Source type" value={
        <div className="inline-flex items-center gap-1.5">{meta?.icon}<span>{meta?.label ?? record.sourceType}</span></div>
      } />
      <DetailRow label="Status" value={<Badge tone={STATUS_TONE[record.status]}>{record.status}</Badge>} />
      <DetailRow label="Source name" value={record.sourceName ? <span className="font-mono text-[12.5px]">{record.sourceName}</span> : <span className="text-fg-muted">—</span>} />
      <DetailRow label="Created by" value={record.createdBy?.name || record.createdBy?.email || "—"} />
      <DetailRow label="Created" value={<span className="text-fg-muted">{timeAgo(record.createdAt)}</span>} />
      <DetailRow label="Created records" value={
        createdList.length === 0
          ? <span className="text-fg-muted">None — parsing not run yet.</span>
          : <span>{createdList.length} record(s)</span>
      } />
      {record.errorMessage && (
        <div className="text-[12.5px] text-danger">{record.errorMessage}</div>
      )}
      <div className="bg-panel-2 border border-border rounded-md px-3 py-2.5 text-[12.5px] text-fg-muted mt-1">
        Parsing will be implemented in the next ingestion phase. For now this draft is a placeholder
        in the workflow and shows up in the project's version history.
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 items-baseline">
      <div className="text-[11.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div>{value}</div>
    </div>
  );
}
