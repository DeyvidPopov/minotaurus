import type { NextFunction, Request, Response } from "express";
import { fail, HttpError } from "../utils/response.js";

export function notFound(_req: Request, res: Response) {
  return fail(res, 404, "NOT_FOUND", "Route not found");
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    return fail(res, err.status, err.code, err.message);
  }
  const message = err instanceof Error ? err.message : "Unknown server error";
  // eslint-disable-next-line no-console
  console.error("[error]", err);
  return fail(res, 500, "INTERNAL_ERROR", message);
}
