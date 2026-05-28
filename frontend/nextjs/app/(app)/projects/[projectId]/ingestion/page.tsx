// app/(app)/projects/[projectId]/ingestion/page.tsx — Ingestion Hub
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download, FileText, Plug, GitMerge, Database, Trash2, ExternalLink, X, Info,
  Upload as UploadIcon, Search, ArrowLeft, Link as LinkIcon, Plus, ChevronDown, ChevronUp,
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
import { MermaidPreview } from "@/components/mermaid-preview";
import { useAuth } from "@/lib/auth-context";
import { projectsApi } from "@/lib/api/projects";
import { artifactsApi } from "@/lib/api/artifacts";
import {
  ingestionApi,
  type IngestionRecord,
  type IngestionSourceType,
  type IngestionStatus,
  type MarkdownParserResult,
  type OpenApiParserResult,
  type MermaidParserResult,
  type SqlSchemaParserResult,
  type CreatedRecordRef,
} from "@/lib/api/ingestion";
import type { DiagramType as IngestionDiagramType } from "@/lib/api/diagrams";
import type { DatabaseType as IngestionDatabaseType } from "@/lib/api/database-models";
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
    description: "OpenAPI 3.x or Swagger 2.0 JSON. Parses paths + operations into an API Spec with endpoints, optionally linked to an artifact.",
    icon: <Plug size={16} />,
    badge: "Parser ready",
    parserReady: true,
  },
  {
    type: "MERMAID",
    label: "Mermaid Diagram",
    description: "Flowchart / sequence / ERD source (.mmd or fenced .md). Creates a Diagram with the detected type.",
    icon: <GitMerge size={16} />,
    badge: "Parser ready",
    parserReady: true,
  },
  {
    type: "SQL_SCHEMA",
    label: "SQL Schema",
    description: "CREATE TABLE DDL. Creates a DatabaseModel with entities, fields and resolved foreign keys.",
    icon: <Database size={16} />,
    badge: "Parser ready",
    parserReady: true,
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
  const [wizardOpen, setWizardOpen] = useState<null | "MARKDOWN" | "OPENAPI_JSON" | "MERMAID" | "SQL_SCHEMA">(null);
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
    if (s.parserReady) {
      setWizardOpen(s.type);
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
                    const parser = r.parserResult as MarkdownParserResult | OpenApiParserResult | MermaidParserResult | SqlSchemaParserResult | null;
                    const parserSource = (parser as { source?: string } | null)?.source ?? null;
                    let summary: React.ReactNode = <span className="text-fg-subtle">—</span>;
                    if (r.status === "PARSED" && parser) {
                      if (parserSource === "OPENAPI_JSON") {
                        const p = parser as OpenApiParserResult;
                        summary = (
                          <span className="text-fg-muted text-[12.5px]">
                            {p.endpointCount} endpoint{p.endpointCount === 1 ? "" : "s"} · v{p.version}
                          </span>
                        );
                      } else if (parserSource === "MERMAID") {
                        const p = parser as MermaidParserResult;
                        summary = (
                          <span className="text-fg-muted text-[12.5px]">
                            {p.diagramType} · {p.lineCount} lines
                          </span>
                        );
                      } else if (parserSource === "SQL_SCHEMA") {
                        const p = parser as SqlSchemaParserResult;
                        summary = (
                          <span className="text-fg-muted text-[12.5px]">
                            {p.entityCount} entit{p.entityCount === 1 ? "y" : "ies"} · {p.fieldCount} fields · {p.relationships.length} FK
                          </span>
                        );
                      } else {
                        const p = parser as MarkdownParserResult;
                        summary = (
                          <span className="text-fg-muted text-[12.5px]">
                            {p.wordCount} words · {p.headings.length} heading{p.headings.length === 1 ? "" : "s"}
                          </span>
                        );
                      }
                    } else if (r.status === "CONFIRMED") {
                      const apiSpec = created.find((c) => c.type === "API_SPEC");
                      const diagram = created.find((c) => c.type === "DIAGRAM");
                      const dbModel = created.find((c) => c.type === "DATABASE_MODEL");
                      if (apiSpec) {
                        summary = (
                          <span className="text-success text-[12.5px]">
                            API spec + {created.filter((c) => c.type === "API_ENDPOINT").length} endpoint{created.filter((c) => c.type === "API_ENDPOINT").length === 1 ? "" : "s"} created
                          </span>
                        );
                      } else if (diagram) {
                        summary = <span className="text-success text-[12.5px]">Diagram created</span>;
                      } else if (dbModel) {
                        const entities = created.filter((c) => c.type === "DATABASE_ENTITY").length;
                        const fieldsN = created.filter((c) => c.type === "DATABASE_FIELD").length;
                        summary = (
                          <span className="text-success text-[12.5px]">
                            DB model + {entities} entit{entities === 1 ? "y" : "ies"} · {fieldsN} fields
                          </span>
                        );
                      } else {
                        summary = (
                          <span className="text-success text-[12.5px]">
                            {created.length} record{created.length === 1 ? "" : "s"} created
                          </span>
                        );
                      }
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

      {wizardOpen === "MARKDOWN" && (
        <MarkdownImportWizard
          projectId={projectId}
          onClose={() => setWizardOpen(null)}
          onCommitted={async (artifactId) => {
            setWizardOpen(null);
            await refresh();
            void artifactId;
          }}
          onNavigateToArtifact={(artifactId) => {
            router.push(`/projects/${projectId}/artifacts/${artifactId}?tab=documentation`);
          }}
        />
      )}

      {wizardOpen === "OPENAPI_JSON" && (
        <OpenApiImportWizard
          projectId={projectId}
          onClose={() => setWizardOpen(null)}
          onCommitted={async () => {
            setWizardOpen(null);
            await refresh();
          }}
          onNavigateToApiSpec={(apiSpecId) => {
            router.push(`/projects/${projectId}/api/${apiSpecId}`);
          }}
        />
      )}

      {wizardOpen === "MERMAID" && (
        <MermaidImportWizard
          projectId={projectId}
          onClose={() => setWizardOpen(null)}
          onCommitted={async () => { setWizardOpen(null); await refresh(); }}
          onNavigateToDiagram={(id) => router.push(`/projects/${projectId}/diagrams/${id}`)}
        />
      )}

      {wizardOpen === "SQL_SCHEMA" && (
        <SqlSchemaImportWizard
          projectId={projectId}
          onClose={() => setWizardOpen(null)}
          onCommitted={async () => { setWizardOpen(null); await refresh(); }}
          onNavigateToDatabaseModel={(id) => router.push(`/projects/${projectId}/database/${id}`)}
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

  const [artifactTitleError, setArtifactTitleError] = useState<string | null>(null);

  const confirmCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    setArtifactTitleError(null);
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
      const code = err instanceof ApiError ? (err.body as { error?: { code?: string } } | undefined)?.error?.code : null;
      const msg = err instanceof ApiError ? err.message : "Confirm failed";
      if (code === "ARTIFACT_TITLE_TAKEN") setArtifactTitleError(msg);
      toast.error(msg);
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
          <DetailRow label="Headings" value={<ParsedHeadingsList headings={preview.headings} />} />
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
          <LabeledInput
            label="Artifact title"
            value={artifactTitle}
            onChange={(v) => { setArtifactTitle(v); if (artifactTitleError) setArtifactTitleError(null); }}
            required
          />
          {artifactTitleError && (
            <div className="text-[12px] text-danger -mt-2">{artifactTitleError}</div>
          )}
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

// ────────────────────────────── OpenAPI Import Wizard ──────────────────────────────

type OpenApiStep = "input" | "preview" | "confirm";

const METHOD_TONE: Record<string, "info" | "success" | "warning" | "danger" | "default"> = {
  GET: "info",
  POST: "success",
  PUT: "warning",
  PATCH: "warning",
  DELETE: "danger",
};

function OpenApiImportWizard({
  projectId,
  onClose,
  onCommitted,
  onNavigateToApiSpec,
}: {
  projectId: string;
  onClose: () => void;
  onCommitted: () => Promise<void> | void;
  onNavigateToApiSpec: (apiSpecId: string) => void;
}) {
  const [step, setStep] = useState<OpenApiStep>("input");
  const [title, setTitle] = useState("OpenAPI import");
  const [sourceName, setSourceName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<IngestionRecord | null>(null);
  const [preview, setPreview] = useState<OpenApiParserResult | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [linkedArtifactId, setLinkedArtifactId] = useState<string | "">("");
  const [selectedBaseUrl, setSelectedBaseUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (!/\.json$/i.test(file.name)) {
      toast.error("Please pick a .json file");
      return;
    }
    const text = await file.text();
    setBody(text);
    if (!sourceName) setSourceName(file.name);
    if (!title || title === "OpenAPI import") {
      setTitle(file.name.replace(/\.json$/i, ""));
    }
  };

  const runParse = async () => {
    if (!body.trim()) {
      toast.error("Paste or upload an OpenAPI JSON document first.");
      return;
    }
    setBusy(true);
    try {
      const draft = record ?? await ingestionApi.createDraft(projectId, {
        sourceType: "OPENAPI_JSON",
        title: title.trim() || "OpenAPI import",
        sourceName: sourceName.trim() || undefined,
      });
      const result = await ingestionApi.parseOpenApiJson(draft.id, body);
      setRecord(result.record);
      setPreview(result.preview);
      setSelectedBaseUrl(result.preview.baseUrl ?? "");
      setStep("preview");
      toast.success("OpenAPI JSON parsed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  };

  const goConfirm = async () => {
    setStep("confirm");
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

  const confirmCreate = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const out = await ingestionApi.confirmOpenApiJson(record.id, {
        mode: "CREATE_API_SPEC",
        artifactId: linkedArtifactId || null,
        baseUrl: selectedBaseUrl.trim(),
      });
      toast.success(`Imported "${out.apiSpec.title}" with ${out.apiSpec.endpointCount} endpoints`);
      await onCommitted();
      onNavigateToApiSpec(out.apiSpec.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Import OpenAPI JSON" wide>
      {step === "input" && (
        <div className="flex flex-col gap-3">
          <LabeledInput label="Title" value={title} onChange={setTitle} placeholder="e.g. Catalog API" required />
          <LabeledInput label="Source name" optional value={sourceName} onChange={setSourceName} placeholder="catalog.openapi.json" mono />
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-fg-muted">OpenAPI JSON</span>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
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
                  Upload .json
                </Button>
              </div>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{ "openapi": "3.0.0", "info": { ... }, "paths": { ... } }'
              spellCheck={false}
              className="min-h-[280px] max-h-[420px] px-3 py-2 bg-panel-2 border border-border rounded-sm text-[12.5px] font-mono leading-relaxed focus:outline-none focus:border-border-strong"
            />
            <div className="text-[11.5px] text-fg-subtle">
              {body.length.toLocaleString()} chars
            </div>
          </div>
          <div className="text-[12px] text-fg-muted">
            JSON only — YAML is not supported in this phase. Supported root keys: <code>openapi</code> (3.x) or <code>swagger</code> (2.0 best-effort), plus <code>info</code>, <code>servers</code>, <code>paths</code>.
          </div>
          <div className="flex items-center justify-end gap-2 mt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="button" variant="primary" onClick={runParse} disabled={busy || !body.trim()}>
              {busy ? "Parsing…" : "Parse"}
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="flex flex-col gap-3 text-[13px]">
          <DetailRow label="API title" value={<strong className="text-fg">{preview.title}</strong>} />
          <DetailRow label="Version" value={<span className="text-fg-muted">v{preview.version}</span>} />
          <DetailRow label="Base URL" value={
            preview.baseUrl
              ? (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-[12.5px]">{preview.baseUrl}</span>
                    {preview.availableBaseUrls && preview.availableBaseUrls.length > 1 && (
                      <span className="text-[11.5px] text-fg-subtle">
                        + {preview.availableBaseUrls.length - 1} other server URL{preview.availableBaseUrls.length - 1 === 1 ? "" : "s"} — pick one on confirm
                      </span>
                    )}
                  </div>
                )
              : <span className="text-fg-subtle">none declared</span>
          } />
          <DetailRow label="Description" value={
            preview.description
              ? <span className="text-fg-muted leading-relaxed">{preview.description}</span>
              : <span className="text-fg-subtle">—</span>
          } />
          <DetailRow label="Endpoints" value={
            <span className="text-fg-muted">{preview.endpointCount} total</span>
          } />
          <div className="bg-panel-2 border border-border rounded-sm max-h-[300px] overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead className="border-b border-border bg-panel sticky top-0">
                <tr className="text-left text-[11px] uppercase tracking-wider text-fg-subtle">
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Path</th>
                  <th className="px-3 py-2">Summary</th>
                  <th className="px-3 py-2">Auth</th>
                </tr>
              </thead>
              <tbody>
                {preview.endpoints.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-fg-muted text-center">No supported endpoints found (GET / POST / PUT / PATCH / DELETE only).</td></tr>
                ) : preview.endpoints.map((ep, i) => (
                  <tr key={`${ep.method}-${ep.path}-${i}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-2"><Badge tone={METHOD_TONE[ep.method] ?? "default"} mono>{ep.method}</Badge></td>
                    <td className="px-3 py-2 font-mono truncate max-w-[260px]" title={ep.path}>{ep.path}</td>
                    <td className="px-3 py-2 text-fg-muted truncate max-w-[260px]" title={ep.summary}>{ep.summary || "—"}</td>
                    <td className="px-3 py-2">
                      {ep.requiresAuth
                        ? <Badge tone="warning">🔒 auth</Badge>
                        : <span className="text-fg-subtle text-[11.5px]">public</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-panel-2 border border-border rounded-md px-3 py-2 text-[12px] text-fg-muted">
            Parsing was deterministic — no AI, no auto-linking. Only standard HTTP methods are imported.
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <Button type="button" variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => setStep("input")} disabled={busy}>Back</Button>
            <Button type="button" variant="primary" onClick={goConfirm} disabled={busy || preview.endpointCount === 0}>
              Create API spec
            </Button>
          </div>
        </div>
      )}

      {step === "confirm" && preview && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => setStep("preview")}>Back</Button>
            <div className="text-[13px] font-medium">Confirm API spec creation</div>
          </div>
          <DetailRow label="API title" value={<strong className="text-fg">{preview.title}</strong>} />
          <DetailRow label="Endpoints" value={<span className="text-fg-muted">{preview.endpointCount}</span>} />

          <BaseUrlPicker
            value={selectedBaseUrl}
            onChange={setSelectedBaseUrl}
            availableBaseUrls={preview.availableBaseUrls ?? []}
            parsedBaseUrl={preview.baseUrl ?? ""}
          />

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-fg-muted">Link to artifact <span className="text-fg-subtle">(optional)</span></span>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <input
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search artifacts by title or type…"
                className="w-full h-8 pl-8 pr-3 bg-panel-2 border border-border rounded-sm text-[13px] focus:outline-none focus:border-border-strong"
              />
            </div>
            <div className="bg-panel-2 border border-border rounded-sm max-h-[220px] overflow-y-auto">
              <ul className="divide-y divide-border">
                <li>
                  <button
                    type="button"
                    onClick={() => setLinkedArtifactId("")}
                    className={`w-full text-left px-3 py-2 hover:bg-panel-hover text-[13px] ${linkedArtifactId === "" ? "bg-panel-hover" : ""}`}
                  >
                    <span className="text-fg-muted">— No artifact link —</span>
                  </button>
                </li>
                {artifacts === null ? (
                  <li className="px-3 py-3 text-fg-muted text-[13px]">Loading artifacts…</li>
                ) : filteredArtifacts.length === 0 ? (
                  <li className="px-3 py-3 text-fg-muted text-[13px]">No artifacts match.</li>
                ) : filteredArtifacts.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setLinkedArtifactId(a.id)}
                      className={`w-full text-left px-3 py-2 hover:bg-panel-hover flex items-center gap-2.5 ${linkedArtifactId === a.id ? "bg-panel-hover" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium truncate">{a.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <TypeChip type={a.type} />
                          <StatusBadge status={a.status} />
                        </div>
                      </div>
                      {linkedArtifactId === a.id && (
                        <Badge tone="info">Selected</Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </label>
          <div className="text-[12px] text-fg-muted">
            The API spec is created in this project. If you link it to an artifact, the artifact's detail page will list it under <em>Linked resources</em>.
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep("preview")} disabled={busy}>Cancel</Button>
            <Button type="button" variant="primary" onClick={confirmCreate} disabled={busy}>
              {busy ? "Creating…" : "Create API spec"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ────────────────────────────── Mermaid Import Wizard ──────────────────────────────

type MermaidStep = "input" | "preview" | "confirm";

const DIAGRAM_TYPE_OPTIONS: IngestionDiagramType[] = [
  "FLOWCHART", "SEQUENCE", "ERD", "CLASS", "STATE", "GANTT", "ARCHITECTURE",
];

function MermaidImportWizard({
  projectId,
  onClose,
  onCommitted,
  onNavigateToDiagram,
}: {
  projectId: string;
  onClose: () => void;
  onCommitted: () => Promise<void> | void;
  onNavigateToDiagram: (diagramId: string) => void;
}) {
  const [step, setStep] = useState<MermaidStep>("input");
  const [title, setTitle] = useState("Mermaid import");
  const [sourceName, setSourceName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<IngestionRecord | null>(null);
  const [preview, setPreview] = useState<MermaidParserResult | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [linkedArtifactId, setLinkedArtifactId] = useState<string | "">("");
  const [chosenTitle, setChosenTitle] = useState("");
  const [chosenType, setChosenType] = useState<IngestionDiagramType>("FLOWCHART");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (!/\.(mmd|md)$/i.test(file.name)) {
      toast.error("Please pick a .mmd or .md file");
      return;
    }
    const text = await file.text();
    setBody(text);
    if (!sourceName) setSourceName(file.name);
    if (!title || title === "Mermaid import") {
      setTitle(file.name.replace(/\.(mmd|md)$/i, ""));
    }
  };

  const runParse = async () => {
    if (!body.trim()) { toast.error("Paste or upload Mermaid source first."); return; }
    setBusy(true);
    try {
      const draft = record ?? await ingestionApi.createDraft(projectId, {
        sourceType: "MERMAID",
        title: title.trim() || "Mermaid import",
        sourceName: sourceName.trim() || undefined,
      });
      const result = await ingestionApi.parseMermaid(draft.id, body);
      setRecord(result.record);
      setPreview(result.preview);
      setChosenTitle(result.preview.title);
      setChosenType(result.preview.diagramType);
      setStep("preview");
      toast.success("Mermaid parsed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  };

  const goConfirm = async () => {
    setStep("confirm");
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
    return artifacts.filter((a) => a.title.toLowerCase().includes(q) || a.type.toLowerCase().includes(q));
  }, [artifacts, pickerSearch]);

  const confirmCreate = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const out = await ingestionApi.confirmMermaid(record.id, {
        mode: "CREATE_DIAGRAM",
        artifactId: linkedArtifactId || null,
        title: chosenTitle.trim() || "Imported Mermaid Diagram",
        diagramType: chosenType,
      });
      toast.success(`Imported diagram "${out.diagram.title}"`);
      await onCommitted();
      onNavigateToDiagram(out.diagram.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Import Mermaid diagram" wide>
      {step === "input" && (
        <div className="flex flex-col gap-3">
          <LabeledInput label="Title" value={title} onChange={setTitle} placeholder="e.g. Checkout Flow" required />
          <LabeledInput label="Source name" optional value={sourceName} onChange={setSourceName} placeholder="checkout.mmd" mono />
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-fg-muted">Mermaid source</span>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mmd,.md,text/markdown,text/plain"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
                />
                <Button type="button" size="sm" icon={<UploadIcon size={13} />} onClick={() => fileInputRef.current?.click()}>
                  Upload .mmd / .md
                </Button>
              </div>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"%% Title: Checkout Flow\nsequenceDiagram\nCustomer->>Frontend: Checkout\nFrontend->>OrderService: Create order"}
              spellCheck={false}
              className="min-h-[280px] max-h-[420px] px-3 py-2 bg-panel-2 border border-border rounded-sm text-[12.5px] font-mono leading-relaxed focus:outline-none focus:border-border-strong"
            />
            <div className="text-[11.5px] text-fg-subtle">
              {body.length.toLocaleString()} chars
            </div>
          </div>
          <div className="text-[12px] text-fg-muted">
            We accept Mermaid source (.mmd) or Markdown (.md) containing a <code>```mermaid</code> code block. The first non-comment line determines the diagram type.
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="button" variant="primary" onClick={runParse} disabled={busy || !body.trim()}>{busy ? "Parsing…" : "Parse"}</Button>
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="flex flex-col gap-3 text-[13px]">
          <DetailRow label="Title" value={<strong className="text-fg">{preview.title}</strong>} />
          <DetailRow label="Diagram type" value={<Badge tone="info" mono>{preview.diagramType}</Badge>} />
          <DetailRow label="Lines" value={<span className="text-fg-muted">{preview.lineCount}</span>} />
          <DetailRow label="Node hints" value={
            preview.nodeHints.length === 0
              ? <span className="text-fg-muted">None detected.</span>
              : (
                  <div className="flex flex-wrap gap-1.5">
                    {preview.nodeHints.slice(0, 24).map((n, i) => (
                      <span key={`${n}-${i}`} className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-panel-2 border border-border text-[12px] text-fg-muted">{n}</span>
                    ))}
                    {preview.nodeHints.length > 24 && (
                      <span className="text-[11.5px] text-fg-subtle">+ {preview.nodeHints.length - 24} more</span>
                    )}
                  </div>
                )
          } />
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] uppercase tracking-wider text-fg-subtle">Live preview</span>
            <div className="bg-panel-2 border border-border rounded-sm p-3 overflow-x-auto">
              <MermaidPreview source={preview.mermaidSource} />
            </div>
          </div>
          <details className="text-[12px] text-fg-muted">
            <summary className="cursor-pointer">Show raw Mermaid source</summary>
            <pre className="mt-2 px-3 py-2 bg-panel-2 border border-border rounded-sm text-[12px] font-mono leading-relaxed whitespace-pre-wrap max-h-[260px] overflow-y-auto">{preview.mermaidSource}</pre>
          </details>
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => setStep("input")} disabled={busy}>Back</Button>
            <Button type="button" variant="primary" onClick={goConfirm} disabled={busy}>Create diagram</Button>
          </div>
        </div>
      )}

      {step === "confirm" && preview && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => setStep("preview")}>Back</Button>
            <div className="text-[13px] font-medium">Confirm diagram creation</div>
          </div>
          <LabeledInput label="Diagram title" value={chosenTitle} onChange={setChosenTitle} required />
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-fg-muted">Diagram type</span>
            <select
              value={chosenType}
              onChange={(e) => setChosenType(e.target.value as IngestionDiagramType)}
              className="h-8 px-2 bg-panel-2 border border-border rounded-sm text-[13px] focus:outline-none focus:border-border-strong"
            >
              {DIAGRAM_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <ArtifactLinkPicker
            artifacts={artifacts}
            filtered={filteredArtifacts}
            value={linkedArtifactId}
            onChange={setLinkedArtifactId}
            search={pickerSearch}
            onSearch={setPickerSearch}
            helper="Linking shows this diagram under the artifact's Linked resources."
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep("preview")} disabled={busy}>Cancel</Button>
            <Button type="button" variant="primary" onClick={confirmCreate} disabled={busy || !chosenTitle.trim()}>{busy ? "Creating…" : "Create diagram"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ────────────────────────────── SQL Schema Import Wizard ──────────────────────────────

type SqlStep = "input" | "preview" | "confirm";

const DATABASE_TYPE_OPTIONS: IngestionDatabaseType[] = ["PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite"];

function SqlSchemaImportWizard({
  projectId,
  onClose,
  onCommitted,
  onNavigateToDatabaseModel,
}: {
  projectId: string;
  onClose: () => void;
  onCommitted: () => Promise<void> | void;
  onNavigateToDatabaseModel: (modelId: string) => void;
}) {
  const [step, setStep] = useState<SqlStep>("input");
  const [title, setTitle] = useState("SQL schema import");
  const [sourceName, setSourceName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<IngestionRecord | null>(null);
  const [preview, setPreview] = useState<SqlSchemaParserResult | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [linkedArtifactId, setLinkedArtifactId] = useState<string | "">("");
  const [chosenTitle, setChosenTitle] = useState("Imported Database Schema");
  const [chosenDb, setChosenDb] = useState<IngestionDatabaseType>("PostgreSQL");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (!/\.sql$/i.test(file.name)) { toast.error("Please pick a .sql file"); return; }
    const text = await file.text();
    setBody(text);
    if (!sourceName) setSourceName(file.name);
    if (!title || title === "SQL schema import") {
      setTitle(file.name.replace(/\.sql$/i, ""));
    }
  };

  const runParse = async () => {
    if (!body.trim()) { toast.error("Paste or upload SQL DDL first."); return; }
    setBusy(true);
    try {
      const draft = record ?? await ingestionApi.createDraft(projectId, {
        sourceType: "SQL_SCHEMA",
        title: title.trim() || "SQL schema import",
        sourceName: sourceName.trim() || undefined,
      });
      const result = await ingestionApi.parseSqlSchema(draft.id, body);
      setRecord(result.record);
      setPreview(result.preview);
      setChosenTitle(result.preview.title || "Imported Database Schema");
      setChosenDb(result.preview.databaseType);
      setStep("preview");
      toast.success(`Parsed ${result.preview.entityCount} entities`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  };

  const goConfirm = async () => {
    setStep("confirm");
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
    return artifacts.filter((a) => a.title.toLowerCase().includes(q) || a.type.toLowerCase().includes(q));
  }, [artifacts, pickerSearch]);

  const confirmCreate = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const out = await ingestionApi.confirmSqlSchema(record.id, {
        mode: "CREATE_DATABASE_MODEL",
        artifactId: linkedArtifactId || null,
        title: chosenTitle.trim() || "Imported Database Schema",
        databaseType: chosenDb,
      });
      toast.success(`Imported database "${out.databaseModel.title}" with ${out.databaseModel.entityCount} entities`);
      await onCommitted();
      onNavigateToDatabaseModel(out.databaseModel.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  };

  // Generate a small Mermaid ERD preview client-side from the parsed schema.
  const erdSource = useMemo(() => {
    if (!preview || preview.entities.length === 0) return "";
    const lines: string[] = ["erDiagram"];
    for (const e of preview.entities) {
      const safeName = e.name.replace(/[^A-Za-z0-9_]/g, "_") || "entity";
      if (e.fields.length === 0) {
        lines.push(`  ${safeName} { string _empty "No fields parsed" }`);
        continue;
      }
      lines.push(`  ${safeName} {`);
      for (const f of e.fields.slice(0, 12)) {
        const fname = (f.name || "field").replace(/[^A-Za-z0-9_]/g, "_");
        const ftype = (f.type || "text").replace(/[^A-Za-z0-9_]/g, "_") || "text";
        const flags = [f.isPrimaryKey ? "PK" : "", f.isForeignKey ? "FK" : ""].filter(Boolean).join(",");
        // Name first, type second — Mermaid doesn't validate which token is which.
        lines.push(`    ${fname} ${ftype}${flags ? ` "${flags}"` : ""}`);
      }
      lines.push("  }");
    }
    for (const r of preview.relationships) {
      const from = r.fromEntity.replace(/[^A-Za-z0-9_]/g, "_");
      const to = r.toEntity.replace(/[^A-Za-z0-9_]/g, "_");
      const label = `${r.fromField}→${r.toField || "id"}`.replace(/[^A-Za-z0-9_>→\-]/g, "_");
      lines.push(`  ${from} }o--|| ${to} : "${label}"`);
    }
    return lines.join("\n");
  }, [preview]);

  return (
    <Modal onClose={onClose} title="Import SQL schema" wide>
      {step === "input" && (
        <div className="flex flex-col gap-3">
          <LabeledInput label="Title" value={title} onChange={setTitle} placeholder="e.g. User Management Database" required />
          <LabeledInput label="Source name" optional value={sourceName} onChange={setSourceName} placeholder="schema.sql" mono />
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-fg-muted">SQL DDL</span>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sql,text/sql,text/plain"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
                />
                <Button type="button" size="sm" icon={<UploadIcon size={13} />} onClick={() => fileInputRef.current?.click()}>
                  Upload .sql
                </Button>
              </div>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"CREATE TABLE users (\n  id uuid PRIMARY KEY,\n  email text NOT NULL UNIQUE\n);"}
              spellCheck={false}
              className="min-h-[280px] max-h-[420px] px-3 py-2 bg-panel-2 border border-border rounded-sm text-[12.5px] font-mono leading-relaxed focus:outline-none focus:border-border-strong"
            />
            <div className="text-[11.5px] text-fg-subtle">
              {body.length.toLocaleString()} chars
            </div>
          </div>
          <div className="text-[12px] text-fg-muted">
            Supported subset: CREATE TABLE with column definitions, PRIMARY KEY, NOT NULL, UNIQUE, FOREIGN KEY ... REFERENCES table(column). No migrations, views, triggers, or vendor-specific syntax.
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="button" variant="primary" onClick={runParse} disabled={busy || !body.trim()}>{busy ? "Parsing…" : "Parse"}</Button>
          </div>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="flex flex-col gap-3 text-[13px]">
          <DetailRow label="Database type" value={<Badge tone="info" mono>{preview.databaseType}</Badge>} />
          <DetailRow label="Entities" value={<span className="text-fg-muted">{preview.entityCount}</span>} />
          <DetailRow label="Fields" value={<span className="text-fg-muted">{preview.fieldCount}</span>} />
          <DetailRow label="Foreign keys" value={<span className="text-fg-muted">{preview.relationships.length}</span>} />
          <div className="bg-panel-2 border border-border rounded-sm max-h-[280px] overflow-y-auto p-2">
            {preview.entities.length === 0 ? (
              <div className="px-2 py-2 text-fg-muted text-[12.5px]">No entities detected.</div>
            ) : preview.entities.map((e) => (
              <div key={e.name} className="mb-2 last:mb-0">
                <div className="text-[13px] font-semibold font-mono">{e.name}</div>
                <ul className="m-0 mt-1 pl-3 list-none text-[12.5px] text-fg-muted">
                  {e.fields.map((f) => (
                    <li key={f.name} className="flex items-center gap-1.5">
                      <span className="font-mono">{f.name}</span>
                      <span className="text-fg-subtle">{f.type}</span>
                      {f.isPrimaryKey && <Badge tone="warning" mono>PK</Badge>}
                      {f.isForeignKey && (
                        <Badge tone="info" mono>FK → {f.referencesEntity}.{f.referencesField || "id"}</Badge>
                      )}
                      {f.required && !f.isPrimaryKey && <span className="text-fg-subtle">required</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {erdSource && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] uppercase tracking-wider text-fg-subtle">ERD preview</span>
              <div className="bg-panel-2 border border-border rounded-sm p-3 overflow-x-auto">
                <MermaidPreview source={erdSource} />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => setStep("input")} disabled={busy}>Back</Button>
            <Button type="button" variant="primary" onClick={goConfirm} disabled={busy || preview.entityCount === 0}>Create database model</Button>
          </div>
        </div>
      )}

      {step === "confirm" && preview && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => setStep("preview")}>Back</Button>
            <div className="text-[13px] font-medium">Confirm database model creation</div>
          </div>
          <LabeledInput label="Title" value={chosenTitle} onChange={setChosenTitle} required />
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-fg-muted">Database type</span>
            <select
              value={chosenDb}
              onChange={(e) => setChosenDb(e.target.value as IngestionDatabaseType)}
              className="h-8 px-2 bg-panel-2 border border-border rounded-sm text-[13px] focus:outline-none focus:border-border-strong"
            >
              {DATABASE_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <ArtifactLinkPicker
            artifacts={artifacts}
            filtered={filteredArtifacts}
            value={linkedArtifactId}
            onChange={setLinkedArtifactId}
            search={pickerSearch}
            onSearch={setPickerSearch}
            helper="Linking shows this database model under the artifact's Linked resources."
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep("preview")} disabled={busy}>Cancel</Button>
            <Button type="button" variant="primary" onClick={confirmCreate} disabled={busy || !chosenTitle.trim()}>{busy ? "Creating…" : "Create database model"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Shared artifact picker for Mermaid + SQL wizards.
function ArtifactLinkPicker({
  artifacts,
  filtered,
  value,
  onChange,
  search,
  onSearch,
  helper,
}: {
  artifacts: Artifact[] | null;
  filtered: Artifact[];
  value: string;
  onChange: (id: string) => void;
  search: string;
  onSearch: (s: string) => void;
  helper: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-fg-muted">Link to artifact <span className="text-fg-subtle">(optional)</span></span>
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search artifacts by title or type…"
          className="w-full h-8 pl-8 pr-3 bg-panel-2 border border-border rounded-sm text-[13px] focus:outline-none focus:border-border-strong"
        />
      </div>
      <div className="bg-panel-2 border border-border rounded-sm max-h-[220px] overflow-y-auto">
        <ul className="divide-y divide-border">
          <li>
            <button
              type="button"
              onClick={() => onChange("")}
              className={`w-full text-left px-3 py-2 hover:bg-panel-hover text-[13px] ${value === "" ? "bg-panel-hover" : ""}`}
            >
              <span className="text-fg-muted">— No artifact link —</span>
            </button>
          </li>
          {artifacts === null ? (
            <li className="px-3 py-3 text-fg-muted text-[13px]">Loading artifacts…</li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-3 text-fg-muted text-[13px]">No artifacts match.</li>
          ) : filtered.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onChange(a.id)}
                className={`w-full text-left px-3 py-2 hover:bg-panel-hover flex items-center gap-2.5 ${value === a.id ? "bg-panel-hover" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium truncate">{a.title}</div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <TypeChip type={a.type} />
                    <StatusBadge status={a.status} />
                  </div>
                </div>
                {value === a.id && <Badge tone="info">Selected</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="text-[12px] text-fg-muted">{helper}</div>
    </label>
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
  const parser = record.parserResult as MarkdownParserResult | OpenApiParserResult | MermaidParserResult | SqlSchemaParserResult | null;
  const parserSource = (parser as { source?: string } | null)?.source ?? null;
  const isOpenApi = parserSource === "OPENAPI_JSON";
  const isMermaid = parserSource === "MERMAID";
  const isSql = parserSource === "SQL_SCHEMA";
  const linkHrefFor = (c: CreatedRecordRef) => {
    if (c.type === "API_SPEC") return `/projects/${projectId}/api/${c.id}`;
    if (c.type === "ARTIFACT") return `/projects/${projectId}/artifacts/${c.id}?tab=documentation`;
    if (c.type === "DIAGRAM") return `/projects/${projectId}/diagrams/${c.id}`;
    if (c.type === "DATABASE_MODEL") return `/projects/${projectId}/database/${c.id}`;
    return `/projects/${projectId}`;
  };
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <DetailRow label="Source type" value={
        <div className="inline-flex items-center gap-1.5">{meta?.icon}<span>{meta?.label ?? record.sourceType}</span></div>
      } />
      <DetailRow label="Status" value={<Badge tone={STATUS_TONE[record.status]}>{record.status}</Badge>} />
      <DetailRow label="Source name" value={record.sourceName ? <span className="font-mono text-[12.5px]">{record.sourceName}</span> : <span className="text-fg-muted">—</span>} />
      <DetailRow label="Created by" value={record.createdBy?.name || record.createdBy?.email || "—"} />
      <DetailRow label="Created" value={<span className="text-fg-muted">{timeAgo(record.createdAt)}</span>} />

      {parser && !isOpenApi && !isMermaid && !isSql && (
        <>
          <DetailRow label="Parsed title" value={<span className="text-fg">{(parser as MarkdownParserResult).title}</span>} />
          <DetailRow label="Word count" value={<span className="text-fg-muted">{(parser as MarkdownParserResult).wordCount} words</span>} />
          <DetailRow label="Headings" value={
            (parser as MarkdownParserResult).headings.length === 0
              ? <span className="text-fg-muted">None detected.</span>
              : <span className="text-fg-muted">{(parser as MarkdownParserResult).headings.length} (e.g. {(parser as MarkdownParserResult).headings.slice(0, 3).join(", ")}{(parser as MarkdownParserResult).headings.length > 3 ? "…" : ""})</span>
          } />
        </>
      )}

      {parser && isOpenApi && (
        <>
          <DetailRow label="API title" value={<span className="text-fg">{(parser as OpenApiParserResult).title}</span>} />
          <DetailRow label="Version" value={<span className="text-fg-muted">v{(parser as OpenApiParserResult).version}</span>} />
          <DetailRow label="Base URL" value={
            (parser as OpenApiParserResult).baseUrl
              ? <span className="font-mono text-[12.5px]">{(parser as OpenApiParserResult).baseUrl}</span>
              : <span className="text-fg-subtle">none</span>
          } />
          <DetailRow label="Endpoints" value={<span className="text-fg-muted">{(parser as OpenApiParserResult).endpointCount}</span>} />
        </>
      )}

      {parser && isMermaid && (
        <>
          <DetailRow label="Diagram title" value={<span className="text-fg">{(parser as MermaidParserResult).title}</span>} />
          <DetailRow label="Diagram type" value={<Badge tone="info" mono>{(parser as MermaidParserResult).diagramType}</Badge>} />
          <DetailRow label="Lines" value={<span className="text-fg-muted">{(parser as MermaidParserResult).lineCount}</span>} />
          <DetailRow label="Node hints" value={
            (parser as MermaidParserResult).nodeHints.length === 0
              ? <span className="text-fg-muted">None detected.</span>
              : <span className="text-fg-muted">{(parser as MermaidParserResult).nodeHints.slice(0, 5).join(", ")}{(parser as MermaidParserResult).nodeHints.length > 5 ? `, +${(parser as MermaidParserResult).nodeHints.length - 5} more` : ""}</span>
          } />
        </>
      )}

      {parser && isSql && (
        <>
          <DetailRow label="DB title" value={<span className="text-fg">{(parser as SqlSchemaParserResult).title}</span>} />
          <DetailRow label="Database type" value={<Badge tone="info" mono>{(parser as SqlSchemaParserResult).databaseType}</Badge>} />
          <DetailRow label="Entities" value={<span className="text-fg-muted">{(parser as SqlSchemaParserResult).entityCount}</span>} />
          <DetailRow label="Fields" value={<span className="text-fg-muted">{(parser as SqlSchemaParserResult).fieldCount}</span>} />
          <DetailRow label="Relationships" value={<span className="text-fg-muted">{(parser as SqlSchemaParserResult).relationships.length} FK</span>} />
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
                    href={linkHrefFor(c)}
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

function BaseUrlPicker({
  value,
  onChange,
  availableBaseUrls,
  parsedBaseUrl,
}: {
  value: string;
  onChange: (v: string) => void;
  availableBaseUrls: string[];
  parsedBaseUrl: string;
}) {
  const showChips = availableBaseUrls.length > 1;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-fg-muted">Base URL</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={parsedBaseUrl || "/api"}
        spellCheck={false}
        className="h-8 px-2.5 bg-panel-2 border border-border rounded-sm text-[13px] font-mono focus:outline-none focus:border-border-strong"
      />
      {showChips && (
        <div className="flex flex-wrap gap-1.5">
          {availableBaseUrls.map((url) => {
            const selected = value.trim() === url.trim();
            return (
              <button
                key={url}
                type="button"
                onClick={() => onChange(url)}
                className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[12px] font-mono transition-colors ${
                  selected
                    ? "bg-accent-soft text-accent border-accent"
                    : "bg-panel-2 text-fg-muted border-border hover:bg-panel-hover hover:text-fg"
                }`}
                title={url}
              >
                {url}
              </button>
            );
          })}
        </div>
      )}
      <div className="text-[11.5px] text-fg-subtle">
        OpenAPI files often contain generated, staging, or placeholder server URLs. Choose the URL that should be stored in Minotaurus.
      </div>
    </div>
  );
}

const HEADINGS_COLLAPSED_LIMIT = 12;

function ParsedHeadingsList({ headings }: { headings: string[] }) {
  const [showAll, setShowAll] = useState(false);

  if (headings.length === 0) {
    return <span className="text-fg-muted">No headings detected.</span>;
  }

  const overflow = Math.max(0, headings.length - HEADINGS_COLLAPSED_LIMIT);
  const visible = showAll ? headings : headings.slice(0, HEADINGS_COLLAPSED_LIMIT);
  const canToggle = overflow > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {visible.map((h, i) => (
          <span
            key={`${i}-${h}`}
            className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-panel-2 border border-border text-[12px] text-fg-muted leading-snug max-w-full truncate"
            title={h}
          >
            {h}
          </span>
        ))}
      </div>
      {canToggle && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="self-start inline-flex items-center gap-1 px-1.5 py-0.5 -ml-1.5 rounded-sm text-[11.5px] text-fg-muted hover:text-fg hover:bg-panel-hover focus:outline-none focus:ring-1 focus:ring-accent"
          aria-expanded={showAll}
        >
          {showAll ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {showAll ? "Show less" : `+ ${overflow} more`}
        </button>
      )}
    </div>
  );
}
