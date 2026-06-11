// Shared mapping of the AI generation error taxonomy (bootstrap / review /
// advisor / documentation controllers) to the response envelope. Status codes and
// detail keys are a documented contract — keep them byte-identical; only the
// truncation `suggestion` is per-feature copy passed in by the caller.
import type { Response } from "express";
import { fail } from "../../utils/response.js";
import { AiOutputTruncatedError, AiSchemaError } from "./ai.service.js";
import { AiNotConfiguredError, AiProviderError } from "./providers/ai.provider.js";

/**
 * Map a shared AI error to the response and return true (handled). Returns false
 * for any other error so the caller rethrows it to the central error handler.
 */
export function respondAiError(res: Response, err: unknown, truncatedSuggestion: string): boolean {
  if (err instanceof AiNotConfiguredError) {
    fail(res, 503, "AI_NOT_CONFIGURED", err.message);
    return true;
  }
  if (err instanceof AiOutputTruncatedError) {
    fail(res, 422, "AI_OUTPUT_TRUNCATED", err.message, {
      maxTokens: err.details.maxTokens,
      outputTokens: err.details.outputTokens,
      suggestion: truncatedSuggestion,
    });
    return true;
  }
  if (err instanceof AiProviderError) {
    fail(res, 502, "AI_PROVIDER_ERROR", err.message);
    return true;
  }
  if (err instanceof AiSchemaError) {
    fail(res, 502, "AI_SCHEMA_ERROR", err.message);
    return true;
  }
  return false;
}
