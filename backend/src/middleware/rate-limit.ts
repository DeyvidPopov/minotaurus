// In-memory fixed-window rate limiter middleware.
//
// Single-instance only: state lives in a per-limiter Map in this process, so it
// resets on restart and does NOT coordinate across replicas. That is acceptable
// for the current single-node deployment; move to a shared store (e.g. Redis)
// before scaling horizontally. The decision math is the pure engine.
import type { NextFunction, Request, Response } from "express";
import { fail } from "../utils/response.js";
import { hitFixedWindow, type WindowState } from "./rate-limit.engine.js";

export interface RateLimitOptions {
  /** Window length in ms. */
  windowMs: number;
  /** Max hits allowed per key per window. */
  max: number;
  /** Derive the bucket key from the request (e.g. IP, or IP+email). */
  keyGenerator: (req: Request) => string;
}

/**
 * Client IP for rate-limit keying. Deliberately uses `req.ip` and the raw socket
 * address ONLY — it never parses `X-Forwarded-For` itself. Trusting that header
 * blindly lets an attacker rotate `X-Forwarded-For` per request to get a fresh
 * bucket and defeat every IP-keyed limiter. Express populates `req.ip` from XFF
 * *only* when `app.set('trust proxy', …)` is configured (see app.ts / TRUST_PROXY),
 * so behind a known proxy this is correct, and with no proxy it falls back to the
 * real socket peer — never a client-controlled value.
 */
export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

/** Lower-cased email from the body, for per-email keys (falls back to ""). */
export function bodyEmail(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function rateLimit(opts: RateLimitOptions) {
  const store = new Map<string, WindowState>();

  // Opportunistic pruning so the Map can't grow unbounded from one-off keys.
  function prune(now: number): void {
    if (store.size < 5_000) return;
    for (const [key, state] of store) {
      if (now >= state.resetAt) store.delete(key);
    }
  }

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    prune(now);
    const key = opts.keyGenerator(req);
    const decision = hitFixedWindow(store.get(key), now, opts.windowMs, opts.max);
    store.set(key, decision.state);

    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(decision.remaining));

    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      return fail(res, 429, "RATE_LIMITED", "Too many requests. Please try again later.", {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
    return next();
  };
}
