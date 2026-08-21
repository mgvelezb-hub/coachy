# Coachy — `apps/web`

PWA del coach virtual. Next.js 15 (App Router) · TypeScript strict · Tailwind v4 · shadcn/ui ·
Prisma 6 · Supabase (Auth + Postgres + Storage) · Recharts · vitest.

> **El repo es público.** Aquí no vive ningún dato de ninguna persona. Los seeds solo cargan
> catálogos genéricos (ejercicios y alimentos). El historial real de un atleta entra por
> `/admin/import` o vive en `data/private/` (ignorado por git). Si algo en un commit identifica a
> alguien, es un bug.

---

## 1. Setup local (sin Supabase)

Requisitos: Node 22, pnpm 11 (`corepack enable`), PostgreSQL 17 en local.

```bash
# desde la raíz del monorepo
pnpm install

# la base local (el server de Homebrew escucha en 5433, no en 5432)
export PATH="/usr/local/opt/postgresql@17/bin:$PATH"
createdb -h 127.0.0.1 -p 5433 -U "$(whoami)" coachy_dev

cd apps/web
cp .env.example .env          # Prisma y Next leen este archivo
pnpm db:migrate               # aplica prisma/migrations
pnpm db:seed                  # ejercicios + alimentos genéricos
pnpm dev                      # http://localhost:3000
```

Sin credenciales de Supabase la app corre en modo vitrina: la portada, `/login` y `/signup`
renderizan, pero no hay sesión y `/app` no está protegida por nada porque no hay a quién
autenticar. Es suficiente para trabajar en UI y en el esquema.

### Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción (corre `prisma generate` primero) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | vitest — las pruebas contra la base se saltan solas si no hay Postgres |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:deploy` | `prisma migrate deploy` (producción) |
| `pnpm db:seed` | Carga catálogos genéricos |
| `pnpm db:studio` | Prisma Studio |
| `node scripts/generate-icons.mjs` | Regenera los iconos PWA |

---

## 2. Setup de Supabase

### 2.1 Crear el proyecto

