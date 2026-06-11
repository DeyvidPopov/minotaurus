// app/(app)/projects/[projectId]/api/page.tsx — API specs list
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { Empty } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { TypeChip } from "@/components/ui/type-chip";
import { Field } from "@/components/ui/field";
import { artifactsApi } from "@/lib/api/artifacts";
import { apiSpecsApi, type ApiSpec } from "@/lib/api/api-specs";
import { errorMessage } from "@/lib/api/error-message";
import type { Artifact } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export default function ApiSpecsListPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const router = useRouter();
  const [specs, setSpecs] = useState<ApiSpec[] | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const [specsRes, artsRes] = await Promise.all([
        apiSpecsApi.list(projectId),
        artifactsApi.list(projectId),
      ]);
      setSpecs(specsRes);
      setArtifacts(artsRes);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to load API specs"));
      setSpecs([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const term = q.trim().toLowerCase();
  const filtered = (specs ?? []).filter(
    (s) =>
      !term ||
      s.title.toLowerCase().includes(term) ||
      s.description.toLowerCase().includes(term) ||
      s.baseUrl.toLowerCase().includes(term),
  );

  const artifactsById = new Map(artifacts.map((a) => [a.id, a]));

  return (
    <div className="px-4 py-6 md:px-8 max-w-[1200px] mx-auto">
      <PageHeader
        title="API specifications"
        subtitle={
          specs === null
            ? "Loading…"
            : `${specs.length} spec${specs.length === 1 ? "" : "s"} · ${specs.reduce((s, x) => s + x.endpointCount, 0)} endpoints`
        }
        actions={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Search by title…" className="w-full sm:w-[220px]" />
            <Button variant="primary" onClick={() => setCreating(true)}>
              New API spec
            </Button>
          </>
        }
      />

      {specs !== null && specs.length === 0 ? (
        <Empty
          title="No API specs yet"
          message="Document the public HTTP surface of your services. Each spec can link to an artifact (a service or an API_SPEC artifact) and own a list of endpoints."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              New API spec
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <Empty title="No specs match" message="Try a different filter." />
      ) : (
        <>
          {/* Desktop: table (md and up). */}
          <Card padded={false} className="hidden md:block">
            <table className="w-full text-[13px]">
              <thead className="bg-panel">
                <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Title</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Version</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Linked artifact</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Endpoints</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const art = s.artifactId ? artifactsById.get(s.artifactId) : null;
                  return (
                    <tr key={s.id} className="hover:bg-panel-hover cursor-pointer" onClick={() => router.push(`/projects/${projectId}/api/${s.id}`)}>
                      <td className="px-3.5 py-3 border-b border-border">
                        <div className="font-medium">{s.title}</div>
                        <div className="text-[12px] text-fg-muted truncate max-w-[420px]">
                          {s.description || s.baseUrl || <em className="text-fg-subtle">No description</em>}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 border-b border-border">
                        <Badge mono>v{s.version}</Badge>
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
                      <td className="px-3.5 py-3 border-b border-border tabular-nums">
                        {s.endpointCount > 0 ? <Badge tone="success">{s.endpointCount}</Badge> : <span className="text-fg-subtle">0</span>}
                      </td>
                      <td className="px-3.5 py-3 border-b border-border text-fg-muted text-[12.5px]">{timeAgo(s.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Mobile: stacked cards (below md). No horizontal scroll; every column survives. */}
          <div className="md:hidden space-y-2.5">
            {filtered.map((s) => {
              const art = s.artifactId ? artifactsById.get(s.artifactId) : null;
              return (
                <Link
                  key={s.id}
                  href={`/projects/${projectId}/api/${s.id}`}
                  className="block rounded-lg border border-border bg-panel p-3 hover:bg-panel-hover transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium leading-snug min-w-0">{s.title}</div>
                    <Badge mono>v{s.version}</Badge>
                  </div>
                  <p className="mt-1 text-[12px] text-fg-muted line-clamp-2">
                    {s.description || s.baseUrl || <em className="text-fg-subtle">No description</em>}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {art ? (
                      <>
                        <TypeChip type={art.type} />
                        <span className="text-[12.5px] text-fg-muted">{art.title}</span>
                      </>
                    ) : (
                      <span className="text-fg-subtle text-[12px]">No linked artifact</span>
                    )}
                  </div>
                  <div className="mt-2.5 flex items-center gap-x-3 gap-y-1.5 flex-wrap text-[11.5px] text-fg-muted">
                    {s.endpointCount > 0 ? (
                      <Badge tone="success">{s.endpointCount} {s.endpointCount === 1 ? "endpoint" : "endpoints"}</Badge>
                    ) : (
                      <span>0 endpoints</span>
                    )}
                    <span>{timeAgo(s.updatedAt)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {creating && (
        <CreateSpecModal
          projectId={projectId}
          artifacts={artifacts}
          onClose={() => setCreating(false)}
          onCreated={(spec) => {
            setCreating(false);
            router.push(`/projects/${projectId}/api/${spec.id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateSpecModal({
  projectId,
  artifacts,
  onClose,
  onCreated,
}: {
  projectId: string;
  artifacts: Artifact[];
  onClose: () => void;
  onCreated: (spec: ApiSpec) => void;
}) {
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [baseUrl, setBaseUrl] = useState("");
  const [description, setDescription] = useState("");
  const [artifactId, setArtifactId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setBusy(true);
    try {
      const spec = await apiSpecsApi.create(projectId, {
        title: title.trim(),
        version: version.trim() || "1.0.0",
        baseUrl: baseUrl.trim(),
        description: description.trim(),
        artifactId: artifactId || null,
      });
      toast.success(`API spec "${spec.title}" created`);
      onCreated(spec);
    } catch (err) {
      toast.error(errorMessage(err, "Could not create API spec"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="w-[520px] max-w-[92vw] bg-panel border border-border rounded-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center">
          <div className="font-semibold">New API spec</div>
          <button className="ml-auto text-fg-muted hover:text-fg" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Authentication API"
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Version">
              <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0"
                className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
            </Field>
            <Field label="Base URL">
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="/api"
                className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
            </Field>
          </div>
          <Field label="Linked artifact (optional)">
            <select value={artifactId} onChange={(e) => setArtifactId(e.target.value)}
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
              <option value="">— None —</option>
              {artifacts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.type})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this spec describe?"
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent min-h-[80px]" />
          </Field>
          <div className="flex justify-end gap-2 mt-1">
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

