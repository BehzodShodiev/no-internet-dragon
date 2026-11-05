// Offline-first service worker: once loaded, the game runs with no network at all.
const CACHE = 'no-internet-dragon-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './icon.svg', './manifest.webmanifest'])));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const put = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };
  if (req.mode === 'navigate') {
    // network first for the page so updates arrive, cache when offline
    e.respondWith(fetch(req).then(put).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
  } else {
    // hashed assets never change: cache first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(put)));
  }
});
