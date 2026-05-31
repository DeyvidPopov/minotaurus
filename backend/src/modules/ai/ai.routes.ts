import { Router } from "express";
import { applyBootstrapEndpoint, proposeBootstrapEndpoint } from "./ai.controller.js";
import { projectAiReviewRouter } from "./review/review.routes.js";

// Mounted at /projects/:projectId/ai (see routes.ts), so mergeParams is required
// to read :projectId in the controllers.
export const projectAiRouter = Router({ mergeParams: true });
projectAiRouter.post("/bootstrap/propose", proposeBootstrapEndpoint);
projectAiRouter.post("/bootstrap/apply", applyBootstrapEndpoint);
projectAiRouter.use("/review", projectAiReviewRouter);
