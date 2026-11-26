// Service worker: aplikacja działa offline; dane pobierane najpierw z sieci, w razie braku — z pamięci.
const CACHE = 'kardio-v3';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
// plik danych zapisujemy pod stałą nazwą (bez ?t=...), żeby był dostępny offline
const dataKey = url => /\/data\/[^/]+\.json$/.test(url.pathname) ? 'data/' + url.pathname.split('/').pop() : null;

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const key = dataKey(url);
  // sieć najpierw (świeże dane i nowa wersja strony), pamięć jako zapas offline
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key ? new Request(key) : e.request, copy)); }
      return r;
    }).catch(() => caches.match(key || e.request).then(r => r || caches.match('index.html')))
  );
});
