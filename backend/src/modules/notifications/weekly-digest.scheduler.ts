// node-cron driver for the weekly email digest. Single-instance + in-memory
// (state resets on restart, does NOT span replicas — move to a durable queue
// before any multi-instance deploy, same caveat as the account-deletion sweep).
// A re-entrancy guard prevents a fire from overlapping a long run. Unlike the
// deletion sweep there is NO boot one-shot — a digest must not re-send on every
// restart; it fires only on the weekly schedule.
import cron from "node-cron";
import { sendWeeklyDigests } from "./weekly-digest.service.js";

let running = false;

async function tick(): Promise<void> {
  if (running) return; // skip if a previous run is still in flight
  running = true;
  try {
    const result = await sendWeeklyDigests();
    if (result.recipients > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[notifications] weekly digest: ${result.recipients} recipient(s), sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed}`,
      );
    }
  } catch (err) {
    // sendWeeklyDigests never throws, but guard anyway so a bug can't crash the timer.
    // eslint-disable-next-line no-console
    console.error("[notifications] weekly digest run failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
  } finally {
    running = false;
  }
}

/** Start the weekly digest (Mondays 08:00, server local time). */
export function startWeeklyDigestScheduler(): void {
  cron.schedule("0 8 * * 1", () => {
    void tick();
  });
}
