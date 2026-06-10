-- Add the `GENERATES` and `DEPLOYED_TO` values to the RelationType enum so the
-- backend matches the frontend `RelationType` union (lib/types.ts). Both were
-- declared on the frontend but missing from the Prisma enum, so the relation
-- controller rejected them. Appended to the end of the type (physical order
-- matches the schema declaration order).
--
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "RelationType" ADD VALUE 'GENERATES';
ALTER TYPE "RelationType" ADD VALUE 'DEPLOYED_TO';
