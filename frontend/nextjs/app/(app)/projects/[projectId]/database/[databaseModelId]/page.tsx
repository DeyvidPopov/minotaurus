// app/(app)/projects/[projectId]/database/[databaseModelId]/page.tsx — DB model detail
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit, Trash2, Plus, X, Key, Link2, Save, Database, ArrowRight } from "lucide-react";
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
  DATABASE_TYPES,
  databaseEntitiesApi,
  databaseFieldsApi,
  databaseModelsApi,
  type DatabaseEntity,
  type DatabaseField,
  type DatabaseModel,
  type DatabaseType,
} from "@/lib/api/database-models";
import { ApiError } from "@/lib/api/client";
import type { Artifact } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export default function DatabaseModelDetailPage({
  params,
}: {
  params: { projectId: string; databaseModelId: string };
}) {
  const { projectId, databaseModelId } = params;
  const router = useRouter();

  const [model, setModel] = useState<DatabaseModel | null>(null);
  const [entities, setEntities] = useState<DatabaseEntity[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [tab, setTab] = useState<"entities" | "erd" | "mermaid">("entities");

  const [editingModel, setEditingModel] = useState(false);
  const [creatingEntity, setCreatingEntity] = useState(false);
  const [editingEntity, setEditingEntity] = useState<DatabaseEntity | null>(null);
  const [fieldModal, setFieldModal] = useState<{ entity: DatabaseEntity; field?: DatabaseField } | null>(null);

  const load = async () => {
    try {
      const [m, es, arts] = await Promise.all([
        databaseModelsApi.get(databaseModelId),
        databaseEntitiesApi.list(databaseModelId),
        artifactsApi.list(projectId),
      ]);
      setModel(m);
      setEntities(es);
      setArtifacts(arts);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load database model");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseModelId]);

  const linkedArtifact = useMemo(
    () => (model?.artifactId ? artifacts.find((a) => a.id === model.artifactId) ?? null : null),
    [model, artifacts],
  );

  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  if (!model) {
    return <div className="px-8 py-6 text-fg-muted">Loading…</div>;
  }

  const onDeleteModel = async () => {
    if (!confirm(`Delete "${model.title}"? Its ${entities.length} entity/entities and all their fields will be removed.`)) return;
    try {
      await databaseModelsApi.remove(model.id);
      toast.success("Database model deleted");
      router.push(`/projects/${projectId}/database`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  };

  const onDeleteEntity = async (id: string) => {
    if (!confirm("Delete this entity and all its fields?")) return;
    try {
      await databaseEntitiesApi.remove(id);
      toast.success("Entity deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete entity");
    }
  };

  const onDeleteField = async (id: string) => {
    try {
      await databaseFieldsApi.remove(id);
      toast.success("Field deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete field");
    }
  };

  return (
    <div className="px-8 py-6 max-w-[1100px] mx-auto">
      <PageHeader
        eyebrow={
          <>
            <Badge mono>DATABASE</Badge>
            <Badge mono>{model.databaseType}</Badge>
          </>
        }
        title={model.title}
        subtitle={model.description || "No description"}
        actions={
          <>
            <Button icon={<Edit size={13} />} onClick={() => setEditingModel(true)}>Edit</Button>
            <Button icon={<Trash2 size={13} />} onClick={onDeleteModel}>Delete</Button>
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
          <span>Updated {timeAgo(model.updatedAt)}</span>
          <span className="font-mono text-[11.5px]">{model.id}</span>
        </div>
      </PageHeader>

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as "entities" | "erd" | "mermaid")}
        tabs={[
          { id: "entities", label: "Entities", count: entities.length },
          { id: "erd", label: "ERD view" },
          { id: "mermaid", label: "Mermaid source" },
        ]}
      />

      {tab === "entities" && (
        <EntitiesEditor
          entities={entities}
          entityById={entityById}
          onAddEntity={() => setCreatingEntity(true)}
          onEditEntity={setEditingEntity}
          onDeleteEntity={onDeleteEntity}
          onAddField={(entity) => setFieldModal({ entity })}
          onEditField={(entity, field) => setFieldModal({ entity, field })}
          onDeleteField={onDeleteField}
        />
      )}

      {tab === "erd" && <ErdView entities={entities} entityById={entityById} />}

      {tab === "mermaid" && <MermaidView model={model} entities={entities} entityById={entityById} />}

      {editingModel && (
        <EditModelModal
          model={model}
          artifacts={artifacts}
          onClose={() => setEditingModel(false)}
          onSaved={(updated) => { setEditingModel(false); setModel(updated); }}
        />
      )}

      {creatingEntity && (
        <EntityModal
          databaseModelId={model.id}
          onClose={() => setCreatingEntity(false)}
          onSaved={() => { setCreatingEntity(false); load(); }}
        />
      )}
      {editingEntity && (
        <EntityModal
          databaseModelId={model.id}
          entity={editingEntity}
          onClose={() => setEditingEntity(null)}
          onSaved={() => { setEditingEntity(null); load(); }}
        />
      )}

      {fieldModal && (
        <FieldModal
          entity={fieldModal.entity}
          field={fieldModal.field}
          siblingEntities={entities.filter((e) => true)}
          onClose={() => setFieldModal(null)}
          onSaved={() => { setFieldModal(null); load(); }}
        />
      )}
    </div>
  );
}

// ───────────────────────── Entities editor ─────────────────────────

function EntitiesEditor({
  entities,
  entityById,
  onAddEntity,
  onEditEntity,
  onDeleteEntity,
  onAddField,
  onEditField,
  onDeleteField,
}: {
  entities: DatabaseEntity[];
  entityById: Map<string, DatabaseEntity>;
  onAddEntity: () => void;
  onEditEntity: (e: DatabaseEntity) => void;
  onDeleteEntity: (id: string) => void;
  onAddField: (e: DatabaseEntity) => void;
  onEditField: (e: DatabaseEntity, f: DatabaseField) => void;
  onDeleteField: (id: string) => void;
}) {
  if (entities.length === 0) {
    return (
      <Empty
        icon={<Database size={28} />}
        title="No entities yet"
        message="Add at least one entity (e.g. users, orders) to start describing the data shape."
        action={
          <Button variant="primary" icon={<Plus size={14} />} onClick={onAddEntity}>
            Add entity
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="primary" icon={<Plus size={14} />} onClick={onAddEntity}>
          Add entity
        </Button>
      </div>
      {entities.map((entity) => (
        <Card
          key={entity.id}
          title={
            <span className="font-mono font-semibold text-[14px]">{entity.name}</span>
          }
          subtitle={entity.description || "No description"}
          action={
            <div className="flex items-center gap-1">
              <Button size="sm" icon={<Plus size={12} />} onClick={() => onAddField(entity)}>Add field</Button>
              <Button size="sm" icon={<Edit size={12} />} onClick={() => onEditEntity(entity)} />
              <Button size="sm" icon={<Trash2 size={12} />} onClick={() => onDeleteEntity(entity.id)} />
            </div>
          }
          padded={false}
        >
          {entity.fields.length === 0 ? (
            <div className="p-6 text-center text-fg-muted text-[13px]">No fields yet — click <em>Add field</em>.</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-panel">
                <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
                  <th className="text-left px-3.5 py-2 border-b border-border">Name</th>
                  <th className="text-left px-3.5 py-2 border-b border-border">Type</th>
                  <th className="text-left px-3.5 py-2 border-b border-border">Flags</th>
                  <th className="text-left px-3.5 py-2 border-b border-border">References</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entity.fields.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="px-3.5 py-2 font-mono text-[12.5px]">{f.name}</td>
                    <td className="px-3.5 py-2 font-mono text-[12.5px] text-fg-muted">{f.type}</td>
                    <td className="px-3.5 py-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {f.isPrimaryKey && (
                          <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-mono font-bold"
                            style={{ color: "var(--c-warning)", border: "1px solid color-mix(in srgb, var(--c-warning) 30%, transparent)", background: "color-mix(in srgb, var(--c-warning) 10%, transparent)" }}>
                            <Key size={10} /> PK
                          </span>
                        )}
                        {(f.isForeignKey || f.referencesEntityId) && (
                          <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-mono font-bold"
                            style={{ color: "var(--c-info)", border: "1px solid color-mix(in srgb, var(--c-info) 30%, transparent)", background: "color-mix(in srgb, var(--c-info) 10%, transparent)" }}>
                            <Link2 size={10} /> FK
                          </span>
                        )}
                        {f.required && <Badge mono>required</Badge>}
                      </div>
                    </td>
                    <td className="px-3.5 py-2 text-[12.5px]">
                      {f.referencesEntityId ? (
                        <span className="font-mono">{entityById.get(f.referencesEntityId)?.name ?? <em className="text-danger">missing entity</em>}</span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" icon={<Edit size={12} />} onClick={() => onEditField(entity, f)} />
                        <Button size="sm" icon={<Trash2 size={12} />} onClick={() => onDeleteField(f.id)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ))}
    </div>
  );
}

// ───────────────────────── ERD view (entity boxes + FK arrows summary) ─────────────────────────

function ErdView({
  entities,
  entityById,
}: {
  entities: DatabaseEntity[];
  entityById: Map<string, DatabaseEntity>;
}) {
  if (entities.length === 0) {
    return (
      <Card>
        <Empty title="Nothing to show" message="Add entities and fields to populate the ERD view." />
      </Card>
    );
  }
  const allFks = entities.flatMap((e) =>
    e.fields
      .filter((f) => f.referencesEntityId)
      .map((f) => ({
        sourceEntity: e.name,
        sourceField: f.name,
        targetEntity: f.referencesEntityId ? entityById.get(f.referencesEntityId)?.name ?? null : null,
        targetMissing: f.referencesEntityId ? !entityById.has(f.referencesEntityId) : false,
      })),
  );

  return (
    <div className="flex flex-col gap-4">
      <Card title="Entities" subtitle="One box per entity. PK and FK fields are highlighted.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {entities.map((e) => (
            <div key={e.id} className="bg-panel-2 border border-border rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-panel font-mono font-semibold text-[13px] border-b border-border flex items-center gap-2">
                <Database size={12} className="text-accent" /> {e.name}
              </div>
              {e.fields.length === 0 ? (
                <div className="px-3 py-2 text-fg-subtle text-[12px] italic">No fields</div>
              ) : (
                <div className="text-[12.5px] font-mono">
                  {e.fields.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-1.5 border-t border-border first:border-t-0">
                      {f.isPrimaryKey && <Key size={10} className="text-warning shrink-0" />}
                      {(f.isForeignKey || f.referencesEntityId) && <Link2 size={10} className="text-info shrink-0" />}
                      <span className="font-semibold">{f.name}</span>
                      <span className="text-fg-muted">: {f.type}</span>
                      {f.referencesEntityId && (
                        <span className="ml-auto text-fg-subtle text-[11px]">→ {entityById.get(f.referencesEntityId)?.name ?? "?"}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Foreign-key relationships" subtitle={`${allFks.length} relationship${allFks.length === 1 ? "" : "s"} across this model.`}>
        {allFks.length === 0 ? (
          <div className="text-fg-muted text-[13px]">No foreign keys yet.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {allFks.map((fk, i) => (
              <div key={i} className="flex items-center gap-2 text-[13px] font-mono">
                <span>{fk.sourceEntity}.{fk.sourceField}</span>
                <ArrowRight size={13} className="text-fg-subtle" />
                <span className={fk.targetMissing ? "text-danger" : ""}>{fk.targetEntity ?? <em>missing</em>}</span>
                {fk.targetMissing && <span className="text-danger text-[11px] font-sans ml-2">target entity is missing</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────── Mermaid view (source only — paste-ready) ─────────────────────────

function MermaidView({
  model,
  entities,
  entityById,
}: {
  model: DatabaseModel;
  entities: DatabaseEntity[];
  entityById: Map<string, DatabaseEntity>;
}) {
  const source = useMemo(() => {
    const lines: string[] = ["erDiagram"];
    if (entities.length === 0) {
      lines.push(`  %% ${model.title} — no entities yet`);
      return lines.join("\n");
    }
    for (const e of entities) {
      lines.push(`  ${escapeName(e.name)} {`);
      for (const f of e.fields) {
        const flags: string[] = [];
        if (f.isPrimaryKey) flags.push("PK");
        if (f.isForeignKey || f.referencesEntityId) flags.push("FK");
        lines.push(`    ${escapeName(f.type)} ${escapeName(f.name)}${flags.length ? " " + flags.join(",") : ""}`);
      }
      if (e.fields.length === 0) lines.push("    string placeholder");
      lines.push(`  }`);
    }
    for (const e of entities) {
      for (const f of e.fields) {
        if (!f.referencesEntityId) continue;
        const target = entityById.get(f.referencesEntityId);
        if (!target) continue;
        lines.push(`  ${escapeName(e.name)} }o--|| ${escapeName(target.name)} : "${f.name}"`);
      }
    }
    return lines.join("\n");
  }, [model.title, entities, entityById]);

  return (
    <Card
      title="Mermaid ERD source"
      subtitle="Paste into a Mermaid-aware viewer (GitHub README, Notion, mermaid.live) to render the diagram."
      action={
        <Button
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(source).then(
              () => toast.success("Mermaid source copied"),
              () => toast.error("Clipboard blocked"),
            );
          }}
        >
          Copy
        </Button>
      }
    >
      <pre className="bg-panel-2 border border-border rounded-md p-3 text-[12.5px] overflow-auto" style={{ maxHeight: 420 }}>
        {source}
      </pre>
    </Card>
  );
}

function escapeName(s: string) {
  // Mermaid identifiers don't allow spaces; replace anything non-alphanumeric with _.
  return s.replace(/[^A-Za-z0-9_]/g, "_");
}

// ───────────────────────── modals ─────────────────────────

function EditModelModal({
  model,
  artifacts,
  onClose,
  onSaved,
}: {
  model: DatabaseModel;
  artifacts: Artifact[];
  onClose: () => void;
  onSaved: (m: DatabaseModel) => void;
}) {
  const [title, setTitle] = useState(model.title);
  const [databaseType, setDatabaseType] = useState<DatabaseType>(model.databaseType);
  const [description, setDescription] = useState(model.description);
  const [artifactId, setArtifactId] = useState(model.artifactId ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setBusy(true);
    try {
      const updated = await databaseModelsApi.update(model.id, {
        title: title.trim(),
        databaseType,
        description: description.trim(),
        artifactId: artifactId || null,
      });
      toast.success("Model updated");
      onSaved(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit database model" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
        </Field>
        <Field label="Database type">
          <select value={databaseType} onChange={(e) => setDatabaseType(e.target.value as DatabaseType)}
            className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
            {DATABASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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

function EntityModal({
  databaseModelId,
  entity,
  onClose,
  onSaved,
}: {
  databaseModelId: string;
  entity?: DatabaseEntity;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(entity?.name ?? "");
  const [description, setDescription] = useState(entity?.description ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    try {
      if (entity) {
        await databaseEntitiesApi.update(entity.id, { name: name.trim(), description });
      } else {
        await databaseEntitiesApi.create(databaseModelId, { name: name.trim(), description });
      }
      toast.success(entity ? "Entity updated" : "Entity created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save entity");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={entity ? "Edit entity" : "Add entity"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="users"
            className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent font-mono" />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent min-h-[64px]" />
        </Field>
        <div className="flex justify-end gap-2 mt-1">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={<Save size={13} />} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function FieldModal({
  entity,
  field,
  siblingEntities,
  onClose,
  onSaved,
}: {
  entity: DatabaseEntity;
  field?: DatabaseField;
  siblingEntities: DatabaseEntity[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(field?.name ?? "");
  const [type, setType] = useState(field?.type ?? "text");
  const [required, setRequired] = useState(field?.required ?? false);
  const [isPrimaryKey, setIsPrimaryKey] = useState(field?.isPrimaryKey ?? false);
  const [isForeignKey, setIsForeignKey] = useState(field?.isForeignKey ?? false);
  const [referencesEntityId, setReferencesEntityId] = useState<string>(field?.referencesEntityId ?? "");
  const [description, setDescription] = useState(field?.description ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        type: type.trim() || "text",
        required,
        isPrimaryKey,
        isForeignKey: isForeignKey || !!referencesEntityId,
        referencesEntityId: referencesEntityId || null,
        description,
      };
      if (field) {
        await databaseFieldsApi.update(field.id, body);
      } else {
        await databaseFieldsApi.create(entity.id, body);
      }
      toast.success(field ? "Field updated" : "Field created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save field");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={field ? `Edit field — ${entity.name}` : `Add field — ${entity.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="id"
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent font-mono" />
          </Field>
          <Field label="Type">
            <input value={type} onChange={(e) => setType(e.target.value)} placeholder="uuid / text / int8"
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent font-mono" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={isPrimaryKey} onChange={(e) => setIsPrimaryKey(e.target.checked)} />
            Primary key
          </label>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Required
          </label>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input
              type="checkbox"
              checked={isForeignKey || !!referencesEntityId}
              onChange={(e) => {
                const next = e.target.checked;
                setIsForeignKey(next);
                if (!next) setReferencesEntityId("");
              }}
            />
            Foreign key
          </label>
        </div>
        {(isForeignKey || referencesEntityId) && (
          <Field label="References entity">
            <select value={referencesEntityId} onChange={(e) => setReferencesEntityId(e.target.value)}
              className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
              <option value="">— Pick an entity —</option>
              {siblingEntities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
        </Field>
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
