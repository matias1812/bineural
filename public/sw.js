// Vyneural · Service Worker
// Estrategia: cache-first con revalidación en segundo plano para los assets
// estáticos (los nombres llevan hash, así un deploy nuevo trae URLs nuevas),
// y red-al-cache para las navegaciones (con fallback al index).
const CACHE = 'vyneural-v2';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones: red primero, con revalidación del index en cache.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Estáticos: cache-first + actualización en segundo plano.
  e.respondWith(
    caches.match(req).then((hit) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fetched;
    }),
  );
});

// ── Notificaciones de alarma (click y acciones) ────────────────────────────
// La página crea la notificación con reg.showNotification() (solo posible
// mientras la página está viva — limitación honesta del navegador; para
// ejecución con la app cerrada hace falta Web Push con backend, ver
// docs/system-robustness.md). Aquí se gestiona el click y las acciones:
// enfocar la ventana existente, navegarla al deep link de la sesión, o
// abrir la PWA si no hay ninguna ventana.

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = (e.notification.data && e.notification.data.url) || '/';
  const action = e.action || '';
  // 'dismiss' se usa solo para descartar (la notificación ya se cerró).
  if (action === 'dismiss') return;

  let target = data;
  if (action === 'start') {
    // El deep link ya lleva autostart=true; se garantiza por si llegó sin él.
    const u = new URL(data, self.location.origin);
    u.searchParams.set('autostart', 'true');
    target = u.href;
  }

  e.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.focus) {
            // Navegar la ventana existente transfiere la configuración de la
            // sesión (freq/beat/wave/autostart); evitar duplicados abriendo
            // solo la primera ventana enfocable.
            if (client.navigate) {
              client.navigate(target).catch(() => {});
            } else {
              client.postMessage({ type: 'NAVIGATE', url: target });
            }
            return client.focus();
          }
          return null;
        }
        // Sin ventana abierta: abrir la PWA con el deep link.
        return self.clients.openWindow(target);
      }),
  );
});

// Cierre explícito de la notificación por el usuario (sin acción): no-op
// hoy; aquí se registrarían métricas locales si algún día existen.
self.addEventListener('notificationclose', (e) => {
  /* sin telemetría local */
});
