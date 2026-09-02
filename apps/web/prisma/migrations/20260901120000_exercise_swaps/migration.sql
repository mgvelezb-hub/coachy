-- Ejercicios que la persona ya cambió, y por cuál. Cambiar un ejercicio a
-- media sesión resolvía ese día y nada más: a la semana siguiente el generador
-- volvía a proponer el mismo que ya se había rechazado. Un cambio repetido es
-- una preferencia, no una casualidad.
ALTER TABLE "profiles" ADD COLUMN "exercise_swaps" JSONB;
