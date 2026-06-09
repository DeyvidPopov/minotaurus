// Manually run the weekly email digest now, instead of waiting for the Monday
// 08:00 cron. Same code path as the scheduler (sendWeeklyDigests): emails every
// user with `emailDigestEnabled = true` who has at least one open validation
// issue across their accessible projects. Read-only w.r.t. project state.
//
// Run:  npx tsx scripts/send-weekly-digest.ts   (with the local DB reachable)

import { prisma } from "../src/lib/prisma.js";
import { sendWeeklyDigests } from "../src/modules/notifications/weekly-digest.service.js";

async function main(): Promise<void> {
  const outcome = await sendWeeklyDigests();
  console.log("[weekly-digest] outcome:", outcome);
  console.log(
    `recipients=${outcome.recipients} sent=${outcome.sent} skipped=${outcome.skipped} failed=${outcome.failed}`,
  );
  if (outcome.sent === 0 && outcome.skipped > 0) {
    console.log(
      "\nNo emails sent — opted-in users had no open issues (the digest skips all-clear).",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
