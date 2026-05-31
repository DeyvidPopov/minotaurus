-- AlterEnum
ALTER TYPE "AiSessionKind" ADD VALUE 'REVIEW';

-- AlterTable
ALTER TABLE "AiSession" ADD COLUMN     "analysisHash" TEXT;
