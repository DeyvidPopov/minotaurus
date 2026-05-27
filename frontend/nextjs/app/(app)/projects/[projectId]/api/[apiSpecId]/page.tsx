// app/(app)/projects/[projectId]/api/[apiSpecId]/page.tsx — API spec detail
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Trash2, Plus, X, Lock, LockOpen, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TypeChip } from "@/components/ui/type-chip";
import { Empty } from "@/components/ui/empty";
import { Tabs } from "@/components/ui/tabs";
import { artifactsApi } from "@/lib/api/artifacts";
import {
  apiEndpointsApi,
  apiSpecsApi,
  type ApiEndpoint,
  type ApiSpec,
  type HttpMethod,
} from "@/lib/api/api-specs";
import { ApiError } from "@/lib/api/client";
import type { Artifact } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const METHOD_TONE: Record<HttpMethod, string> = {
  GET: "var(--c-info)",
  POST: "var(--c-success)",
  PUT: "var(--c-warning)",
  PATCH: "var(--c-warning)",
  DELETE: "var(--c-danger)",
};

export default function ApiSpecDetailPage({
  params,
}: {
  params: { projectId: string; apiSpecId: string };
}) {
  const { projectId, apiSpecId } = params;
  const router = useRouter();

  const [spec, setSpec] = useState<ApiSpec | null>(null);
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [tab, setTab] = useState<"endpoints" | "preview">("endpoints");

  const [editingSpec, setEditingSpec] = useState(false);
  const [creatingEndpoint, setCreatingEndpoint] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<ApiEndpoint | null>(null);

  const load = async () => {
    try {
      const [s, eps, arts] = await Promise.all([
        apiSpecsApi.get(apiSpecId),
        apiEndpointsApi.list(apiSpecId),
        artifactsApi.list(projectId),
      ]);
      setSpec(s);
      setEndpoints(eps);
      setArtifacts(arts);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load API spec");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSpecId]);

  const linkedArtifact = useMemo(
    () => (spec?.artifactId ? artifacts.find((a) => a.id === spec.artifactId) ?? null : null),
    [spec, artifacts],
  );

  if (!spec) {
    return <div className="px-8 py-6 text-fg-muted">Loading…</div>;
  }

  const onDeleteSpec = async () => {
    if (!confirm(`Delete API spec "${spec.title}"? Its ${endpoints.length} endpoint(s) will also be removed.`)) return;
    try {
      await apiSpecsApi.remove(spec.id);
      toast.success("API spec deleted");
      router.push(`/projects/${projectId}/api`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  };

  const onDeleteEndpoint = async (id: string) => {
    if (!confirm("Delete this endpoint?")) return;
    try {
      await apiEndpointsApi.remove(id);
      toast.success("Endpoint deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete endpoint");
    }
  };

  return (
    <div className="px-8 py-6 max-w-[1100px] mx-auto">
      <PageHeader
        eyebrow={
          <>
            <Badge mono>API SPEC</Badge>
            <Badge mono>v{spec.version}</Badge>
            {spec.baseUrl && <Badge mono>{spec.baseUrl}</Badge>}
          </>
        }
        title={spec.title}
        subtitle={spec.description || "No description"}
        actions={
          <>
            <Button icon={<Edit size={13} />} onClick={() => setEditingSpec(true)}>Edit</Button>
            <Button icon={<Trash2 size={13} />} onClick={onDeleteSpec}>Delete</Button>
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
          <span>Updated {timeAgo(spec.updatedAt)}</span>
          <span className="font-mono text-[11.5px]">{spec.id}</span>
        </div>
      </PageHeader>

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as "endpoints" | "preview")}
        tabs={[
          { id: "endpoints", label: "Endpoints", count: endpoints.length },
          { id: "preview", label: "OpenAPI-like JSON" },
        ]}
      />

      {tab === "endpoints" && (
        <Card
          padded={false}
          title={`Endpoints (${endpoints.length})`}
          action={
            <Button size="sm" variant="primary" icon={<Plus size={12} />} onClick={() => setCreatingEndpoint(true)}>
              Add endpoint
            </Button>
          }
        >
          {endpoints.length === 0 ? (
            <Empty
              title="No endpoints yet"
              message="Add the HTTP routes this spec describes."
              action={
                <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreatingEndpoint(true)}>
                  Add endpoint
                </Button>
              }
            />
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-panel">
                <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Method</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Path</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Summary</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Auth</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {endpoints.map((ep) => (
                  <tr key={ep.id} className="border-b border-border last:border-0 hover:bg-panel-hover">
                    <td className="px-3.5 py-2.5">
                      <span className="font-mono text-[11px] font-bold px-2 py-1 rounded" style={{
                        color: METHOD_TONE[ep.method],
                        border: `1px solid ${METHOD_TONE[ep.method]}33`,
                        background: `${METHOD_TONE[ep.method]}11`,
                      }}>
                        {ep.method}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[12.5px]">{ep.path}</td>
                    <td className="px-3.5 py-2.5">{ep.summary || <em className="text-fg-subtle">No summary</em>}</td>
                    <td className="px-3.5 py-2.5">
                      {ep.requiresAuth ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-fg"><Lock size={11} /> required</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-fg-muted"><LockOpen size={11} /> public</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-fg-muted text-[12px]">{timeAgo(ep.updatedAt)}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" icon={<Edit size={12} />} onClick={() => setEditingEndpoint(ep)} />
                        <Button size="sm" icon={<Trash2 size={12} />} onClick={() => onDeleteEndpoint(ep.id)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "preview" && (
        <Card title="OpenAPI-like preview" subtitle="Lightweight JSON view of this spec.">
          <pre className="bg-panel-2 border border-border rounded-md p-3 text-[12px] overflow-auto" style={{ maxHeight: 480 }}>
            {JSON.stringify(buildOpenApiPreview(spec, endpoints), null, 2)}
          </pre>
        </Card>
      )}

      {editingSpec && (
        <EditSpecModal
          spec={spec}
          artifacts={artifacts}
          onClose={() => setEditingSpec(false)}
          onSaved={(updated) => { setEditingSpec(false); setSpec(updated); }}
        />
      )}

      {creatingEndpoint && (
        <EndpointModal
          apiSpecId={spec.id}
          onClose={() => setCreatingEndpoint(false)}
          onSaved={() => { setCreatingEndpoint(false); load(); }}
        />
      )}
      {editingEndpoint && (
        <EndpointModal
          apiSpecId={spec.id}
          endpoint={editingEndpoint}
          onClose={() => setEditingEndpoint(null)}
          onSaved={() => { setEditingEndpoint(null); load(); }}
        />
      )}
    </div>
  );
}

// ────────────────────────── modals ──────────────────────────

function EditSpecModal({
  spec,
  artifacts,
  onClose,
  onSaved,
}: {
  spec: ApiSpec;
  artifacts: Artifact[];
  onClose: () => void;
  onSaved: (s: ApiSpec) => void;
}) {
  const [title, setTitle] = useState(spec.title);
  const [version, setVersion] = useState(spec.version);
  const [baseUrl, setBaseUrl] = useState(spec.baseUrl);
  const [description, setDescription] = useState(spec.description);
  const [artifactId, setArtifactId] = useState<string>(spec.artifactId ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setBusy(true);
    try {
      const updated = await apiSpecsApi.update(spec.id, {
        title: title.trim(),
        version: version.trim() || "1.0.0",
        baseUrl: baseUrl.trim(),
        description: description.trim(),
        artifactId: artifactId || null,
      });
      toast.success("Spec updated");
      onSaved(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit API spec" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Version">
            <input value={version} onChange={(e) => setVersion(e.target.value)}
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
          </Field>
          <Field label="Base URL">
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
          </Field>
        </div>
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

function EndpointModal({
  apiSpecId,
  endpoint,
  onClose,
  onSaved,
}: {
  apiSpecId: string;
  endpoint?: ApiEndpoint;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [path, setPath] = useState(endpoint?.path ?? "/");
  const [method, setMethod] = useState<HttpMethod>(endpoint?.method ?? "GET");
  const [summary, setSummary] = useState(endpoint?.summary ?? "");
  const [requestSchema, setRequestSchema] = useState(endpoint?.requestSchema ?? "");
  const [responseSchema, setResponseSchema] = useState(endpoint?.responseSchema ?? "");
  const [requiresAuth, setRequiresAuth] = useState(endpoint?.requiresAuth ?? false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!path.trim()) {
      toast.error("Path is required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        path: path.trim(),
        method,
        summary: summary.trim(),
        requestSchema,
        responseSchema,
        requiresAuth,
      };
      if (endpoint) await apiEndpointsApi.update(endpoint.id, body);
      else await apiEndpointsApi.create(apiSpecId, body);
      toast.success(endpoint ? "Endpoint updated" : "Endpoint created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save endpoint");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={endpoint ? "Edit endpoint" : "Add endpoint"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Field label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value as HttpMethod)}
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Path">
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/auth/login"
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent font-mono" />
          </Field>
        </div>
        <Field label="Summary">
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Issue a JWT for valid credentials"
            className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
        </Field>
        <Field label="Request schema (JSON or free text)">
          <textarea value={requestSchema} onChange={(e) => setRequestSchema(e.target.value)} placeholder='{ "email": "string", "password": "string" }'
            className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[12.5px] outline-none focus:border-accent min-h-[64px] font-mono" />
        </Field>
        <Field label="Response schema (JSON or free text)">
          <textarea value={responseSchema} onChange={(e) => setResponseSchema(e.target.value)} placeholder='{ "token": "string", "user": { ... } }'
            className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[12.5px] outline-none focus:border-accent min-h-[64px] font-mono" />
        </Field>
        <label className="flex items-center gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" checked={requiresAuth} onChange={(e) => setRequiresAuth(e.target.checked)} />
          Requires authentication
        </label>
        <div className="flex justify-end gap-2 mt-1">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={<Save size={13} />} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Modal>
  );
}

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

// ────────────────────────── OpenAPI-like preview ──────────────────────────

function buildOpenApiPreview(spec: ApiSpec, endpoints: ApiEndpoint[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of endpoints) {
    if (!paths[e.path]) paths[e.path] = {};
    paths[e.path][e.method.toLowerCase()] = {
      summary: e.summary || undefined,
      security: e.requiresAuth ? [{ bearerAuth: [] }] : undefined,
      requestBody: e.requestSchema || undefined,
      responses: { "200": { description: "OK", schema: e.responseSchema || undefined } },
    };
  }
  return {
    openapi: "3.0.0",
    info: { title: spec.title, version: spec.version, description: spec.description },
    servers: spec.baseUrl ? [{ url: spec.baseUrl }] : undefined,
    paths,
  };
}
