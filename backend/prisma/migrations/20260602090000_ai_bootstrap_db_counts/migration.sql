-- Bootstrap V2 (Phase 1 — Database) audit counts on AiSession.
-- Additive, non-destructive; existing rows take the default 0.

-- AlterTable
ALTER TABLE "AiSession" ADD COLUMN     "databaseModelsProposed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "databaseEntitiesProposed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "databaseFieldsProposed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "databaseModelsCreated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "databaseEntitiesCreated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "databaseFieldsCreated" INTEGER NOT NULL DEFAULT 0;
