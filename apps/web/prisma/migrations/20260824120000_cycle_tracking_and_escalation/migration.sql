-- Fase 7 (ciclo menstrual) y Fase 3 (escalamiento del observatorio).

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'ESCALAMIENTO';

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "cycle_avg_length" INTEGER NOT NULL DEFAULT 28,
ADD COLUMN     "cycle_last_period_start" DATE,
ADD COLUMN     "cycle_tracking_enabled" BOOLEAN NOT NULL DEFAULT false;
