-- Rango de edad para quien no da su fecha exacta: mejor que suponer 30 años.
ALTER TABLE "profiles" ADD COLUMN "age_range" TEXT;
