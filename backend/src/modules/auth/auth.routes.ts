import { Router } from "express";
import { changePassword, login, me, register, updateMe } from "./auth.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit, clientIp, bodyEmail } from "../../middleware/rate-limit.js";
import { registrationRouter } from "./registration/registration.routes.js";
import { passwordResetRouter } from "./password-reset/password-reset.routes.js";

export const authRouter = Router();

// login: 10 attempts per 15 min per IP+email — brute-force defense. The 401 is
// already enumeration-safe (same response for unknown email / bad password).
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  keyGenerator: (req) => `login:${clientIp(req)}:${bodyEmail(req)}`,
});

// Multi-step verified registration: /auth/register/{start,verify,complete,resend}.
authRouter.use("/register", registrationRouter);

// Forgot-password flow: /auth/password/{forgot,verify,reset,resend}.
authRouter.use("/password", passwordResetRouter);

// DEPRECATED: single-step, unverified registration. Kept temporarily for
// back-compat with the existing frontend register page; new clients should use
// the multi-step /auth/register/* flow above. Remove once the UI has migrated.
// (Mounted AFTER the registrationRouter so /register/start etc. resolve there;
// this only handles a bare POST /register.)
authRouter.post("/register", register);

authRouter.post("/login", loginLimiter, login);
authRouter.get("/me", requireAuth, me);
authRouter.patch("/me", requireAuth, updateMe);
authRouter.post("/change-password", requireAuth, changePassword);
