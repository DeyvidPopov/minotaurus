// app/(app)/projects/[projectId]/database/[databaseModelId]/page.tsx — DB model detail
"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Edit, Trash2, X, Key, Link2, Save, Database, ArrowRight, GitMerge, Copy, RefreshCw, ExternalLink, AlertTriangle, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, FILL_ACTIONS_MOBILE } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TypeChip } from "@/components/ui/type-chip";
import { Empty } from "@/components/ui/empty";
import { Tabs } from "@/components/ui/tabs";
import { Segmented } from "@/components/ui/segmented";
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
import { diagramsApi, type Diagram } from "@/lib/api/diagrams";
import { ApiError } from "@/lib/api/client";
import type { Artifact } from "@/lib/types";
import { timeAgo, cn } from "@/lib/utils";
import { MermaidPreview } from "@/components/mermaid-preview";

// ───────────────────────── Mermaid generator ─────────────────────────

function escapeName(s: string) {
  // Mermaid identifiers don't allow spaces; replace anything non-alphanumeric with _.
  // Empty / pure-symbol names fall back to a safe placeholder so the entity still
  // gets a visible label instead of rendering as an unnamed box.
  const cleaned = (s || "").replace(/[^A-Za-z0-9_]/g, "_");
  return cleaned || "unnamed";
}

