// app/(app)/projects/[projectId]/versions/page.tsx — version-event timeline
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Network,
  BookOpen,
  Plug,
  Database,
  GitMerge,
  Package,
  Shield,
  Plus,
  Pencil,
  Trash2,
  Link2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Empty } from "@/components/ui/empty";
import { OpenLink } from "@/components/ui/open-link";
import {
  VERSION_ACTIONS,
  VERSION_ENTITY_TYPES,
  versionsApi,
  type VersionAction,
  type VersionEntityType,
  type VersionEvent,
} from "@/lib/api/versions";
import { ApiError } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils";

const ACTION_COLOR: Record<VersionAction, string> = {
  CREATED: "var(--c-success)",
  UPDATED: "var(--c-info)",
  DELETED: "var(--c-danger)",
  LINKED: "var(--c-info)",
  UNLINKED: "var(--fg-muted)",
  VALIDATED: "var(--c-warning)",
  EXPORTED: "#a78bfa",
};

const ACTION_VERB: Record<VersionAction, string> = {
  CREATED: "created",
  UPDATED: "updated",
  DELETED: "deleted",
  LINKED: "linked",
  UNLINKED: "unlinked",
  VALIDATED: "validated",
  EXPORTED: "exported",
};

// Entities where the stored `title` repeats information already in the verb +
// entity-type line (e.g. relations are "source → target"). Keep the layout
// consistent with the dashboard's Recent changes widget.
const HIDE_SECONDARY_TITLE = new Set<VersionEntityType>(["RELATION"]);

function entityTypeLabel(t: VersionEntityType): string {
  return t.toLowerCase().replace(/_/g, " ");
}

function authorFirstName(event: VersionEvent): string {
  const full = event.triggeredByName?.trim();
  if (!full) return "Someone";
  return full.split(/\s+/)[0];
}

const ENTITY_ICON: Record<VersionEntityType, React.ReactNode> = {
  PROJECT: <Box size={14} />,
  ARTIFACT: <Box size={14} />,
  RELATION: <Network size={14} />,
  DOCUMENTATION: <BookOpen size={14} />,
  API_SPEC: <Plug size={14} />,
  API_ENDPOINT: <Plug size={14} />,
  DATABASE_MODEL: <Database size={14} />,
  DATABASE_ENTITY: <Database size={14} />,
  DATABASE_FIELD: <Database size={14} />,
  DIAGRAM: <GitMerge size={14} />,
  EXPORT: <Package size={14} />,
  VALIDATION: <Shield size={14} />,
};

const ACTION_ICON: Record<VersionAction, React.ReactNode> = {
  CREATED: <Plus size={11} />,
  UPDATED: <Pencil size={11} />,
  DELETED: <Trash2 size={11} />,
  LINKED: <Link2 size={11} />,
  UNLINKED: <Unlink size={11} />,
  VALIDATED: <Shield size={11} />,
  EXPORTED: <Package size={11} />,
};

