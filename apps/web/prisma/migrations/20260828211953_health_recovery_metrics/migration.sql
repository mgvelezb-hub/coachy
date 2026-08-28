-- AlterTable
ALTER TABLE "health_days" ADD COLUMN     "hrv_ms" INTEGER,
ADD COLUMN     "respiratory_rate" DECIMAL(4,1),
ADD COLUMN     "spo2" DECIMAL(4,1),
ADD COLUMN     "stand_hours" INTEGER,
ADD COLUMN     "vo2max" DECIMAL(4,1);
