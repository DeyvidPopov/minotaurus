// Deletes expired pending-verification rows across the three flow tables. Never
// throws: each table is swept independently so one failing delete can't block the
// others, and a failure is logged with a scalar (never row contents or secrets).
// Driven by the node-cron scheduler (see server.ts) and callable directly in tests.
import { prisma } from "../../../lib/prisma.js";
import {
  deadEmailChangeWhere,
  deadEmailVerificationWhere,
  deadPasswordResetWhere,
} from "./verification-cleanup.engine.js";

export interface PruneResult {
  emailVerifications: number;
  passwordResets: number;
  emailChanges: number;
}

async function safeDelete(label: string, run: () => Promise<{ count: number }>): Promise<number> {
  try {
    const { count } = await run();
    return count;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[verification-cleanup] prune failed", {
      table: label,
      error: err instanceof Error ? err.message : "unknown",
    });
    return 0;
  }
}

/** Remove every fully-expired pending verification/reset/email-change row. */
export async function pruneExpiredVerifications(now: Date): Promise<PruneResult> {
  const emailVerifications = await safeDelete("EmailVerification", () =>
    prisma.emailVerification.deleteMany({ where: deadEmailVerificationWhere(now) }),
  );
  const passwordResets = await safeDelete("PasswordReset", () =>
    prisma.passwordReset.deleteMany({ where: deadPasswordResetWhere(now) }),
  );
  const emailChanges = await safeDelete("EmailChange", () =>
    prisma.emailChange.deleteMany({ where: deadEmailChangeWhere(now) }),
  );
  return { emailVerifications, passwordResets, emailChanges };
}
