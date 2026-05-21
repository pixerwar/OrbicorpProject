/*
  Warnings:

  - You are about to drop the column `metadata` on the `BrowserSession` table. All the data in the column will be lost.
  - You are about to drop the column `startedAt` on the `BrowserSession` table. All the data in the column will be lost.
  - The `status` column on the `BrowserSession` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `AgentCard` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CardTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VirtualCard` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AgentCard" DROP CONSTRAINT "AgentCard_agentId_fkey";

-- DropForeignKey
ALTER TABLE "AgentCard" DROP CONSTRAINT "AgentCard_cardId_fkey";

-- DropForeignKey
ALTER TABLE "CardTransaction" DROP CONSTRAINT "CardTransaction_cardId_fkey";

-- DropForeignKey
ALTER TABLE "VirtualCard" DROP CONSTRAINT "VirtualCard_companyId_fkey";

-- AlterTable
ALTER TABLE "BrowserSession" DROP COLUMN "metadata",
DROP COLUMN "startedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- DropTable
DROP TABLE "AgentCard";

-- DropTable
DROP TABLE "CardTransaction";

-- DropTable
DROP TABLE "VirtualCard";

-- DropEnum
DROP TYPE "CardStatus";

-- DropEnum
DROP TYPE "TxStatus";

-- CreateIndex
CREATE INDEX "BrowserSession_companyId_idx" ON "BrowserSession"("companyId");

-- CreateIndex
CREATE INDEX "BrowserSession_status_idx" ON "BrowserSession"("status");
