-- Bloques cambiados por fecha: {"2026-09-01": "PESAS"}. Hoy tocaba squash pero
-- la cancha estaba ocupada; antes la única salida era no entrenar. Es una
-- excepción de ese día, no un cambio de plan.
ALTER TABLE "profiles" ADD COLUMN "block_overrides" JSONB;
