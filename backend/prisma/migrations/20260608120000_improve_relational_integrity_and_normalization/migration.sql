-- improve_relational_integrity_and_normalization
--
-- Adds missing foreign keys, unique constraints, a self-loop CHECK, the precise
-- column-level FK (DatabaseField.referencesFieldId), normalizes ValidationIssue
-- into a real Artifact FK + a polymorphic subject pointer, refines indexes, and
-- backfills an explicit OWNER membership for every project owner.
--
-- Hand-edited from `prisma migrate diff` so the new NOT NULL column is backfilled
-- safely instead of failing on existing rows. End state matches schema.prisma.

-- ── New enum: a validation finding's subject kind ──
CREATE TYPE "ValidationSubjectType" AS ENUM ('ARTIFACT', 'API_SPEC', 'DATABASE_MODEL', 'DIAGRAM', 'PROJECT');

-- ── Drop single-column indexes now covered by a composite (unique) index ──
DROP INDEX "AiSession_projectId_idx";
DROP INDEX "ApiEndpoint_apiSpecId_idx";
DROP INDEX "DatabaseEntity_databaseModelId_idx";
DROP INDEX "DatabaseField_entityId_idx";
DROP INDEX "ValidationIssue_projectId_idx";

-- ── DatabaseField: precise (column-level) FK target ──
ALTER TABLE "DatabaseField" ADD COLUMN "referencesFieldId" TEXT;

-- ── ValidationIssue: subjectType + subjectId (polymorphic) and artifactId → real nullable FK ──
-- subjectType is safe with a default; subjectId is backfilled from the old
-- artifactId pointer (which WAS the polymorphic subject id) before becoming NOT NULL.
ALTER TABLE "ValidationIssue"
  ADD COLUMN "subjectType" "ValidationSubjectType" NOT NULL DEFAULT 'ARTIFACT',
  ADD COLUMN "subjectId" TEXT,
  ALTER COLUMN "artifactId" DROP NOT NULL;

-- Backfill the polymorphic subject id from the old artifactId column.
UPDATE "ValidationIssue" SET "subjectId" = "artifactId";

-- Classify the subject kind from what the pointer resolves to. Best-effort: a
-- finding about a resource LINKED to an artifact stored that artifact's id, so it
-- reads as ARTIFACT here; the next validation run recomputes the exact kind. This
-- label does not drive navigation (the UI resolves the target from the rule).
UPDATE "ValidationIssue" v SET "subjectType" = (CASE
  WHEN EXISTS (SELECT 1 FROM "Artifact" a WHERE a."id" = v."subjectId") THEN 'ARTIFACT'
  WHEN EXISTS (SELECT 1 FROM "ApiSpec" s WHERE s."id" = v."subjectId" OR s."artifactId" = v."subjectId") THEN 'API_SPEC'
  WHEN EXISTS (SELECT 1 FROM "DatabaseModel" m WHERE m."id" = v."subjectId" OR m."artifactId" = v."subjectId") THEN 'DATABASE_MODEL'
  WHEN EXISTS (SELECT 1 FROM "Diagram" d WHERE d."id" = v."subjectId" OR d."artifactId" = v."subjectId") THEN 'DIAGRAM'
  ELSE 'PROJECT'
END)::"ValidationSubjectType";

-- subjectId is fully populated → enforce NOT NULL.
ALTER TABLE "ValidationIssue" ALTER COLUMN "subjectId" SET NOT NULL;

-- artifactId is now the STRICT Artifact FK: keep it only where it is a real artifact
-- id, NULL otherwise (api-spec / db-model / diagram / project subjects), so the FK
-- added below is satisfied.
UPDATE "ValidationIssue" v SET "artifactId" = NULL
  WHERE v."artifactId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Artifact" a WHERE a."id" = v."artifactId");

-- ── Recreated / new indexes ──
CREATE INDEX "AiSession_projectId_kind_createdAt_idx" ON "AiSession"("projectId", "kind", "createdAt" DESC);
CREATE UNIQUE INDEX "ApiEndpoint_apiSpecId_method_path_key" ON "ApiEndpoint"("apiSpecId", "method", "path");
CREATE UNIQUE INDEX "DatabaseEntity_databaseModelId_name_key" ON "DatabaseEntity"("databaseModelId", "name");
CREATE INDEX "DatabaseField_referencesFieldId_idx" ON "DatabaseField"("referencesFieldId");
CREATE UNIQUE INDEX "DatabaseField_entityId_name_key" ON "DatabaseField"("entityId", "name");
CREATE INDEX "ValidationIssue_projectId_status_idx" ON "ValidationIssue"("projectId", "status");
CREATE INDEX "ValidationIssue_artifactId_idx" ON "ValidationIssue"("artifactId");

-- ── Foreign keys ──
ALTER TABLE "DatabaseField" ADD CONSTRAINT "DatabaseField_referencesFieldId_fkey" FOREIGN KEY ("referencesFieldId") REFERENCES "DatabaseField"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ValidationIssue" ADD CONSTRAINT "ValidationIssue_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSession" ADD CONSTRAINT "AiSession_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── CHECK: an artifact relation can never be a self-loop ──
-- Prisma's schema cannot express CHECK; the relations controller + AI validator
-- already guard this at the app layer — this is the DB-level backstop. Prisma does
-- not manage CHECK constraints, so it stays out of future schema diffs.
ALTER TABLE "ArtifactRelation" ADD CONSTRAINT "ArtifactRelation_no_self_loop" CHECK ("sourceArtifactId" <> "targetArtifactId");

-- ── Backfill: every project owner is also an explicit OWNER ProjectMember ──
-- createProject already writes this row; this heals any legacy project that relied
-- only on the implicit-owner fallback. Idempotent — inserts nothing when present.
INSERT INTO "ProjectMember" ("id", "projectId", "userId", "role", "joinedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", p."ownerId", 'OWNER', now(), now(), now()
FROM "Project" p
WHERE NOT EXISTS (
  SELECT 1 FROM "ProjectMember" m WHERE m."projectId" = p."id" AND m."userId" = p."ownerId"
);
