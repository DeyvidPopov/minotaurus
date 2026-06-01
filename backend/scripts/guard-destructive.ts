// CLI safety gate for destructive npm scripts that are NOT themselves TS we
// control (e.g. `prisma migrate reset`). Used as a prefix:
//   "prisma:reset": "tsx scripts/guard-destructive.ts && prisma migrate reset --force"
// Exits 0 if the target database is a safe local dev DB, 1 (blocking the chained
// command) otherwise. Prints only the parsed host in the reason — never the URL.
import { assertDestructiveAllowed } from "../src/lib/destructive-guard.js";

try {
  assertDestructiveAllowed();
  // eslint-disable-next-line no-console
  console.error("[guard] destructive command allowed against local database.");
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
