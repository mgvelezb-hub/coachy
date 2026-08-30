-- Nivel, equipo y ficha de cada ejercicio de gimnasio.
ALTER TABLE "exercises"
  ADD COLUMN "level" TEXT NOT NULL DEFAULT 'PRINCIPIANTE',
  ADD COLUMN "equipment" TEXT NOT NULL DEFAULT 'MAQUINA',
  ADD COLUMN "how_to" TEXT,
  ADD COLUMN "why_for" TEXT,
  ADD COLUMN "watch_out" TEXT;
