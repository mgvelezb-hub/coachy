-- ---------------------------------------------------------------------------
-- Coachy — configuración de Supabase
--
-- Correr UNA VEZ en el SQL Editor del proyecto, DESPUÉS de aplicar las
-- migraciones de Prisma (`pnpm -F web db:deploy`). Es idempotente: se puede
-- volver a correr sin romper nada.
--
-- Qué hace:
--   1. Trigger auth.users -> public.users (crea la fila al registrarse).
--   2. Habilita RLS en todas las tablas de la app (incluye `notifications`).
--   3. Políticas: cada atleta ve solo lo suyo; el admin ve todo.
--   4. Bucket privado `progress-photos` y sus políticas por carpeta de usuario.
--   5. Bucket privado `exercise-videos` (banco de demostraciones, solo lectura
--      para cualquier usuario autenticado).
--
-- Nota importante: Prisma se conecta con un rol que hace BYPASSRLS. Estas
-- políticas protegen el acceso directo (PostgREST, Storage, cliente del
-- navegador). El filtro por `userId` en las server actions NO es opcional.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. auth.users -> public.users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, role, created_at, updated_at)
  values (new.id, new.email, 'ATHLETE', now(), now())
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Mantiene el email sincronizado si el usuario lo cambia.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set email = new.email, updated_at = now() where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- 2. Helper: ¿el usuario de la sesión es admin?
--
-- El rol vive en public.users y la app lo recalcula desde ADMIN_EMAILS en cada
-- acceso. SECURITY DEFINER para que la función pueda leer la tabla sin quedar
-- atrapada en las propias políticas.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role::text = 'ADMIN'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.users             enable row level security;
alter table public.profiles          enable row level security;
alter table public.checkins          enable row level security;
alter table public.photos            enable row level security;
alter table public.decisions         enable row level security;
alter table public.meal_plans        enable row level security;
alter table public.workouts          enable row level security;
alter table public.conversations     enable row level security;
alter table public.notifications    enable row level security;
alter table public.training_examples enable row level security;
alter table public.exercises         enable row level security;
alter table public.foods             enable row level security;

-- users -------------------------------------------------------------------
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (id = auth.uid() or public.is_admin());

-- profiles ----------------------------------------------------------------
drop policy if exists profiles_all_own on public.profiles;
create policy profiles_all_own on public.profiles
  for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- checkins ----------------------------------------------------------------
drop policy if exists checkins_all_own on public.checkins;
create policy checkins_all_own on public.checkins
  for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- photos: se cuelgan del check-in, así que heredan su dueño -----------------
drop policy if exists photos_all_own on public.photos;
create policy photos_all_own on public.photos
  for all
  using (
    public.is_admin()
    or exists (
      select 1 from public.checkins c
      where c.id = photos.checkin_id and c.user_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.checkins c
      where c.id = photos.checkin_id and c.user_id = auth.uid()
    )
  );

-- decisions: el atleta lee; solo el admin (o el servidor) escribe ----------
drop policy if exists decisions_select_own on public.decisions;
create policy decisions_select_own on public.decisions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists decisions_write_admin on public.decisions;
create policy decisions_write_admin on public.decisions
  for all using (public.is_admin()) with check (public.is_admin());

-- meal_plans: cuelgan de la decisión --------------------------------------
drop policy if exists meal_plans_select_own on public.meal_plans;
create policy meal_plans_select_own on public.meal_plans
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.decisions d
      where d.id = meal_plans.decision_id and d.user_id = auth.uid()
    )
  );

drop policy if exists meal_plans_write_admin on public.meal_plans;
create policy meal_plans_write_admin on public.meal_plans
  for all using (public.is_admin()) with check (public.is_admin());

-- workouts ----------------------------------------------------------------
drop policy if exists workouts_all_own on public.workouts;
create policy workouts_all_own on public.workouts
  for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- conversations -----------------------------------------------------------
drop policy if exists conversations_all_own on public.conversations;
create policy conversations_all_own on public.conversations
  for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- notifications: el atleta lee y marca como leídas las suyas --------------
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Las crea el servidor (crons y orquestador), nunca el navegador.
drop policy if exists notifications_write_admin on public.notifications;
create policy notifications_write_admin on public.notifications
  for insert with check (public.is_admin());

-- training_examples: material de entrenamiento, solo admin ----------------
drop policy if exists training_examples_admin on public.training_examples;
create policy training_examples_admin on public.training_examples
  for all using (public.is_admin()) with check (public.is_admin());

-- Catálogos: cualquiera autenticado los lee; solo el admin los edita ------
drop policy if exists exercises_read on public.exercises;
create policy exercises_read on public.exercises
  for select using (auth.role() = 'authenticated');

drop policy if exists exercises_write_admin on public.exercises;
create policy exercises_write_admin on public.exercises
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists foods_read on public.foods;
create policy foods_read on public.foods
  for select using (auth.role() = 'authenticated');

drop policy if exists foods_write_admin on public.foods;
create policy foods_write_admin on public.foods
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Storage: bucket privado de fotos de progreso
--
-- Rutas: {user_id}/{checkin_id}/{vista}.jpg
-- La primera carpeta de la ruta es el dueño; ahí se apoyan las políticas.
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
-- 5. Storage: bucket privado del banco de videos de ejercicios
--
-- Rutas: library/{slug}.mp4 — un video por ejercicio del catálogo, el mismo
-- para todos los atletas. `exercises.video_url` guarda la ruta
-- `exercise-videos/library/{slug}.mp4`, nunca una URL firmada; la app la firma
-- al vuelo con `signedExerciseVideoUrl`.
--
-- Solo-lectura autenticada: cualquiera con sesión puede ver la demostración;
-- escribir y borrar es del admin (el guion `scripts/build-video-bank.mts` sube
-- con service role, que salta RLS).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-videos',
  'exercise-videos',
  false,
  67108864,
  array['video/mp4', 'video/quicktime']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exercise_videos_read on storage.objects;
create policy exercise_videos_read on storage.objects
  for select using (
    bucket_id = 'exercise-videos'
    and auth.role() = 'authenticated'
  );

drop policy if exists exercise_videos_insert on storage.objects;
create policy exercise_videos_insert on storage.objects
  for insert with check (
    bucket_id = 'exercise-videos' and public.is_admin()
  );

drop policy if exists exercise_videos_update on storage.objects;
create policy exercise_videos_update on storage.objects
  for update using (
    bucket_id = 'exercise-videos' and public.is_admin()
  );

drop policy if exists exercise_videos_delete on storage.objects;
create policy exercise_videos_delete on storage.objects
  for delete using (
    bucket_id = 'exercise-videos' and public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- 6. Backfill: usuarios que ya existían en auth.users antes del trigger
-- ---------------------------------------------------------------------------

insert into public.users (id, email, role, created_at, updated_at)
select u.id, u.email, 'ATHLETE', now(), now()
from auth.users u
where u.email is not null
on conflict (id) do nothing;
