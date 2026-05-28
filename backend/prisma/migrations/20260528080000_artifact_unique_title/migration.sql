-- Add normalizedTitle column with a default so existing rows are valid,
-- backfill from title via lower(trim(collapse whitespace)), drop the
-- default, then enforce a per-project unique index.

ALTER TABLE "Artifact" ADD COLUMN "normalizedTitle" TEXT NOT NULL DEFAULT '';

UPDATE "Artifact"
SET "normalizedTitle" = lower(btrim(regexp_replace("title", '\s+', ' ', 'g')));

ALTER TABLE "Artifact" ALTER COLUMN "normalizedTitle" DROP DEFAULT;

CREATE UNIQUE INDEX "Artifact_projectId_normalizedTitle_key" ON "Artifact"("projectId", "normalizedTitle");
