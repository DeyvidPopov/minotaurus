import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import {
  artifactsRouter,
  projectArtifactsRouter,
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
import { requireAuth } from "./middleware/auth.js";
import { ok } from "./utils/response.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) =>
  ok(res, { status: "ok", time: new Date().toISOString() }, "Healthy"),
);

apiRouter.use("/auth", authRouter);

apiRouter.use("/projects", requireAuth, projectsRouter);
apiRouter.use("/projects/:projectId/artifacts", requireAuth, projectArtifactsRouter);
apiRouter.use("/projects/:projectId/api-specs", requireAuth, projectApiSpecsRouter);
apiRouter.use("/projects/:projectId/database-models", requireAuth, projectDatabaseModelsRouter);
apiRouter.use("/projects/:projectId/diagrams", requireAuth, projectDiagramsRouter);
apiRouter.use("/projects/:projectId/graph", requireAuth, graphRouter);
apiRouter.use("/projects/:projectId", requireAuth, projectValidationRouter);
apiRouter.use("/projects/:projectId", requireAuth, projectExportsRouter);

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

apiRouter.use("/relations", requireAuth, relationsRouter);
apiRouter.use("/validation-issues", requireAuth, validationIssuesRouter);
apiRouter.use("/exports", requireAuth, exportsRouter);
