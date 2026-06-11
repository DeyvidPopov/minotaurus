// Routes for the verified email-change flow. All require auth; requireAuth runs
// BEFORE each limiter so the limiter can key by the authenticated userId (the
// actor is known, so per-user buckets are tighter and fairer than per-IP).
import { Router } from "express";
import type { Request } from "express";
import { requireAuth, type AuthedRequest } from "../../../middleware/auth.js";
import { rateLimit, clientIp } from "../../../middleware/rate-limit.js";
import { requestChange, resendChange, verifyChange } from "./email-change.controller.js";

export const emailChangeRouter = Router();

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Per-user key (falls back to IP if somehow unauthenticated). */
function userKey(prefix: string) {
  return (req: Request) => {
    const uid = (req as AuthedRequest).user?.userId;
    return `${prefix}:${uid ?? clientIp(req)}`;
  };
}

// request: 5 per hour per user — bounds confirmation-email volume to new addresses.
const requestLimiter = rateLimit({ windowMs: HOUR, max: 5, keyGenerator: userKey("emailchange:request") });
// verify: 10 per 10 min per user — defends the code (the service also caps guesses atomically).
const verifyLimiter = rateLimit({ windowMs: 10 * MIN, max: 10, keyGenerator: userKey("emailchange:verify") });
// resend: 5 per hour per user — the 30s cooldown is the primary gate.
const resendLimiter = rateLimit({ windowMs: HOUR, max: 5, keyGenerator: userKey("emailchange:resend") });

emailChangeRouter.post("/request", requireAuth, requestLimiter, requestChange);
emailChangeRouter.post("/verify", requireAuth, verifyLimiter, verifyChange);
emailChangeRouter.post("/resend", requireAuth, resendLimiter, resendChange);
