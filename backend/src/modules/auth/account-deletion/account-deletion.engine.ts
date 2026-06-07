// Pure logic for the account-deletion flow — no Prisma, no IO, no clock.
//
// Given a flat view of the projects a user is involved in, it answers three
// questions the rest of the flow is built on:
//   1. classifyProjects  — which projects need a user decision vs. just vanish vs.
//      continue without them (the three buckets shown in the deletion wizard).
//   2. validateDeletionPlan — is the submitted per-project plan complete & legal.
//   3. resolveOwnerRepoints — at purge time, which surviving projects still point
//      `ownerId` at the departing user and must be repointed to a new owner FIRST,
//      or the user-delete cascade would destroy a project that should survive.
//
// "Owner" folds in the creator-pointer rule (ARCHITECTURE: Project.ownerId counts
// as an implicit OWNER membership when the owner has no ProjectMember row).
import type { ProjectRole } from "@prisma/client";

export type ProjectAction = "TRANSFER" | "DELETE";

export interface MemberLite {
  userId: string;
  role: ProjectRole;
  name: string;
  email: string;
}

export interface ProjectLite {
  id: string;
  name: string;
  ownerId: string;
  /** ProjectMember rows as stored (the implicit owner may be absent — folded in here). */
  members: MemberLite[];
}

export interface TransferTarget {
  userId: string;
  name: string;
  email: string;
  role: ProjectRole;
}

export interface SimpleProject {
  id: string;
  name: string;
  memberCount: number;
}

export interface SharedOwnedProject extends SimpleProject {
  /** Members (excluding the departing user) who can inherit the project. */
  targets: TransferTarget[];
}

export interface DeletionBuckets {
  /** Sole-owner, no other members → deleted on purge; the export bundle covers them. */
  soloOwned: SimpleProject[];
  /** Sole-owner WITH other members → require a per-project Transfer/Delete decision. */
  sharedOwned: SharedOwnedProject[];
  /** Survive without the user (co-owned, or member-only). Authorship → tombstone; no decision. */
  continuing: SimpleProject[];
}

export interface PlanItem {
  projectId: string;
  action: ProjectAction;
  transferToUserId?: string;
}

export interface OwnerRepoint {
  projectId: string;
  newOwnerId: string;
}

/** Members with the creator-pointer owner folded in as an OWNER when it has no row. */
function normalizedMembers(p: ProjectLite): MemberLite[] {
  if (p.members.some((m) => m.userId === p.ownerId)) return p.members;
  return [...p.members, { userId: p.ownerId, role: "OWNER" as ProjectRole, name: "", email: "" }];
}

/** Set of userIds that are OWNER of a project (creator pointer folded in). */
function ownerIds(p: ProjectLite): Set<string> {
  const owners = new Set(p.members.filter((m) => m.role === "OWNER").map((m) => m.userId));
  if (!p.members.some((m) => m.userId === p.ownerId)) owners.add(p.ownerId);
  return owners;
}

/**
 * Bucket every project the user is involved in. Deterministic: input order is
 * preserved within each bucket. `projects` must be only the projects the user is
 * a member of or the ownerId of.
 */
export function classifyProjects(userId: string, projects: ProjectLite[]): DeletionBuckets {
  const buckets: DeletionBuckets = { soloOwned: [], sharedOwned: [], continuing: [] };
  for (const p of projects) {
    const members = normalizedMembers(p);
    const memberCount = members.length;
    const owners = ownerIds(p);
    const userIsOwner = owners.has(userId);
    const ownersAfter = [...owners].filter((o) => o !== userId);
    const otherMembers = members.filter((m) => m.userId !== userId);

    if (!userIsOwner || ownersAfter.length > 0) {
      // Member-only, or co-owned and another owner remains → continues unchanged.
      buckets.continuing.push({ id: p.id, name: p.name, memberCount });
      continue;
    }
    // Sole owner from here on.
    if (otherMembers.length === 0) {
      buckets.soloOwned.push({ id: p.id, name: p.name, memberCount });
    } else {
      buckets.sharedOwned.push({
        id: p.id,
        name: p.name,
        memberCount,
        targets: otherMembers.map((m) => ({
          userId: m.userId,
          name: m.name,
          email: m.email,
          role: m.role,
        })),
      });
    }
  }
  return buckets;
}

/**
 * Validate a submitted plan against the sharedOwned bucket: every sharedOwned
 * project needs exactly one legal decision, transfer targets must be eligible,
 * and there must be no stray items for projects that don't require a decision.
 * Returns a list of human-readable problems ([] = valid).
 */
export function validateDeletionPlan(sharedOwned: SharedOwnedProject[], plan: PlanItem[]): string[] {
  const errors: string[] = [];
  const planById = new Map(plan.map((p) => [p.projectId, p]));
  const seen = new Set<string>();

  for (const sp of sharedOwned) {
    const item = planById.get(sp.id);
    if (!item) {
      errors.push(`Missing decision for project "${sp.name}".`);
      continue;
    }
    if (item.action === "TRANSFER") {
      if (!item.transferToUserId) {
        errors.push(`Choose who to transfer "${sp.name}" to.`);
      } else if (!sp.targets.some((t) => t.userId === item.transferToUserId)) {
        errors.push(`The selected new owner for "${sp.name}" is not a member of it.`);
      }
    } else if (item.action !== "DELETE") {
      errors.push(`Invalid action for project "${sp.name}".`);
    }
  }

  const sharedIds = new Set(sharedOwned.map((s) => s.id));
  for (const item of plan) {
    if (seen.has(item.projectId)) errors.push(`Duplicate decision for a project.`);
    seen.add(item.projectId);
    if (!sharedIds.has(item.projectId)) {
      errors.push(`A decision was submitted for a project that doesn't need one.`);
    }
  }
  return errors;
}

/**
 * At purge time, determine which surviving projects still have `ownerId` pointing
 * at the departing user and therefore must have ownership repointed BEFORE the
 * user row is deleted (otherwise the Project.ownerId cascade would delete a
 * project that should survive). Covers both:
 *   - co-owned projects that survive automatically (repoint to a remaining owner), and
 *   - sole-owned projects the user chose to TRANSFER (repoint to the chosen target).
 * Projects that should be deleted (solo, or sole-owned + DELETE) are intentionally
 * omitted — the user-delete cascade removes them.
 *
 * `plan` should already be re-validated against current membership by the caller;
 * a TRANSFER whose target is no longer a member is treated as no repoint here.
 */
export function resolveOwnerRepoints(
  userId: string,
  projects: ProjectLite[],
  plan: PlanItem[],
): OwnerRepoint[] {
  const planById = new Map(plan.map((p) => [p.projectId, p]));
  const out: OwnerRepoint[] = [];

  for (const p of projects) {
    if (p.ownerId !== userId) continue; // only the ownerId-cascade is dangerous
    const owners = ownerIds(p);
    if (!owners.has(userId)) continue;
    const ownersAfter = [...owners].filter((o) => o !== userId);

    let newOwnerId: string | undefined;
    if (ownersAfter.length > 0) {
      // Co-owned: survives automatically, hand the pointer to a remaining owner.
      newOwnerId = ownersAfter[0];
    } else {
      // Sole owner: survives only if the user chose to transfer to a valid member.
      const item = planById.get(p.id);
      const members = normalizedMembers(p);
      const validTarget =
        item?.action === "TRANSFER" &&
        item.transferToUserId &&
        members.some((m) => m.userId === item.transferToUserId);
      if (validTarget) newOwnerId = item!.transferToUserId;
    }
    if (newOwnerId) out.push({ projectId: p.id, newOwnerId });
  }
  return out;
}
