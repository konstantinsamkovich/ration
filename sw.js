const cacheName = 'ration-shell-v2';
const shell = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shell)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('ration-shell-') && key !== cacheName)
      .map((key) => caches.delete(key))
  )));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const path = new URL(request.url);
  const scope = self.registration.scope;
  if (!path.href.startsWith(scope)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(new URL('./', scope))));
  } else if (shell.some((item) => new URL(item, scope).href === path.href)) {
    event.respondWith(caches.open(cacheName).then(async (cache) => {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return cache.match(request);
      }
    }));
  }
});
