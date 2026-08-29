-- Fase 7: nivel de natación, para prescribir la primera disciplina fuera de las pesas.
CREATE TYPE "SwimLevel" AS ENUM ('PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO');

ALTER TABLE "profiles"
  ADD COLUMN "swim_level" "SwimLevel" NOT NULL DEFAULT 'PRINCIPIANTE';
