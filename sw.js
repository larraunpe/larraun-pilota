// Larraun Pilota PWA - Service Worker
// ⚠️  Aldatu CACHE_NAME zenbakia PDFak edo orrialdeak eguneratzean
const CACHE_NAME = 'larraun-pilota-v2';

const PRECACHE_URLS = [
    '/kontrol-panela-app.html',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Nunito:wght@400;500;600;700&display=swap'
];

// Install: precache core files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches (this forces removal of cached PDFs from v1)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Fetch strategy
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // ─── NEVER cache PDFs: always fetch fresh from network ───
    if (url.pathname.endsWith('.pdf')) {
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .catch(() => new Response('PDF ez dago erabilgarri konexiorik gabe.', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                }))
        );
        return;
    }

    // ─── Network-first for HTML navigation (always fresh content) ───
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

    // ─── Cache-first for fonts and icons (stable resources) ───
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

    // ─── Default: network with cache fallback ───
    event.respondWith(
        fetch(request).catch(() => caches.match(request))
    );
});
