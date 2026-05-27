-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ENGINEER', 'ARCHITECT');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('DOCUMENTATION', 'API_SPEC', 'API_ENDPOINT', 'SERVICE', 'DATABASE_MODEL', 'DATABASE_ENTITY', 'DIAGRAM', 'REQUIREMENT', 'SECURITY_POLICY', 'ENVIRONMENT', 'EXTERNAL_SYSTEM');

-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('DEPENDS_ON', 'DOCUMENTS', 'IMPLEMENTS', 'USES', 'EXPOSES', 'BELONGS_TO', 'SECURES', 'VALIDATES', 'COMMUNICATES_WITH');

-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- CreateEnum
CREATE TYPE "DatabaseType" AS ENUM ('PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite');

-- CreateEnum
CREATE TYPE "DiagramType" AS ENUM ('FLOWCHART', 'SEQUENCE', 'ERD', 'CLASS', 'STATE', 'GANTT', 'ARCHITECTURE');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('DOCUMENTATION', 'API', 'DATABASE', 'SECURITY', 'ARCHITECTURE', 'RELATIONSHIP', 'VERSIONING', 'DIAGRAM');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('JSON', 'MARKDOWN', 'PDF', 'ZIP');

-- CreateEnum
CREATE TYPE "VersionEntityType" AS ENUM ('PROJECT', 'ARTIFACT', 'RELATION', 'DOCUMENTATION', 'API_SPEC', 'API_ENDPOINT', 'DATABASE_MODEL', 'DATABASE_ENTITY', 'DATABASE_FIELD', 'DIAGRAM', 'EXPORT', 'VALIDATION');

-- CreateEnum
CREATE TYPE "VersionAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'LINKED', 'UNLINKED', 'VALIDATED', 'EXPORTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ENGINEER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ArtifactType" NOT NULL,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gx" INTEGER NOT NULL DEFAULT 0,
    "gy" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "documentationContent" TEXT,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactRelation" (
    "id" TEXT NOT NULL,
    "sourceArtifactId" TEXT NOT NULL,
    "targetArtifactId" TEXT NOT NULL,
    "relationType" "RelationType" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiSpec" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "artifactId" TEXT,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiEndpoint" (
    "id" TEXT NOT NULL,
    "apiSpecId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "method" "HttpMethod" NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "requestSchema" TEXT NOT NULL DEFAULT '',
    "responseSchema" TEXT NOT NULL DEFAULT '',
    "requiresAuth" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatabaseModel" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "artifactId" TEXT,
    "title" TEXT NOT NULL,
    "databaseType" "DatabaseType" NOT NULL DEFAULT 'PostgreSQL',
    "description" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatabaseModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatabaseEntity" (
    "id" TEXT NOT NULL,
    "databaseModelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatabaseEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatabaseField" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "isPrimaryKey" BOOLEAN NOT NULL DEFAULT false,
    "isForeignKey" BOOLEAN NOT NULL DEFAULT false,
    "referencesEntityId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DatabaseField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagram" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "artifactId" TEXT,
    "title" TEXT NOT NULL,
    "type" "DiagramType" NOT NULL DEFAULT 'FLOWCHART',
    "mermaidSource" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diagram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationIssue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "category" "IssueCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportPackage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "sections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "entityType" "VersionEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "VersionAction" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "triggeredById" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "Artifact_projectId_idx" ON "Artifact"("projectId");

-- CreateIndex
CREATE INDEX "Artifact_createdById_idx" ON "Artifact"("createdById");

-- CreateIndex
CREATE INDEX "ArtifactRelation_sourceArtifactId_idx" ON "ArtifactRelation"("sourceArtifactId");

-- CreateIndex
CREATE INDEX "ArtifactRelation_targetArtifactId_idx" ON "ArtifactRelation"("targetArtifactId");

-- CreateIndex
CREATE INDEX "ApiSpec_projectId_idx" ON "ApiSpec"("projectId");

-- CreateIndex
CREATE INDEX "ApiSpec_artifactId_idx" ON "ApiSpec"("artifactId");

-- CreateIndex
CREATE INDEX "ApiEndpoint_apiSpecId_idx" ON "ApiEndpoint"("apiSpecId");

-- CreateIndex
CREATE INDEX "DatabaseModel_projectId_idx" ON "DatabaseModel"("projectId");

-- CreateIndex
CREATE INDEX "DatabaseModel_artifactId_idx" ON "DatabaseModel"("artifactId");

-- CreateIndex
CREATE INDEX "DatabaseEntity_databaseModelId_idx" ON "DatabaseEntity"("databaseModelId");

-- CreateIndex
CREATE INDEX "DatabaseField_entityId_idx" ON "DatabaseField"("entityId");

-- CreateIndex
CREATE INDEX "DatabaseField_referencesEntityId_idx" ON "DatabaseField"("referencesEntityId");

-- CreateIndex
CREATE INDEX "Diagram_projectId_idx" ON "Diagram"("projectId");

-- CreateIndex
CREATE INDEX "Diagram_artifactId_idx" ON "Diagram"("artifactId");

-- CreateIndex
CREATE INDEX "ValidationIssue_projectId_idx" ON "ValidationIssue"("projectId");

-- CreateIndex
CREATE INDEX "ExportPackage_projectId_idx" ON "ExportPackage"("projectId");

-- CreateIndex
CREATE INDEX "VersionEvent_projectId_idx" ON "VersionEvent"("projectId");

-- CreateIndex
CREATE INDEX "VersionEvent_entityId_idx" ON "VersionEvent"("entityId");

-- CreateIndex
CREATE INDEX "VersionEvent_projectId_createdAt_idx" ON "VersionEvent"("projectId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactRelation" ADD CONSTRAINT "ArtifactRelation_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactRelation" ADD CONSTRAINT "ArtifactRelation_targetArtifactId_fkey" FOREIGN KEY ("targetArtifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactRelation" ADD CONSTRAINT "ArtifactRelation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiSpec" ADD CONSTRAINT "ApiSpec_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiSpec" ADD CONSTRAINT "ApiSpec_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiSpec" ADD CONSTRAINT "ApiSpec_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiEndpoint" ADD CONSTRAINT "ApiEndpoint_apiSpecId_fkey" FOREIGN KEY ("apiSpecId") REFERENCES "ApiSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseModel" ADD CONSTRAINT "DatabaseModel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseModel" ADD CONSTRAINT "DatabaseModel_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseModel" ADD CONSTRAINT "DatabaseModel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseEntity" ADD CONSTRAINT "DatabaseEntity_databaseModelId_fkey" FOREIGN KEY ("databaseModelId") REFERENCES "DatabaseModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseField" ADD CONSTRAINT "DatabaseField_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "DatabaseEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseField" ADD CONSTRAINT "DatabaseField_referencesEntityId_fkey" FOREIGN KEY ("referencesEntityId") REFERENCES "DatabaseEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagram" ADD CONSTRAINT "Diagram_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagram" ADD CONSTRAINT "Diagram_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagram" ADD CONSTRAINT "Diagram_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationIssue" ADD CONSTRAINT "ValidationIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportPackage" ADD CONSTRAINT "ExportPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportPackage" ADD CONSTRAINT "ExportPackage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionEvent" ADD CONSTRAINT "VersionEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionEvent" ADD CONSTRAINT "VersionEvent_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

