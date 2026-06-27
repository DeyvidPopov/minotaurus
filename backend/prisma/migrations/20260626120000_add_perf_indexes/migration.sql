-- Performance indexes (read-path optimization; no data change).
--
-- 1. ValidationIssue list: the default issue list runs `WHERE projectId ORDER BY
--    createdAt DESC`. The existing (projectId,status) index serves the equality
--    but not the ordering, forcing a Sort node. A (projectId, createdAt DESC)
--    index turns it into a range scan.
CREATE INDEX "ValidationIssue_projectId_createdAt_idx" ON "ValidationIssue"("projectId", "createdAt" DESC);

-- 2. ExportPackage list: listExports runs `WHERE projectId ORDER BY createdAt DESC`.
CREATE INDEX "ExportPackage_projectId_createdAt_idx" ON "ExportPackage"("projectId", "createdAt" DESC);

-- 3. VersionEvent per-entity recent events: the impact page runs `WHERE projectId
--    AND entityId ORDER BY createdAt DESC LIMIT 10`. (entityId, createdAt DESC) is
--    more selective than the existing (projectId, createdAt DESC) for this query
--    and supersedes the bare (entityId) index, which is dropped.
DROP INDEX "VersionEvent_entityId_idx";
CREATE INDEX "VersionEvent_entityId_createdAt_idx" ON "VersionEvent"("entityId", "createdAt" DESC);
