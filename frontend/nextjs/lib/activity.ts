// lib/activity.ts — shared presentation helpers for version-event activity feeds.
// Used by the dashboard's Recent activity widget, the project overview's Recent
// changes timeline, and the full Version History page so their verb/colour/label
// and author formatting stay in one place and can't drift.
import type { VersionAction, VersionEntityType, VersionEvent } from "@/lib/api/versions";

/** Dot/accent colour per action, keyed to the design palette. */
export const ACTION_COLOR: Record<VersionAction, string> = {
  CREATED: "var(--c-success)",
  UPDATED: "var(--c-info)",
  DELETED: "var(--c-danger)",
  LINKED: "var(--c-info)",
  UNLINKED: "var(--fg-muted)",
  VALIDATED: "var(--c-warning)",
  EXPORTED: "#a78bfa",
};

/** Standalone label form of each action, e.g. timeline "{actor} {verb} {entity}".
 *  The dashboard phrases VALIDATED differently (as a sentence with the entity as
 *  object) — it overrides that one entry locally; everything else shares this map. */
export const ACTION_VERB: Record<VersionAction, string> = {
  CREATED: "created",
  UPDATED: "updated",
  DELETED: "deleted",
  LINKED: "linked",
  UNLINKED: "unlinked",
  VALIDATED: "validated",
  EXPORTED: "exported",
};

/** Human label for an entity type, e.g. DATABASE_FIELD → "database field". */
export function entityTypeLabel(t: VersionEntityType): string {
  return t.toLowerCase().replace(/_/g, " ");
}

/** Full display name of who triggered the event, falling back to "Someone". */
export function actorName(event: VersionEvent): string {
  return event.triggeredByName?.trim() || "Someone";
}

// ── Run collapsing ──────────────────────────────────────────────────────────
// Validation runs carry the same severity breakdown and, when run repeatedly,
// would otherwise spam an activity feed with identical "ran validation" rows.
// `groupActivityRuns` folds *consecutive* runs by the same actor in the same
// project into one entry carrying a run `count` (the feeds render "ran
// validation · N runs"); every other event passes through with count 1, and the
// latest run of a fold is the one kept. Order-preserving. Shared by the project
// Overview "Recent changes" timeline (single project) and the dashboard "Recent
// activity" feed (cross-project — hence the projectId guard) so the two can't
// drift. Pass events already sorted newest-first.
export function groupActivityRuns(events: VersionEvent[]): { event: VersionEvent; count: number }[] {
  const out: { event: VersionEvent; count: number }[] = [];
  for (const e of events) {
    const prev = out[out.length - 1];
    const isRun = e.entityType === "VALIDATION" && e.action === "VALIDATED";
    if (
      prev &&
      isRun &&
      prev.event.entityType === "VALIDATION" &&
      prev.event.action === "VALIDATED" &&
      prev.event.triggeredBy === e.triggeredBy &&
      prev.event.projectId === e.projectId
    ) {
      prev.count += 1;
    } else {
      out.push({ event: e, count: 1 });
    }
  }
  return out;
}

// ── Rich event description ──────────────────────────────────────────────────
// The backend already stores specific context on every VersionEvent (a relation's
// "source → target" title, a validation run's per-severity counts, an artifact's
// type/status, …). `describeEvent` surfaces that instead of the generic
// "{verb} {entityType}" phrasing — so the feed shows "linked Public Web App →
// API Gateway" / "ran validation · 1 error · 22 warnings", not "linked relation"
// / "validated validation". Additive: existing consumers keep using the helpers
// above until they adopt this.

/** Specific, human-readable description of a version event. */
export interface EventDescription {
  /** Predicate, with the entity noun where it helps — "created artifact", "linked", "ran validation". */
  verb: string;
  /** Specific subject — "API Gateway", "Public Web App → API Gateway", or "" when the verb stands alone. */
  subject: string;
  /** Optional secondary line built from stored context — "1 error · 22 warnings", "Service · Draft", "uses". */
  detail?: string;
}

const EVENT_ENTITY_NOUN: Partial<Record<VersionEntityType, string>> = {
  ARTIFACT: "artifact",
  API_SPEC: "API spec",
  API_ENDPOINT: "API endpoint",
  DATABASE_MODEL: "database model",
  DATABASE_ENTITY: "database entity",
  DATABASE_FIELD: "database field",
  DIAGRAM: "diagram",
  DOCUMENTATION: "documentation",
  PROJECT: "project",
};

