/**
 * Service worker mínimo de Coachy.
 *
 * Deliberadamente conservador: solo cachea el App Shell estático y sirve una
 * página offline. Nada dinámico se cachea — las medidas, fotos y decisiones
 * son datos privados y no deben quedar en el disco del navegador.
 */
const CACHE = "coachy-shell-v1";
const SHELL = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navegación: red primero; si no hay red, la página offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline").then((res) => res ?? Response.error())),
    );
    return;
  }

  // Estáticos del shell: cache primero.
  const url = new URL(request.url);
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});
