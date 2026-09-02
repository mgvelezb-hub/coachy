-- Golf entra al catálogo de disciplinas. El enum es lista cerrada a propósito
-- (la base rechaza valores inventados), así que ampliarla es una migración.
ALTER TYPE "Discipline" ADD VALUE IF NOT EXISTS 'GOLF';

-- Rondas de golf: las métricas que explican el score (GIR, putts, FIR,
-- castigos — Broadie/strokes gained). Todo salvo el score es opcional: exigir
-- la tarjeta completa mataría el registro.
CREATE TABLE "golf_rounds" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "holes" INTEGER NOT NULL,
  "par" INTEGER,
  "score" INTEGER NOT NULL,
  "putts" INTEGER,
  "fairwaysHit" INTEGER,
  "fairwaysTotal" INTEGER,
  "girHit" INTEGER,
  "penalties" INTEGER,
  "course" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "golf_rounds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "golf_rounds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "golf_rounds_user_id_date_idx" ON "golf_rounds"("user_id", "date");

-- Práctica fuera del campo, separada por tipo: el juego corto y el putting
-- explican más score del que se les practica, y solo registrando el tipo se
-- puede enseñar ese desbalance.
CREATE TABLE "golf_practices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "kind" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "balls" INTEGER,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "golf_practices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "golf_practices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "golf_practices_user_id_date_idx" ON "golf_practices"("user_id", "date");

-- La lista de súper compartida del hogar: lo tachado vive en el vínculo, no
-- en cada perfil — la compra es del hogar, uno tacha en el súper y el otro lo
-- ve desde la casa.
ALTER TABLE "household_links" ADD COLUMN "super_comprados" JSONB;
