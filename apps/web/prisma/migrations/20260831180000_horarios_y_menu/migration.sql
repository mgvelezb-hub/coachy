-- Horarios de comida propios. El motor sugiere una hora por tiempo de comida
-- a partir de una jornada estándar que no es la de todo el mundo; un horario
-- que no se cumple vuelve inútil el recordatorio. Solo se guarda lo que la
-- persona movió: {"COMIDA": "15:00"}.
ALTER TABLE "profiles" ADD COLUMN "meal_times" JSONB;

-- Cuál de los dos menús de la semana se va a cocinar. Cambia la lista de
-- súper: comprar para dos menús cuando solo se cocina uno es tirar comida.
ALTER TABLE "profiles" ADD COLUMN "menu_preference" TEXT NOT NULL DEFAULT 'AMBOS';
