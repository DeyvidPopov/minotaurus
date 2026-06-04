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
