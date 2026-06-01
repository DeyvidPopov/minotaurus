-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultProjectId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultProjectId_fkey" FOREIGN KEY ("defaultProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
