// ai.controller.ts — thin HTTP layer for the AI Bootstrap Wizard. Role checks +
// envelope only; orchestration lives in ai.service.ts / proposal/*.

import type { Response } from "express";
import { z } from "zod";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { assertCanMutate } from "../../lib/project-access.js";
import { AiOutputTruncatedError, AiSchemaError, proposeBootstrap } from "./ai.service.js";
import {
  applyBootstrap,
  BootstrapConflictError,
  BootstrapValidationError,
} from "./proposal/bootstrap.apply.js";
import { bootstrapProposalSchema } from "./proposal/bootstrap.schema.js";
import { AiNotConfiguredError, AiProviderError } from "./providers/ai.provider.js";
import type { BootstrapProposal } from "./ai.types.js";

const proposeSchema = z.object({
  idea: z.string().trim().min(10, "Describe your idea in at least 10 characters").max(2000),
});

const applySchema = z.object({
  proposal: bootstrapProposalSchema,
  sessionId: z.string().uuid().nullable().optional(),
});

export async function proposeBootstrapEndpoint(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  if (!(await assertCanMutate(projectId, req.user!.userId, res))) return;

  const parsed = proposeSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  try {
    const result = await proposeBootstrap({
      projectId,
      userId: req.user!.userId,
      idea: parsed.data.idea,
    });
    return ok(res, result, "Architecture proposed");
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return fail(res, 503, "AI_NOT_CONFIGURED", err.message);
    if (err instanceof AiOutputTruncatedError) {
      return fail(res, 422, "AI_OUTPUT_TRUNCATED", err.message, {
        maxTokens: err.details.maxTokens,
        outputTokens: err.details.outputTokens,
        suggestion: "Try a narrower idea or increase AI_MAX_TOKENS.",
      });
    }
    if (err instanceof AiProviderError) return fail(res, 502, "AI_PROVIDER_ERROR", err.message);
    if (err instanceof AiSchemaError) return fail(res, 502, "AI_SCHEMA_ERROR", err.message);
    throw err;
  }
}

export async function applyBootstrapEndpoint(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  if (!(await assertCanMutate(projectId, req.user!.userId, res))) return;

  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  try {
    const result = await applyBootstrap({
      projectId,
      userId: req.user!.userId,
      proposal: parsed.data.proposal as unknown as BootstrapProposal,
      sessionId: parsed.data.sessionId ?? null,
    });
    return created(res, result, "Architecture applied");
  } catch (err) {
    if (err instanceof BootstrapValidationError) {
      const msg = err.report.errors.join("; ") || "The proposal did not pass deterministic validation.";
      return fail(res, 422, "AI_VALIDATION_FAILED", msg);
    }
    if (err instanceof BootstrapConflictError) return fail(res, 409, "AI_APPLY_CONFLICT", err.message);
    throw err;
  }
}
