-- DropIndex
DROP INDEX "photos_checkin_id_view_key";

-- CreateIndex
CREATE INDEX "photos_checkin_id_view_idx" ON "photos"("checkin_id", "view");
