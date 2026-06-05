// Routes for the forgot-password flow, each behind a rate limiter. Limits mirror
// the registration flow's posture: keys combine client IP and (where a body email
// exists) the normalized email so one address can't be hammered across IPs, and
// blank-email floods stay scoped per-IP instead of colliding into one bucket.
import { Router } from "express";
import { rateLimit, clientIp, bodyEmail } from "../../../middleware/rate-limit.js";
import {
  confirmReset,
  requestReset,
  resendReset,
  verifyReset,
} from "./password-reset.controller.js";

export const passwordResetRouter = Router();

const MIN = 60_000;
const HOUR = 60 * MIN;

// forgot: 5 per hour per IP+email — bounds reset-email volume / spam.
const forgotLimiter = rateLimit({
  windowMs: HOUR,
  max: 5,
  keyGenerator: (req) => `pwforgot:${clientIp(req)}:${bodyEmail(req)}`,
});

// verify: 10 per 10 min per IP+email — defends the code (the service also caps
// real guesses atomically).
const verifyLimiter = rateLimit({
  windowMs: 10 * MIN,
  max: 10,
  keyGenerator: (req) => `pwverify:${clientIp(req)}:${bodyEmail(req)}`,
});

// reset: 10 per hour per IP — guards the token-exchange step (no email in body).
const resetLimiter = rateLimit({
  windowMs: HOUR,
  max: 10,
  keyGenerator: (req) => `pwreset:${clientIp(req)}`,
});

// resend: 5 per hour per IP+email — the 30s cooldown is the primary gate.
const resendLimiter = rateLimit({
  windowMs: HOUR,
  max: 5,
  keyGenerator: (req) => `pwresend:${clientIp(req)}:${bodyEmail(req)}`,
});

passwordResetRouter.post("/forgot", forgotLimiter, requestReset);
passwordResetRouter.post("/verify", verifyLimiter, verifyReset);
passwordResetRouter.post("/reset", resetLimiter, confirmReset);
passwordResetRouter.post("/resend", resendLimiter, resendReset);
