-- CreateEnum
CREATE TYPE "AiSessionKind" AS ENUM ('BOOTSTRAP');

-- CreateEnum
CREATE TYPE "AiSessionStatus" AS ENUM ('PROPOSED', 'APPLIED', 'DISCARDED');

-- CreateTable
CREATE TABLE "AiSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "AiSessionKind" NOT NULL DEFAULT 'BOOTSTRAP',
    "status" "AiSessionStatus" NOT NULL DEFAULT 'PROPOSED',
    "idea" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "proposal" JSONB,
    "artifactsProposed" INTEGER NOT NULL DEFAULT 0,
    "relationsProposed" INTEGER NOT NULL DEFAULT 0,
    "diagramsProposed" INTEGER NOT NULL DEFAULT 0,
    "artifactsCreated" INTEGER NOT NULL DEFAULT 0,
    "relationsCreated" INTEGER NOT NULL DEFAULT 0,
    "diagramsCreated" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "appliedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSession_projectId_idx" ON "AiSession"("projectId");

-- CreateIndex
CREATE INDEX "AiSession_projectId_createdAt_idx" ON "AiSession"("projectId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AiSession" ADD CONSTRAINT "AiSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSession" ADD CONSTRAINT "AiSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
