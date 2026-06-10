// components/export-preview.tsx — readable SSOT export preview
"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Box, Network, Shield, ChevronDown, FileText, BookOpen, Plug, Lock, LockOpen, Database, Key, Link2, ArrowRight, GitMerge, History } from "lucide-react";
import { MermaidPreview } from "@/components/mermaid-preview";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TypeChip } from "@/components/ui/type-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { Empty } from "@/components/ui/empty";
import type {
  ArtifactStatus,
  ArtifactType,
  Category,
  ExportFormat,
  IssueStatus,
  RelationType,
  Severity,
} from "@/lib/types";

interface ExportedDocumentation {
  markdownContent: string;
  updatedAt: string;
}

interface ExportedArtifact {
  id: string;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
  description: string;
  tags?: string[];
  documentation?: ExportedDocumentation;
}

interface ExportedRelation {
  id: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  relationType: RelationType;
  description?: string;
}

interface ExportedIssue {
  id: string;
  severity: Severity;
  category: Category;
  message: string;
  artifactId: string;
  status: IssueStatus;
}

interface ExportedProject {
  id: string;
  name: string;
  description?: string;
}

interface ExportedApiEndpoint {
  id: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  summary?: string;
  requiresAuth?: boolean;
}

interface ExportedApiSpec {
  id: string;
  title: string;
  version: string;
  baseUrl?: string;
  description?: string;
  artifactId?: string | null;
  linkedArtifact?: { id: string; title: string; type: ArtifactType } | null;
  endpoints?: ExportedApiEndpoint[];
}

interface ExportedDatabaseField {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  referencesEntityId?: string | null;
  referencesEntityName?: string | null;
  referencesFieldId?: string | null;
  referencesFieldName?: string | null;
}

interface ExportedDatabaseEntity {
  id: string;
  name: string;
  description?: string;
  fields?: ExportedDatabaseField[];
}

interface ExportedDatabaseModel {
  id: string;
  title: string;
  databaseType: string;
  description?: string;
  artifactId?: string | null;
  linkedArtifact?: { id: string; title: string; type: ArtifactType } | null;
  entities?: ExportedDatabaseEntity[];
}

interface ExportedDiagram {
  id: string;
  title: string;
  type: string;
  mermaidSource?: string;
  description?: string;
  artifactId?: string | null;
  linkedArtifact?: { id: string; title: string; type: ArtifactType } | null;
}

interface ExportedVersionEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  title: string;
  description?: string;
  triggeredBy?: string;
  createdAt: string;
}

interface ExportedImpactRow {
  artifact: { id: string; title: string; type: string; status: string };
  directDependencies: { id: string; targetTitle: string | null; relationType: string }[];
  dependentArtifacts: { id: string; sourceTitle: string | null; relationType: string }[];
  impactSummary: {
    affectedArtifacts: number;
    affectedApis: number;
    affectedDatabases: number;
    affectedDiagrams: number;
  };
}

interface ExportContent {
  project?: ExportedProject;
  generatedAt?: string;
  artifacts?: ExportedArtifact[];
  relations?: ExportedRelation[];
  validationIssues?: ExportedIssue[];
  apiSpecs?: ExportedApiSpec[];
  databaseModels?: ExportedDatabaseModel[];
  diagrams?: ExportedDiagram[];
  versionHistory?: ExportedVersionEvent[];
  recentChanges?: ExportedVersionEvent[];
  impactAnalysis?: ExportedImpactRow[];
}

export interface ExportPreviewModel {
  id: string;
  format: ExportFormat;
  sections: string[];
  createdAt: string;
  content: unknown;
}

