-- Alimentos dados de alta por la persona: lo que su alacena tiene y el
-- catálogo no. Entran al motor con rol, macros por 100 g y porción casera.
CREATE TABLE "custom_foods" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "protein_per_100" DECIMAL(6,2) NOT NULL,
  "carb_per_100" DECIMAL(6,2) NOT NULL,
  "fat_per_100" DECIMAL(6,2) NOT NULL,
  "fiber_per_100" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "serving_unit" TEXT NOT NULL,
  "grams_per_unit" DECIMAL(7,2) NOT NULL,
  "min_units" DECIMAL(5,2) NOT NULL,
  "max_units" DECIMAL(5,2) NOT NULL,
  "tags" TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "custom_foods_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "custom_foods_user_id_idx" ON "custom_foods"("user_id");
ALTER TABLE "custom_foods" ADD CONSTRAINT "custom_foods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
