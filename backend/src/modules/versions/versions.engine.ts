// versions.engine.ts — pure helpers for recording version events.
// Recording is a write-only push to the in-memory db; callers are responsible
// for the surrounding persist() so a single mutating endpoint stays atomic.

import { db, type VersionAction, type VersionEntityType, type VersionEventRow } from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";

export interface RecordEventInput {
  projectId: string;
  entityType: VersionEntityType;
  entityId: string;
  action: VersionAction;
  title: string;
  description?: string;
  triggeredBy: string;
  metadata?: Record<string, unknown>;
  /** Optional override for testing; defaults to now. */
  at?: string;
}

export function recordVersionEvent(input: RecordEventInput): VersionEventRow {
  const row: VersionEventRow = {
    id: newId(),
    projectId: input.projectId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    title: input.title,
    description: input.description ?? "",
    triggeredBy: input.triggeredBy,
    metadata: input.metadata ?? {},
    createdAt: input.at ?? new Date().toISOString(),
  };
  db().versionEvents.push(row);
  return row;
}

export function eventsForProject(projectId: string): VersionEventRow[] {
  return db().versionEvents.filter((e) => e.projectId === projectId);
}