1. En [supabase.com](https://supabase.com) crea un proyecto. Guarda la contraseña de la base:
   aparece una sola vez y la necesitas para `DATABASE_URL`.
2. **Project Settings → API**: copia `Project URL` y la llave `anon` y la `service_role`.
3. **Project Settings → Database → Connection string**: copia las dos cadenas.
   - `DATABASE_URL` → modo **Transaction** (puerto `6543`), añadiendo
     `?pgbouncer=true&connection_limit=1`. Es la que usa la app en runtime.
   - `DIRECT_URL` → modo **Session** (puerto `5432`). Es la que usa `prisma migrate`; el pooler
     no soporta migraciones.

### 2.2 Configurar Auth

**Authentication → Providers → Email**: deja *Email* habilitado con contraseña.

- Si dejas *Confirm email* prendido, el signup no devuelve sesión: el usuario recibe un correo y
  vuelve por `/auth/callback`. Ya está implementado.
- Para probar rápido, apágalo y el signup entra directo a `/onboarding`.

**Authentication → URL Configuration**:

- *Site URL*: `http://localhost:3000` en desarrollo, tu dominio de Vercel en producción.
- *Redirect URLs*: agrega `http://localhost:3000/auth/callback` y
  `https://<tu-dominio>/auth/callback`.

### 2.3 Variables de entorno

```bash
cd apps/web
cp .env.example .env
```

| Variable | De dónde sale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (**solo servidor**) |
| `DATABASE_URL` | Connection string, Transaction pooler (6543) + `?pgbouncer=true` |
| `DIRECT_URL` | Connection string, Session (5432) |
| `ANTHROPIC_API_KEY` | console.anthropic.com — se usa hasta la Fase 2 |
| `ADMIN_EMAILS` | Emails con rol ADMIN, separados por coma |
| `VISION_ENABLED` | `false` en Fase 1 |
| `REQUIRE_APPROVAL` | `true`: ninguna decisión se publica sin que el admin la apruebe |

El rol se recalcula **en cada acceso** desde `ADMIN_EMAILS`. Quitar un correo de la lista degrada
esa cuenta a `ATHLETE` sin tocar la base.

### 2.4 Migrar el esquema

```bash
cd apps/web
pnpm db:deploy    # crea las tablas en Supabase
pnpm db:seed      # catálogos genéricos
```

### 2.5 Correr `supabase/setup.sql`

Abre el **SQL Editor** del proyecto, pega [`supabase/setup.sql`](./supabase/setup.sql) y ejecútalo.
Hazlo **después** de migrar: el script asume que las tablas ya existen. Es idempotente.

Deja instalado:

1. **Trigger `auth.users → public.users`** — crea la fila de la app cuando alguien se registra, y
   mantiene el email sincronizado si lo cambia. También rellena las cuentas que ya existían.
2. **RLS en todas las tablas** — cada atleta ve solo lo suyo; el admin ve todo. `photos` y
   `meal_plans` heredan el dueño de su check-in / decisión. Los catálogos (`exercises`, `foods`)
   los lee cualquiera autenticado y solo el admin los escribe.
3. **Bucket privado `progress-photos`** — límite de 8 MB, solo imágenes, con políticas que atan
   cada archivo a la carpeta del usuario: `{user_id}/{checkin_id}/{vista}.jpg`.

> **Ojo con Prisma y RLS.** Prisma se conecta con un rol que hace `BYPASSRLS`, así que las
> políticas **no** protegen las server actions. El filtro por `userId` en cada consulta del
> servidor es la defensa real; RLS cubre el acceso directo (PostgREST, Storage, el cliente del
> navegador). Las dos capas son necesarias.

### 2.6 Verificar

1. `pnpm dev`, entra a `/signup` y crea la primera cuenta con un correo de `ADMIN_EMAILS`.
2. Comprueba en **Table Editor → users** que apareció la fila con `role = ADMIN` (el trigger la
   crea como `ATHLETE`; la app la corrige al primer acceso).
3. Termina el onboarding → deberías caer en `/app`.
4. Manda un check-in con fotos y confirma en **Storage → progress-photos** que existen bajo tu
   `user_id`.

---

## 3. Deploy en Vercel

1. **New Project** → importa el repo `coachy`.
2. **Root Directory**: `apps/web`. Marca *Include files outside of the root directory* (es un
   monorepo pnpm; el lockfile vive arriba).
3. **Framework Preset**: Next.js. Vercel detecta pnpm por el lockfile.
   - *Install Command*: `pnpm install --frozen-lockfile` (o el default).
   - *Build Command*: `pnpm build` — ya corre `prisma generate`.
4. **Environment Variables**: las nueve de la tabla de arriba, en *Production* y *Preview*.
   `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` marcadas como sensibles.
5. Deploy. Después, en Supabase, agrega el dominio de Vercel a *Site URL* y *Redirect URLs*.

Las migraciones **no** corren solas en el deploy, a propósito: `prisma migrate deploy` contra
producción se ejecuta a mano cuando decides que toca.

```bash
DIRECT_URL="<la de producción>" pnpm db:deploy
```

---

## 4. Cómo está armado

```
src/
  app/
    page.tsx                    portada pública
    login/ signup/              email + contraseña (Supabase Auth)
    auth/callback/              canje del código (confirmación de correo, magic link)
    onboarding/                 cuestionario inicial → crea Profile
    app/                        zona del atleta (layout con nav inferior)
      page.tsx                  home: check-in de la semana o invitación a hacerlo
      checkin/                  4 pasos: medidas → fotos → sensaciones → cumplimiento
      historial/                gráficas Recharts + comparador de fotos + tabla
    admin/                      zona del admin
      page.tsx                  lista de atletas
      atletas/[id]/             perfil + check-ins + editor de config del motor
      import/                   carga de historial privado en JSON
  lib/
    supabase/                   clientes browser / server / service-role, todos perezosos
    validation/                 schemas zod (check-in, onboarding, import)
    engine-types.ts             interfaz mínima del motor — TODO: cambiar por @coachy/engine
    engine-config.ts            schema y defaults de la config (spec 02 §7)
    checkin-write.ts            persistencia del check-in, aislada para poder probarla
    storage.ts                  subida y URLs firmadas del bucket privado
  middleware.ts                 refresca la sesión y protege /app, /admin, /onboarding
```

### Decisiones que conviene conocer

- **Todos los clientes de Supabase son perezosos.** El build pasa sin credenciales; el error de
  variable faltante aparece cuando algo intenta usarlas de verdad, no al compilar.
- **El check-in guarda medidas antes que fotos.** Si la red se cae a medio subir, los números ya
  quedaron y la atleta no repite el formulario.
- **Borrador en `localStorage` por fecha**, sin fotos: pesan demasiado y son datos sensibles.
- **`(userId, date)` es único.** Reenviar el mismo domingo corrige; nunca duplica. Lo mismo aplica
  al importador.
- **El service worker solo cachea el App Shell.** Medidas, fotos y decisiones nunca tocan el caché
  del navegador.
- **Fase inicial**: quien declara 3+ días de pesas entra en `BASE`; el resto en `REINTRO`.

---

## 5. Pendientes de Fase 2

- Conectar `@coachy/engine` (`packages/engine`) y borrar `lib/engine-types.ts` y el fallback de
  `lib/engine-config.ts`.
- Cola de decisiones en `/admin/decisiones` con Aprobar / Corregir.
- Mensaje de Coachy, menú vigente y meta de la semana en `/app`.
- Análisis de fotos con visión, detrás de `VISION_ENABLED` y del consentimiento del atleta.
