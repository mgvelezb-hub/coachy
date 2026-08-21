-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('RECORDATORIO_CHECKIN', 'CHECKIN_PENDIENTE', 'MENSAJE_COACHY', 'ALERTA_ABANDONO');

-- AlterTable
ALTER TABLE "decisions" ADD COLUMN     "menu_seed" INTEGER,
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "question_ids" TEXT[],
ADD COLUMN     "reply_json" JSONB,
ADD COLUMN     "vision_json" JSONB;

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
