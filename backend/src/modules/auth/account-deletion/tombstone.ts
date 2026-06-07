// The "Deleted User" tombstone sentinel.
//
// When an account is purged, any of its authorship that lives in SURVIVING
// projects (ones transferred away or that the user only contributed to) is
// reassigned to this single shared sentinel so the history stays honest
// ("created by Deleted User") instead of misattributing the work to a real,
// current user. The sentinel is flagged `isSystem`, has an unusable password,
// is excluded from login / member pickers, and is itself never deletable.
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

// Fixed, non-routable identity for the sentinel. The address is never emailed
// and the password hash ("!") can never match a bcrypt compare, so the row can
// never be logged into even if it somehow surfaced in a lookup.
export const TOMBSTONE_EMAIL = "deleted-user@system.minotaurus.local";
const TOMBSTONE_UNUSABLE_HASH = "!";

// A client that may be the base PrismaClient or a transaction handle. PrismaClient
// is assignable to TransactionClient, so callers can pass either.
type Db = Prisma.TransactionClient;

/**
 * Find-or-create the single tombstone user, returning its id. Idempotent and
 * race-safe: a lost create race (unique-email violation) is resolved by re-reading
 * the row a concurrent caller just created. Call inside the purge transaction so
 * the sentinel is guaranteed to exist before authorship is reassigned to it.
 */
export async function ensureTombstoneUser(db: Db = prisma): Promise<string> {
  const existing = await db.user.findFirst({ where: { isSystem: true }, select: { id: true } });
  if (existing) return existing.id;
  try {
    const created = await db.user.create({
      data: {
        email: TOMBSTONE_EMAIL,
        passwordHash: TOMBSTONE_UNUSABLE_HASH,
        firstName: "Deleted",
        lastName: "User",
        isSystem: true,
      },
      select: { id: true },
    });
    return created.id;
  } catch {
    const row = await db.user.findFirst({ where: { isSystem: true }, select: { id: true } });
    if (row) return row.id;
    throw new Error("Failed to ensure the tombstone user");
  }
}
