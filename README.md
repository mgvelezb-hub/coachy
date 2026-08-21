# Coachy

Coach virtual de nutrición y entrenamiento. Replica el ciclo de un coach real: check-in semanal
(medidas, fotos, sensaciones) → análisis → decisión de fase/macros por motor determinista → menús
y rutina → validación humana.

Monorepo pnpm:

| Paquete | Qué es |
|---|---|
| [`packages/engine`](./packages/engine) | Motor de dietas: TypeScript puro, sin IA, con tests. Decide los números. |
| [`apps/web`](./apps/web) | PWA en Next.js 15 + Supabase. Captura, muestra y valida. Ver su [README](./apps/web/README.md). |

Requisitos: Node 22, pnpm 11 (`corepack enable`).

```bash
pnpm install
pnpm -F web dev        # http://localhost:3000
```

El setup completo (base local, Supabase, Vercel) está en
[`apps/web/README.md`](./apps/web/README.md).

## Privacidad

**Este repo es público y no contiene datos de ninguna persona.** Los seeds cargan solo catálogos
genéricos: ejercicios y alimentos. El historial real de un atleta entra por `/admin/import` como
JSON privado, o vive en `data/private/` (ignorado por git). Las fotos de progreso se guardan en un
bucket privado de Supabase con URLs firmadas, y solo se analizan con IA si el atleta lo autoriza
explícitamente — el consentimiento queda registrado con fecha y versión.

Ningún secreto va al repo: `.env` y `.env*.local` están ignorados; `apps/web/.env.example` tiene
los placeholders.

## Estado

| Fase | Entrega | Estado |
|---|---|---|
| 0 | Motor de dietas + tests + backtest | `packages/engine` |
| 1 | Schema, auth, check-in PWA con fotos, historial, admin | `apps/web` |
| 2 | Coachy v1: análisis, preguntas, respuesta y validación admin | pendiente |
