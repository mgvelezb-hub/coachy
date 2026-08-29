-- Fase 8: estilos de dieta alternativos y la ventana del ayuno.
CREATE TYPE "DietStyle" AS ENUM ('ESTANDAR', 'AYUNO', 'VEGETARIANA', 'KETO');

ALTER TABLE "profiles"
  ADD COLUMN "diet_style" "DietStyle" NOT NULL DEFAULT 'ESTANDAR',
  ADD COLUMN "fasting_start_hour" INTEGER,
  ADD COLUMN "fasting_end_hour" INTEGER;
