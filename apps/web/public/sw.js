/**
 * Service worker de Coachy.
 *
 * Conservador por defecto: cachea el App Shell estático y sirve una página
 * offline. Medidas, fotos y decisiones nunca tocan el caché del navegador.
 *
 * La excepción es **el modo gimnasio** (`/app/entrenamiento`). Ahí el objetivo
 * del producto es entrenar sin señal, así que esa ruta y los estáticos de Next
 * que la pintan sí se guardan: sin eso, abrir la app en el sótano del gimnasio
 * muestra la página offline y la rutina se queda del otro lado.
 *
 * Ese caché vive aparte (`coachy-training-v1`) para poder borrarlo solo: la
 * pantalla de salir manda `{ type: "purge-training" }` antes de cerrar sesión,
 * y con eso el HTML con la rutina no se queda en un teléfono ajeno. Los videos
 * NO se cachean todavía: eso es Fase 5.
 */
const SHELL_CACHE = "coachy-shell-v2";
const TRAINING_CACHE = "coachy-training-v1";
const KEEP = [SHELL_CACHE, TRAINING_CACHE];

const SHELL = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const TRAINING_ROUTE = "/app/entrenamiento";

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
  if (event.data && event.data.type === "purge-training") {
    event.waitUntil(caches.delete(TRAINING_CACHE));
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

  // El modo gimnasio: red primero, caché como red de seguridad.
  if (request.mode === "navigate" && url.pathname.startsWith(TRAINING_ROUTE)) {
    event.respondWith(
      networkFirst(request, TRAINING_CACHE).catch(() =>
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
