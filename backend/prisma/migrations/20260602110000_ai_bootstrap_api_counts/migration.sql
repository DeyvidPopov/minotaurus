-- Bootstrap V2 (Phase 2 — API catalog) audit counts on AiSession.
-- Additive, non-destructive; existing rows take the default 0.

-- AlterTable
ALTER TABLE "AiSession" ADD COLUMN     "apiSpecsProposed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "apiEndpointsProposed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "apiSpecsCreated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "apiEndpointsCreated" INTEGER NOT NULL DEFAULT 0;
