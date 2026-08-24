-- Fase 8 — datos del reloj (Apple Watch / Salud) sin app nativa.
--
-- Los sube un Atajo de iOS con el token del atleta. Un día es una fila; la
-- unicidad de (user_id, date) es lo que hace idempotente el reenvío.

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "health_ingest_token" UUID;

-- CreateTable
CREATE TABLE "health_days" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "steps" INTEGER,
    "active_kcal" INTEGER,
    "exercise_min" INTEGER,
    "sleep_min" INTEGER,
    "resting_hr" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'atajo-ios',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_health_ingest_token_key" ON "profiles"("health_ingest_token");

-- CreateIndex
CREATE INDEX "health_days_user_id_date_idx" ON "health_days"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "health_days_user_id_date_key" ON "health_days"("user_id", "date");

-- AddForeignKey
ALTER TABLE "health_days" ADD CONSTRAINT "health_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