// Strip characters that would terminate or confuse a Mermaid string literal
// when used inside `: "..."` relationship labels.
function safeLabel(s: string): string {
  return (s || "").replace(/["\n\r]/g, " ").trim() || "ref";
}

function generateMermaidErd(
  modelTitle: string,
  entities: DatabaseEntity[],
  entityById: Map<string, DatabaseEntity>,
): string {
  const lines: string[] = ["erDiagram"];
  if (entities.length === 0) {
    lines.push(`  %% ${modelTitle} — no entities yet`);
    // Placeholder entity so Mermaid still renders something.
    lines.push(`  EMPTY_MODEL {`);
    lines.push(`    string _empty "No entities defined"`);
    lines.push(`  }`);
    return lines.join("\n");
  }
  for (const e of entities) {
    lines.push(`  ${escapeName(e.name)} {`);
    if (e.fields.length === 0) {
      // Required placeholder — Mermaid silently elides entities that have an
      // empty body in some versions.
      lines.push(`    string _empty "No fields defined"`);
    } else {
      for (const f of e.fields) {
        const flags: string[] = [];
        if (f.isPrimaryKey) flags.push("PK");
        if (f.isForeignKey || f.referencesEntityId) flags.push("FK");
        // Mermaid renders fields as two tokens — by convention type-name, but the
        // parser doesn't validate that, so we put the human-friendly field name
        // first and the type second.
        lines.push(
          `    ${escapeName(f.name)} ${escapeName(f.type)}${flags.length ? " " + flags.join(",") : ""}`,
        );
      }
    }
    lines.push(`  }`);
  }
  // Resolve a precise FK target column (referencesFieldId) → its name for the label.
  const fieldNameById = new Map<string, string>();
  for (const e of entities) for (const f of e.fields) fieldNameById.set(f.id, f.name);
  for (const e of entities) {
    for (const f of e.fields) {
      if (!f.referencesEntityId) continue;
      const target = entityById.get(f.referencesEntityId);
      if (!target) continue;
      // Show the precise target column when pinned (referencesFieldId), else just the
      // FK column name. Always non-empty so Mermaid renders text on the edge.
      const targetCol = f.referencesFieldId ? fieldNameById.get(f.referencesFieldId) : undefined;
      const label = targetCol ? `${f.name} → ${targetCol}` : f.name;
      lines.push(
        `  ${escapeName(e.name)} }o--|| ${escapeName(target.name)} : "${safeLabel(label)}"`,
      );
    }
  }
  return lines.join("\n");
}

// Separator between the canonical ERD title ("<model> ERD") and a variant label
// ("<model> ERD — Denormalized"). A space–em-dash–space is unlikely to appear in
// a model title, so it cleanly distinguishes a variant from the canonical without
// a schema-level Diagram→Model link. Used by BOTH the matcher and the creator, so
// they can never drift — change it in one place.
const ERD_VARIANT_SEP = " — ";

// Set-based, order-independent line diff between two ERD Mermaid sources, ignoring
// pure-structural lines (braces / the `erDiagram` header / comments). Used to show
// "what changed" when a frozen diagram has drifted from the model's current shape.
// Pure — no IO/clock — so the same inputs always yield the same diff.
function diffErdLines(oldSrc: string, newSrc: string): { added: string[]; removed: string[] } {
  const meaningful = (src: string) =>
    src
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && l !== "{" && l !== "}" && l !== "erDiagram" && !l.startsWith("%%"));
  const oldSet = new Set(meaningful(oldSrc));
  const newSet = new Set(meaningful(newSrc));
  return {
    added: [...newSet].filter((l) => !oldSet.has(l)),
    removed: [...oldSet].filter((l) => !newSet.has(l)),
  };
}

export default function DatabaseModelDetailPage({
  params,
}: {
  params: { projectId: string; databaseModelId: string };
}) {
  const { projectId, databaseModelId } = params;
  const router = useRouter();
  const confirm = useConfirm();

  const [model, setModel] = useState<DatabaseModel | null>(null);
  const [entities, setEntities] = useState<DatabaseEntity[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [tab, setTab] = useState<"entities" | "erd" | "mermaid">("entities");

  const [editingModel, setEditingModel] = useState(false);
  const [creatingEntity, setCreatingEntity] = useState(false);
  const [editingEntity, setEditingEntity] = useState<DatabaseEntity | null>(null);
  const [fieldModal, setFieldModal] = useState<{ entity: DatabaseEntity; field?: DatabaseField } | null>(null);
  const [savingVariant, setSavingVariant] = useState(false);

  const load = async () => {
    try {
      const [m, es, arts, dgs] = await Promise.all([
        databaseModelsApi.get(databaseModelId),
        databaseEntitiesApi.list(databaseModelId),
        artifactsApi.list(projectId),
        // ERD diagrams in the project — used to detect a previously-generated ERD
        // for THIS model so we can offer a one-click resync instead of a duplicate.
        diagramsApi.list(projectId, { type: "ERD" }),
      ]);
      setModel(m);
      setEntities(es);
      setArtifacts(arts);
      setDiagrams(dgs);
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

  const generatedErd = useMemo(
    () => (model ? generateMermaidErd(model.title, entities, entityById) : ""),
    [model, entities, entityById],
  );

  // The persisted ERD diagram previously generated from this model, if any. No
  // formal Diagram→DatabaseModel link exists, so we match on the generation
  // convention: an ERD diagram titled "<model> ERD" (scoped to the model's
  // linked artifact when it has one). Title-matching is intentionally
  // conservative — if it doesn't match (e.g. the model was renamed) we simply
  // fall back to "Generate", never risk overwriting an unrelated diagram.
  const modelErds = useMemo(() => {
    if (!model) return [] as Diagram[];
    const expected = `${model.title} ERD`;
    const titled = diagrams.filter((d) => d.type === "ERD" && d.title === expected);
    // Prefer ones scoped to the model's linked artifact; fall back to title-only.
    const scoped = model.artifactId ? titled.filter((d) => d.artifactId === model.artifactId) : [];
    const matches = scoped.length ? scoped : titled;
    // Newest first, so the primary (the one we Open/Update) is the latest.
    return [...matches].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [model, diagrams]);
  const modelErd = modelErds[0] ?? null;

  // Stale = a matched diagram whose frozen Mermaid no longer equals what the
  // model would generate now (the backend stores mermaidSource verbatim, so a
  // trimmed string compare is exact — they're equal right after generation).
  const erdStale = useMemo(
    () => !!modelErd && modelErd.mermaidSource.trim() !== generatedErd.trim(),
    [modelErd, generatedErd],
  );

  // Saved variants = detached ERD copies titled "<model> ERD — <label>". These are
  // intentional divergences (the user forked them to explore an alternative design),
  // so they are NOT tracked for staleness — only the canonical "<model> ERD" is.
  // Matched by the same title convention as the canonical (prefix here vs exact above),
  // scoped to the model's linked artifact when it has one.
  const modelVariants = useMemo(() => {
    if (!model) return [] as Diagram[];
    const prefix = `${model.title} ERD${ERD_VARIANT_SEP}`;
    const matches = diagrams.filter((d) => d.type === "ERD" && d.title.startsWith(prefix));
    const scoped = model.artifactId ? matches.filter((d) => d.artifactId === model.artifactId) : [];
    const list = scoped.length ? scoped : matches;
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [model, diagrams]);

  // Default name for the next variant: v2, v3, … (the canonical is conceptually v1).
  // Derived from the highest existing v<N> so it doesn't collide after deletions.
  const nextVariantName = useMemo(() => {
    if (!model) return "v2";
    const prefix = `${model.title} ERD${ERD_VARIANT_SEP}`;
    let max = 1;
    for (const d of modelVariants) {
      const label = d.title.startsWith(prefix) ? d.title.slice(prefix.length).trim() : "";
      const m = /^v(\d+)$/i.exec(label);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `v${max + 1}`;
  }, [model, modelVariants]);

  // Variant labels already in use (trimmed). The Save-as-variant modal blocks a
  // duplicate, because diagram titles are intentionally NOT unique at the DB level
  // — without this guard an identical name silently creates a second copy.
  const existingVariantNames = useMemo(() => {
    if (!model) return [] as string[];
    const prefix = `${model.title} ERD${ERD_VARIANT_SEP}`;
    return modelVariants
      .map((d) => (d.title.startsWith(prefix) ? d.title.slice(prefix.length).trim() : d.title.trim()))
      .filter(Boolean);
  }, [model, modelVariants]);

  if (!model) {
    return <div className="px-8 py-6 text-fg-muted">Loading…</div>;
  }

  const onDeleteModel = async () => {
    if (!(await confirm({
      title: "Delete database model",
      message: `This permanently deletes "${model.title}", its ${entities.length} entity/entities and all their fields.`,
      confirmLabel: "Delete model",
      destructive: true,
      confirmPhrase: model.title,
    }))) return;
    try {
      await databaseModelsApi.remove(model.id);
      toast.success("Database model deleted");
      router.push(`/projects/${projectId}/database`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete");
    }
  };

  const onDeleteEntity = async (id: string) => {
    const ent = entities.find((e) => e.id === id);
    if (!(await confirm({
      title: "Delete entity",
      message: ent ? `This permanently deletes the entity "${ent.name}" and all its fields.` : "This permanently deletes the entity and all its fields.",
      confirmLabel: "Delete entity",
      destructive: true,
      confirmPhrase: ent?.name,
    }))) return;
    try {
      await databaseEntitiesApi.remove(id);
      toast.success("Entity deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete entity");
    }
  };

  const onDeleteField = async (id: string) => {
    const fld = entities.flatMap((e) => e.fields).find((f) => f.id === id);
    if (!(await confirm({
      title: "Delete field",
      message: fld ? `This permanently deletes the field "${fld.name}".` : "This permanently deletes the field.",
      confirmLabel: "Delete field",
      destructive: true,
      confirmPhrase: fld?.name,
    }))) return;
    try {
      await databaseFieldsApi.remove(id);
      toast.success("Field deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete field");
    }
  };

  const onReorderFields = async (entityId: string, fieldIds: string[]) => {
    try {
      await databaseFieldsApi.reorder(entityId, fieldIds);
      await load(); // confirm the persisted order (and refresh ERD/Mermaid staleness)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not reorder fields");
      await load(); // revert the optimistic order on failure
    }
  };

  const generateErdDiagram = async () => {
    try {
      const d = await diagramsApi.create(projectId, {
        title: `${model.title} ERD`,
        type: "ERD",
        artifactId: model.artifactId,
        mermaidSource: generatedErd,
        description: `Auto-generated from database model "${model.title}".`,
      });
      toast.success(`Diagram "${d.title}" created`);
      router.push(`/projects/${projectId}/diagrams/${d.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not generate diagram");
    }
  };

  // Re-sync the previously-generated diagram to the model's current shape.
  // Confirmed because it OVERWRITES the diagram's Mermaid — a manual update is
  // the deliberate, no-silent-clobber alternative to auto-syncing on every edit.
  const updateErdDiagram = async () => {
    if (!modelErd) return;
    if (!(await confirm({
      title: "Update diagram",
      message: `This replaces the Mermaid in "${modelErd.title}" with this model's current entities and fields. Any manual edits to that diagram will be lost.`,
      confirmLabel: "Update diagram",
    }))) return;
    try {
      await diagramsApi.update(modelErd.id, { mermaidSource: generatedErd });
      toast.success("Diagram updated");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update diagram");
    }
  };

  // Freeze the CURRENT generated ERD as a detached, named variant ("<model> ERD —
  // <label>"). It's a normal Diagram (duplicate titles are allowed), seeded from the
  // model but never auto-synced — the user hand-edits it to explore an alternative.
  // Navigates to the new diagram so they can start editing immediately.
  const saveErdVariant = async (label: string) => {
    const name = label.trim();
    if (!name) return;
    try {
      const d = await diagramsApi.create(projectId, {
        title: `${model.title} ERD${ERD_VARIANT_SEP}${name}`,
        type: "ERD",
        artifactId: model.artifactId,
        mermaidSource: generatedErd,
        description: `Variant of the "${model.title}" ERD — a detached copy for exploring an alternative design. Not auto-synced to the model.`,
      });
      toast.success(`Variant "${d.title}" created`);
      router.push(`/projects/${projectId}/diagrams/${d.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create variant");
    }
  };

  return (
    <div className="px-8 py-6 max-w-[1200px] mx-auto">
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
            <Button variant="primary" onClick={() => setCreatingEntity(true)}>Add entity</Button>
            <Button icon={<Edit size={13} />} onClick={() => setEditingModel(true)}>Edit</Button>
            <Button variant="danger" icon={<Trash2 size={13} />} onClick={onDeleteModel}>Delete</Button>
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
          onReorderFields={onReorderFields}
        />
      )}

      {tab === "erd" && (
        <ErdView
          model={model}
          projectId={projectId}
          entities={entities}
          entityById={entityById}
          generatedErd={generatedErd}
          existingDiagram={modelErd}
          duplicateCount={modelErds.length}
          diagramStale={erdStale}
          variants={modelVariants}
          onGenerateDiagram={generateErdDiagram}
          onUpdateDiagram={updateErdDiagram}
          onSaveVariant={() => setSavingVariant(true)}
        />
      )}

      {tab === "mermaid" && (
        <Card
          title="Mermaid ERD source"
          subtitle="Auto-generated from the entities and fields above. Paste into any Mermaid viewer."
          action={
            <Button
              size="sm"
              icon={<Copy size={12} />}
              className="w-full sm:w-auto"
              onClick={() => {
                navigator.clipboard.writeText(generatedErd).then(
                  () => toast.success("Mermaid source copied"),
                  () => toast.error("Clipboard blocked"),
                );
              }}
            >
              Copy
            </Button>
          }
        >
          <pre className="bg-panel-2 border border-border rounded-md p-3 text-[12.5px] overflow-auto font-mono" style={{ maxHeight: 480 }}>
            {generatedErd}
          </pre>
        </Card>
      )}

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
          siblingEntities={entities}
          onClose={() => setFieldModal(null)}
          onSaved={() => { setFieldModal(null); load(); }}
        />
      )}

      {savingVariant && (
        <SaveVariantModal
          modelTitle={model.title}
          defaultName={nextVariantName}
          existingNames={existingVariantNames}
          onClose={() => setSavingVariant(false)}
          onSave={async (label) => { await saveErdVariant(label); }}
        />
      )}
    </div>
  );
}

// ───────────────────────── Entities editor (polished) ─────────────────────────

function PkBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded font-mono font-bold leading-none"
      style={{
        color: "var(--c-warning)",
        border: "1px solid color-mix(in srgb, var(--c-warning) 35%, transparent)",
        background: "color-mix(in srgb, var(--c-warning) 12%, transparent)",
      }}
      title="Primary key"
    >
      <Key size={10} /> PK
    </span>
  );
}

function FkBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded font-mono font-bold leading-none"
      style={{
        color: "var(--c-info)",
        border: "1px solid color-mix(in srgb, var(--c-info) 35%, transparent)",
        background: "color-mix(in srgb, var(--c-info) 12%, transparent)",
      }}
      title="Foreign key"
    >
      <Link2 size={10} /> FK
    </span>
  );
}

interface FieldRowDrag {
  dragging: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLTableRowElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLTableRowElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLTableRowElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLTableRowElement>) => void;
  onPointerLeave: (e: ReactPointerEvent<HTMLTableRowElement>) => void;
}

function FieldRow({
  field,
  entityById,
  onEdit,
  onDelete,
  drag,
}: {
  field: DatabaseField;
  entityById: Map<string, DatabaseEntity>;
  onEdit: () => void;
  onDelete: () => void;
  drag?: FieldRowDrag;
}) {
  const target = field.referencesEntityId ? entityById.get(field.referencesEntityId) : null;
  // Prefer the EXACT pinned column (referencesFieldId); else the FK is entity-level only.
  const preciseColumn =
    field.referencesFieldId && target
      ? target.fields.find((f) => f.id === field.referencesFieldId)?.name ?? null
      : null;
  const hasFk = field.isForeignKey || !!field.referencesEntityId;
  return (
    <tr
      data-field-id={field.id}
      onPointerDown={drag?.onPointerDown}
      onPointerMove={drag?.onPointerMove}
      onPointerUp={drag?.onPointerUp}
      onPointerCancel={drag?.onPointerCancel}
      onPointerLeave={drag?.onPointerLeave}
      title={drag ? "Press and hold, then drag to reorder" : undefined}
      style={drag ? { cursor: drag.dragging ? "grabbing" : "grab", touchAction: drag.dragging ? "none" : undefined } : undefined}
      className={cn(
        "border-b border-border last:border-0 transition-colors select-none",
        drag?.dragging ? "bg-panel-2 ring-1 ring-accent relative z-10" : "hover:bg-panel-hover",
      )}
    >
      <td className="px-3.5 py-2.5 font-mono text-[12.5px] font-semibold">
        <div className="flex items-center gap-2">
          {field.isPrimaryKey && <Key size={11} className="text-warning shrink-0" />}
          {hasFk && <Link2 size={11} className="text-info shrink-0" />}
          {field.name}
        </div>
      </td>
      <td className="px-3.5 py-2.5 font-mono text-[12.5px] text-fg-muted">{field.type}</td>
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {field.isPrimaryKey && <PkBadge />}
          {hasFk && <FkBadge />}
          {field.required && (
            <span className="inline-flex items-center text-[10.5px] px-1.5 py-0.5 rounded font-mono leading-none text-fg-muted border border-border bg-panel-2">
              required
            </span>
          )}
        </div>
      </td>
      <td className="px-3.5 py-2.5 text-[12.5px]">
        {hasFk ? (
          target ? (
            <span className="font-mono inline-flex items-center gap-1">
              <ArrowRight size={11} className="text-fg-subtle" />
              <span className="text-fg-muted">
                {target.name}.
                {preciseColumn ?? <span className="italic opacity-70">(unresolved column)</span>}
              </span>
            </span>
          ) : (
            <span className="text-danger text-[11.5px]">missing target</span>
          )
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className="px-3.5 py-2.5 text-right">
        <div className="flex items-center gap-1 justify-end">
          <Button size="sm" icon={<Edit size={12} />} onClick={onEdit} />
          <Button size="sm" icon={<Trash2 size={12} />} onClick={onDelete} />
        </div>
      </td>
    </tr>
  );
}

const LONG_PRESS_MS = 350;
const DRAG_CANCEL_PX = 10;

/**
 * The field table for ONE entity, with long-press drag-to-reorder. A press starts
 * a timer; if the pointer stays put for LONG_PRESS_MS the row "lifts" and we capture
 * the pointer (so scrolling is only hijacked once a drag genuinely begins — a quick
 * scroll cancels the press). Rows reorder live as the pointer crosses them; the new
 * order is persisted on drop. Local `rows` state mirrors props and re-syncs on every
 * load (incl. a server-failure revert); no load happens mid-drag, so it never fights
 * an in-progress drag.
 */
function FieldTable({
  entity,
  entityById,
  onEditField,
  onDeleteField,
  onReorder,
}: {
  entity: DatabaseEntity;
  entityById: Map<string, DatabaseEntity>;
  onEditField: (f: DatabaseField) => void;
  onDeleteField: (id: string) => void;
  onReorder: (entityId: string, fieldIds: string[]) => void;
}) {
  const [rows, setRows] = useState<DatabaseField[]>(entity.fields);
  const [dragId, setDragId] = useState<string | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const ctl = useRef<{
    id: string;
    pointerId: number;
    startY: number;
    active: boolean;
    timer: number | null;
    rowEl: HTMLTableRowElement;
  } | null>(null);

  useEffect(() => { setRows(entity.fields); }, [entity.fields]);

  const canReorder = rows.length > 1;

  const cleanup = () => {
    const c = ctl.current;
    if (c?.timer) window.clearTimeout(c.timer);
    ctl.current = null;
    setDragId(null);
  };
  useEffect(() => cleanup, []);

  const fieldIdAtY = (clientY: number): string | null => {
    const tb = tbodyRef.current;
    if (!tb) return null;
    for (const el of Array.from(tb.querySelectorAll<HTMLElement>("[data-field-id]"))) {
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) return el.dataset.fieldId ?? null;
    }
    return null;
  };

  const moveDraggedTo = (targetId: string) => {
    const c = ctl.current;
    if (!c) return;
    setRows((prev) => {
      const from = prev.findIndex((f) => f.id === c.id);
      const to = prev.findIndex((f) => f.id === targetId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLTableRowElement>, id: string) => {
    if (!canReorder) return;
    if (e.button !== 0) return; // primary mouse button / touch / pen only
    // Don't start a drag from the row's interactive controls (Edit / Delete).
    if ((e.target as HTMLElement).closest("button, a, input, select")) return;
    if (ctl.current) return;
    const rowEl = e.currentTarget;
    const c = { id, pointerId: e.pointerId, startY: e.clientY, active: false, timer: null as number | null, rowEl };
    ctl.current = c;
    c.timer = window.setTimeout(() => {
      if (ctl.current !== c) return;
      c.active = true;
      c.timer = null;
      // Capture only NOW, so a pre-activation scroll wasn't hijacked.
      try { rowEl.setPointerCapture(c.pointerId); } catch { /* pointer may be gone */ }
      setDragId(c.id);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLTableRowElement>) => {
    const c = ctl.current;
    if (!c || e.pointerId !== c.pointerId) return;
    if (!c.active) {
      // Moving before the hold completes = a scroll, not a drag → abandon.
      if (Math.abs(e.clientY - c.startY) > DRAG_CANCEL_PX) cleanup();
      return;
    }
    e.preventDefault();
    const targetId = fieldIdAtY(e.clientY);
    if (targetId && targetId !== c.id) moveDraggedTo(targetId);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLTableRowElement>) => {
    const c = ctl.current;
    if (!c || e.pointerId !== c.pointerId) return;
    const wasActive = c.active;
    cleanup();
    if (wasActive) {
      const orderedIds = rowsRef.current.map((f) => f.id);
      const original = entity.fields.map((f) => f.id);
      if (orderedIds.join("") !== original.join("")) onReorder(entity.id, orderedIds);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-[13px]">
        <thead className="bg-panel">
          <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
            <th className="text-left px-3.5 py-2 border-b border-border">Name</th>
            <th className="text-left px-3.5 py-2 border-b border-border">Type</th>
            <th className="text-left px-3.5 py-2 border-b border-border">Flags</th>
            <th className="text-left px-3.5 py-2 border-b border-border">References</th>
            <th />
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {rows.map((f) => (
            <FieldRow
              key={f.id}
              field={f}
              entityById={entityById}
              onEdit={() => onEditField(f)}
              onDelete={() => onDeleteField(f.id)}
              drag={
                canReorder
                  ? {
                      dragging: dragId === f.id,
                      onPointerDown: (e) => onPointerDown(e, f.id),
                      onPointerMove,
                      onPointerUp,
                      onPointerCancel: cleanup,
                      onPointerLeave: () => { if (ctl.current && !ctl.current.active) cleanup(); },
                    }
                  : undefined
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntitiesEditor({
  entities,
  entityById,
  onAddEntity,
  onEditEntity,
  onDeleteEntity,
  onAddField,
  onEditField,
  onDeleteField,
  onReorderFields,
}: {
  entities: DatabaseEntity[];
  entityById: Map<string, DatabaseEntity>;
  onAddEntity: () => void;
  onEditEntity: (e: DatabaseEntity) => void;
  onDeleteEntity: (id: string) => void;
  onAddField: (e: DatabaseEntity) => void;
  onEditField: (e: DatabaseEntity, f: DatabaseField) => void;
  onDeleteField: (id: string) => void;
  onReorderFields: (entityId: string, fieldIds: string[]) => void;
}) {
  if (entities.length === 0) {
    return (
      <Empty
        icon={<Database size={28} />}
        title="No entities yet"
        message="Add at least one entity (e.g. users, orders) to start describing the data shape."
        action={
          <Button variant="primary" onClick={onAddEntity}>
            Add entity
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {entities.map((entity) => (
        <Card
          key={entity.id}
          title={<span className="font-mono font-semibold text-[14px]">{entity.name}</span>}
          subtitle={entity.description || "No description"}
          action={
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={() => onAddField(entity)}>Add field</Button>
              <Button size="sm" icon={<Edit size={12} />} onClick={() => onEditEntity(entity)} />
              <Button size="sm" icon={<Trash2 size={12} />} onClick={() => onDeleteEntity(entity.id)} />
            </div>
          }
          padded={false}
        >
          {entity.fields.length === 0 ? (
            <div className="p-6 text-center text-fg-muted text-[13px]">No fields yet — click <em>Add field</em>.</div>
          ) : (
            <FieldTable
              entity={entity}
              entityById={entityById}
              onEditField={(f) => onEditField(entity, f)}
              onDeleteField={onDeleteField}
              onReorder={onReorderFields}
            />
          )}
        </Card>
      ))}
    </div>
  );
}

// ───────────────────────── ERD view — visual Mermaid + summary ─────────────────────────

function ErdView({
  model,
  projectId,
  entities,
  entityById,
  generatedErd,
  existingDiagram,
  duplicateCount,
  diagramStale,
  variants,
  onGenerateDiagram,
  onUpdateDiagram,
  onSaveVariant,
}: {
  model: DatabaseModel;
  projectId: string;
  entities: DatabaseEntity[];
  entityById: Map<string, DatabaseEntity>;
  generatedErd: string;
  existingDiagram: Diagram | null;
  duplicateCount: number;
  diagramStale: boolean;
  variants: Diagram[];
  onGenerateDiagram: () => void;
  onUpdateDiagram: () => void;
  onSaveVariant: () => void;
}) {
  const [view, setView] = useState<"preview" | "source">("preview");

  if (entities.length === 0) {
    return (
      <Card>
        <Empty title="Nothing to show" message="Add entities and fields to populate the ERD view." />
      </Card>
    );
  }

  const allFks = entities.flatMap((e) =>
    e.fields
      .filter((f) => f.referencesEntityId || f.isForeignKey)
      .map((f) => {
        const target = f.referencesEntityId ? entityById.get(f.referencesEntityId) ?? null : null;
        // The EXACT pinned target column (referencesFieldId) when available.
        const targetColumn = f.referencesFieldId
          ? target?.fields.find((x) => x.id === f.referencesFieldId)?.name ?? null
          : null;
        return {
          sourceEntity: e.name,
          sourceField: f.name,
          targetEntity: target?.name ?? null,
          targetColumn,
          targetMissing: !!f.referencesEntityId && !entityById.has(f.referencesEntityId),
        };
      }),
  );

  const copySource = () => {
    navigator.clipboard.writeText(generatedErd).then(
      () => toast.success("Mermaid source copied"),
      () => toast.error("Clipboard blocked"),
    );
  };

  // What drifted between the frozen diagram and the model's current shape — shown in
  // the stale banner so "out of date" is concrete (added/removed entities & fields).
  const erdDiff =
    existingDiagram && diagramStale
      ? diffErdLines(existingDiagram.mermaidSource, generatedErd)
      : null;

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Schema diagram"
        subtitle={`${entities.length} entities · ${allFks.length} relationship${allFks.length === 1 ? "" : "s"} · auto-generated from this model`}
        action={
          <div className={`flex items-center gap-2 flex-wrap w-full sm:w-auto ${FILL_ACTIONS_MOBILE}`}>
            <Segmented
              fullWidthMobile
              value={view}
              onChange={(v) => setView(v as "preview" | "source")}
              options={[
                { value: "preview", label: "Preview" },
                { value: "source", label: "Source" },
              ]}
            />
            <Button size="sm" icon={<Copy size={12} />} onClick={copySource}>Copy Mermaid</Button>
            {existingDiagram ? (
              <>
                {diagramStale && (
                  <>
                    <Button size="sm" variant="primary" icon={<RefreshCw size={12} />} onClick={onUpdateDiagram}>
                      Update diagram
                    </Button>
                    {/* A variant only makes sense as a fork of a *divergence* — so it's
                        offered exactly when the diagram is out of date, beside Update. */}
                    <Button size="sm" icon={<GitBranch size={12} />} onClick={onSaveVariant}>Save as variant</Button>
                  </>
                )}
                <Link href={`/projects/${projectId}/diagrams/${existingDiagram.id}`}>
                  <Button size="sm" icon={<ExternalLink size={12} />}>Open diagram</Button>
                </Link>
              </>
            ) : (
              <Button size="sm" icon={<GitMerge size={12} />} onClick={onGenerateDiagram}>Generate diagram</Button>
            )}
          </div>
        }
      >
        {/* Sync status for the previously-generated diagram. The diagram is a frozen
            snapshot, so a model edit makes it stale; Update resyncs it (explicit, so
            it never silently clobbers hand-edits). Once one exists, the action above
            is Update/Open — never Generate — so no new duplicates are created. */}
        {existingDiagram && (diagramStale || duplicateCount > 1) && (
          <div className="mb-3 flex flex-col gap-2 text-[12.5px]">
            {diagramStale && (
              <div
                className="flex flex-col gap-2 rounded-md px-3 py-2 text-warning"
                style={{
                  border: "1px solid color-mix(in srgb, var(--c-warning) 30%, transparent)",
                  background: "color-mix(in srgb, var(--c-warning) 10%, transparent)",
                }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span className="text-fg-muted">
                    <strong className="text-warning">&ldquo;{existingDiagram.title}&rdquo;</strong> is out of date — it was
                    generated before the latest changes to this model. Use <em>Update diagram</em> to resync it, or{" "}
                    <em>Save as variant</em> to keep this version as a separate copy.
                  </span>
                </div>
                {erdDiff && (erdDiff.added.length > 0 || erdDiff.removed.length > 0) && (
                  <ErdDiffSummary diff={erdDiff} />
                )}
              </div>
            )}
            {duplicateCount > 1 && (
              <div className="flex items-start gap-2 rounded-md px-3 py-2 border border-border bg-panel-2 text-fg-muted">
                <Copy size={14} className="shrink-0 mt-0.5" />
                <span>
                  {duplicateCount} ERD diagrams were generated from this model. Update/Open act on the most recent — you
                  can remove the extras from the{" "}
                  <Link href={`/projects/${projectId}/diagrams`} className="text-accent hover:underline">Diagrams page</Link>.
                </span>
              </div>
            )}
          </div>
        )}
        {view === "preview" ? (
          <div className="bg-panel-2 border border-border rounded-md p-4" style={{ minHeight: 280 }}>
            <MermaidPreview source={generatedErd} />
          </div>
        ) : (
          <pre className="bg-panel-2 border border-border rounded-md p-3 text-[12.5px] overflow-auto font-mono" style={{ maxHeight: 420 }}>
            {generatedErd}
          </pre>
        )}
      </Card>

      {variants.length > 0 && (
        <Card
          title="Saved variants"
          subtitle="Detached ERD copies for exploring alternative designs. These are not auto-synced — editing the model won't change them."
        >
          <div className="flex flex-col gap-2">
            {variants.map((v) => {
              const prefix = `${model.title} ERD${ERD_VARIANT_SEP}`;
              const label = v.title.startsWith(prefix) ? v.title.slice(prefix.length) : v.title;
              return (
                <div key={v.id} className="flex items-center gap-3 rounded-md border border-border bg-panel-2 px-3 py-2">
                  <GitBranch size={14} className="text-accent shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">{label}</div>
                    <div className="text-[11.5px] text-fg-muted">Updated {timeAgo(v.updatedAt)}</div>
                  </div>
                  <Badge tone="default">variant</Badge>
                  <Link href={`/projects/${projectId}/diagrams/${v.id}`}>
                    <Button size="sm" icon={<ExternalLink size={12} />}>Open</Button>
                  </Link>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Entities" subtitle="Compact view of each entity. PK and FK fields are highlighted; FK rows show the target column.">
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
                  {e.fields.map((f) => {
                    const target = f.referencesEntityId ? entityById.get(f.referencesEntityId) : null;
                    // Exact pinned column (referencesFieldId), else the FK is entity-level only.
                    const preciseColumn = f.referencesFieldId
                      ? target?.fields.find((x) => x.id === f.referencesFieldId)?.name ?? null
                      : null;
                    const hasFk = f.isForeignKey || !!f.referencesEntityId;
                    return (
                      <div
                        key={f.id}
                        className="flex items-center gap-2 px-3 py-1.5 border-t border-border first:border-t-0 hover:bg-panel transition-colors"
                      >
                        {f.isPrimaryKey && <Key size={10} className="text-warning shrink-0" />}
                        {hasFk && <Link2 size={10} className="text-info shrink-0" />}
                        <span className="font-semibold">{f.name}</span>
                        <span className="text-fg-muted">{f.type}</span>
                        {f.isPrimaryKey && <PkBadge />}
                        {hasFk && <FkBadge />}
                        {hasFk && (
                          target ? (
                            <span className="ml-auto text-fg-subtle text-[11px] inline-flex items-center gap-1">
                              <ArrowRight size={10} />
                              {target.name}.
                              {preciseColumn ? (
                                preciseColumn
                              ) : (
                                <span className="italic opacity-70">(unresolved column)</span>
                              )}
                            </span>
                          ) : (
                            <span className="ml-auto text-[11px] text-danger">missing</span>
                          )
                        )}
                      </div>
                    );
                  })}
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
                <span className="font-semibold">{fk.sourceEntity}.{fk.sourceField}</span>
                <ArrowRight size={13} className="text-fg-subtle" />
                <span className={fk.targetMissing ? "text-danger" : "text-fg-muted"}>
                  {fk.targetEntity ?? <em>missing</em>}
                  {fk.targetEntity &&
                    (fk.targetColumn ? (
                      `.${fk.targetColumn}`
                    ) : (
                      <span className="italic opacity-70">.(unresolved column)</span>
                    ))}
                </span>
                {fk.targetMissing && <span className="text-danger text-[11px] font-sans ml-2">target entity is missing</span>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div>
        <details className="text-[12.5px]">
          <summary className="cursor-pointer text-fg-muted hover:text-fg">View raw Mermaid source — used to render the preview</summary>
          <pre className="mt-2 bg-panel-2 border border-border rounded-md p-3 text-[12.5px] overflow-auto font-mono" style={{ maxHeight: 240 }}>
            {generatedErd}
          </pre>
        </details>
      </div>
    </div>
  );
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
  const [referencesFieldId, setReferencesFieldId] = useState<string>(field?.referencesFieldId ?? "");
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
        isForeignKey: isForeignKey || !!referencesEntityId || !!referencesFieldId,
        referencesEntityId: referencesEntityId || null,
        referencesFieldId: referencesFieldId || null,
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
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="id"
              className="w-full min-w-0 bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent font-mono" />
          </Field>
          <Field label="Type">
            <input value={type} onChange={(e) => setType(e.target.value)} placeholder="uuid / text / int8"
              className="w-full min-w-0 bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent font-mono" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
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
                // Clear BOTH FK targets so a stale referencesFieldId can't resurrect the
                // FK on save (the backend re-derives the entity from a lingering column).
                if (!next) {
                  setReferencesEntityId("");
                  setReferencesFieldId("");
                }
              }}
            />
            Foreign key
          </label>
        </div>
        {(isForeignKey || referencesEntityId) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="References entity">
              <select value={referencesEntityId}
                onChange={(e) => { setReferencesEntityId(e.target.value); setReferencesFieldId(""); }}
                className="w-full min-w-0 bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
                <option value="">— Pick an entity —</option>
                {siblingEntities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </Field>
            <Field label="References column">
              <select value={referencesFieldId} onChange={(e) => setReferencesFieldId(e.target.value)}
                disabled={!referencesEntityId}
                className="w-full min-w-0 bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] disabled:opacity-50">
                <option value="">— Entity PK (default) —</option>
                {siblingEntities.find((e) => e.id === referencesEntityId)?.fields.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}{f.isPrimaryKey ? " (PK)" : ""}</option>
                ))}
              </select>
            </Field>
          </div>
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

// Compact added/removed line summary for the stale-diagram banner. Capped so a big
// drift doesn't flood the banner — the full picture is one click away in Source.
function ErdDiffSummary({ diff }: { diff: { added: string[]; removed: string[] } }) {
  const CAP = 6;
  const overflow = diff.added.length + diff.removed.length - Math.min(diff.removed.length, CAP) - Math.min(diff.added.length, CAP);
  return (
    <div className="flex flex-col gap-0.5 pl-6">
      {diff.removed.slice(0, CAP).map((l, i) => (
        <div key={`r-${i}`} className="font-mono text-[11.5px] text-danger break-all">
          <span className="select-none opacity-70">− </span>{l}
        </div>
      ))}
      {diff.added.slice(0, CAP).map((l, i) => (
        <div key={`a-${i}`} className="font-mono text-[11.5px] text-success break-all">
          <span className="select-none opacity-70">+ </span>{l}
        </div>
      ))}
      {overflow > 0 && (
        <div className="text-[11px] text-fg-subtle">…and {overflow} more — switch to <em>Source</em> for the full diagram.</div>
      )}
    </div>
  );
}

// Names + creates a detached ERD variant (a frozen copy the user hand-edits to try
// an alternative design). The parent owns the actual create + navigation via onSave.
function SaveVariantModal({
  modelTitle,
  defaultName,
  existingNames,
  onClose,
  onSave,
}: {
  modelTitle: string;
  defaultName: string;
  existingNames: string[];
  onClose: () => void;
  onSave: (label: string) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  // Diagram titles aren't DB-unique, so guard the duplicate here (case-insensitive).
  const duplicate = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
  const canSave = !!trimmed && !duplicate && !busy;

  const submit = async () => {
    if (!trimmed) {
      toast.error("Give the variant a name");
      return;
    }
    if (duplicate) {
      toast.error("A variant with that name already exists");
      return;
    }
    setBusy(true);
    try {
      await onSave(trimmed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Save ERD as variant" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] text-fg-muted leading-relaxed">
          Creates a <strong className="text-fg">detached copy</strong> of the current ERD that you can hand-edit to try an
          alternative design. It is not auto-synced to the model, so later model edits won&rsquo;t change it — ideal for
          comparing solutions side by side.
        </p>
        <Field label="Variant name">
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSave) void submit(); }}
            placeholder="v2 · Denormalized · Event-sourced"
            className={cn(
              "bg-panel border rounded-sm px-2.5 py-2 text-[13.5px] outline-none",
              duplicate ? "border-danger focus:border-danger" : "border-border focus:border-accent",
            )}
          />
        </Field>
        {duplicate ? (
          <div className="text-[12px] text-danger">
            A variant named{" "}
            <span className="font-mono">{modelTitle} ERD{ERD_VARIANT_SEP}{trimmed}</span>{" "}
            already exists — pick a different name.
          </div>
        ) : (
          <div className="text-[12px] text-fg-subtle">
            Saved as <span className="font-mono text-fg-muted">{modelTitle} ERD{ERD_VARIANT_SEP}{trimmed || "…"}</span>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-1">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={<Save size={13} />} onClick={submit} disabled={!canSave}>
            {busy ? "Saving…" : "Save variant"}
          </Button>
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
