// Service worker: pozwala działać offline i instalować aplikację.
// Strategia "najpierw sieć": gdy jest internet, zawsze bierze świeże pliki; bez internetu — kopię z pamięci.
// Po zmianie plików aplikacji podbij WERSJA.
const WERSJA = 'jedzenie-v3';
const PLIKI = ['./', 'index.html', 'styl.css?v=3', 'app.js?v=3', 'przepisy.json', 'manifest.json', 'ikona.svg', 'ikona-180.png', 'ikona-192.png', 'ikona-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(WERSJA).then(c => c.addAll(PLIKI)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(klucze => Promise.all(klucze.filter(k => k !== WERSJA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(odp => {
        const kopia = odp.clone();
        caches.open(WERSJA).then(c => c.put(e.request, kopia));
        return odp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
