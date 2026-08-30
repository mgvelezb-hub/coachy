-- Minutos disponibles por día, declarados una vez para no volver a preguntarlos.
ALTER TABLE "profiles" ADD COLUMN "time_per_day" JSONB;