export function ExportPreview({ preview }: { preview: ExportPreviewModel }) {
  const isMarkdown = preview.format === "MARKDOWN";

  const parsed: ExportContent | null = useMemo(() => {
    if (isMarkdown) return null;
    if (preview.content && typeof preview.content === "object") {
      return preview.content as ExportContent;
    }
    return null;
  }, [preview.content, isMarkdown]);

  const markdownBody: string = useMemo(
    () => (isMarkdown ? String(preview.content ?? "") : ""),
    [preview.content, isMarkdown],
  );

  const artifactsById = useMemo(() => {
    const map = new Map<string, ExportedArtifact>();
    parsed?.artifacts?.forEach((a) => map.set(a.id, a));
    return map;
  }, [parsed]);

  const artifacts = parsed?.artifacts ?? [];
  const relations = parsed?.relations ?? [];
  const issues = parsed?.validationIssues ?? [];
  const apiSpecs = parsed?.apiSpecs ?? [];
  const totalEndpoints = apiSpecs.reduce((s, x) => s + (x.endpoints?.length ?? 0), 0);
  const databaseModels = parsed?.databaseModels ?? [];
  const totalEntities = databaseModels.reduce((s, m) => s + (m.entities?.length ?? 0), 0);
  const diagrams = parsed?.diagrams ?? [];
  const versionHistory = parsed?.versionHistory ?? [];
  const impactRows = parsed?.impactAnalysis ?? [];
  const docCount = artifacts.filter((a) => a.documentation?.markdownContent?.trim()).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary strip */}
      <div className="bg-panel-2 border border-border rounded-md p-3.5">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge mono>{preview.format}</Badge>
          <div className="text-[13.5px] font-semibold">
            {parsed?.project?.name ?? (isMarkdown ? "Markdown export" : "Untitled project")}
          </div>
          <div className="text-[11.5px] text-fg-subtle font-mono">
            generated {new Date(parsed?.generatedAt ?? preview.createdAt).toLocaleString()}
          </div>
          <div className="flex-1" />
          <span className="text-[11.5px] text-fg-subtle">sections: {preview.sections.join(", ") || "—"}</span>
        </div>
        {!isMarkdown && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mt-3">
            <SummaryCount icon={<Box size={13} />} label="Artifacts" value={artifacts.length} />
            <SummaryCount icon={<BookOpen size={13} />} label="With docs" value={docCount} />
            <SummaryCount icon={<Network size={13} />} label="Relations" value={relations.length} />
            <SummaryCount icon={<Plug size={13} />} label="API endpoints" value={totalEndpoints} />
            <SummaryCount icon={<Database size={13} />} label="DB entities" value={totalEntities} />
            <SummaryCount icon={<GitMerge size={13} />} label="Diagrams" value={diagrams.length} />
            <SummaryCount icon={<History size={13} />} label="Events" value={versionHistory.length} />
            <SummaryCount icon={<Shield size={13} />} label="Issues" value={issues.length} />
          </div>
        )}
      </div>

      {/* Body */}
      {isMarkdown ? (
        <Card title="Markdown content">
          {markdownBody.trim() ? (
            <article className="prose-markdown" style={{ maxHeight: 480, overflow: "auto" }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownBody}</ReactMarkdown>
            </article>
          ) : (
            <Empty icon={<FileText size={26} />} title="Empty export" message="No content was rendered." />
          )}
        </Card>
      ) : (
        <>
          {parsed === null ? (
            <Card>
              <div className="text-fg-muted text-[13px]">Unexpected payload shape.</div>
            </Card>
          ) : (
            <>
              <ArtifactsSection artifacts={artifacts} />
              <ApiSpecsSection apiSpecs={apiSpecs} />
              <DatabaseModelsSection databaseModels={databaseModels} />
              <DiagramsSection diagrams={diagrams} />
              <RelationsSection relations={relations} artifactsById={artifactsById} />
              <RecentChangesSection events={versionHistory} />
              <ImpactSection rows={impactRows} />
              <IssuesSection issues={issues} artifactsById={artifactsById} />
            </>
          )}
        </>
      )}

      {/* Raw — collapsible */}
      <details className="bg-panel-2 border border-border rounded-md group">
        <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[12.5px] text-fg-muted hover:text-fg flex items-center gap-2 list-none">
          <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
          Raw {isMarkdown ? "Markdown" : "JSON"}
        </summary>
        <pre className="bg-panel border-t border-border px-3.5 py-3 text-[12px] overflow-auto" style={{ maxHeight: 360 }}>
          {isMarkdown ? markdownBody : JSON.stringify(preview.content ?? {}, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function SummaryCount({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-panel border border-border rounded-md px-3 py-2">
      <div className="text-[11px] text-fg-muted flex items-center gap-1.5">{icon}{label}</div>
      <div className="text-[20px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ArtifactsSection({ artifacts }: { artifacts: ExportedArtifact[] }) {
  if (artifacts.length === 0) {
    return (
      <Card title="Artifacts">
        <div className="text-fg-muted text-[13px]">Not included in this export.</div>
      </Card>
    );
  }
  return (
    <Card title={`Artifacts (${artifacts.length})`}>
      <div className="grid sm:grid-cols-2 gap-3">
        {artifacts.map((a) => (
          <div key={a.id} className="bg-panel-2 border border-border rounded-md p-3">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <TypeChip type={a.type} />
              <StatusBadge status={a.status} />
              {a.documentation?.markdownContent?.trim() && (
                <Badge tone="success">DOC</Badge>
              )}
            </div>
            <div className="font-medium text-[13.5px] mb-1">{a.title}</div>
            <div className="text-fg-muted text-[12.5px] leading-relaxed">{a.description || <em className="text-fg-subtle">No description</em>}</div>
            {a.documentation?.markdownContent?.trim() && (
              <details className="mt-2 group">
                <summary className="cursor-pointer select-none text-[12px] text-accent hover:underline list-none flex items-center gap-1">
                  <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                  Documentation
                </summary>
                <div className="mt-2 bg-panel border border-border rounded-md p-2.5">
                  <article className="prose-markdown" style={{ fontSize: 12.5, maxHeight: 220, overflow: "auto" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {a.documentation.markdownContent}
                    </ReactMarkdown>
                  </article>
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function RelationsSection({
  relations,
  artifactsById,
}: {
  relations: ExportedRelation[];
  artifactsById: Map<string, ExportedArtifact>;
}) {
  if (relations.length === 0) {
    return (
      <Card title="Relations">
        <div className="text-fg-muted text-[13px]">Not included in this export.</div>
      </Card>
    );
  }
  return (
    <Card padded={false} title={`Relations (${relations.length})`}>
      <table className="w-full text-[13px]">
        <thead className="bg-panel">
          <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
            <th className="text-left px-3.5 py-2.5 border-b border-border">Source</th>
            <th className="text-left px-3.5 py-2.5 border-b border-border">Relation</th>
            <th className="text-left px-3.5 py-2.5 border-b border-border">Target</th>
          </tr>
        </thead>
        <tbody>
          {relations.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <td className="px-3.5 py-2.5">
                <ArtifactRef artifactId={r.sourceArtifactId} artifactsById={artifactsById} />
              </td>
              <td className="px-3.5 py-2.5">
                <Badge mono>{r.relationType}</Badge>
              </td>
              <td className="px-3.5 py-2.5">
                <ArtifactRef artifactId={r.targetArtifactId} artifactsById={artifactsById} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function IssuesSection({
  issues,
  artifactsById,
}: {
  issues: ExportedIssue[];
  artifactsById: Map<string, ExportedArtifact>;
}) {
  if (issues.length === 0) {
    return (
      <Card title="Validation issues">
        <div className="text-fg-muted text-[13px]">No validation issues in this export.</div>
      </Card>
    );
  }
  return (
    <Card padded={false} title={`Validation issues (${issues.length})`}>
      <table className="w-full text-[13px]">
        <thead className="bg-panel">
          <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
            <th className="text-left px-3.5 py-2.5 border-b border-border">Severity</th>
            <th className="text-left px-3.5 py-2.5 border-b border-border">Category</th>
            <th className="text-left px-3.5 py-2.5 border-b border-border">Message</th>
            <th className="text-left px-3.5 py-2.5 border-b border-border">Artifact</th>
            <th className="text-left px-3.5 py-2.5 border-b border-border">Status</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((i) => (
            <tr key={i.id} className="border-b border-border last:border-0">
              <td className="px-3.5 py-2.5"><SeverityBadge severity={i.severity} /></td>
              <td className="px-3.5 py-2.5"><Badge mono>{i.category}</Badge></td>
              <td className="px-3.5 py-2.5">{i.message}</td>
              <td className="px-3.5 py-2.5">
                <ArtifactRef artifactId={i.artifactId} artifactsById={artifactsById} />
              </td>
              <td className="px-3.5 py-2.5"><Badge mono>{i.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ArtifactRef({
  artifactId,
  artifactsById,
}: {
  artifactId: string;
  artifactsById: Map<string, ExportedArtifact>;
}) {
  const a = artifactsById.get(artifactId);
  if (!a) return <span className="font-mono text-[11.5px] text-fg-subtle">{artifactId}</span>;
  return (
    <div className="flex items-center gap-2">
      <TypeChip type={a.type} />
      <span className="text-[13px] font-medium">{a.title}</span>
    </div>
  );
}

const METHOD_TONE: Record<ExportedApiEndpoint["method"], string> = {
  GET: "var(--c-info)",
  POST: "var(--c-success)",
  PUT: "var(--c-warning)",
  PATCH: "var(--c-warning)",
  DELETE: "var(--c-danger)",
};

function ApiSpecsSection({ apiSpecs }: { apiSpecs: ExportedApiSpec[] }) {
  if (apiSpecs.length === 0) {
    return (
      <Card title="API specs">
        <div className="text-fg-muted text-[13px]">Not included in this export.</div>
      </Card>
    );
  }
  return (
    <Card title={`API specs (${apiSpecs.length})`}>
      <div className="flex flex-col gap-3">
        {apiSpecs.map((s) => (
          <div key={s.id} className="bg-panel-2 border border-border rounded-md p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Plug size={13} className="text-accent" />
              <span className="font-semibold text-[13.5px]">{s.title}</span>
              <Badge mono>v{s.version}</Badge>
              {s.baseUrl && <Badge mono>{s.baseUrl}</Badge>}
              {s.linkedArtifact && (
                <span className="flex items-center gap-1.5 text-[12px] text-fg-muted ml-1">
                  <TypeChip type={s.linkedArtifact.type} />
                  {s.linkedArtifact.title}
                </span>
              )}
            </div>
            {s.description && <div className="text-fg-muted text-[12.5px] mb-2">{s.description}</div>}
            {!s.endpoints || s.endpoints.length === 0 ? (
              <div className="text-fg-subtle text-[12.5px] italic">No endpoints.</div>
            ) : (
              <div className="bg-panel border border-border rounded-md overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead className="bg-panel-2">
                    <tr className="text-fg-muted text-[11px] uppercase tracking-wider">
                      <th className="text-left px-3 py-2 border-b border-border">Method</th>
                      <th className="text-left px-3 py-2 border-b border-border">Path</th>
                      <th className="text-left px-3 py-2 border-b border-border">Summary</th>
                      <th className="text-left px-3 py-2 border-b border-border">Auth</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.endpoints.map((e) => (
                      <tr key={e.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <span className="font-mono text-[10.5px] font-bold px-1.5 py-0.5 rounded" style={{
                            color: METHOD_TONE[e.method],
                            border: `1px solid ${METHOD_TONE[e.method]}33`,
                            background: `${METHOD_TONE[e.method]}11`,
                          }}>
                            {e.method}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[12px]">{e.path}</td>
                        <td className="px-3 py-2">{e.summary || <em className="text-fg-subtle">—</em>}</td>
                        <td className="px-3 py-2">
                          {e.requiresAuth ? (
                            <span className="inline-flex items-center gap-1 text-[11.5px]"><Lock size={11} /> required</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-muted"><LockOpen size={11} /> public</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function DatabaseModelsSection({ databaseModels }: { databaseModels: ExportedDatabaseModel[] }) {
  if (databaseModels.length === 0) {
    return (
      <Card title="Database models">
        <div className="text-fg-muted text-[13px]">Not included in this export.</div>
      </Card>
    );
  }
  return (
    <Card title={`Database models (${databaseModels.length})`}>
      <div className="flex flex-col gap-3">
        {databaseModels.map((m) => {
          const entities = m.entities ?? [];
          return (
            <div key={m.id} className="bg-panel-2 border border-border rounded-md p-3">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Database size={13} className="text-accent" />
                <span className="font-semibold text-[13.5px]">{m.title}</span>
                <Badge mono>{m.databaseType}</Badge>
                {m.linkedArtifact && (
                  <span className="flex items-center gap-1.5 text-[12px] text-fg-muted ml-1">
                    <TypeChip type={m.linkedArtifact.type} />
                    {m.linkedArtifact.title}
                  </span>
                )}
              </div>
              {m.description && <div className="text-fg-muted text-[12.5px] mb-2">{m.description}</div>}
              {entities.length === 0 ? (
                <div className="text-fg-subtle text-[12.5px] italic">No entities.</div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {entities.map((e) => (
                    <div key={e.id} className="bg-panel border border-border rounded-md overflow-hidden">
                      <div className="px-3 py-1.5 bg-panel-2 font-mono font-semibold text-[12.5px] border-b border-border">{e.name}</div>
                      {(e.fields ?? []).length === 0 ? (
                        <div className="px-3 py-2 text-fg-subtle text-[12px] italic">No fields</div>
                      ) : (
                        <div className="text-[12px] font-mono">
                          {(e.fields ?? []).map((f) => (
                            <div key={f.id} className="flex items-center gap-2 px-3 py-1 border-t border-border first:border-t-0">
                              {f.isPrimaryKey && <Key size={9} className="text-warning shrink-0" />}
                              {(f.isForeignKey || f.referencesEntityId) && <Link2 size={9} className="text-info shrink-0" />}
                              <span className="font-semibold">{f.name}</span>
                              <span className="text-fg-muted">: {f.type}</span>
                              {f.referencesEntityName && (
                                <span className="ml-auto text-fg-subtle text-[11px] inline-flex items-center gap-1">
                                  <ArrowRight size={9} /> {f.referencesEntityName}
                                  {f.referencesFieldName ? `.${f.referencesFieldName}` : ""}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DiagramsSection({ diagrams }: { diagrams: ExportedDiagram[] }) {
  if (diagrams.length === 0) {
    return (
      <Card title="Diagrams">
        <div className="text-fg-muted text-[13px]">Not included in this export.</div>
      </Card>
    );
  }
  return (
    <Card title={`Diagrams (${diagrams.length})`}>
      <div className="flex flex-col gap-3">
        {diagrams.map((d) => (
          <div key={d.id} className="bg-panel-2 border border-border rounded-md p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <GitMerge size={13} className="text-accent" />
              <span className="font-semibold text-[13.5px]">{d.title}</span>
              <Badge mono>{d.type}</Badge>
              {d.linkedArtifact && (
                <span className="flex items-center gap-1.5 text-[12px] text-fg-muted ml-1">
                  <TypeChip type={d.linkedArtifact.type} />
                  {d.linkedArtifact.title}
                </span>
              )}
            </div>
            {d.description && <div className="text-fg-muted text-[12.5px] mb-2">{d.description}</div>}
            {d.mermaidSource && d.mermaidSource.trim() ? (
              <>
                <div className="bg-panel border border-border rounded-md p-3 mb-2">
                  <MermaidPreview source={d.mermaidSource} />
                </div>
                <details className="group">
                  <summary className="cursor-pointer select-none text-[12px] text-accent hover:underline list-none flex items-center gap-1">
                    <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                    Mermaid source
                  </summary>
                  <pre className="mt-2 bg-panel border border-border rounded-md p-2.5 text-[12px] overflow-auto" style={{ maxHeight: 220 }}>
                    {d.mermaidSource}
                  </pre>
                </details>
              </>
            ) : (
              <div className="text-fg-subtle text-[12.5px] italic">No Mermaid source.</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function RecentChangesSection({ events }: { events: ExportedVersionEvent[] }) {
  if (events.length === 0) {
    return (
      <Card title="Recent changes">
        <div className="text-fg-muted text-[13px]">Not included in this export.</div>
      </Card>
    );
  }
  const shown = events.slice(0, 15);
  return (
    <Card title={`Recent changes (${events.length})`} subtitle={`Showing latest ${shown.length}.`}>
      <ul className="divide-y divide-border">
        {shown.map((e) => (
          <li key={e.id} className="flex items-center gap-2 py-2 text-[13px]">
            <Badge mono>{e.action}</Badge>
            <Badge mono>{e.entityType}</Badge>
            <span className="flex-1 min-w-0 truncate">{e.title}</span>
            <span className="text-[11.5px] text-fg-subtle font-mono">{new Date(e.createdAt).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ImpactSection({ rows }: { rows: ExportedImpactRow[] }) {
  if (rows.length === 0) {
    return (
      <Card title="Impact analysis">
        <div className="text-fg-muted text-[13px]">Not included in this export.</div>
      </Card>
    );
  }
  return (
    <Card title={`Impact analysis (${rows.length} artifacts)`} subtitle="Per-artifact blast radius.">
      <div className="grid sm:grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.artifact.id} className="bg-panel-2 border border-border rounded-md p-3">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <TypeChip type={r.artifact.type as ArtifactType} />
              <span className="text-[13.5px] font-medium">{r.artifact.title}</span>
              <Badge mono>{r.artifact.status}</Badge>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-[11.5px]">
              <Tile label="Artifacts" value={r.impactSummary.affectedArtifacts} />
              <Tile label="APIs"      value={r.impactSummary.affectedApis} />
              <Tile label="DBs"       value={r.impactSummary.affectedDatabases} />
              <Tile label="Diagrams"  value={r.impactSummary.affectedDiagrams} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-panel border border-border rounded px-2 py-1">
      <div className="text-[10px] text-fg-muted">{label}</div>
      <div className="text-[14px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
