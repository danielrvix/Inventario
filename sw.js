self.addEventListener('fetch', (event) => {
  // Service worker básico obligatorio para PWA
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});