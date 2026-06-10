// app/(app)/projects/[projectId]/database/page.tsx — list database models
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Database } from "lucide-react";
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
  DATABASE_TYPES,
  databaseModelsApi,
  type DatabaseModel,
  type DatabaseType,
} from "@/lib/api/database-models";
import { ApiError } from "@/lib/api/client";
import type { Artifact } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export default function DatabaseModelsListPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const router = useRouter();

  const [models, setModels] = useState<DatabaseModel[] | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | DatabaseType>("ALL");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const [list, arts] = await Promise.all([
        databaseModelsApi.list(projectId),
        artifactsApi.list(projectId),
      ]);
      setModels(list);
      setArtifacts(arts);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load database models");
      setModels([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const term = q.trim().toLowerCase();
  const filtered = (models ?? []).filter(
    (m) =>
      (typeFilter === "ALL" || m.databaseType === typeFilter) &&
      (!term ||
        m.title.toLowerCase().includes(term) ||
        m.description.toLowerCase().includes(term)),
  );

  const artifactsById = new Map(artifacts.map((a) => [a.id, a]));

  return (
    <div className="px-4 py-6 md:px-8 max-w-[1200px] mx-auto">
      <PageHeader
        title="Database models"
        subtitle={
          models === null
            ? "Loading…"
            : `${models.length} model${models.length === 1 ? "" : "s"} · ${models.reduce((s, m) => s + m.entityCount, 0)} entities`
        }
        actions={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Search by title…" className="w-full sm:w-[220px]" />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "ALL" | DatabaseType)}
              className="h-8 px-2.5 pr-7 bg-panel border border-border rounded-sm text-[13.5px]">
              <option value="ALL">All databases</option>
              {DATABASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Button variant="primary" onClick={() => setCreating(true)}>
              New database model
            </Button>
          </>
        }
      />

      {models !== null && models.length === 0 ? (
        <Empty
          icon={<Database size={28} />}
          title="No database models yet"
          message="Describe the data stores your services rely on. Each model owns entities; each entity owns fields with optional primary and foreign keys."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              New database model
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <Empty title="No models match" message="Try a different filter." />
      ) : (
        <>
          {/* Desktop: table (md and up). */}
          <Card padded={false} className="hidden md:block">
            <table className="w-full text-[13px]">
              <thead className="bg-panel">
                <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Title</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Database</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Linked artifact</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Entities</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const art = m.artifactId ? artifactsById.get(m.artifactId) : null;
                  return (
                    <tr key={m.id} className="hover:bg-panel-hover cursor-pointer" onClick={() => router.push(`/projects/${projectId}/database/${m.id}`)}>
                      <td className="px-3.5 py-3 border-b border-border">
                        <div className="font-medium">{m.title}</div>
                        <div className="text-[12px] text-fg-muted truncate max-w-[420px]">
                          {m.description || <em className="text-fg-subtle">No description</em>}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 border-b border-border">
                        <Badge mono>{m.databaseType}</Badge>
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
                        {m.entityCount > 0 ? <Badge tone="success">{m.entityCount}</Badge> : <span className="text-fg-subtle">0</span>}
                      </td>
                      <td className="px-3.5 py-3 border-b border-border text-fg-muted text-[12.5px]">{timeAgo(m.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Mobile: stacked cards (below md). No horizontal scroll; every column survives. */}
          <div className="md:hidden space-y-2.5">
            {filtered.map((m) => {
              const art = m.artifactId ? artifactsById.get(m.artifactId) : null;
              return (
                <Link
                  key={m.id}
                  href={`/projects/${projectId}/database/${m.id}`}
                  className="block rounded-lg border border-border bg-panel p-3 hover:bg-panel-hover transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium leading-snug min-w-0">{m.title}</div>
                    <Badge mono>{m.databaseType}</Badge>
                  </div>
                  <p className="mt-1 text-[12px] text-fg-muted line-clamp-2">
                    {m.description || <em className="text-fg-subtle">No description</em>}
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
                    {m.entityCount > 0 ? (
                      <Badge tone="success">{m.entityCount} {m.entityCount === 1 ? "entity" : "entities"}</Badge>
                    ) : (
                      <span>0 entities</span>
                    )}
                    <span>{timeAgo(m.updatedAt)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {creating && (
        <CreateModelModal
          projectId={projectId}
          artifacts={artifacts}
          onClose={() => setCreating(false)}
          onCreated={(m) => {
            setCreating(false);
            router.push(`/projects/${projectId}/database/${m.id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateModelModal({
  projectId,
  artifacts,
  onClose,
  onCreated,
}: {
  projectId: string;
  artifacts: Artifact[];
  onClose: () => void;
  onCreated: (m: DatabaseModel) => void;
}) {
  const [title, setTitle] = useState("");
  const [databaseType, setDatabaseType] = useState<DatabaseType>("PostgreSQL");
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
      const m = await databaseModelsApi.create(projectId, {
        title: title.trim(),
        databaseType,
        description: description.trim(),
        artifactId: artifactId || null,
      });
      toast.success(`Database model "${m.title}" created`);
      onCreated(m);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create database model");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="w-[520px] max-w-[92vw] bg-panel border border-border rounded-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center">
          <div className="font-semibold">New database model</div>
          <button className="ml-auto text-fg-muted hover:text-fg" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. User Management Database"
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
          </Field>
          <Field label="Database type">
            <select value={databaseType} onChange={(e) => setDatabaseType(e.target.value as DatabaseType)}
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
              {DATABASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
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
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this database hold?"
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] text-fg-muted font-medium">{label}</label>
      {children}
    </div>
  );
}
