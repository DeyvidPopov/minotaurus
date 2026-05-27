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
import { requireAuth } from "./middleware/auth.js";
import { ok } from "./utils/response.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) =>
  ok(res, { status: "ok", time: new Date().toISOString() }, "Healthy"),
);

apiRouter.use("/auth", authRouter);

apiRouter.use("/projects", requireAuth, projectsRouter);
apiRouter.use("/projects/:projectId/artifacts", requireAuth, projectArtifactsRouter);
apiRouter.use("/projects/:projectId/graph", requireAuth, graphRouter);
apiRouter.use("/projects/:projectId", requireAuth, projectValidationRouter);
apiRouter.use("/projects/:projectId", requireAuth, projectExportsRouter);

apiRouter.use("/artifacts/:artifactId/relations", requireAuth, artifactRelationsRouter);
apiRouter.use("/artifacts", requireAuth, artifactsRouter);

apiRouter.use("/relations", requireAuth, relationsRouter);
apiRouter.use("/validation-issues", requireAuth, validationIssuesRouter);
apiRouter.use("/exports", requireAuth, exportsRouter);
