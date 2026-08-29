-- Fase 8: estudios cargados por la atleta. Se guardan y se grafican; la app no los interpreta.
CREATE TYPE "LabKind" AS ENUM ('INBODY', 'QUIMICA');

CREATE TABLE "lab_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "kind" "LabKind" NOT NULL,
  "taken_on" DATE NOT NULL,
  "values_json" JSONB NOT NULL,
  "file_path" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lab_results_user_id_kind_taken_on_key"
  ON "lab_results"("user_id", "kind", "taken_on");
CREATE INDEX "lab_results_user_id_taken_on_idx" ON "lab_results"("user_id", "taken_on");

ALTER TABLE "lab_results"
  ADD CONSTRAINT "lab_results_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
