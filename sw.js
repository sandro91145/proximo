// Caches the app itself so it opens instantly and offline.
// The strike list (disruptions.json) is always fetched fresh; the page keeps its own last copy.
const VERSION = 'proximo-v13';
const SHELL = ['./', 'index.html', 'styles.css?v=13', 'app.js?v=13', 'manifest.webmanifest',
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
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // fonts etc.: straight to network
  if (url.pathname.endsWith('/disruptions.json')) return;                 // always live
  // Network first (checking with the server, not a stale browser copy); cache as offline fallback.
  const req = e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(req)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
