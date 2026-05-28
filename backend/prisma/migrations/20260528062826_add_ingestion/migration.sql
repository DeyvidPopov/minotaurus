-- CreateEnum
CREATE TYPE "IngestionSourceType" AS ENUM ('MARKDOWN', 'OPENAPI_JSON', 'MERMAID', 'SQL_SCHEMA');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('DRAFT', 'PARSED', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "IngestionRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceType" "IngestionSourceType" NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL DEFAULT '',
    "createdRecords" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestionRecord_projectId_idx" ON "IngestionRecord"("projectId");

-- CreateIndex
CREATE INDEX "IngestionRecord_projectId_createdAt_idx" ON "IngestionRecord"("projectId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "IngestionRecord" ADD CONSTRAINT "IngestionRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRecord" ADD CONSTRAINT "IngestionRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
