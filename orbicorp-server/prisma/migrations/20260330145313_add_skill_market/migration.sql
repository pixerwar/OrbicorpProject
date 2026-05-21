/*
  Warnings:

  - You are about to drop the `InstalledSkill` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Skill` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('SKILL', 'TOOL', 'AGENT_TEMPLATE', 'LANGUAGE_PACK', 'WORKFLOW_TEMPLATE');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FREE', 'ONE_TIME', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED', 'REMOVED');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED', 'PENDING_CONFIG');

-- DropForeignKey
ALTER TABLE "InstalledSkill" DROP CONSTRAINT "InstalledSkill_companyId_fkey";

-- DropForeignKey
ALTER TABLE "InstalledSkill" DROP CONSTRAINT "InstalledSkill_skillId_fkey";

-- DropTable
DROP TABLE "InstalledSkill";

-- DropTable
DROP TABLE "Skill";

-- CreateTable
CREATE TABLE "MarketPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "type" "PackageType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorName" TEXT,
    "authorEmail" TEXT,
    "authorUrl" TEXT,
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'FREE',
    "price" DOUBLE PRECISION DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "minVersion" TEXT,
    "providers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "manifest" JSONB NOT NULL,
    "tools" JSONB NOT NULL DEFAULT '[]',
    "configSchema" JSONB NOT NULL DEFAULT '{}',
    "installCount" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT',
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageInstallation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "InstallationStatus" NOT NULL DEFAULT 'ACTIVE',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPackage" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageReview" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketPackage_name_key" ON "MarketPackage"("name");

-- CreateIndex
CREATE INDEX "MarketPackage_type_idx" ON "MarketPackage"("type");

-- CreateIndex
CREATE INDEX "MarketPackage_category_idx" ON "MarketPackage"("category");

-- CreateIndex
CREATE INDEX "MarketPackage_status_idx" ON "MarketPackage"("status");

-- CreateIndex
CREATE INDEX "MarketPackage_isOfficial_idx" ON "MarketPackage"("isOfficial");

-- CreateIndex
CREATE INDEX "PackageInstallation_companyId_idx" ON "PackageInstallation"("companyId");

-- CreateIndex
CREATE INDEX "PackageInstallation_packageId_idx" ON "PackageInstallation"("packageId");

-- CreateIndex
CREATE INDEX "PackageInstallation_status_idx" ON "PackageInstallation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PackageInstallation_companyId_packageId_key" ON "PackageInstallation"("companyId", "packageId");

-- CreateIndex
CREATE INDEX "AgentPackage_agentId_idx" ON "AgentPackage"("agentId");

-- CreateIndex
CREATE INDEX "AgentPackage_installationId_idx" ON "AgentPackage"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPackage_agentId_installationId_key" ON "AgentPackage"("agentId", "installationId");

-- CreateIndex
CREATE INDEX "PackageReview_packageId_idx" ON "PackageReview"("packageId");

-- CreateIndex
CREATE INDEX "PackageReview_rating_idx" ON "PackageReview"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "PackageReview_packageId_companyId_key" ON "PackageReview"("packageId", "companyId");

-- AddForeignKey
ALTER TABLE "PackageInstallation" ADD CONSTRAINT "PackageInstallation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageInstallation" ADD CONSTRAINT "PackageInstallation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "MarketPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPackage" ADD CONSTRAINT "AgentPackage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPackage" ADD CONSTRAINT "AgentPackage_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "PackageInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageReview" ADD CONSTRAINT "PackageReview_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "MarketPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
