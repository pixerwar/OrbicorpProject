-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "isMain" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "modelProvider" DROP NOT NULL,
ALTER COLUMN "modelId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "llmConfig" JSONB NOT NULL DEFAULT '{}';
