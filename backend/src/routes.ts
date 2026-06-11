import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import {
  artifactsRouter,
  projectArtifactsRouter,
  projectDocumentationRouter,
} from "./modules/artifacts/artifacts.routes.js";
import {
  artifactRelationsRouter,
  relationsRouter,
} from "./modules/relations/relations.routes.js";
import { graphRouter } from "./modules/graph/graph.routes.js";
import {
  projectValidationRouter,
  validationIssuesRouter,
} from "./modules/validation/validation.routes.js";
import {
  exportsRouter,
  projectExportsRouter,
} from "./modules/exports/exports.routes.js";
import {
  apiEndpointsRouter,
  apiSpecEndpointsRouter,
  apiSpecsRouter,
  projectApiSpecsRouter,
} from "./modules/api-specs/api-specs.routes.js";
import {
  databaseEntitiesRouter,
  databaseEntityFieldsRouter,
  databaseFieldsRouter,
  databaseModelEntitiesRouter,
  databaseModelsRouter,
  projectDatabaseModelsRouter,
} from "./modules/database-models/database-models.routes.js";
import {
  diagramsRouter,
  projectDiagramsRouter,
} from "./modules/diagrams/diagrams.routes.js";
import {
  projectVersionsRouter,
  versionEventsRouter,
} from "./modules/versions/versions.routes.js";
import { projectMembersRouter } from "./modules/members/members.routes.js";
import {
  ingestionRouter,
  projectIngestionRouter,
} from "./modules/ingestion/ingestion.routes.js";
import { projectAiRouter } from "./modules/ai/ai.routes.js";
import { projectApiIntelRouter } from "./modules/api-intel/api-intel.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { requireAuth } from "./middleware/auth.js";
import { fail, ok } from "./utils/response.js";
import { prisma } from "./lib/prisma.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) =>
  ok(res, { status: "ok", time: new Date().toISOString() }, "Healthy"),
);

apiRouter.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Deliberately generic: this endpoint is unauthenticated, so it must not
    // disclose the DB host/port/driver. We only report reachability.
    return ok(res, { database: "connected" }, "Database reachable");
  } catch (err) {
    // Log the real error server-side only; never return raw Prisma/PG text to
    // an anonymous caller (matches the errorHandler's no-leak discipline).
    // eslint-disable-next-line no-console
    console.error("[health/db] database unreachable:", err);
    return fail(res, 503, "DB_UNREACHABLE", "Database unreachable");
  }
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/settings", requireAuth, settingsRouter);
apiRouter.use("/dashboard", requireAuth, dashboardRouter);

apiRouter.use("/projects", requireAuth, projectsRouter);
apiRouter.use("/projects/:projectId/artifacts", requireAuth, projectArtifactsRouter);
apiRouter.use("/projects/:projectId/documentation", requireAuth, projectDocumentationRouter);
apiRouter.use("/projects/:projectId/api-specs", requireAuth, projectApiSpecsRouter);
apiRouter.use("/projects/:projectId/database-models", requireAuth, projectDatabaseModelsRouter);
apiRouter.use("/projects/:projectId/diagrams", requireAuth, projectDiagramsRouter);
apiRouter.use("/projects/:projectId/graph", requireAuth, graphRouter);
apiRouter.use("/projects/:projectId", requireAuth, projectValidationRouter);
apiRouter.use("/projects/:projectId", requireAuth, projectExportsRouter);
apiRouter.use("/projects/:projectId", requireAuth, projectVersionsRouter);
apiRouter.use("/projects/:projectId/members", requireAuth, projectMembersRouter);
apiRouter.use("/projects/:projectId/ingestion", requireAuth, projectIngestionRouter);
apiRouter.use("/ingestion", requireAuth, ingestionRouter);
apiRouter.use("/projects/:projectId/ai", requireAuth, projectAiRouter);
apiRouter.use("/projects/:projectId/api-intel", requireAuth, projectApiIntelRouter);

apiRouter.use("/artifacts/:artifactId/relations", requireAuth, artifactRelationsRouter);
apiRouter.use("/artifacts", requireAuth, artifactsRouter);

apiRouter.use("/api-specs/:apiSpecId/endpoints", requireAuth, apiSpecEndpointsRouter);
apiRouter.use("/api-specs", requireAuth, apiSpecsRouter);
apiRouter.use("/api-endpoints", requireAuth, apiEndpointsRouter);

apiRouter.use("/database-models/:databaseModelId/entities", requireAuth, databaseModelEntitiesRouter);
apiRouter.use("/database-models", requireAuth, databaseModelsRouter);
apiRouter.use("/database-entities/:entityId/fields", requireAuth, databaseEntityFieldsRouter);
apiRouter.use("/database-entities", requireAuth, databaseEntitiesRouter);
apiRouter.use("/database-fields", requireAuth, databaseFieldsRouter);

apiRouter.use("/diagrams", requireAuth, diagramsRouter);
apiRouter.use("/version-events", requireAuth, versionEventsRouter);

apiRouter.use("/relations", requireAuth, relationsRouter);
apiRouter.use("/validation-issues", requireAuth, validationIssuesRouter);
apiRouter.use("/exports", requireAuth, exportsRouter);
