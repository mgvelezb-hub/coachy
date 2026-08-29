-- Fase 6: las preferencias que sí mandan sobre la planeación.
ALTER TABLE "profiles"
  ADD COLUMN "max_prep_min" INTEGER,
  ADD COLUMN "avoid_repeat_groups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "primary_discipline" "Discipline" NOT NULL DEFAULT 'PESAS',
  ADD COLUMN "other_disciplines" JSONB;
