// lib/api/error-message.ts — normalize a caught error into a display-safe string.

import { ApiError } from "./client";

/**
 * Display-safe message for a caught value. Returns an `ApiError`'s server message
 * (the user-facing copy unwrapped from the API envelope) and the caller's fallback
 * for anything else. Deliberately `ApiError`-only: a generic Error/throwable maps to
 * the fallback so an unexpected internal message is never surfaced to the user.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof ApiError ? err.message : fallback;
}
