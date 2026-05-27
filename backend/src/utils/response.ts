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
) {
  return res.status(status).json({ success: false, error: { code, message } });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
