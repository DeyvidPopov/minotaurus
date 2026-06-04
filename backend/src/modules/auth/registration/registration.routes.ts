// Routes for the multi-step registration flow, each behind a rate limiter.
// Limits are per fixed window; keys combine client IP and (where a body email
// exists) the normalized email so one address can't be hammered across IPs.
import { Router } from "express";
import { rateLimit, clientIp, bodyEmail } from "../../../middleware/rate-limit.js";
import {
  registerComplete,
  registerResend,
  registerStart,
  registerVerify,
} from "./registration.controller.js";

export const registrationRouter = Router();

const MIN = 60_000;
const HOUR = 60 * MIN;

// start: 5 per hour per IP+email — bounds account-creation spam / mail volume.
const startLimiter = rateLimit({
  windowMs: HOUR,
  max: 5,
  keyGenerator: (req) => `start:${clientIp(req)}:${bodyEmail(req)}`,
});

// verify: 10 per 10 min per IP+email — defends the code (the service also caps
// real guesses atomically). Keyed by IP+email (not email alone) so a remote party
// can't exhaust a victim's window from anywhere, and blank-email floods are scoped
// per-IP instead of colliding into one global bucket.
const verifyLimiter = rateLimit({
  windowMs: 10 * MIN,
  max: 10,
  keyGenerator: (req) => `verify:${clientIp(req)}:${bodyEmail(req)}`,
});

// resend: 5 per hour per IP+email — the 30s cooldown is the primary gate.
const resendLimiter = rateLimit({
  windowMs: HOUR,
  max: 5,
  keyGenerator: (req) => `resend:${clientIp(req)}:${bodyEmail(req)}`,
});

// complete: 10 per hour per IP — guards the token-exchange step.
const completeLimiter = rateLimit({
  windowMs: HOUR,
  max: 10,
  keyGenerator: (req) => `complete:${clientIp(req)}`,
});

registrationRouter.post("/start", startLimiter, registerStart);
registrationRouter.post("/verify", verifyLimiter, registerVerify);
registrationRouter.post("/complete", completeLimiter, registerComplete);
registrationRouter.post("/resend", resendLimiter, registerResend);
