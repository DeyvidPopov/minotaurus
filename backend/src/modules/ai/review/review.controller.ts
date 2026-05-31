// review.controller.ts — thin HTTP layer for the read-only AI Architecture
// Review. Role check + envelope + error mapping only; orchestration lives in
// review.service.ts. There is no mutation/apply endpoint by design.

import type { Response } from "express";
import { ok, fail } from "../../../utils/response.js";
import type { AuthedRequest } from "../../../middleware/auth.js";
import { assertProjectRole } from "../../../lib/project-access.js";
import { AiOutputTruncatedError, AiSchemaError } from "../ai.service.js";
import { AiNotConfiguredError, AiProviderError } from "../providers/ai.provider.js";
import { generateArchitectureReview } from "./review.service.js";

export async function reviewArchitectureEndpoint(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  // DEVELOPER+: the review is read-only, and developers already see the full
  // project architecture. (Mutations require DEVELOPER; this stays consistent
  // without escalating to the ARCHITECT export/validation tier, since nothing
  // is written to the SSOT.)
  if (!(await assertProjectRole(projectId, req.user!.userId, res, "DEVELOPER"))) return;

  try {
    const result = await generateArchitectureReview({ projectId, userId: req.user!.userId });
    return ok(res, result, "Architecture review generated");
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return fail(res, 503, "AI_NOT_CONFIGURED", err.message);
    if (err instanceof AiOutputTruncatedError) {
      return fail(res, 422, "AI_OUTPUT_TRUNCATED", err.message, {
        maxTokens: err.details.maxTokens,
        outputTokens: err.details.outputTokens,
        suggestion: "The project is large; increase AI_MAX_TOKENS or narrow the export scope.",
      });
    }
    if (err instanceof AiProviderError) return fail(res, 502, "AI_PROVIDER_ERROR", err.message);
    if (err instanceof AiSchemaError) return fail(res, 502, "AI_SCHEMA_ERROR", err.message);
    throw err;
  }
}
