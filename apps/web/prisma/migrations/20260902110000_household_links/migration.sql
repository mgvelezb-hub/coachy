-- Vínculo entre dos cuentas que viven juntas (pareja, roommates). Esta tabla
-- es solo la BASE: hoy no comparte nada todavía y no hay UI en la app que la
-- use. Se construye ahora porque lo que sí viene pronto (lista de súper
-- compartida, ver el menú del otro) necesita primero saber QUIÉN está
-- vinculado con quién.
--
-- El vínculo se hace por CÓDIGO, no buscando cuentas por correo: dejar que
-- una cuenta busque a otra por email expondría quién más usa la app. El
-- código (6 caracteres, alfabeto sin ambigüedades) se comparte fuera de la
-- app y solo sirve para aceptar una invitación concreta.
--
-- Genérico a propósito: el vínculo (quién está unido con quién) es
-- independiente de QUÉ se comparte, para no tener que rehacer esta tabla
-- cuando llegue el segundo caso de uso después de la lista de súper.
CREATE TABLE "household_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "inviter_id" UUID NOT NULL,
  "invitee_id" UUID,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "dissolved_at" TIMESTAMP(3),

  CONSTRAINT "household_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "household_links_code_key" ON "household_links"("code");
CREATE INDEX "household_links_inviter_id_idx" ON "household_links"("inviter_id");
CREATE INDEX "household_links_invitee_id_idx" ON "household_links"("invitee_id");

-- Quien invitó: si la cuenta se borra, el vínculo se va con ella.
ALTER TABLE "household_links"
  ADD CONSTRAINT "household_links_inviter_id_fkey" FOREIGN KEY ("inviter_id")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Quien aceptó: si esa cuenta se borra, el vínculo NO se borra con ella —
-- se queda como registro histórico con invitee_id en null.
ALTER TABLE "household_links"
  ADD CONSTRAINT "household_links_invitee_id_fkey" FOREIGN KEY ("invitee_id")
  REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
