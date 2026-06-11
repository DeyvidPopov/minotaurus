import { Router } from "express";
import { applyBootstrapEndpoint, proposeBootstrapEndpoint } from "./ai.controller.js";
import {
  latestReviewEndpoint,
  reviewArchitectureEndpoint,
  reviewByIdEndpoint,
  reviewHistoryEndpoint,
} from "./review/review.controller.js";
import { documentationDraftEndpoint } from "./documentation/doc-draft.controller.js";
import {
  advisorEndpoint,
  latestAdvisorEndpoint,
  advisorHistoryEndpoint,
  advisorByIdEndpoint,
} from "./advisor/advisor.controller.js";
import { rateLimit, clientIp } from "../../middleware/rate-limit.js";
import type { AuthedRequest } from "../../middleware/auth.js";

// Mounted at /projects/:projectId/ai (see routes.ts), so mergeParams is required
// to read :projectId in the controllers.
export const projectAiRouter = Router({ mergeParams: true });

// AI generation calls the paid Anthropic Messages API (up to several thousand
// output tokens each). Throttle per authenticated user so one DEVELOPER+ member
// of any project can't drive unbounded cost / a billing-DoS. Keyed by userId —
// the whole AI router is mounted behind requireAuth (routes.ts) — falling back
// to client IP only if somehow unauthenticated. Applied to the model-calling
// POSTs only; the GETs reuse persisted results (no AI call) and bootstrap/apply
// is the deterministic, already-bounded apply step.
const aiGenerateLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  keyGenerator: (req) => `ai:${(req as AuthedRequest).user?.userId ?? clientIp(req)}`,
});

projectAiRouter.post("/bootstrap/propose", aiGenerateLimiter, proposeBootstrapEndpoint);
projectAiRouter.post("/bootstrap/apply", applyBootstrapEndpoint);

// AI Architecture Review: POST generates (AI call); the GETs reuse persisted
// reviews with NO AI call (cheap deterministic staleness recompute only).
projectAiRouter.post("/review", aiGenerateLimiter, reviewArchitectureEndpoint);
projectAiRouter.get("/review/latest", latestReviewEndpoint);
projectAiRouter.get("/reviews", reviewHistoryEndpoint);
projectAiRouter.get("/reviews/:reviewId", reviewByIdEndpoint);

// Artifact Documentation Assistant: generate an on-demand Markdown draft for one
// artifact (DEVELOPER+). Draft only — AI never writes documentation; the user
// reviews/edits and saves via PUT /artifacts/:id/documentation.
projectAiRouter.post(
  "/documentation/artifacts/:artifactId/draft",
  aiGenerateLimiter,
  documentationDraftEndpoint,
);

// AI Architecture Advisor: the "Advisor / Next Steps" mode of AI Review
// (DEVELOPER+). Read-only w.r.t. architecture — it interprets the deterministic
// analysis (why findings matter, what to investigate next) and writes ONLY its
// own AiSession(ADVISOR) record. POST generates (AI call) + persists; the GETs
// reuse persisted advisories with NO AI call (cheap deterministic staleness
// recompute only), mirroring the Full Review read endpoints.
projectAiRouter.post("/advisor", aiGenerateLimiter, advisorEndpoint);
projectAiRouter.get("/advisor/latest", latestAdvisorEndpoint);
projectAiRouter.get("/advisors", advisorHistoryEndpoint);
projectAiRouter.get("/advisors/:advisorId", advisorByIdEndpoint);
