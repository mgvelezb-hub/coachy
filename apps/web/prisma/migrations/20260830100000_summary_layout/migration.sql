-- Resumen configurable: qué paneles se ven, en qué orden y con cuánto detalle.
ALTER TABLE "profiles" ADD COLUMN "summary_layout" JSONB;
