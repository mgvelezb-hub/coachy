# Holy Gains — Plan de app nativa (atleta)

## Decisión

- **Expo / React Native**, un codebase para iOS + Android. Android domina el mercado
  latino objetivo; iOS es la vitrina premium (y los widgets). SwiftUI descartado.
- **La app nativa es solo para la atleta.** El admin (observatorio, decisiones,
  importador) se queda en la web.
- A futuro comercial: opción latina 100% en español, nutrición mexicana real
  (SMAE + Plato del Bien Comer sobre el sistema de equivalencias del motor),
  modelo B2B2C hacia coaches. Nada de eso cambia esta fase.

## Por qué endpoints REST primero

Las pantallas web viven de **server actions** de Next.js, que solo funcionan
dentro de la web. Una app nativa necesita HTTP puro. La API pública se monta en
`/api/v1/*` sin tocar las server actions existentes: la web sigue igual y ambos
clientes comparten la misma lógica de dominio (`src/lib/*`).

**Auth**: la app nativa usa `supabase-js` (login igual que la web) y manda el
`access_token` como `Authorization: Bearer <jwt>`. El backend lo valida con
Supabase y resuelve el usuario — mismo patrón que ya usa `/api/health/ingest`
pero con JWT de sesión en lugar de token estático.

## Fases

| Fase | Entregable |
|---|---|
| **N1** | Scaffold `apps/mobile` (Expo + TypeScript + expo-router) en el monorepo; base de API v1: helper de auth Bearer + `GET /api/v1/me` + `GET /api/v1/checkins` |
| N2 | Endpoints restantes de atleta: check-in (crear/corregir + fotos), decisión vigente, alimentación, rutina del día + registro de series, historial/medidas, objetivo, notificaciones |
| N3 | Pantallas nativas núcleo: login, hoy, check-in, historial (brand kit Holy Gains) |
| N4 | Modo gym nativo: SQLite/SwiftData local + cola de sync (reemplaza IndexedDB/Background Sync), videos offline |
| N5 | HealthKit directo (mata el Atajo de iOS) + Health Connect en Android |
| N6 | Widgets (WidgetKit vía config plugin + App Group; Glance en Android) — premium |

## Testers

Irma, Becca, Moises, Zaret, Pao y Mau — objetivos e historiales distintos; el
onboarding multiusuario existente los da de alta.

- **Android**: APK por link (EAS build), sin tienda, sin caducidad, gratis.
- **iOS con Apple ID gratis**: cable + Xcode y caduca a los 7 días. Tolerable
  para 1 dispositivo de prueba; con 2+ iPhones se compra la cuenta de
  desarrollador ($99/año) y se reparte por TestFlight.

## Reglas que no se negocian

- Cero datos personales en el repo (público).
- El motor decide los números; la IA nunca los altera (mismos guardarraíles).
- La nativa consume la MISMA API y DB — nada de lógica de dietas duplicada en el
  cliente.
