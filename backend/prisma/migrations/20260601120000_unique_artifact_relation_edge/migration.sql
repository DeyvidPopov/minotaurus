-- Harden the graph SSOT: a directed artifact edge is unique by
-- (sourceArtifactId, targetArtifactId, relationType). The application already
-- validates this (AI bootstrap validator + relation controller); this makes the
-- database enforce it too, for concurrent-write safety and duplicate-edge
-- protection. A pre-flight check confirmed zero existing duplicate groups, so
-- the index build succeeds without a cleanup step.
CREATE UNIQUE INDEX "ArtifactRelation_sourceArtifactId_targetArtifactId_relation_key" ON "ArtifactRelation"("sourceArtifactId", "targetArtifactId", "relationType");
