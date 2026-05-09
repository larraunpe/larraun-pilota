// Larraun Pilota PWA - Service Worker
// Aldatu CACHE_NAME bertsioa eguneratzean
const CACHE_NAME = 'larraun-pilota-v1';

// Fitxategiak cachean gorde (offline erabilgarri)
const PRECACHE_URLS = [
    '/kontrol-panela-app.html',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Nunito:wght@400;500;600;700&display=swap'
];

// Install: precache core files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(PRECACHE_URLS).catch(err => {
                console.warn('Precache partial failure (ok for external URLs):', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: network-first for HTML (always fresh), cache-first for assets
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Network-first for navigation (HTML pages) — always get latest content
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request).then(r => r || caches.match('/kontrol-panela-app.html')))
        );
        return;
    }

    // Cache-first for fonts, icons, CSS
    if (
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('cdnjs.cloudflare.com') ||
        request.destination === 'image'
    ) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // Default: network with cache fallback
    event.respondWith(
        fetch(request).catch(() => caches.match(request))
    );
});
