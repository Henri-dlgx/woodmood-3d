// Network first, always revalidated with the server (GitHub Pages lets
// browsers keep files 10 min, which could mix an old page with a new script),
// cache fallback so the viewer still opens offline.
// The cached model is the encrypted .enc file, never the plain GLB.
// Bump CACHE and the ?v= in index.html together.
const CACHE = 'woodmood-3d-v7';
const SHELL = [
  './', 'index.html', 'style.css?v=7', 'app.js?v=7', 'manifest.json',
  'vendor/model-viewer-4.4.0.min.js', 'model/stove.glb.enc',
  'logo.svg', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'no-cache' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
