// app/(app)/projects/[projectId]/ingestion/page.tsx — Ingestion Hub
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download, FileText, Plug, GitMerge, Database, Trash2, ExternalLink, X, Info,
  Upload as UploadIcon, Search, ArrowLeft, Link as LinkIcon, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { TypeChip } from "@/components/ui/type-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/lib/auth-context";
import { projectsApi } from "@/lib/api/projects";
import { artifactsApi } from "@/lib/api/artifacts";
import {
  ingestionApi,
  type IngestionRecord,
  type IngestionSourceType,
  type IngestionStatus,
  type MarkdownParserResult,
  type CreatedRecordRef,
} from "@/lib/api/ingestion";
import { membersApi, type ProjectMember } from "@/lib/api/members";
import { ApiError } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils";
import type { Artifact, ArtifactType, Project } from "@/lib/types";

interface SourceTypeMeta {
  type: IngestionSourceType;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge: string;
  parserReady: boolean;
}

const SOURCE_TYPES: SourceTypeMeta[] = [
  {
    type: "MARKDOWN",
    label: "Markdown Documentation",
    description: "README and design notes. Parse headings + word count, then attach to an existing artifact or create a new DOCUMENTATION artifact.",
    icon: <FileText size={16} />,
    badge: "Parser ready",
    parserReady: true,
  },
  {
    type: "OPENAPI_JSON",
    label: "OpenAPI JSON",
    description: "API specs with endpoints. Will create an API_SPEC + ApiEndpoints.",
    icon: <Plug size={16} />,
    badge: "Coming next",
    parserReady: false,
  },
  {
    type: "MERMAID",
    label: "Mermaid Diagram",
    description: "Flowchart / sequence / ERD source. Will create a Diagram (+ inferred relations).",
    icon: <GitMerge size={16} />,
    badge: "Coming next",
    parserReady: false,
  },
  {
    type: "SQL_SCHEMA",
    label: "SQL Schema",
    description: "CREATE TABLE statements. Will create a DatabaseModel with entities + fields.",
    icon: <Database size={16} />,
    badge: "Coming next",
    parserReady: false,
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

function createdRecordList(value: unknown): CreatedRecordRef[] {
  return Array.isArray(value) ? (value as CreatedRecordRef[]) : [];
}

export default function IngestionHubPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const { user: me } = useAuth();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<IngestionRecord[] | null>(null);
  const [myMembership, setMyMembership] = useState<ProjectMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftFormFor, setDraftFormFor] = useState<IngestionSourceType | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
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

  const handleStart = (s: SourceTypeMeta) => {
    if (!canMutate) {
      toast.error("Your role doesn't allow ingestion mutations.");
      return;
    }
    if (s.parserReady && s.type === "MARKDOWN") {
      setWizardOpen(true);
    } else {
      setDraftFormFor(s.type);
    }
  };

  const deleteRecord = async (record: IngestionRecord) => {
    if (!canMutate) {
      toast.error("Your role doesn't allow deleting ingestion drafts.");
      return;
    }
    if (!window.confirm(`Delete ingestion record "${record.title}"?`)) return;
    try {
      await ingestionApi.remove(record.id);
      toast.success("Ingestion record deleted");
      if (selected?.id === record.id) setSelected(null);
      await refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to delete record";
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
          <strong className="text-fg">Markdown ingestion is live.</strong> The parser is deterministic
          (no AI): it extracts the first H1 as the title, lists headings, computes a word count, and
          produces a plain-text excerpt. The original Markdown body is preserved unchanged.
          OpenAPI / Mermaid / SQL parsers land in later phases.
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
                <Badge tone={s.parserReady ? "success" : "default"}>{s.badge}</Badge>
                <Button size="sm" onClick={() => handleStart(s)} disabled={!canMutate}>
                  {s.parserReady ? "Start import" : "Start draft"}
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
            message="Pick a source type above to begin."
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
                    <th className="px-4 py-2.5 font-semibold">Result</th>
                    <th className="px-4 py-2.5 font-semibold">Created</th>
                    <th className="px-4 py-2.5 font-semibold">By</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const meta = sourceMeta(r.sourceType);
                    const created = createdRecordList(r.createdRecords);
                    const preview = r.parserResult as MarkdownParserResult | null;
                    let summary: React.ReactNode = <span className="text-fg-subtle">—</span>;
                    if (r.status === "PARSED" && preview) {
                      summary = (
                        <span className="text-fg-muted text-[12.5px]">
                          {preview.wordCount} words · {preview.headings.length} heading{preview.headings.length === 1 ? "" : "s"}
                        </span>
                      );
                    } else if (r.status === "CONFIRMED") {
                      summary = (
                        <span className="text-success text-[12.5px]">
                          {created.length} record{created.length === 1 ? "" : "s"} created
                        </span>
                      );
                    } else if (r.status === "FAILED" && r.errorMessage) {
                      summary = (
                        <span className="text-danger text-[12.5px] truncate inline-block max-w-[240px]" title={r.errorMessage}>
                          {r.errorMessage}
                        </span>
                      );
                    }
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
                        <td className="px-4 py-2.5">{summary}</td>
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
                                title="Delete record"
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

      {draftFormFor && (
        <DraftFormModal
          projectId={projectId}
          sourceType={draftFormFor}
          onClose={() => setDraftFormFor(null)}
          onCreated={async () => {
            setDraftFormFor(null);
            await refresh();
          }}
        />
      )}

      {wizardOpen && (
        <MarkdownImportWizard
          projectId={projectId}
          onClose={() => setWizardOpen(false)}
          onCommitted={async (artifactId) => {
            setWizardOpen(false);
            await refresh();
            // Don't auto-navigate — let the user choose. Toast already showed success.
            void artifactId;
          }}
          onNavigateToArtifact={(artifactId) => {
            router.push(`/projects/${projectId}/artifacts/${artifactId}?tab=documentation`);
          }}
        />
      )}

      {selected && (
        <Modal onClose={() => setSelected(null)} title={selected.title}>
          <DetailView record={selected} projectId={projectId} />
        </Modal>
      )}
    </div>
  );
}

function DraftFormModal({
  projectId,
  sourceType,
  onClose,
  onCreated,
}: {
  projectId: string;
  sourceType: IngestionSourceType;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState(sourceMeta(sourceType)?.label ?? "");
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await ingestionApi.createDraft(projectId, {
        sourceType,
        title: title.trim(),
        sourceName: sourceName.trim() || undefined,
      });
      toast.success("Ingestion draft created");
      await onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create draft");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`New ${sourceMeta(sourceType)?.label ?? "ingestion"} draft`}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <LabeledInput label="Title" value={title} onChange={setTitle} placeholder="e.g. Catalog API spec" required />
        <LabeledInput
          label="Source name"
          optional
          value={sourceName}
          onChange={setSourceName}
          placeholder="catalog.openapi.json"
          mono
        />
        <div className="text-[12px] text-fg-muted">
          A parser for {sourceMeta(sourceType)?.label} is not implemented yet — this just records the draft.
        </div>
        <div className="flex items-center justify-end gap-2 mt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
            {busy ? "Creating…" : "Create draft"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ────────────────────────────── Markdown Import Wizard ──────────────────────────────

type WizardStep = "input" | "preview" | "linkExisting" | "createNew";

function MarkdownImportWizard({
  projectId,
  onClose,
  onCommitted,
  onNavigateToArtifact,
}: {
  projectId: string;
  onClose: () => void;
  onCommitted: (artifactId: string) => Promise<void> | void;
  onNavigateToArtifact: (artifactId: string) => void;
}) {
  const [step, setStep] = useState<WizardStep>("input");
  const [title, setTitle] = useState("Markdown import");
  const [sourceName, setSourceName] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<IngestionRecord | null>(null);
  const [preview, setPreview] = useState<MarkdownParserResult | null>(null);
  const [artifactTitle, setArtifactTitle] = useState("");
  const [artifactType, setArtifactType] = useState<ArtifactType>("DOCUMENTATION");
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".md")) {
      toast.error("Please pick a .md file");
      return;
    }
    const text = await file.text();
    setMarkdown(text);
    if (!sourceName) setSourceName(file.name);
    if (!title || title === "Markdown import") {
      setTitle(file.name.replace(/\.md$/i, ""));
    }
  };

  const runParse = async () => {
    if (!markdown.trim()) {
      toast.error("Paste or upload some Markdown first.");
      return;
    }
    setBusy(true);
    try {
      const draft = record ?? await ingestionApi.createDraft(projectId, {
        sourceType: "MARKDOWN",
        title: title.trim() || "Markdown import",
        sourceName: sourceName.trim() || undefined,
      });
      const result = await ingestionApi.parseMarkdown(draft.id, markdown);
      setRecord(result.record);
      setPreview(result.preview);
      setArtifactTitle(result.preview.title);
      setStep("preview");
      toast.success("Markdown parsed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  };

  const openLinkPicker = async () => {
    setStep("linkExisting");
    if (artifacts !== null) return;
    try {
      const list = await artifactsApi.list(projectId);
      setArtifacts(list);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load artifacts");
    }
  };

  const filteredArtifacts = useMemo(() => {
    if (!artifacts) return [];
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return artifacts;
    return artifacts.filter(
      (a) => a.title.toLowerCase().includes(q) || a.type.toLowerCase().includes(q),
    );
  }, [artifacts, pickerSearch]);

  const confirmLink = async (artifact: Artifact) => {
    if (!record) return;
    setBusy(true);
    try {
      const out = await ingestionApi.confirmMarkdown(record.id, {
        mode: "LINK_EXISTING",
        artifactId: artifact.id,
      });
      toast.success(`Documentation imported into ${out.artifact.title}`);
      await onCommitted(out.artifact.id);
      onNavigateToArtifact(out.artifact.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    setBusy(true);
    try {
      const out = await ingestionApi.confirmMarkdown(record.id, {
        mode: "CREATE_NEW",
        artifactTitle: artifactTitle.trim() || "Imported Markdown",
        artifactType,
      });
      toast.success(`Created artifact "${out.artifact.title}"`);
      await onCommitted(out.artifact.id);
      onNavigateToArtifact(out.artifact.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Import Markdown documentation" wide>
      {step === "input" && (
        <div className="flex flex-col gap-3">
          <LabeledInput label="Title" value={title} onChange={setTitle} placeholder="e.g. Authentication README" required />
          <LabeledInput label="Source name" optional value={sourceName} onChange={setSourceName} placeholder="README.md" mono />
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-fg-muted">Markdown</span>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,text/markdown,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  icon={<UploadIcon size={13} />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload .md
                </Button>
              </div>
            </div>
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              placeholder="# Heading&#10;&#10;Paste your Markdown body here…"
              spellCheck={false}
              className="min-h-[280px] max-h-[420px] px-3 py-2 bg-panel-2 border border-border rounded-sm text-[13px] font-mono leading-relaxed focus:outline-none focus:border-border-strong"
            />
            <div className="text-[11.5px] text-fg-subtle">
              {markdown.length.toLocaleString()} chars
            </div>
          </div>
          <div className="text-[12px] text-fg-muted">
            We support .md files and pasted Markdown only. Parsing is deterministic — headings, an
            excerpt and a word count. Your Markdown body is preserved as-is.
          </div>
          <div className="flex items-center justify-end gap-2 mt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="button" variant="primary" onClick={runParse} disabled={busy || !markdown.trim()}>
              {busy ? "Parsing…" : "Parse"}
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="flex flex-col gap-3 text-[13px]">
          <DetailRow label="Title" value={<strong className="text-fg">{preview.title}</strong>} />
          <DetailRow label="Word count" value={`${preview.wordCount.toLocaleString()} words`} />
          <DetailRow label="Headings" value={
            preview.headings.length === 0
              ? <span className="text-fg-muted">No headings detected.</span>
              : (
                <ul className="m-0 pl-4 list-disc text-[12.5px] text-fg-muted">
                  {preview.headings.slice(0, 12).map((h, i) => <li key={i}>{h}</li>)}
                  {preview.headings.length > 12 && <li className="text-fg-subtle">+ {preview.headings.length - 12} more</li>}
                </ul>
              )
          } />
          <DetailRow label="Excerpt" value={
            preview.excerpt
              ? <span className="text-fg-muted leading-relaxed">{preview.excerpt}</span>
              : <span className="text-fg-subtle">No prose excerpt — the doc may be header-only.</span>
          } />
          <details className="text-[12px] text-fg-muted">
            <summary className="cursor-pointer">Show raw Markdown</summary>
            <pre className="mt-2 px-3 py-2 bg-panel-2 border border-border rounded-sm text-[12px] font-mono leading-relaxed whitespace-pre-wrap max-h-[260px] overflow-y-auto">{markdown}</pre>
          </details>
          <div className="bg-panel-2 border border-border rounded-md px-3 py-2 text-[12px] text-fg-muted">
            Parsing was deterministic — no AI, no auto-linking. The Markdown body will be written verbatim into the chosen artifact.
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <Button type="button" variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => setStep("input")} disabled={busy}>Back</Button>
            <div className="flex items-center gap-2">
              <Button type="button" icon={<LinkIcon size={13} />} onClick={openLinkPicker} disabled={busy}>Attach to existing</Button>
              <Button type="button" variant="primary" icon={<Plus size={13} />} onClick={() => setStep("createNew")} disabled={busy}>Create new artifact</Button>
            </div>
          </div>
        </div>
      )}

      {step === "linkExisting" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => setStep("preview")}>Back</Button>
            <div className="text-[13px] font-medium">Pick the artifact to attach this Markdown to</div>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              autoFocus
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Search artifacts by title or type…"
              className="w-full h-8 pl-8 pr-3 bg-panel-2 border border-border rounded-sm text-[13px] focus:outline-none focus:border-border-strong"
            />
          </div>
          <div className="bg-panel-2 border border-border rounded-sm max-h-[360px] overflow-y-auto">
            {artifacts === null ? (
              <div className="px-4 py-4 text-fg-muted text-[13px]">Loading artifacts…</div>
            ) : filteredArtifacts.length === 0 ? (
              <div className="px-4 py-4 text-fg-muted text-[13px]">No artifacts match your search.</div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredArtifacts.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => confirmLink(a)}
                      disabled={busy}
                      className="w-full text-left px-4 py-2.5 hover:bg-panel-hover disabled:opacity-50 flex items-center gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium truncate">{a.title}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <TypeChip type={a.type} />
                          <StatusBadge status={a.status} />
                        </div>
                      </div>
                      <span className="text-[11.5px] text-fg-muted">Attach →</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="text-[12px] text-fg-muted">
            Attaching will <strong className="text-fg">replace</strong> any existing documentation on the target artifact with this Markdown body.
          </div>
        </div>
      )}

      {step === "createNew" && (
        <form onSubmit={confirmCreate} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => setStep("preview")}>Back</Button>
            <div className="text-[13px] font-medium">Create a new artifact for this Markdown</div>
          </div>
          <LabeledInput label="Artifact title" value={artifactTitle} onChange={setArtifactTitle} required />
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-fg-muted">Artifact type</span>
            <select
              value={artifactType}
              onChange={(e) => setArtifactType(e.target.value as ArtifactType)}
              className="h-8 px-2 bg-panel-2 border border-border rounded-sm text-[13px] focus:outline-none focus:border-border-strong"
            >
              <option value="DOCUMENTATION">DOCUMENTATION</option>
              <option value="SERVICE">SERVICE</option>
              <option value="API_SPEC">API_SPEC</option>
              <option value="API_ENDPOINT">API_ENDPOINT</option>
              <option value="DATABASE_MODEL">DATABASE_MODEL</option>
              <option value="DATABASE_ENTITY">DATABASE_ENTITY</option>
              <option value="DIAGRAM">DIAGRAM</option>
              <option value="REQUIREMENT">REQUIREMENT</option>
              <option value="SECURITY_POLICY">SECURITY_POLICY</option>
              <option value="ENVIRONMENT">ENVIRONMENT</option>
              <option value="EXTERNAL_SYSTEM">EXTERNAL_SYSTEM</option>
            </select>
          </label>
          <div className="text-[12px] text-fg-muted">
            We'll create the artifact with ACTIVE status, tag <span className="font-mono">imported</span>, and attach the Markdown body as its documentation.
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep("preview")} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy || !artifactTitle.trim()}>
              {busy ? "Creating…" : "Create artifact"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ────────────────────────────── Shared modal / detail bits ──────────────────────────────

function Modal({ children, onClose, title, wide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4" onClick={onClose}>
      <div
        className={`bg-panel border border-border rounded-lg w-full max-h-[88vh] overflow-y-auto ${wide ? "max-w-[760px]" : "max-w-[520px]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-panel">
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

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  optional,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-fg-muted">
        {label}{optional && <span className="text-fg-subtle"> (optional)</span>}
      </span>
      <input
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`h-8 px-2.5 bg-panel-2 border border-border rounded-sm text-[13px] focus:outline-none focus:border-border-strong${mono ? " font-mono" : ""}`}
      />
    </label>
  );
}

function DetailView({ record, projectId }: { record: IngestionRecord; projectId: string }) {
  const meta = sourceMeta(record.sourceType);
  const createdList = createdRecordList(record.createdRecords);
  const preview = record.parserResult as MarkdownParserResult | null;
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <DetailRow label="Source type" value={
        <div className="inline-flex items-center gap-1.5">{meta?.icon}<span>{meta?.label ?? record.sourceType}</span></div>
      } />
      <DetailRow label="Status" value={<Badge tone={STATUS_TONE[record.status]}>{record.status}</Badge>} />
      <DetailRow label="Source name" value={record.sourceName ? <span className="font-mono text-[12.5px]">{record.sourceName}</span> : <span className="text-fg-muted">—</span>} />
      <DetailRow label="Created by" value={record.createdBy?.name || record.createdBy?.email || "—"} />
      <DetailRow label="Created" value={<span className="text-fg-muted">{timeAgo(record.createdAt)}</span>} />

      {preview && (
        <>
          <DetailRow label="Parsed title" value={<span className="text-fg">{preview.title}</span>} />
          <DetailRow label="Word count" value={<span className="text-fg-muted">{preview.wordCount} words</span>} />
          <DetailRow label="Headings" value={
            preview.headings.length === 0
              ? <span className="text-fg-muted">None detected.</span>
              : <span className="text-fg-muted">{preview.headings.length} (e.g. {preview.headings.slice(0, 3).join(", ")}{preview.headings.length > 3 ? "…" : ""})</span>
          } />
        </>
      )}

      <DetailRow label="Created records" value={
        createdList.length === 0
          ? <span className="text-fg-muted">{record.status === "PARSED" ? "Preview only — confirm to commit." : "None"}</span>
          : (
            <ul className="m-0 pl-0 list-none text-[12.5px]">
              {createdList.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Badge tone="default" mono>{c.type}</Badge>
                  <a
                    href={`/projects/${projectId}/artifacts/${c.id}?tab=documentation`}
                    className="text-accent hover:underline truncate"
                  >
                    {c.id}
                  </a>
                  {c.mode && <span className="text-fg-subtle">· {c.mode}</span>}
                </li>
              ))}
            </ul>
          )
      } />

      {record.errorMessage && (
        <div className="text-[12.5px] text-danger">{record.errorMessage}</div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 items-baseline">
      <div className="text-[11.5px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div>{value}</div>
    </div>
  );
}
