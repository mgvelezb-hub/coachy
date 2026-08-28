-- Registro multi-disciplina (natación, box, squash, CrossFit, funcional,
-- cardio) fuera del modo gimnasio de pesas. Esta fase solo REGISTRA: no
-- prescribe ni genera rutina para estas disciplinas.

-- CreateEnum
CREATE TYPE "Discipline" AS ENUM ('PESAS', 'FUNCIONAL', 'CROSSFIT', 'NATACION', 'BOX', 'SQUASH', 'CARDIO', 'OTRO');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('APP', 'HEALTHKIT');

-- CreateTable
CREATE TABLE "activity_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "source" "ActivitySource" NOT NULL,
    "external_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "date" DATE NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "active_kcal" INTEGER,
    "avg_hr" INTEGER,
    "max_hr" INTEGER,
    "distance_m" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- (user_id, source, external_id) es la llave de idempotencia. Postgres trata
-- cada NULL como distinto en un índice único, así que las sesiones de la app
-- (source = APP, external_id = NULL) nunca chocan entre sí; solo las de
-- HealthKit (external_id = UUID del workout) se corrigen en vez de duplicarse.
CREATE UNIQUE INDEX "activity_sessions_user_id_source_external_id_key" ON "activity_sessions"("user_id", "source", "external_id");

-- CreateIndex
CREATE INDEX "activity_sessions_user_id_started_at_idx" ON "activity_sessions"("user_id", "started_at");

-- AddForeignKey
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
