// artifact-title.ts — shared helpers for the per-project artifact-title
// uniqueness constraint introduced by migration 20260528080000_artifact_unique_title.

import { prisma } from "../../lib/prisma.js";

/**
 * Normalizes an artifact title for uniqueness comparison: trim, collapse
 * internal whitespace, lowercase. Must mirror the SQL backfill expression in
 * `prisma/migrations/20260528080000_artifact_unique_title/migration.sql`
 * (lower(btrim(regexp_replace(title, '\s+', ' ', 'g')))).
 */
export function normalizeArtifactTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface TitleConflictCheck {
  conflict: boolean;
  conflictingId?: string;
  conflictingTitle?: string;
  normalized: string;
}

/**
 * Returns a TitleConflictCheck describing whether `title` collides with an
 * existing artifact in `projectId`. Pass `excludeArtifactId` on update flows
 * so the artifact doesn't conflict with itself.
 */
export async function checkArtifactTitleConflict(
  projectId: string,
  title: string,
  excludeArtifactId?: string,
): Promise<TitleConflictCheck> {
  const normalized = normalizeArtifactTitle(title);
  const match = await prisma.artifact.findFirst({
    where: {
      projectId,
      normalizedTitle: normalized,
      ...(excludeArtifactId ? { NOT: { id: excludeArtifactId } } : {}),
    },
    select: { id: true, title: true },
  });
  if (!match) return { conflict: false, normalized };
  return { conflict: true, conflictingId: match.id, conflictingTitle: match.title, normalized };
}

export const ARTIFACT_TITLE_TAKEN_MESSAGE =
  "An artifact with this title already exists in this project.";
