-- Suplementos que la persona tiene: el plan solo sugiere lo que ya puede tomar.
ALTER TABLE "profiles" ADD COLUMN "supplements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
