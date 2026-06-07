// node-cron driver for the account-deletion purge. Single-instance + in-memory:
// state resets on restart and does NOT span replicas — move to a durable queue
// (the same one the automated-export feature will need) before any multi-instance
// deploy. A re-entrancy guard prevents an hourly tick from overlapping a long run.
import cron from "node-cron";
import { purgeDueAccounts } from "./account-deletion.purge.js";

let running = false;

async function tick(): Promise<void> {
  if (running) return; // skip if a previous sweep is still in flight
  running = true;
  try {
    const result = await purgeDueAccounts(new Date());
    if (result.processed > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[account-deletion] purge sweep: processed ${result.processed}, purged ${result.purged}`,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[account-deletion] purge sweep failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
  } finally {
    running = false;
  }
}

/** Start the hourly purge sweep plus a one-shot sweep shortly after boot. */
export function startAccountDeletionScheduler(): void {
  cron.schedule("0 * * * *", () => {
    void tick();
  });
  // Catch anything already past its grace window without waiting for the hour.
  const boot = setTimeout(() => {
    void tick();
  }, 10_000);
  boot.unref();
}
