self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Deja pasar todas las solicitudes a la red (necesario para Firebase y GitHub Pages)
  event.respondWith(fetch(event.request));
});
