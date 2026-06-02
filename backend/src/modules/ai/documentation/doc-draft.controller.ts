// doc-draft.controller.ts — thin HTTP layer for the artifact Documentation
// Assistant. Role check (DEVELOPER+, because the user can later save the doc) +
// envelope + AI error mapping only. Orchestration lives in doc-draft.service.ts.
// There is NO apply/save endpoint here by design — saving stays on the existing
// PUT /artifacts/:id/documentation path.

import type { Response } from "express";
import { ok, fail } from "../../../utils/response.js";
import type { AuthedRequest } from "../../../middleware/auth.js";
import { assertProjectRole } from "../../../lib/project-access.js";
import { AiOutputTruncatedError, AiSchemaError } from "../ai.service.js";
import { AiNotConfiguredError, AiProviderError } from "../providers/ai.provider.js";
import { DocArtifactNotFoundError, generateDocumentationDraft } from "./doc-draft.service.js";

export async function documentationDraftEndpoint(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const artifactId = req.params.artifactId;
  // DEVELOPER+: the user must be able to save the documentation they're drafting.
  if (!(await assertProjectRole(projectId, req.user!.userId, res, "DEVELOPER"))) return;

  try {
    const result = await generateDocumentationDraft({ projectId, artifactId, userId: req.user!.userId });
    return ok(res, result, "Documentation draft generated");
  } catch (err) {
    if (err instanceof DocArtifactNotFoundError) return fail(res, 404, "NOT_FOUND", "Artifact not found");
    if (err instanceof AiNotConfiguredError) return fail(res, 503, "AI_NOT_CONFIGURED", err.message);
    if (err instanceof AiOutputTruncatedError) {
      return fail(res, 422, "AI_OUTPUT_TRUNCATED", err.message, {
        maxTokens: err.details.maxTokens,
        outputTokens: err.details.outputTokens,
        suggestion: "The artifact context was large; increase AI_DOC_DRAFT_MAX_TOKENS.",
      });
    }
    if (err instanceof AiProviderError) return fail(res, 502, "AI_PROVIDER_ERROR", err.message);
    if (err instanceof AiSchemaError) return fail(res, 502, "AI_SCHEMA_ERROR", err.message);
    throw err;
  }
}
