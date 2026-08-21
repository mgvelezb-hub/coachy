# Coachy

Coach virtual de nutrición y entrenamiento. Replica el ciclo de un coach real: check-in semanal (medidas, fotos, sensaciones) → análisis → decisión de fase/macros por motor determinista → menús y rutina → validación humana.

Monorepo: `packages/engine` (motor puro, TS) · `apps/web` (Next.js 15 + Supabase).

Repo público: no contiene datos de ninguna persona. Los datos viven en Supabase, por usuario.
