import type { NextFunction, Request, Response } from "express";
import { fail, HttpError } from "../utils/response.js";

export function notFound(_req: Request, res: Response) {
  return fail(res, 404, "NOT_FOUND", "Route not found");
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Known application errors are intentionally user-facing: their code + message
  // are part of the API contract (UNAUTHORIZED, NOT_FOUND, AI_OUTPUT_TRUNCATED, …).
  if (err instanceof HttpError) {
    return fail(res, err.status, err.code, err.message);
  }

  // Unexpected failures (runtime exceptions, Prisma/DB errors, null refs, …) must
  // NEVER leak internal details to the client — log full diagnostics, respond generic.
  // eslint-disable-next-line no-console
  console.error("[error]", {
    timestamp: new Date().toISOString(),
    name: err instanceof Error ? err.name : "NonError",
    message: err instanceof Error ? err.message : String(err),
    method: req.method,
    path: req.originalUrl,
    stack: err instanceof Error ? err.stack : undefined,
  });
  return fail(res, 500, "INTERNAL_ERROR", "Internal server error");
}
