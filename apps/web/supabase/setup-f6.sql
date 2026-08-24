-- ---------------------------------------------------------------------------
-- Coachy — Fase 6: fotos de referencia del objetivo
--
--   set -a && . ./.env.local && set +a
--   psql "$DIRECT_URL" -f supabase/setup-f6.sql
--
-- Es idempotente. Corre después de `setup.sql`.
--
-- ## Por qué no hay tabla
--
-- Las referencias del objetivo viven en el bucket privado que ya existe,
-- `progress-photos`, bajo:
--
--     {user_id}/goal/{vista}.jpg          -- frente.jpg | perfil.jpg | espalda.jpg
--
-- Las fotos del check-in ya usan `{user_id}/{checkin_id}/{vista}.jpg`, y como
-- `checkin_id` es un uuid, el prefijo literal `goal` no puede colisionar con
-- ninguna.
--
-- Y sobre todo: las políticas de `setup.sql` atan la PRIMERA CARPETA de la ruta
-- a `auth.uid()`, no la segunda. Es decir, `goal/` ya está protegido por lo que
-- está instalado — cada atleta solo lee y escribe dentro de su propia carpeta.
-- Una tabla `goal_photos` solo duplicaría lo que `storage.list` ya sabe
-- (existencia y `updated_at`) y agregaría una segunda fuente de verdad capaz de
-- desincronizarse del bucket. Por eso esta fase NO trae migración de Prisma.
--
-- Lo que sí hace este archivo:
--   1. Reafirma las cuatro políticas del bucket, por si un entorno quedó atrás.
--   2. Verifica en voz alta que una ruta `{uid}/goal/frente.jpg` cae dentro del
--      alcance de esas políticas, para que nadie tenga que deducirlo.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Políticas del bucket privado (idénticas a setup.sql, reafirmadas)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists progress_photos_read on storage.objects;
create policy progress_photos_read on storage.objects
  for select using (
    bucket_id = 'progress-photos'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists progress_photos_insert on storage.objects;
create policy progress_photos_insert on storage.objects
  for insert with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists progress_photos_update on storage.objects;
create policy progress_photos_update on storage.objects
  for update using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists progress_photos_delete on storage.objects;
create policy progress_photos_delete on storage.objects
  for delete using (
    bucket_id = 'progress-photos'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- ---------------------------------------------------------------------------
-- 2. Comprobación: la ruta del objetivo cae en la carpeta del dueño
--
-- `storage.foldername('<uid>/goal/frente.jpg')` tiene que devolver
-- {<uid>, goal}; lo que las políticas miran es el primer elemento.
-- ---------------------------------------------------------------------------

do $$
declare
  uid text := '00000000-0000-0000-0000-000000000000';
  parts text[];
begin
  parts := storage.foldername(uid || '/goal/frente.jpg');

  if parts[1] is distinct from uid then
    raise exception
      'La ruta del objetivo no cae en la carpeta del dueño: foldername devolvió %',
      parts;
  end if;

  raise notice 'Fase 6: {user_id}/goal/{vista}.jpg queda cubierta por las políticas de progress-photos.';
end
$$;
