-- Coachy — RLS de la Fase 4 (entrenamiento).
--
-- Complemento de `setup.sql`, que ya cubre `workouts`. Aquí solo va lo que
-- estrenó el modo gimnasio: `workout_sets`, que hereda el dueño de su sesión.
--
-- Correr DESPUÉS de `pnpm db:deploy` y de `setup.sql` (necesita `is_admin()`).
-- Es idempotente.
--
--   set -a && . ./.env.local && set +a
--   psql "$DIRECT_URL" -f supabase/setup-training.sql

alter table public.workout_sets enable row level security;

drop policy if exists workout_sets_all_own on public.workout_sets;
create policy workout_sets_all_own on public.workout_sets
  for all
  using (
    exists (
      select 1
      from public.workouts w
      where w.id = workout_id
        and (w.user_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.workouts w
      where w.id = workout_id
        and (w.user_id = auth.uid() or public.is_admin())
    )
  );

-- Prisma se conecta con un rol BYPASSRLS: esta política protege el acceso
-- directo (PostgREST, el cliente del navegador), no las server actions. El
-- filtro por `userId` en cada consulta del servidor sigue siendo la defensa
-- real. Las dos capas son necesarias.
