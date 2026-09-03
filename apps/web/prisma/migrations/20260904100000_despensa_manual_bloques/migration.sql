-- Ajustes tras la primera prueba de Mau (3-sep): despensa disponible que
-- manda sobre la variedad, ejercicios elegidos a mano por tipo de día, y
-- bloques de disciplina que se agregan el día, no en el plan.
ALTER TABLE "profiles" ADD COLUMN "pantry" JSONB;
ALTER TABLE "profiles" ADD COLUMN "manual_exercises" JSONB;
ALTER TABLE "profiles" ADD COLUMN "day_blocks" JSONB;
