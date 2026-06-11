// Account-deletion orchestration (the IO layer over the pure engine).
//
// Soft-delete first: a request only records INTENT (the per-project plan + a
// scheduled purge time) and flags User.deletedAt. Nothing is transferred or
// deleted until the purge job runs (see account-deletion.purge.ts). That makes
// undo trivial — clear the flag, drop the row. Mirrors the password-reset /
// email-change shape: a sha256-hashed single-use token backs the undo email link.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { HttpError } from "../../../utils/response.js";
import { hashToken } from "../auth-crypto.js";
import {
  classifyProjects,
  validateDeletionPlan,
  type DeletionBuckets,
  type PlanItem,
  type ProjectLite,
} from "./account-deletion.engine.js";

/** Grace window between request and permanent purge. */
export const DELETION_GRACE_DAYS = 30;

function memberName(u: { firstName: string; lastName: string; email: string }): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
}

/**
 * Assemble the flat ProjectLite[] the pure engine works on: every project the
 * user owns or is a member of, with member identity folded in. Shared by the
 * preview, the request validation, and the purge.
 */
export async function assembleUserProjects(userId: string): Promise<ProjectLite[]> {
  const projects = await prisma.project.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    orderBy: { createdAt: "asc" },
    include: {
      members: {
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
  });
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    ownerId: p.ownerId,
    members: p.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      name: memberName(m.user),
      email: m.user.email,
    })),
  }));
}

export interface DeletionPreview extends DeletionBuckets {
  graceDays: number;
}

/** Read-only classification for the deletion wizard. */
export async function getDeletionPreview(userId: string): Promise<DeletionPreview> {
  const projects = await assembleUserProjects(userId);
  const buckets = classifyProjects(userId, projects);
  return { ...buckets, graceDays: DELETION_GRACE_DAYS };
}

export interface RequestResult {
  scheduledFor: Date;
  /** Plaintext single-use undo token — used only to build the email link; never persisted. */
  undoToken: string;
  buckets: DeletionBuckets;
  /** Recipient contact for the confirmation/export emails (the verified account address). */
  email: string;
  firstName: string;
}

/** Projects the user OWNS (sole or co-owner) — the scope of the personal data export. */
export async function listOwnedProjectsForExport(
  userId: string,
): Promise<{ id: string; name: string }[]> {
  return prisma.project.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId, role: "OWNER" } } }] },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Current pending-deletion state for the reactivation banner. */
export async function getDeletionStatus(
  userId: string,
): Promise<{ pending: boolean; scheduledFor: Date | null }> {
  const row = await prisma.accountDeletion.findUnique({
    where: { userId },
    select: { scheduledFor: true },
  });
  return { pending: !!row, scheduledFor: row?.scheduledFor ?? null };
}

/**
 * Initiate deletion: verify the password, validate the plan against the current
 * project state, then (transactionally) flag the account and persist the plan +
 * schedule. Returns the plaintext undo token so the caller can build the email
 * link. Executes nothing destructive.
 */
export async function requestAccountDeletion(
  userId: string,
  password: string,
  plan: PlanItem[],
  now: Date,
): Promise<RequestResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "User not found");
  if (user.isSystem) throw new HttpError(403, "FORBIDDEN", "This account cannot be deleted");

  const okPw = await bcrypt.compare(password, user.passwordHash);
  if (!okPw) throw new HttpError(401, "INVALID_CREDENTIALS", "That password is incorrect");

  const projects = await assembleUserProjects(userId);
  const buckets = classifyProjects(userId, projects);
  const errors = validateDeletionPlan(buckets.sharedOwned, plan);
  if (errors.length > 0) {
    throw new HttpError(400, "DELETION_PLAN_INVALID", "Resolve every shared project first", {
      problems: errors,
    });
  }

  const undoToken = randomBytes(32).toString("hex");
  const undoTokenHash = hashToken(undoToken);
  const scheduledFor = new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const planJson = plan as unknown as Prisma.InputJsonValue;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { deletedAt: now } });
    await tx.accountDeletion.upsert({
      where: { userId },
      create: { userId, plan: planJson, scheduledFor, undoTokenHash },
      update: { plan: planJson, scheduledFor, undoTokenHash, requestedAt: now },
    });
  });

  return { scheduledFor, undoToken, buckets, email: user.email, firstName: user.firstName };
}

/** Clear a pending deletion via the one-click email token (works while signed out). */
export async function cancelAccountDeletionByToken(token: string): Promise<void> {
  const row = await prisma.accountDeletion.findFirst({ where: { undoTokenHash: hashToken(token) } });
  if (!row) throw new HttpError(404, "DELETION_NOT_FOUND", "This undo link is no longer valid");
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { deletedAt: null } }),
    prisma.accountDeletion.delete({ where: { userId: row.userId } }),
  ]);
}

/** Clear a pending deletion for an authenticated user (the in-app reactivate banner). */
export async function reactivateAccount(userId: string): Promise<void> {
  const row = await prisma.accountDeletion.findUnique({ where: { userId } });
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { deletedAt: null } }),
    ...(row ? [prisma.accountDeletion.delete({ where: { userId } })] : []),
  ]);
}
