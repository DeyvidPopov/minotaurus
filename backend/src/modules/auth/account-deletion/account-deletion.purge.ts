// The permanent purge — runs at/after AccountDeletion.scheduledFor, executing the
// plan recorded at request time. This is the ONLY destructive step; everything up
// to here was reversible. Driven by the node-cron scheduler (see server.ts) and
// callable directly in tests.
//
// Teardown order inside one transaction is load-bearing:
//   1. Repoint ownership of SURVIVING projects off the departing user FIRST —
//      otherwise the Project.ownerId cascade (step 3) would delete a project that
//      should survive (a co-owned project, or one being transferred).
//   2. Reassign every surviving authorship pointer (the 9 Restrict FKs + the
//      no-FK aiSession.appliedById) to the tombstone, so the user row no longer
//      has anything referencing it.
//   3. Delete the user — the cascade then removes exactly the projects still
//      owned by them (solo + chosen-DELETE), their memberships, prefs, email
//      change, and the AccountDeletion row.
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import {
  resolveOwnerRepoints,
  type PlanItem,
  type ProjectLite,
} from "./account-deletion.engine.js";
import { assembleUserProjects } from "./account-deletion.service.js";
import { ensureTombstoneUser } from "./tombstone.js";

/**
 * Re-validate stored TRANSFER targets against CURRENT membership (a target can be
 * removed during the 30-day window): retarget a stale transfer to another
 * remaining member so the project still survives, else fall through to DELETE.
 */
function reconcilePlan(userId: string, projects: ProjectLite[], plan: PlanItem[]): PlanItem[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return plan.map((item) => {
    if (item.action !== "TRANSFER" || !item.transferToUserId) return item;
    const p = byId.get(item.projectId);
    if (!p) return item;
    const targetStillMember = p.members.some(
      (m) => m.userId === item.transferToUserId && m.userId !== userId,
    );
    if (targetStillMember) return item;
    const fallback = p.members.find((m) => m.userId !== userId);
    return fallback
      ? { ...item, transferToUserId: fallback.userId }
      : { projectId: item.projectId, action: "DELETE" as const };
  });
}

/** Reassign every authorship pointer held by `userId` to the tombstone. */
async function reassignAuthorship(
  tx: Prisma.TransactionClient,
  userId: string,
  tombstoneId: string,
): Promise<void> {
  const byCreator = { createdById: userId } as const;
  const toTomb = { createdById: tombstoneId } as const;
  await tx.artifact.updateMany({ where: byCreator, data: toTomb });
  await tx.artifactRelation.updateMany({ where: byCreator, data: toTomb });
  await tx.apiSpec.updateMany({ where: byCreator, data: toTomb });
  await tx.databaseModel.updateMany({ where: byCreator, data: toTomb });
  await tx.diagram.updateMany({ where: byCreator, data: toTomb });
  await tx.exportPackage.updateMany({ where: byCreator, data: toTomb });
  await tx.ingestionRecord.updateMany({ where: byCreator, data: toTomb });
  await tx.aiSession.updateMany({ where: byCreator, data: toTomb });
  await tx.versionEvent.updateMany({
    where: { triggeredById: userId },
    data: { triggeredById: tombstoneId },
  });
  await tx.aiSession.updateMany({
    where: { appliedById: userId },
    data: { appliedById: tombstoneId },
  });
}

export interface PurgeResult {
  status: "purged" | "skipped";
  reason?: string;
}

/**
 * Permanently delete one account per its recorded plan. Idempotent against
 * reactivation: if the account is no longer flagged (undone during the grace
 * window) it is skipped.
 */
export async function purgeAccount(userId: string): Promise<PurgeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accountDeletion: true },
  });
  if (!user) return { status: "skipped", reason: "user already gone" };
  if (user.isSystem) return { status: "skipped", reason: "system user" };
  if (!user.deletedAt || !user.accountDeletion) {
    return { status: "skipped", reason: "no longer pending (reactivated)" };
  }

  const projects = await assembleUserProjects(userId);
  const storedPlan = Array.isArray(user.accountDeletion.plan)
    ? (user.accountDeletion.plan as unknown as PlanItem[])
    : [];
  const effectivePlan = reconcilePlan(userId, projects, storedPlan);
  const repoints = resolveOwnerRepoints(userId, projects, effectivePlan);

  await prisma.$transaction(
    async (tx) => {
      const tombstoneId = await ensureTombstoneUser(tx);

      for (const r of repoints) {
        await tx.project.update({ where: { id: r.projectId }, data: { ownerId: r.newOwnerId } });
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: r.projectId, userId: r.newOwnerId } },
          create: { projectId: r.projectId, userId: r.newOwnerId, role: "OWNER" },
          update: { role: "OWNER" },
        });
      }

      await reassignAuthorship(tx, userId, tombstoneId);
      await tx.user.delete({ where: { id: userId } });
    },
    { timeout: 30_000 },
  );

  return { status: "purged" };
}

/** Find and purge every account whose grace window has elapsed. Never throws. */
export async function purgeDueAccounts(now: Date): Promise<{ processed: number; purged: number }> {
  const due = await prisma.accountDeletion.findMany({
    where: { scheduledFor: { lte: now } },
    select: { userId: true },
  });
  let purged = 0;
  for (const d of due) {
    try {
      const result = await purgeAccount(d.userId);
      if (result.status === "purged") purged += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[account-deletion] purge failed", {
        userId: d.userId,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return { processed: due.length, purged };
}
