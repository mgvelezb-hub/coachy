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
| `pnpm eval:coachy` | Corre Coachy sobre 19 semanas reales y escribe `eval/` ([rúbrica](./eval/README.md)) |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:deploy` | `prisma migrate deploy` (producción) |
| `pnpm db:seed` | Carga catálogos genéricos (ejercicios y alimentos) |
| `pnpm db:studio` | Prisma Studio |
| `node scripts/generate-icons.mjs` | Regenera los iconos PWA |
| `tsx scripts/backfill-photos.mts` | Sube fotos históricas al bucket y las amarra a un check-in ([abajo](#8-backfill-de-fotos-históricas)) |

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
| `ANTHROPIC_API_KEY` | console.anthropic.com — Coachy no redacta sin ella |
| `ADMIN_EMAILS` | Emails con rol ADMIN, separados por coma |
| `VISION_ENABLED` | `true` prende el análisis de fotos. Aun prendido, no analiza nada sin consentimiento del atleta |
| `REQUIRE_APPROVAL` | `true`: ninguna decisión se publica sin que el admin la apruebe |
| `CRON_SECRET` | `openssl rand -hex 32`. Protege `/api/cron/*` y `/api/coachy/run`; sin ella responden 503 |
| `RESEND_API_KEY` | Opcional. Sin ella los avisos existen solo dentro de la app |
| `RESEND_FROM` | Remitente de los correos, si hay Resend |

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

Después corre también [`supabase/setup-training.sql`](./supabase/setup-training.sql), que instala
la RLS de `workout_sets` (Fase 4). Es idempotente y necesita que `setup.sql` ya haya corrido.

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
4. **Environment Variables**: las de la tabla de arriba, en *Production* y *Preview*.
   `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET` y `RESEND_API_KEY` marcadas
   como sensibles.
5. Deploy. Después, en Supabase, agrega el dominio de Vercel a *Site URL* y *Redirect URLs*.

### Crons

[`vercel.json`](./vercel.json) declara los dos recordatorios. Vercel los agenda en **UTC**, así que
las horas están corridas seis: sábado 20:00 CDMX = domingo 02:00 UTC, miércoles 12:00 CDMX =
miércoles 18:00 UTC.

| Cron | Cuándo (CDMX) | Qué hace |
|---|---|---|
| `/api/cron/saturday` | Sábado 20:00 | "Mañana medidas y fotos, misma luz misma hora" |
| `/api/cron/wednesday` | Miércoles 12:00 | "¿Cómo vamos?" si no llegó el check-in; a las 2 semanas, aviso al admin |

Vercel manda `Authorization: Bearer $CRON_SECRET`. Para probarlos a mano:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/wednesday
```

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
      entrenamiento/            modo gimnasio: sesión del día, offline-first
      checkin/                  4 pasos: medidas → fotos → sensaciones → cumplimiento
      historial/                gráficas Recharts + comparador de fotos + tabla + sesiones
    admin/                      zona del admin
      page.tsx                  lista de atletas
      atletas/[id]/             perfil + check-ins + editor de config del motor
      import/                   carga de historial privado en JSON
  lib/
    supabase/                   clientes browser / server / service-role, todos perezosos
    validation/                 schemas zod (check-in, onboarding, import)
    engine-types.ts             re-export de los tipos de packages/engine
    engine-config.ts            valida la config del admin con el loadConfig del motor
    checkin-write.ts            persistencia del check-in, aislada para poder probarla
    training/                   generador de rutina + modo gimnasio (§6)
    storage.ts                  subida y URLs firmadas de los buckets privados
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
- **El service worker cachea el App Shell y, aparte, el modo gimnasio.** Medidas, fotos y
  decisiones nunca tocan el caché del navegador; la rutina sí, porque el gimnasio no tiene señal
  (ver §6). Ese caché se borra al cerrar sesión.
- **Fase inicial**: quien declara 3+ días de pesas entra en `BASE`; el resto en `REINTRO`.
- **El motor vive en el servidor.** `packages/engine` se publica como TypeScript fuente, así que
  `next.config.ts` lo transpila y mapea sus imports `./x.js` a `.ts`. La página del admin le pasa
  al editor los JSON de referencia ya serializados, para no arrastrar el motor al navegador.
- **La config del admin se guarda como overrides parciales**, no resuelta: así el atleta hereda
  cualquier cambio futuro en los defaults del motor.

---

## 5. Coachy (Fase 2)

```
src/lib/coachy/
  analyze.ts        historial -> tipos del motor -> decide() -> Decision
  vision.ts         análisis de fotos por zona (solo cambio, nunca estética)
  questions.ts      banco de preguntas por señal, máximo 3, sin repetir
  compose.ts        redacción con Claude: system prompt, few-shot, tool use
  fewshot.ts        ejemplos de tono: training_examples, con fallback a data/private/
  menu.ts           generateMenu() -> meal_plans
  mapping.ts        Prisma <-> tipos del motor
  notifications.ts  avisos in-app + correo opcional (Resend)
  index.ts          orquestador
```

### La frontera que no se cruza

**El motor decide los números; la IA solo los redacta y pregunta.** Tres candados lo sostienen:

1. La herramienta que el modelo llama **no tiene ningún campo numérico** — no hay dónde escribir
   kcal ni macros.
2. `enforceEngineNumbers` revisa el texto: cualquier número mayor a 30 que no venga del motor tumba
   la frase y la reemplaza por una escrita por nosotros con los números correctos.
3. La cola del admin muestra los números del motor junto al texto propuesto, antes de publicar.

### El ciclo completo

1. La atleta guarda su check-in. La server action contesta de inmediato y dispara Coachy con
   `after()`: nadie espera a que Claude redacte.
2. `runCheckinAnalysis` reconstruye el historial, corre visión si aplica, llama a `decide()` y
   guarda la `Decision` — `PENDIENTE` si `REQUIRE_APPROVAL` está prendido.
3. `pickQuestions` elige hasta 3 preguntas del banco según las señales, sin repetir las de la
   semana pasada.
4. `composeReply` redacta con `claude-sonnet-5`, con el orden y el tono de la metodología y el
   few-shot de la tabla `training_examples`.
5. `syncMealPlans` genera los dos menús cuando cambió la fase o toca quincena.
6. El admin ve la cola en `/admin/decisiones`: **Aprobar** (un tap) o **Corregir** (fase, kcal,
   texto). Corregir recalcula macros con el motor y guarda el par como `training_examples` con
   fuente `ADMIN` — que es como Coachy aprende.
7. Al publicarse, la atleta ve en `/app` el mensaje, las preguntas para contestar inline, el menú
   vigente con equivalencias y lista de súper, y la meta de la semana.

Si algo de la IA falla, la `Decision` del motor ya quedó guardada. `POST /api/coachy/run`
(protegido con `CRON_SECRET`) reintenta los check-ins sin texto.

### Fotos y consentimiento

`analyzePhotos` no manda nada sin **los tres** candados: `VISION_ENABLED=true`, `photoConsentAt`
con fecha en el perfil, y fotos con qué comparar. La foto se descarga con una URL firmada de 60
segundos y sus bytes van únicamente a la API de Anthropic. El esquema de salida solo admite
`{zona, cambio, nota_breve}`: no hay dónde escribir un comentario estético.

### Few-shot

En producción manda la tabla `training_examples`. En local, si la tabla está vacía, se lee
`apps/web/data/private/coach-fewshot.json` — carpeta ignorada por git, con el nombre del atleta
reemplazado por `{{ATLETA}}`. Ese archivo **no existe en un deploy**, a propósito.

## 6. Entrenamiento (Fase 4)

```
src/lib/training/
  types.ts         tipos del generador
  schemes.ts       esquemas del coach + rotación por semana ISO
  split.ts         split por días disponibles, protocolo de lesión
  recipes.ts       qué huecos llena cada tipo de día y cuál se recorta primero
  progression.ts   progresión doble y traducción de peso entre rangos de reps
  generate.ts      generateWeek() — puro, determinista, recibe la fecha
  db.ts            catálogo, historial y materialización en `workouts`
  view.ts          lo que el modo gimnasio necesita, ya resuelto
  session-write.ts persistencia de la sesión, con detección de PRs
  offline.ts       IndexedDB + cola de sincronización (cliente)
```

### El generador

`generateWeek(profile, history, config)` no lee el reloj ni la base: recibe el
lunes de la semana y el catálogo, y devuelve la misma rutina para las mismas
entradas. Eso es lo que la hace probable.

Reproduce el split del coach (pierna 2-3×, hombro+trapecio, pecho+espalda,
brazo), rota el esquema por **semana ISO** (piramidal → fuerza → metabólico →
rango medio), abre el primer ejercicio con dos series de calentamiento, recorta
accesorios cuando la sesión es de 45 minutos (4-5 ejercicios en lugar de 6-8) y
uno más en déficit fuerte.

**Protocolo de lesión**: `conditions` admite `lesion_activa` (sin zona) o
`lesion_<zona>` (`lesion_rodilla`, `lesion_hombro`, ...). Con zona conocida esa
zona se entrena **una sola vez por semana**, con aislados y máquinas a 3×25 de
peso bajo; los días que sobraban se reemplazan por trabajo del resto del cuerpo,
que sigue normal. Con lesión activa se suspende todo lo de impacto y el cardio.

**Progresión doble**: si la última vez completó todas las reps con RPE ≤ 8 en la
serie tope, sube 5 kg (barra o máquina) o 2.5 (mancuerna). Si no, repite peso.
Sin historial el campo va vacío — no se inventa una carga. Como la rotación
cambia el rango de reps cada semana, el peso se traduce con una tabla de
intensidad relativa: el 5×2 no se levanta con el peso del 3×30.

La semana se materializa **a demanda**, la primera vez que se abre `/app` o el
modo gimnasio en esa semana. No hay cron: `(user_id, date)` es único, así que
llamarla dos veces no duplica nada.

### Modo gimnasio

`/app/entrenamiento` es la pantalla que se usa con el teléfono en la mano y las
manos sudadas: steppers de 44 px, peso prellenado por la progresión, dos taps
por serie. Al marcar una serie arranca el cronómetro de descanso (30/45/60 s
según el esquema) y el aviso es visual, no sonoro. Al cerrar el ejercicio pide
RPE y notas; al cerrar la sesión muestra volumen y celebra los récords.

**Todo se escribe primero en el teléfono.** IndexedDB guarda la semana (para
abrir la sesión de mañana sin señal) y una cola de sincronización con reintentos
espaciados sube las series a `POST /api/training/sync`. Cada serie lleva un
`clientId` propio, así que la cola puede reintentar sin duplicar. Si no hay
IndexedDB, cae a `localStorage`.

El service worker cachea `/app/entrenamiento` y los bundles de Next en un caché
aparte (`coachy-training-v1`) — es la excepción a la regla de no cachear nada
privado, y existe porque el gimnasio no tiene señal. Al salir de la sesión ese
caché y la base local se borran.

La cola sube con la app abierta (evento `online` y un intervalo) y, donde el
navegador lo soporta, también con la app cerrada: al encolar se registra un
`sync` (`coachy-training-sync`) y el service worker lee la misma base para
vaciarla. En Safari, que no lo implementa, queda el comportamiento de siempre.

### Biblioteca y videos sin señal

`/app/biblioteca` es el catálogo completo agrupado por zona del cuerpo, con
buscador, sustitutos y reproductor. Su razón de ser es la descarga: por grupo
("Descargar (12 videos · 54 MB)") o completa (42 videos, 189 MB hoy).

```
src/lib/video-cache.ts          Cache Storage: descargar, indexar, liberar
src/lib/exercise-groups.ts      zonas del cuerpo y agrupación (puro)
src/lib/exercise-library.ts     catálogo + firma + tamaños reales del bucket
src/components/exercise-video.tsx   reproductor: primero el teléfono, luego la red
src/app/api/exercise-videos/    firmas frescas (sign) y videos de la semana (week)
```

**La llave del caché es la ruta del ejercicio, no la URL firmada.** La firma
caduca en una hora; si fuera la llave, al día siguiente todo lo "descargado"
volvería a bajarse. Se guarda el blob bajo `/__coachy-video/{ruta}` en el caché
`coachy-videos-v1`, y antes de cada lote se piden firmas nuevas a
`POST /api/exercise-videos/sign`. Los MB que muestra la UI son los que reporta
`storage.list`, no una estimación.

Al abrir `/app` o `/app/entrenamiento` con red, los videos de la rutina de la
semana se pre-descargan en segundo plano (nunca bloquean la UI, se saltan con
ahorro de datos o red lenta, y no repiten lo que ya está).

Al cerrar sesión, el mismo `{ type: "purge-training" }` borra los tres cachés
privados —rutina, biblioteca y videos—: un teléfono se presta.

### RLS

`workout_sets` estrenó política propia en
[`supabase/setup-training.sql`](./supabase/setup-training.sql), que se corre
aparte de `setup.sql`:

```bash
set -a && . ./.env.local && set +a
psql "$DIRECT_URL" -f supabase/setup-training.sql
```

## 7. Pendientes conocidos

- El check-in no captura `newInjury`, `contextChange`, `aggressiveRequest`, `goalReached` ni
  `restart`. El motor sabe usarlos; el formulario todavía no los pregunta. Hoy la lesión activa se
  lee de las condiciones del perfil y los días sin entrenar se derivan del cumplimiento.
- Las respuestas a las preguntas de Coachy son de texto. La API de Claude no recibe audio, así que
  el "audio → transcripción" del plan necesita otra herramienta (Whisper o equivalente).
- El generador no pregunta por el equipo disponible: asume un gimnasio completo.
  Si una máquina no existe, el catálogo trae `substitutes` pero la UI todavía no
  ofrece cambiar el ejercicio en el momento.
- El modo gimnasio todavía reproduce con la URL firmada del servidor. El
  componente que lee primero el video descargado ya existe
  (`components/exercise-video.tsx`); falta cambiar el `<video>` de
  `exercise-logger.tsx` por `<ExerciseVideo path={...} signedUrl={...} />`.
- La biblioteca guarda los videos con la ruta como llave, así que sobreviven a
  las firmas vencidas — pero el navegador puede desalojar el caché si el
  teléfono se queda sin espacio. No se pide almacenamiento persistente.

## 8. Backfill de fotos históricas

Para cargar fotos viejas que nunca pasaron por el formulario de check-in:

```bash
cd apps/web
set -a && . ./.env.local && set +a
pnpm exec tsx scripts/backfill-photos.mts \
  --dir <carpeta> --athlete-email <email> --dry-run
```

La carpeta trae subcarpetas `YYYY-MM-DD` con los `.jpg` de esa tanda; las fotos **nunca** entran
al repo. Cada tanda se amarra al check-in libre más cercano (±6 días, `--window-days`) y, si no
hay ninguno, estrena un check-in esqueleto con valores neutros para esa fecha. La vista
(`FRENTE` / `PERFIL` / `ESPALDA`) la decide Claude Haiku con tool use: el esquema solo admite el
ángulo, así que no hay dónde escribir un comentario sobre el cuerpo de nadie. El guion aborta si
el perfil no tiene `photo_consent_at`.

Corre siempre `--dry-run` primero: imprime el plan completo sin tocar nada. Con
`--cache <archivo.json>` guarda las clasificaciones y la corrida real no las vuelve a pagar. Es
idempotente — una foto ya subida se salta.

`photos` es única por `(check-in, vista)`: si una tanda trae dos fotos de la misma vista (el
perfil izquierdo y el derecho, por ejemplo) solo entra la primera y la otra se reporta como
saltada.

## 9. Observatorio y ciclo (Fases 3 y 7)

### El autopiloto cambia qué es `/admin`

Con `REQUIRE_APPROVAL=false` las decisiones del motor nacen `APROBADA` y se publican solas. El
admin deja de aprobar y pasa a observar: `/admin` abre con las **señales de escalamiento** sin
leer y, debajo, la lista de atletas. El panel de cada atleta trae tendencia de cintura y peso,
volumen de fuerza y mejores marcas desde `workout_sets`, adherencia (check-ins a tiempo y
cumplimiento declarado), el pronóstico, el timeline de decisiones y las propuestas de mejora.

```
src/lib/observatory/
  trend.ts       regresión lineal + banda de predicción (puro)
  signals.ts     las cuatro señales de escalamiento (puro)
  proposals.ts   propuestas deterministas, sin IA (puro)
  sanitize.ts    filtro de privacidad para los textos del motor (puro)
  data.ts        arma el view model desde Prisma
  escalation.ts  de señal a `notifications`
```

**El pronóstico dice lo que no es.** Regresión por mínimos cuadrados sobre las últimas 4-6
semanas **concluyentes** de cintura, con banda de predicción al ~95 %. Con dos o tres puntos no
hay grados de libertad para estimar residuos: la banda colapsa al punto y la proyección se marca
como no confiable, con la advertencia de que dos semanas no hacen una tendencia. Las semanas que
el motor marcó no concluyentes (regla `R1`) no entran al ajuste y salen sombreadas en la gráfica.

**El escalamiento notifica, no bloquea.** Cuatro señales, ni una más: síntoma de seguridad dos
semanas seguidas, cumplimiento por debajo del 50 % dos semanas, tres semanas sin check-in, y el
motor proponiendo salirse de la config (kcal bajo el piso, o una fase pasada de su tope de
semanas). `runCoachy` llama a `runEscalationCheck` justo después de sincronizar los menús —antes
de redactar, para que el aviso salga aunque Claude falle— y cada señal se materializa como una
`Notification` de tipo `ESCALAMIENTO` para cada admin, con `dedupeKey` por
`{atleta}:{señal}:{fecha ancla}`.

### Ciclo menstrual

`profiles` guarda tres campos: `cycle_tracking_enabled`, `cycle_last_period_start` y
`cycle_avg_length`. El opt-in es explícito y vive en el onboarding (tarjeta opcional, no aparece
si declaró sexo masculino) y en el paso 4 del check-in, donde también se edita después.

`src/lib/cycle.ts` calcula la fase por calendario: sangrado al inicio, ovulación anclada **14
días antes del siguiente periodo** —no a la mitad del ciclo—, folicular entre una y otra, lútea
al final. Se niega a estimar sin fecha registrada, con fecha futura o con una fecha de más de 120
días. Es aritmética de calendario y el producto lo dice con todas sus letras: no es diagnóstico,
no detecta embarazo y no sirve como método anticonceptivo.

En el check-in la fase llega prellenada y editable; marcar "esta semana empezó mi periodo"
reancla el conteo. La server action solo rellena `cyclePhase` cuando ella no marcó ninguna, así
que el motor recibe la señal sin depender de que alguien se acuerde. De ahí en adelante todo es
la regla `R1` que ya existía: semana lútea o menstrual sin caída de cintura = semana no
concluyente, que no cuenta para estancamiento. **La rutina no cambia sola**: lo único previsto
para el gimnasio es una frase, y solo en la semana del periodo.

### La frontera de privacidad

El ciclo es dato de salud y es de la atleta. El admin ve **"semana no concluyente"** y nada más:
nunca la fase.

1. El view model del observatorio no tiene campo para la fase. Viaja `inconclusive: boolean`.
2. La explicación de la regla `R1` del motor sí nombra la fase —y así debe llegar al mensaje de
   la atleta, que es de ella—. Antes de pintarse en `/admin` pasa por `sanitizeForAdmin`, que la
   reemplaza por "semana no concluyente".
3. Ninguna consulta de `/admin` selecciona `checkins.cycle_phase`.
4. Las tres columnas de `profiles` salen del alcance de `anon` y `authenticated`:

```bash
set -a && . ./.env.local && set +a
psql "$DIRECT_URL" -f supabase/setup-f3f7.sql
```

Ojo con la mecánica de Postgres: un `revoke` de columna **no recorta** un `grant` de tabla
entera, y Supabase reparte `grant all` sobre `public` por defecto. El script quita el privilegio
de tabla y lo devuelve columna por columna, saltándose las tres del ciclo — por eso hay que
volver a correrlo después de cada migración que agregue columnas a `profiles`. Las nuevas nacen
sin grant para esos roles, que es el lado seguro del error.

### Pendientes de estas dos fases

- La señal de "tres semanas sin check-in" solo se materializa cuando alguien manda datos, porque
  vive dentro de `runCoachy`. `runEscalationSweep()` existe y hace el barrido completo; falta
  llamarlo desde `/api/cron/wednesday`. Mientras tanto la señal sí se **muestra** en el
  observatorio, que la calcula en vivo.
- El modo gimnasio todavía no pinta la nota de la semana del periodo.
  `cycleNoteForProfile(profile, isoDate)` ya devuelve el texto (o `null`) sin exponer la fase;
  falta exponerlo en el view model de `lib/training/view.ts` como `cycleNote` y pintarlo en
  `/app/entrenamiento`.
- Marcar una notificación de escalamiento como leída todavía no tiene botón: se limpian
  escribiendo `read_at` a mano.
