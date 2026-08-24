-- Coachy — Fase 8 (datos del reloj: Apple Watch / Salud por Atajo de iOS).
--
-- Correr DESPUÉS de `pnpm db:deploy` y de `setup.sql` (necesita `is_admin()`).
-- Es idempotente.
--
--   set -a && . ./.env.local && set +a
--   psql "$DIRECT_URL" -f supabase/setup-f8.sql
--
-- ---------------------------------------------------------------------------
-- Qué se protege
-- ---------------------------------------------------------------------------
-- Dos cosas nuevas, con dos candados distintos:
--
-- 1. `health_days` — pasos, energía, sueño y FC en reposo. Es dato de salud:
--    cada quien ve lo suyo. El admin ve todo, igual que con los check-ins,
--    porque el observatorio muestra actividad promedio para acompañar.
--
-- 2. `profiles.health_ingest_token` — **es una credencial**. Con ella
--    cualquiera escribe días en la cuenta de esa persona. No tiene por qué
--    salir nunca por PostgREST ni por el cliente del navegador: se lee en el
--    servidor, se pinta una vez en la tarjeta del perfil, y se puede regenerar.
--    Mismo mecanismo que las columnas del ciclo (`setup-f3f7.sql`): privilegio
--    de columna, porque RLS es por fila.
--
-- Ojo con la mecánica de Postgres: un `revoke` de columna no recorta un `grant`
-- de tabla entera. Hay que quitar el privilegio de tabla y devolverlo columna
-- por columna. Por eso este bloque —igual que el de la Fase 7— hay que volver a
-- correrlo después de cada migración que agregue columnas a `profiles`.

do $$
begin
  if to_regclass('public.health_days') is null then
    raise exception 'Falta la tabla public.health_days: corre antes `pnpm db:deploy`.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'health_ingest_token'
  ) then
    raise exception 'Falta profiles.health_ingest_token: corre antes `pnpm db:deploy`.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- RLS de `health_days`
-- ---------------------------------------------------------------------------

alter table public.health_days enable row level security;

-- La política se escribe solo donde existe `auth` (Supabase). En la base local
-- de desarrollo no hay `auth.uid()` ni PostgREST, y el script tiene que poder
-- correrse ahí sin reventar.
do $$
begin
  if to_regnamespace('auth') is null then
    raise notice 'Sin esquema auth (base local): no hay política que crear.';
    return;
  end if;

  execute 'drop policy if exists health_days_all_own on public.health_days';
  execute $policy$
    create policy health_days_all_own on public.health_days
      for all
      using (user_id = auth.uid() or public.is_admin())
      with check (user_id = auth.uid() or public.is_admin())
  $policy$;
end
$$;

comment on table public.health_days is
  'Fase 8: un día del reloj (pasos, energía activa, minutos de ejercicio, sueño, FC en reposo). Los sube un Atajo de iOS; (user_id, date) es único.';

-- ---------------------------------------------------------------------------
-- El token de ingesta, fuera del alcance de los roles del cliente
-- ---------------------------------------------------------------------------
-- Se re-hace la lista de columnas visibles excluyendo el token y las tres del
-- ciclo: este script y `setup-f3f7.sql` deben poder correrse en cualquier
-- orden sin que uno le devuelva a `anon` lo que el otro le quitó.
--
-- En una base local (`coachy_dev`) los roles `anon` y `authenticated` no
-- existen: ahí no hay PostgREST y el bloque simplemente no aplica.

do $$
declare
  target text;
  visible text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into visible
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name not in (
      'cycle_tracking_enabled', 'cycle_last_period_start', 'cycle_avg_length',
      'health_ingest_token'
    );

  foreach target in array array['anon', 'authenticated'] loop
    if not exists (select 1 from pg_roles where rolname = target) then
      raise notice 'El rol % no existe en esta base: nada que revocar.', target;
      continue;
    end if;

    execute format('revoke all on public.profiles from %I', target);
    execute format('grant select (%s) on public.profiles to %I', visible, target);
    execute format('grant insert (%s) on public.profiles to %I', visible, target);
    execute format('grant update (%s) on public.profiles to %I', visible, target);
    execute format('grant delete on public.profiles to %I', target);
  end loop;
end
$$;

comment on column public.profiles.health_ingest_token is
  'Fase 8: credencial del Atajo de iOS que sube datos de Salud. Se lee solo en el servidor y se puede regenerar; fuera del alcance de anon/authenticated.';

-- Prisma se conecta con un rol BYPASSRLS: estas políticas protegen el acceso
-- directo (PostgREST, el cliente del navegador), no las server actions. El
-- filtro por `userId` en cada consulta del servidor sigue siendo la defensa
-- real. Las dos capas son necesarias.
