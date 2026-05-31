import { Router } from "express";
import { reviewArchitectureEndpoint } from "./review.controller.js";

// Mounted at /projects/:projectId/ai/review (see ai.routes.ts). mergeParams so
// the controller can read :projectId. Single POST — read-only generate; there is
// deliberately no apply/mutation route.
export const projectAiReviewRouter = Router({ mergeParams: true });
projectAiReviewRouter.post("/", reviewArchitectureEndpoint);
