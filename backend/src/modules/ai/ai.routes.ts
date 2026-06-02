import { Router } from "express";
import { applyBootstrapEndpoint, proposeBootstrapEndpoint } from "./ai.controller.js";
import {
  latestReviewEndpoint,
  reviewArchitectureEndpoint,
  reviewByIdEndpoint,
  reviewHistoryEndpoint,
} from "./review/review.controller.js";
import { documentationDraftEndpoint } from "./documentation/doc-draft.controller.js";

// Mounted at /projects/:projectId/ai (see routes.ts), so mergeParams is required
// to read :projectId in the controllers.
export const projectAiRouter = Router({ mergeParams: true });
projectAiRouter.post("/bootstrap/propose", proposeBootstrapEndpoint);
projectAiRouter.post("/bootstrap/apply", applyBootstrapEndpoint);

// AI Architecture Review: POST generates (AI call); the GETs reuse persisted
// reviews with NO AI call (cheap deterministic staleness recompute only).
projectAiRouter.post("/review", reviewArchitectureEndpoint);
projectAiRouter.get("/review/latest", latestReviewEndpoint);
projectAiRouter.get("/reviews", reviewHistoryEndpoint);
projectAiRouter.get("/reviews/:reviewId", reviewByIdEndpoint);

// Artifact Documentation Assistant: generate an on-demand Markdown draft for one
// artifact (DEVELOPER+). Draft only — AI never writes documentation; the user
// reviews/edits and saves via PUT /artifacts/:id/documentation.
projectAiRouter.post(
  "/documentation/artifacts/:artifactId/draft",
  documentationDraftEndpoint,
);
