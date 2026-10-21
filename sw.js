// Caches the app itself so it opens instantly and offline.
// Live departures are never cached: they always come from the network.
const VERSION = 'proximo-v11';
const SHELL = ['./', 'index.html', 'styles.css?v=11', 'app.js?v=11', 'planner.js?v=11', 'map.js?v=11', 'journey.js?v=11', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API + fonts: straight to network
  // Network first, so updates you push to GitHub show up right away; cache as fallback.
  // Always check with the server (no stale browser cache), so a new page never runs with old scripts.
  const req = e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(req)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
