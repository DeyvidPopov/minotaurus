// versions.engine.ts — pure helpers for recording version events.
// Writes directly to Postgres via Prisma.

import type { Prisma, VersionAction, VersionEntityType, VersionEvent } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export interface RecordEventInput {
  projectId: string;
  entityType: VersionEntityType;
  entityId: string;
  action: VersionAction;
  title: string;
  description?: string;
  triggeredBy: string;
  metadata?: Prisma.InputJsonValue;
  /** Optional override for testing / seeding; defaults to now. */
  at?: Date | string;
}

export function recordVersionEvent(input: RecordEventInput): Promise<VersionEvent> {
  const createdAt = input.at ? new Date(input.at) : new Date();
  return prisma.versionEvent.create({
    data: {
      projectId: input.projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      title: input.title,
      description: input.description ?? "",
      triggeredById: input.triggeredBy,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      createdAt,
    },
  });
}
