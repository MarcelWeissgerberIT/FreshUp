/* Fresh Up – Service Worker: App offline verfügbar machen, Mitteilungen öffnen die App */
const CACHE = 'freshup-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/fonts.css',
  'css/app.css',
  'assets/fonts/sora-latin.woff2',
  'assets/fonts/source-sans-3-latin.woff2',
  'assets/fonts/caveat-latin.woff2',
  'assets/fonts/jetbrains-mono-latin.woff2',
  'js/protocol.js',
  'js/store.js',
  'js/bottle-view.js',
  'js/sim-bottle.js',
  'js/connection.js',
  'js/charts.js',
  'js/demo-panel.js',
  'js/app.js',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/img/hero.webp',
  'assets/img/schule.webp',
  'assets/img/sport.webp',
  'assets/img/unterwegs.webp',
  'assets/img/schreibtisch.webp',
  'assets/img/led-rot.webp',
  'assets/img/deckel.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Eigene Dateien: erst Netz (damit Updates ankommen), ohne Netz aus dem Cache.
// Fremde Anfragen laufen direkt über den Browser.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
