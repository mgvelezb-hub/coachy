-- Coachy — Fase 3 (observatorio) y Fase 7 (ciclo menstrual).
--
-- Correr DESPUÉS de `pnpm db:deploy` y de `setup.sql` (necesita `is_admin()`).
-- Es idempotente. No toca ninguna otra política.
--
--   set -a && . ./.env.local && set +a
--   psql "$DIRECT_URL" -f supabase/setup-f3f7.sql
--
-- ---------------------------------------------------------------------------
-- El problema que resuelve
-- ---------------------------------------------------------------------------
-- `profiles` ya tiene RLS: cada quien ve su fila, y el admin ve todas
-- (`profiles_all_own`). Eso está bien para casi todo el perfil y **mal** para
-- las tres columnas del ciclo, que son dato de salud de la atleta. El admin no
-- las necesita: el observatorio solo le muestra "semana no concluyente".
--
-- RLS es por fila, no por columna, así que el candado que corresponde es un
-- privilegio de columna: los roles del cliente (`anon`, `authenticated`) —los
-- que entran por PostgREST y por el navegador— pierden todo acceso a las tres
-- columnas del ciclo. Nadie, ni la atleta ni el admin, las lee por esa vía.
--
-- Ojo con la mecánica de Postgres: un `revoke` de columna **no recorta** un
-- `grant` de tabla entera, y Supabase reparte `grant all` sobre `public` por
-- defecto. El único camino real es quitar el privilegio de tabla y volver a
-- darlo columna por columna, saltándose las del ciclo. Eso es lo que hace el
-- bloque de abajo, y por eso es idempotente y hay que volver a correrlo después
-- de cada migración que agregue columnas a `profiles`: las nuevas nacen sin
-- grant para esos roles, que es el lado seguro del error.
--
-- Hoy `apps/web` no lee ninguna tabla por PostgREST (solo Storage): todo pasa
-- por Prisma, con un rol que hace BYPASSRLS y siempre filtrando por `user_id`.
-- Es la misma frontera que ya documenta el README: el filtro del servidor es la
-- defensa real, esto cubre el acceso directo.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Falta la tabla public.profiles: corre antes `pnpm db:deploy`.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'cycle_tracking_enabled'
  ) then
    raise exception 'Falta profiles.cycle_tracking_enabled: corre antes `pnpm db:deploy`.';
  end if;
end
$$;

-- Lectura y escritura del ciclo: fuera del alcance de los roles del cliente.
-- El opt-in y la fecha del periodo entran por las server actions del check-in y
-- del onboarding, nunca por un PATCH directo.
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
      'cycle_tracking_enabled', 'cycle_last_period_start', 'cycle_avg_length'
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

comment on column public.profiles.cycle_tracking_enabled is
  'Fase 7: opt-in explícito de la atleta. Dato de salud: el admin nunca ve la fase del ciclo.';
comment on column public.profiles.cycle_last_period_start is
  'Fase 7: primer día del último periodo. Estimación de calendario, no diagnóstico ni anticoncepción.';
comment on column public.profiles.cycle_avg_length is
  'Fase 7: duración típica del ciclo en días (21-45).';

-- ---------------------------------------------------------------------------
-- `checkins.cycle_phase`
-- ---------------------------------------------------------------------------
-- Esta columna ya existía y ya viaja al motor. Se queda donde está: es parte
-- del check-in y la política `checkins` la cubre. Lo que cambia en la Fase 7 es
-- la capa de arriba: ninguna vista de `/admin` la selecciona, y los textos del
-- motor que nombran la fase pasan por `sanitizeForAdmin` antes de pintarse.

-- ---------------------------------------------------------------------------
-- Notificaciones de escalamiento (Fase 3)
-- ---------------------------------------------------------------------------
-- Viven en `notifications`, que ya tiene su política por `user_id`. El aviso
-- pertenece al admin que lo recibe, así que no hace falta nada nuevo. Este
-- bloque solo deja constancia de que se revisó.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
  ) then
    raise notice 'notifications no tiene políticas. En Supabase eso significa que falta correr supabase/setup.sql.';
  end if;
end
$$;
