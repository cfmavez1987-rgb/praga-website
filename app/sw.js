const CACHE_NAME = 'praga-v2';
const STATIC_ASSETS = [
    'app.html',
    'icon-192.png',
    'icon-512.png'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
    );
});

self.addEventListener('fetch', event => {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    var copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => caches.match(event.request).then(response => response || caches.match('app.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames.filter(name => name !== CACHE_NAME)
                .map(name => caches.delete(name))
        )).then(() => self.clients.claim())
    );
});
