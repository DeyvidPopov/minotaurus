import type { Response } from "express";

export function ok<T>(res: Response, data: T, message = "OK", status = 200) {
  return res.status(status).json({ success: true, data, message });
}

export function created<T>(res: Response, data: T, message = "Created") {
  return ok(res, data, message, 201);
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  });
}

/**
 * Map the `{ error: "not_found" | "forbidden" }` shape returned by the per-module
 * load-and-authorize access helpers (`findModelForUser`, `findSpecForUser`,
 * `findDiagramForUser`, `findArtifactForUser`, …) to the standard response. The
 * not_found-before-forbidden ordering is the helpers' deliberate info-disclosure
 * boundary; only the not_found message varies per entity ("forbidden" is always
 * the generic 403).
 *
 * Behaviour is byte-equivalent to the inline `result.error === "not_found"
 * ? fail(404,…) : fail(403,…)` ternary it replaces: `"not_found"` → 404, anything
 * else → 403. The param admits `undefined` only because `"error" in result`
 * narrowing leaves a phantom `error?: undefined` on the success member of those
 * helpers' inferred unions; that branch is unreachable at runtime (the success
 * shape has no `error` key) and, like the original ternary, falls through to 403.
 */
export function respondAccessError(
  res: Response,
  error: "not_found" | "forbidden" | undefined,
  notFoundMessage: string,
) {
  return error === "not_found"
    ? fail(res, 404, "NOT_FOUND", notFoundMessage)
    : fail(res, 403, "FORBIDDEN", "Forbidden");
}

/**
 * Guard for the project-level access pattern: given a `projectAccessStatus()`
 * result, send the standard denial response and return `true` (the caller must
 * then `return`), or return `false` when access is "ok" so the caller proceeds.
 *
 * Byte-equivalent to the inline pair it replaces —
 *
 *   if (access === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
 *   if (access === "forbidden") return fail(res, 403, "FORBIDDEN", "Forbidden");
 *
 * — i.e. not_found → 404 (default message "Project not found"), forbidden → 403
 * "Forbidden". The denial routes through `respondAccessError`, so project-level
 * and resource-level (the `findXForUser` helpers) denials share one terminal mapper.
 *
 * This is ONLY for the not_found→404 form. Sites that deliberately collapse a
 * known-to-exist project's non-ok status to a flat 403 (the `status !== "ok"`
 * form, where the projectId came from an already-loaded child row) keep their own
 * one-liner — folding them in here would turn their 403 into a 404.
 */
export function respondProjectAccessDenied(
  res: Response,
  status: "ok" | "not_found" | "forbidden",
  notFoundMessage = "Project not found",
): boolean {
  if (status === "ok") return false;
  respondAccessError(res, status, notFoundMessage);
  return true;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /**
     * Optional, deliberately user-facing extra context (e.g. unmet password
     * rules, retry-after seconds). Only ever set explicitly by us — never
     * populated from an unexpected/internal error — so it cannot leak internals.
     */
    public details?: unknown,
  ) {
    super(message);
  }
}
