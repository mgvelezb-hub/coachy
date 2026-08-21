-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ATHLETE');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "Phase" AS ENUM ('REINTRO', 'BASE', 'CUT', 'CUT_AGRESIVO', 'REFEED', 'ESTABILIZACION', 'MANTENIMIENTO');

-- CreateEnum
CREATE TYPE "Goal" AS ENUM ('RECOMPOSICION', 'PERDIDA_GRASA', 'GANANCIA_MUSCULO', 'SALUD', 'RENDIMIENTO');

-- CreateEnum
CREATE TYPE "WorkSchedule" AS ENUM ('SEDENTARIO', 'ACTIVO');

-- CreateEnum
CREATE TYPE "TrainingTime" AS ENUM ('MANANA', 'MEDIODIA', 'TARDE', 'NOCHE');

-- CreateEnum
CREATE TYPE "Budget" AS ENUM ('BAJO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "StrengthTrend" AS ENUM ('SUBE', 'IGUAL', 'BAJA');

-- CreateEnum
CREATE TYPE "CyclePhase" AS ENUM ('FOLICULAR', 'OVULACION', 'LUTEA', 'MENSTRUACION', 'NA');

-- CreateEnum
CREATE TYPE "PhotoView" AS ENUM ('FRENTE', 'PERFIL', 'ESPALDA');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PENDIENTE', 'APROBADA', 'CORREGIDA');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('COACHY', 'ATHLETE');

-- CreateEnum
CREATE TYPE "TrainingExampleSource" AS ENUM ('COACH', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ATHLETE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "sex" "Sex" NOT NULL,
    "birth_date" DATE,
    "height_cm" DECIMAL(5,1) NOT NULL,
    "weight_kg" DECIMAL(5,1),
    "lean_mass_kg" DECIMAL(5,1),
    "lifting_days" INTEGER NOT NULL DEFAULT 4,
    "cardio_min_wk" INTEGER NOT NULL DEFAULT 0,
    "work" "WorkSchedule" NOT NULL DEFAULT 'SEDENTARIO',
    "training_time" "TrainingTime" NOT NULL DEFAULT 'MANANA',
    "meals_per_day" INTEGER NOT NULL DEFAULT 4,
    "budget" "Budget" NOT NULL DEFAULT 'MEDIO',
    "favorite_foods" TEXT[],
    "excluded_foods" TEXT[],
    "allergies" TEXT[],
    "conditions" TEXT[],
    "goal" "Goal" NOT NULL DEFAULT 'RECOMPOSICION',
    "currentPhase" "Phase" NOT NULL DEFAULT 'REINTRO',
    "engine_config" JSONB,
    "photo_consent_at" TIMESTAMP(3),
    "photo_consent_version" TEXT,
    "onboarding_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkins" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "weight_kg" DECIMAL(5,1),
    "waist_cm" DECIMAL(5,1),
    "leg_left_cm" DECIMAL(5,1),
    "leg_right_cm" DECIMAL(5,1),
    "arm_left_cm" DECIMAL(5,1),
    "arm_right_cm" DECIMAL(5,1),
    "inflammation" INTEGER NOT NULL,
    "energy" INTEGER NOT NULL,
    "hunger" INTEGER NOT NULL,
    "satiety" INTEGER NOT NULL,
    "sleep" INTEGER NOT NULL,
    "strength_rpe" INTEGER,
    "strength_trend" "StrengthTrend",
    "diet_compliance" INTEGER NOT NULL,
    "training_compliance" INTEGER NOT NULL,
    "symptoms" TEXT[],
    "cycle_phase" "CyclePhase",
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "checkin_id" UUID NOT NULL,
    "view" "PhotoView" NOT NULL,
    "storage_path" TEXT NOT NULL,
    "analysis_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions" (
    "id" UUID NOT NULL,
    "checkin_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "phase" "Phase" NOT NULL,
    "kcal" INTEGER NOT NULL,
    "protein_g" INTEGER NOT NULL,
    "fat_g" INTEGER NOT NULL,
    "carbs_g" INTEGER NOT NULL,
    "fiber_g" INTEGER,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PENDIENTE',
    "corrected_by_id" UUID,
    "corrected_json" JSONB,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "menu_number" INTEGER NOT NULL,
    "meals_json" JSONB NOT NULL,
    "equivalences_json" JSONB NOT NULL,
    "grocery_list_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workouts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "muscle_group" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "exercises_json" JSONB NOT NULL,
    "loads_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "muscle_group" TEXT NOT NULL,
    "pool_role" TEXT NOT NULL,
    "video_url" TEXT,
    "substitutes" TEXT[],
    "is_tracker" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foods" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kcal" DECIMAL(6,2) NOT NULL,
    "protein_g" DECIMAL(6,2) NOT NULL,
    "carbs_g" DECIMAL(6,2) NOT NULL,
    "fat_g" DECIMAL(6,2) NOT NULL,
    "fiber_g" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "gi" INTEGER,
    "cost_rel" INTEGER NOT NULL DEFAULT 2,
    "prep_min" INTEGER NOT NULL DEFAULT 10,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" "ConversationRole" NOT NULL,
    "text" TEXT NOT NULL,
    "context_json" JSONB,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_examples" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "context_json" JSONB NOT NULL,
    "approved_response" TEXT NOT NULL,
    "source" "TrainingExampleSource" NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "checkins_user_id_date_idx" ON "checkins"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "checkins_user_id_date_key" ON "checkins"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "photos_checkin_id_view_key" ON "photos"("checkin_id", "view");

-- CreateIndex
CREATE UNIQUE INDEX "decisions_checkin_id_key" ON "decisions"("checkin_id");

-- CreateIndex
CREATE INDEX "decisions_user_id_status_idx" ON "decisions"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plans_decision_id_menu_number_key" ON "meal_plans"("decision_id", "menu_number");

-- CreateIndex
CREATE INDEX "workouts_user_id_date_idx" ON "workouts"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_name_key" ON "exercises"("name");

-- CreateIndex
CREATE INDEX "exercises_muscle_group_idx" ON "exercises"("muscle_group");

-- CreateIndex
CREATE UNIQUE INDEX "foods_name_key" ON "foods"("name");

-- CreateIndex
CREATE INDEX "foods_role_idx" ON "foods"("role");

-- CreateIndex
CREATE INDEX "conversations_user_id_date_idx" ON "conversations"("user_id", "date");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "checkins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "checkins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_corrected_by_id_fkey" FOREIGN KEY ("corrected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_examples" ADD CONSTRAINT "training_examples_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