export default function VersionHistoryPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [events, setEvents] = useState<VersionEvent[] | null>(null);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<"ALL" | VersionEntityType>("ALL");
  const [action, setAction] = useState<"ALL" | VersionAction>("ALL");

  const load = async () => {
    try {
      const list = await versionsApi.list(projectId, { limit: 500 });
      setEvents(list);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load version history");
      setEvents([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filtered = useMemo(() => {
    let items = events ?? [];
    if (entityType !== "ALL") items = items.filter((e) => e.entityType === entityType);
    if (action !== "ALL") items = items.filter((e) => e.action === action);
    if (search.trim()) {
      const t = search.toLowerCase();
      items = items.filter(
        (e) =>
          e.title.toLowerCase().includes(t) ||
          e.description.toLowerCase().includes(t) ||
          e.entityType.toLowerCase().includes(t),
      );
    }
    return items;
  }, [events, entityType, action, search]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div className="px-8 py-6">
      <PageHeader
        title="Version history"
        subtitle={
          events === null
            ? "Loading…"
            : `${events.length} event${events.length === 1 ? "" : "s"} · newest first`
        }
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Filter…" className="w-[220px]" />
            <select value={entityType} onChange={(e) => setEntityType(e.target.value as typeof entityType)}
              className="h-8 px-2.5 pr-7 bg-panel border border-border rounded-sm text-[13.5px]">
              <option value="ALL">All entities</option>
              {VERSION_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={action} onChange={(e) => setAction(e.target.value as typeof action)}
              className="h-8 px-2.5 pr-7 bg-panel border border-border rounded-sm text-[13.5px]">
              <option value="ALL">All actions</option>
              {VERSION_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </>
        }
      />

      {events !== null && events.length === 0 ? (
        <Empty title="No version events yet" message="Edits to artifacts, relations, API specs, documentation, diagrams, validations and exports will appear here." />
      ) : filtered.length === 0 ? (
        <Empty title="No events match" message="Try a different filter." />
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="text-[11.5px] font-mono uppercase tracking-wider text-fg-subtle mb-2">{day}</div>
              <Card padded={false}>
                <ul className="divide-y divide-border">
                  {items.map((e) => (
                    <EventRow key={e.id} event={e} projectId={projectId} />
                  ))}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event, projectId }: { event: VersionEvent; projectId: string }) {
  const c = ACTION_COLOR[event.action];
  const targetHref = entityHref(projectId, event);
  const initials = event.triggeredByInitials?.trim() || "?";
  const fullName = event.triggeredByName?.trim() || "Unknown user";
  const showTitle = !HIDE_SECONDARY_TITLE.has(event.entityType) && !!event.title.trim();
  return (
    <li className="flex items-center gap-3 px-3.5 py-3 hover:bg-panel-hover transition-colors">
      <span
        className="inline-grid place-items-center rounded-full text-[10.5px] font-semibold shrink-0"
        style={{
          width: 28,
          height: 28,
          color: c,
          background: `color-mix(in srgb, ${c} 14%, transparent)`,
          border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
        }}
        title={fullName}
        aria-label={fullName}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] leading-tight truncate">
          <strong className="text-fg font-semibold">{authorFirstName(event)}</strong>{" "}
          <span className="text-fg-muted">{ACTION_VERB[event.action]}</span>{" "}
          <span className="font-mono text-fg-muted">{entityTypeLabel(event.entityType)}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <span
            className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded font-mono font-bold leading-none"
            style={{
              color: c,
              background: `color-mix(in srgb, ${c} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
            }}
          >
            {ACTION_ICON[event.action]} {event.action}
          </span>
          <Badge mono>
            {ENTITY_ICON[event.entityType]}
            {event.entityType}
          </Badge>
          {showTitle && (
            <span className="text-[13px] font-medium truncate">{event.title}</span>
          )}
        </div>
        {event.description && (
          <div className="text-[12.5px] text-fg-muted mt-1 truncate">{event.description}</div>
        )}
      </div>
      <div className="text-[11.5px] text-fg-subtle font-mono shrink-0 flex flex-col items-end gap-1">
        <span>{timeAgo(event.createdAt)}</span>
        <OpenLink href={targetHref} />
      </div>
    </li>
  );
}

function entityHref(projectId: string, e: VersionEvent): string {
  const md = (e.metadata ?? {}) as {
    specId?: string;
    databaseModelId?: string;
    sourceArtifactId?: string;
    ingestionId?: string;
    memberId?: string;
    memberUserId?: string;
  };
  switch (e.entityType) {
    case "ARTIFACT":
    case "DOCUMENTATION":
      return `/projects/${projectId}/artifacts/${e.entityId}`;
    case "API_SPEC":
      return `/projects/${projectId}/api/${e.entityId}`;
    case "API_ENDPOINT":
      return md.specId
        ? `/projects/${projectId}/api/${md.specId}`
        : `/projects/${projectId}/api`;
    case "DATABASE_MODEL":
      return `/projects/${projectId}/database/${e.entityId}`;
    case "DATABASE_ENTITY":
    case "DATABASE_FIELD":
      return md.databaseModelId
        ? `/projects/${projectId}/database/${md.databaseModelId}`
        : `/projects/${projectId}/database`;
    case "DIAGRAM":
      return `/projects/${projectId}/diagrams/${e.entityId}`;
    case "EXPORT":
      return `/projects/${projectId}/export`;
    case "VALIDATION":
      return `/projects/${projectId}/validation`;
    case "RELATION":
      return md.sourceArtifactId
        ? `/projects/${projectId}/artifacts/${md.sourceArtifactId}`
        : `/projects/${projectId}/graph`;
    case "PROJECT":
      // Project-scoped events: route to whichever module the event came from.
      if (md.ingestionId) return `/projects/${projectId}/ingestion`;
      if (md.memberId || md.memberUserId) return `/projects/${projectId}/team`;
      return `/projects/${projectId}`;
    default:
      return `/projects/${projectId}`;
  }
}

function groupByDay(events: VersionEvent[]): [string, VersionEvent[]][] {
  const map = new Map<string, VersionEvent[]>();
  for (const e of events) {
    const day = e.createdAt.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(e);
  }
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
}
