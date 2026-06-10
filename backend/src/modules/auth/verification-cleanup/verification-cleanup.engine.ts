// Pure where-clause builders for the expired-verification sweep. No IO/clock —
// `now` is injected so the same input gives a deep-equal result (colocated test).
//
// These three tables (EmailVerification, PasswordReset, EmailChange) are all
// "pending state, deleted on success, pruned opportunistically when expired".
// The opportunistic prune only fires when the SAME email/user retries, so an
// abandoned-and-never-retried row lingers forever. This sweep catches those.
//
// Invariant — never delete a row the user could still complete. After the code
// is verified, EmailVerification/PasswordReset hold a live short-lived handoff
// token (registration/reset token, ~15m); the row is only dead once THAT token
// has also expired. Since the token expiry (verify + 15m) is always later than
// the code expiry (create + 10m), a row is dead exactly when its code window has
// passed AND it carries no still-live handoff token — the OR guard below.

import type { Prisma } from "@prisma/client";

/** EmailVerification rows whose code window AND any live registration token have lapsed. */
export function deadEmailVerificationWhere(now: Date): Prisma.EmailVerificationWhereInput {
  return {
    expiresAt: { lt: now },
    OR: [
      { registrationTokenExpiresAt: null },
      { registrationTokenExpiresAt: { lt: now } },
    ],
  };
}

/** PasswordReset rows whose code window AND any live reset token have lapsed. */
export function deadPasswordResetWhere(now: Date): Prisma.PasswordResetWhereInput {
  return {
    expiresAt: { lt: now },
    OR: [
      { resetTokenExpiresAt: null },
      { resetTokenExpiresAt: { lt: now } },
    ],
  };
}

/** EmailChange rows whose code window has lapsed (no handoff token — it's 2-step). */
export function deadEmailChangeWhere(now: Date): Prisma.EmailChangeWhereInput {
  return { expiresAt: { lt: now } };
}
