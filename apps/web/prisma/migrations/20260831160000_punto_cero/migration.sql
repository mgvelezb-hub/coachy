-- El "punto cero": el check-in que la persona declaró como su referencia.
-- Quien regresa tras meses parada arrastra un historial que ya no la describe;
-- comparar contra su primer registro de hace un año convierte cualquier avance
-- en un retroceso. Con esto la vara se mueve sin borrar nada del historial.
-- ON DELETE SET NULL: si ese check-in se borra, se vuelve a la vara de antes
-- (el primer registro) en vez de dejar el perfil apuntando a un id muerto.
ALTER TABLE "profiles" ADD COLUMN "baseline_check_in_id" UUID;

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_baseline_check_in_id_key" UNIQUE ("baseline_check_in_id");

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_baseline_check_in_id_fkey"
  FOREIGN KEY ("baseline_check_in_id") REFERENCES "checkins"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
