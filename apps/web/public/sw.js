/**
 * Service worker de Coachy.
 *
 * Conservador por defecto: cachea el App Shell estático y sirve una página
 * offline. Medidas, fotos y decisiones nunca tocan el caché del navegador.
 *
 * Las excepciones son las dos pantallas que existen para usarse sin señal:
 *
 *   - **El modo gimnasio** (`/app/entrenamiento`), con la rutina del día.
 *   - **La biblioteca** (`/app/biblioteca`), con el catálogo de ejercicios.
 *
 * Esas rutas y los estáticos de Next que las pintan sí se guardan: sin eso,
 * abrir la app en el sótano del gimnasio muestra la página offline y la rutina
 * se queda del otro lado.
 *
 * Cada cosa vive en su propio caché para poder borrarla sola:
 *
 *   - `coachy-training-v1` — HTML del modo gimnasio y bundles de Next.
 *   - `coachy-library-v1`  — HTML de la biblioteca.
 *   - `coachy-videos-v1`   — los videos que la atleta descargó. Lo llena y lo
 *     vacía la página (`src/lib/video-cache.ts`); aquí solo se conserva entre
 *     activaciones y se borra al cerrar sesión.
 *
 * La pantalla de salir manda `{ type: "purge-training" }` antes de cerrar
 * sesión y con eso se van los tres: un teléfono se presta, y ni la rutina ni
 * los videos descargados se quedan en el de alguien más.
 */
const SHELL_CACHE = "coachy-shell-v2";
const TRAINING_CACHE = "coachy-training-v1";
const LIBRARY_CACHE = "coachy-library-v1";
const VIDEO_CACHE = "coachy-videos-v1";
const KEEP = [SHELL_CACHE, TRAINING_CACHE, LIBRARY_CACHE, VIDEO_CACHE];

/** Todo lo que vive en el teléfono y desaparece al cerrar sesión. */
const PRIVATE_CACHES = [TRAINING_CACHE, LIBRARY_CACHE, VIDEO_CACHE];

const SHELL = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const TRAINING_ROUTE = "/app/entrenamiento";
const LIBRARY_ROUTE = "/app/biblioteca";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !KEEP.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;

  // Cerrar sesión: no queda nada de esta persona en el teléfono.
  if (type === "purge-training") {
    event.waitUntil(Promise.all(PRIVATE_CACHES.map((cache) => caches.delete(cache))));
    return;
  }

  // "Liberar espacio" desde la biblioteca, si prefiere pedirlo por aquí.
  if (type === "purge-videos") {
    event.waitUntil(caches.delete(VIDEO_CACHE));
  }
});

/** Red primero, y de paso guarda la copia para la próxima vez sin señal. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  const url = new URL(request.url);

  // Las dos pantallas que se usan sin señal: red primero, caché como red de
  // seguridad. Cada una en su propio caché.
  const offlineRoute =
    (url.pathname.startsWith(TRAINING_ROUTE) && TRAINING_CACHE) ||
    (url.pathname.startsWith(LIBRARY_ROUTE) && LIBRARY_CACHE);

  if (request.mode === "navigate" && offlineRoute) {
    event.respondWith(
      networkFirst(request, offlineRoute).catch(() =>
        caches.match("/offline").then((res) => res ?? Response.error()),
      ),
    );
    return;
  }

  // Cualquier otra navegación: red, y si no hay, la página offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline").then((res) => res ?? Response.error()),
      ),
    );
    return;
  }

  // Los bundles de Next tienen hash en el nombre: son inmutables, caché primero.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(TRAINING_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Estáticos del shell: caché primero.
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});
