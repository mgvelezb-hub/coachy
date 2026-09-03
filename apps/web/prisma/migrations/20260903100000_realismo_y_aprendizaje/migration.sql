-- Plan de septiembre 2026: realismo de porciones, comidas que aprenden y
-- split propio. Una sola migración porque las tres cosas llegan juntas y
-- Vercel corre `prisma migrate deploy` en cada build.

-- Estilo "menú fijo de coach": el mismo día repetido toda la semana.
ALTER TYPE "DietStyle" ADD VALUE IF NOT EXISTS 'MENU_FIJO';

-- El registro de comida deja de ser un booleano: guarda la hora planeada, la
-- hora real y el motivo cuando no se hizo. Con eso el ciclo semanal puede
-- proponer horarios que sí se cumplen.
ALTER TABLE "meal_logs" ADD COLUMN "planned_at" TEXT;
ALTER TABLE "meal_logs" ADD COLUMN "taken_at" TIMESTAMP(3);
ALTER TABLE "meal_logs" ADD COLUMN "skipped" TEXT;

-- Horarios por día de la semana (fin de semana distinto) y split fijado por
-- la persona (3 inferior / 3 superior, PPL x2, o el que traiga su coach).
ALTER TABLE "profiles" ADD COLUMN "meal_times_by_day" JSONB;
ALTER TABLE "profiles" ADD COLUMN "custom_split" JSONB;
