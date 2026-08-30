-- Confirmación de comidas: el apego a la dieta deja de depender de la memoria del domingo.
CREATE TABLE "meal_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "slot" TEXT NOT NULL,
  "taken" BOOLEAN NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "meal_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meal_logs_user_id_date_slot_key" ON "meal_logs"("user_id", "date", "slot");
CREATE INDEX "meal_logs_user_id_date_idx" ON "meal_logs"("user_id", "date");

ALTER TABLE "meal_logs"
  ADD CONSTRAINT "meal_logs_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
