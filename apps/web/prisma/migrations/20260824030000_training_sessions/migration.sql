-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "session_minutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "workouts" ADD COLUMN     "completed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "workout_sets" (
    "id" UUID NOT NULL,
    "workout_id" UUID NOT NULL,
    "exercise_id" UUID,
    "exercise_name" TEXT NOT NULL,
    "set_index" INTEGER NOT NULL,
    "target_reps" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight_kg" DECIMAL(6,2),
    "rpe" INTEGER,
    "warmup" BOOLEAN NOT NULL DEFAULT false,
    "client_id" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_sets_workout_id_idx" ON "workout_sets"("workout_id");

-- CreateIndex
CREATE INDEX "workout_sets_exercise_id_idx" ON "workout_sets"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_sets_workout_id_client_id_key" ON "workout_sets"("workout_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "workouts_user_id_date_key" ON "workouts"("user_id", "date");

-- AddForeignKey
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

