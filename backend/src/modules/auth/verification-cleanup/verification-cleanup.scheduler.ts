// node-cron driver for the expired-verification sweep. Single-instance + in-memory
// (state resets on restart, does NOT span replicas — move to a durable queue before
// any multi-instance deploy, same caveat as the account-deletion sweep). A
// re-entrancy guard prevents a tick from overlapping a long run. Includes a boot
// one-shot (unlike the weekly digest): the prune is idempotent and has no external
// side effect, so clearing accumulated cruft on deploy is safe.
import cron from "node-cron";
import { pruneExpiredVerifications } from "./verification-cleanup.service.js";

let running = false;

async function tick(): Promise<void> {
  if (running) return; // skip if a previous sweep is still in flight
  running = true;
  try {
    const result = await pruneExpiredVerifications(new Date());
    const total = result.emailVerifications + result.passwordResets + result.emailChanges;
    if (total > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[verification-cleanup] pruned ${total} expired row(s): ` +
          `emailVerifications=${result.emailVerifications}, ` +
          `passwordResets=${result.passwordResets}, emailChanges=${result.emailChanges}`,
      );
    }
  } catch (err) {
    // pruneExpiredVerifications never throws, but guard anyway so a bug can't crash the timer.
    // eslint-disable-next-line no-console
    console.error("[verification-cleanup] sweep failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
  } finally {
    running = false;
  }
}

/** Start the daily prune sweep (03:30 server local) plus a one-shot shortly after boot. */
export function startVerificationCleanupScheduler(): void {
  cron.schedule("30 3 * * *", () => {
    void tick();
  });
  // Clear anything already expired without waiting for the next 03:30.
  const boot = setTimeout(() => {
    void tick();
  }, 10_000);
  boot.unref();
}
