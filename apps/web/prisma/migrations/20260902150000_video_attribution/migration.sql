-- Atribución del video de cada ejercicio.
--
-- El catálogo dejó de usar clips privados del coach: ahora mezcla video real
-- de wger.de (CC BY-SA 4.0, requiere crédito al autor) y loops generados a
-- partir de las fotos de free-exercise-db (dominio público, no exige crédito
-- pero se etiqueta igual por consistencia). Las tres columnas son opcionales
-- porque siguen existiendo ejercicios sin video, y porque las filas viejas
-- (video del coach, si alguna sobrevive) no tienen de dónde sacar esta info.
ALTER TABLE "exercises"
  ADD COLUMN "video_license" TEXT,
  ADD COLUMN "video_author" TEXT,
  ADD COLUMN "video_source" TEXT;