const EVENT_VERB: Partial<Record<VersionAction, string>> = {
  CREATED: "created",
  UPDATED: "updated",
  DELETED: "deleted",
};

/** "USES" → "uses", "DEPENDS_ON" → "depends on". */
function humanizeLower(token: string): string {
  return token.toLowerCase().replace(/_/g, " ").trim();
}

/** "EXTERNAL_SYSTEM" → "External system", "DRAFT" → "Draft". */
function humanizeSentence(token: string): string {
  const s = humanizeLower(token);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Strip a leading "CODE · " finding-code prefix from a stored message. */
function stripCodePrefix(message: string): string {
  const sep = message.indexOf(" · ");
  if (sep > 0 && /^[A-Z0-9_]+$/.test(message.slice(0, sep))) return message.slice(sep + 3);
  return message;
}

/** "1 error · 22 warnings · 6 info" from a validation run's stored severity map. */
function severityBreakdown(meta: Record<string, unknown>): string {
  const order: [string, string, string][] = [
    ["CRITICAL", "critical", "critical"],
    ["ERROR", "error", "errors"],
    ["WARNING", "warning", "warnings"],
    ["INFO", "info", "info"],
  ];
  const by = meta.bySeverity;
  if (by && typeof by === "object") {
    const parts: string[] = [];
    for (const [key, one, many] of order) {
      const n = Number((by as Record<string, unknown>)[key] ?? 0);
      if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
    }
    if (parts.length) return parts.join(" · ");
  }
  const total = Number(meta.issueCount ?? 0);
  return total > 0 ? `${total} finding${total === 1 ? "" : "s"}` : "No issues found";
}

export function describeEvent(event: VersionEvent): EventDescription {
  const meta = (event.metadata ?? {}) as Record<string, unknown>;
  const title = (event.title ?? "").trim();
  const description = (event.description ?? "").trim();

  switch (event.entityType) {
    case "RELATION": {
      const typeToken = typeof meta.relationType === "string" ? meta.relationType : description;
      return {
        verb: event.action === "UNLINKED" ? "removed link" : "linked",
        subject: title,
        detail: typeToken ? humanizeLower(typeToken) : undefined,
      };
    }
    case "VALIDATION": {
      if (event.action === "VALIDATED") {
        return { verb: "ran validation", subject: "", detail: severityBreakdown(meta) };
      }
      const to = typeof meta.to === "string" ? meta.to : "";
      const verb =
        to === "RESOLVED" ? "resolved a finding" :
        to === "IGNORED" ? "dismissed a finding" :
        to === "OPEN" ? "reopened a finding" : "updated a finding";
      const message = typeof meta.message === "string" ? meta.message : description;
      return { verb, subject: "", detail: message ? stripCodePrefix(message) : undefined };
    }
    case "EXPORT": {
      const fmt = typeof meta.format === "string" ? meta.format : "";
      const subject = title || (fmt ? `${fmt} export` : "export");
      const detail = description
        ? description.split(",").map((s) => humanizeSentence(s.trim())).filter(Boolean).join(", ")
        : undefined;
      return { verb: "generated", subject, detail };
    }
    case "DOCUMENTATION": {
      const verb =
        event.action === "CREATED" ? "added documentation to" :
        event.action === "DELETED" ? "removed documentation from" : "updated documentation for";
      return { verb, subject: title };
    }
    default: {
      const noun = EVENT_ENTITY_NOUN[event.entityType] ?? entityTypeLabel(event.entityType);
      const verb = `${EVENT_VERB[event.action] ?? ACTION_VERB[event.action]} ${noun}`;
      let detail: string | undefined;
      if (event.entityType === "ARTIFACT" && event.action === "CREATED") {
        const parts = [
          typeof meta.type === "string" ? humanizeSentence(meta.type) : "",
          typeof meta.status === "string" ? humanizeSentence(meta.status) : "",
        ].filter(Boolean);
        detail = parts.length ? parts.join(" · ") : undefined;
      } else if (event.entityType === "ARTIFACT" && event.action === "UPDATED") {
        const changed = Array.isArray(meta.changed)
          ? (meta.changed as unknown[]).filter((x): x is string => typeof x === "string")
          : [];
        if (changed.length) detail = `Changed ${changed.join(", ")}`;
      }
      return { verb, subject: title, detail };
    }
  }
}
