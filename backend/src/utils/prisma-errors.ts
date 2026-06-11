import { Prisma } from "@prisma/client";

/**
 * True for a Prisma unique-constraint (P2002) violation. Controllers catch their
 * create/update and map this to a 409 with their OWN per-entity code/message
 * (ENDPOINT_EXISTS / ENTITY_NAME_TAKEN / FIELD_NAME_TAKEN / RELATION_EXISTS /
 * ALREADY_MEMBER) — only the error test is shared, never the response.
 */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
