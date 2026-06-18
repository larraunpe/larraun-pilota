// ============================================================
// LARRAUN PILOTA - Service Worker
// Versión: 2.0.0 (2026-01-18)
// ============================================================

const CACHE_NAME = 'larraun-pwa-v2-0-0';
const STATIC_CACHE_NAME = 'larraun-static-v2-0-0';

// Recursos estáticos que siempre queremos cachear (no cambian)
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/images/icons/LARRAUNTXI.png',
    // Si tienes CSS o JS locales, añádelos aquí
    // 'css/estilos.css',
    // 'js/app.js',
];

// URLs que NUNCA deben cachearse (siempre red)
const NEVER_CACHE = [
    '/frontoi-ordutegiak.html',
    '/taldeak.html',
    '/kategoriak.html',
    '/entrenatzaileak.html',
    '/kartela9.html',
    '/hurrengo-ordutegiak.html',
    '/ordutegiak.html',
    '/emaitzak1.html',
    '/emaitzak-kartela9.html',
    '/aldaketa-osoa.html',
    '/aldaketak.html',
    '/historiko.html',
    '/arauak.pdf',
    '/txapelketak-egutegia.pdf',
    '/ikasturteko-egutegia.pdf',
];

// ─── INSTALL ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando...');
    
    event.waitUntil(
        (async () => {
            // Cachear recursos estáticos
            const cache = await caches.open(STATIC_CACHE_NAME);
            await cache.addAll(STATIC_ASSETS);
            
            // Activar inmediatamente
            await self.skipWaiting();
        })()
    );
});

// ─── ACTIVATE ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    console.log('[SW] Activando...');
    
    event.waitUntil(
        (async () => {
            // Limpiar cachés antiguas
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME && name !== STATIC_CACHE_NAME)
                    .map(name => caches.delete(name))
            );
            
            // Tomar control de todas las páginas
            await self.clients.claim();
        })()
    );
});

// ─── FETCH (ESTRATEGIA INTELIGENTE) ──────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const requestUrl = url.pathname;
    
    // 1. SI ES UN RECURSO QUE NUNCA CACHEAMOS → RED SIEMPRE
    if (NEVER_CACHE.some(path => requestUrl.includes(path))) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    // Si falla, mostrar página offline
                    return caches.match('/offline.html');
                })
        );
        return;
    }
    
    // 2. SI ES UN RECURSO ESTÁTICO (css, js, imágenes) → CACHE FIRST
    if (requestUrl.match(/\.(css|js|png|jpg|jpeg|gif|svg|webp|ico)$/)) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(STATIC_CACHE_NAME);
                const cachedResponse = await cache.match(event.request);
                
                if (cachedResponse) {
                    // Devolver del caché y actualizar en segundo plano
                    event.waitUntil(
                        (async () => {
                            try {
                                const networkResponse = await fetch(event.request);
                                await cache.put(event.request, networkResponse.clone());
                            } catch (e) {
                                // No pasa nada si falla
                            }
                        })()
                    );
                    return cachedResponse;
                }
                
                // Si no está en caché, ir a red
                try {
                    const networkResponse = await fetch(event.request);
                    await cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                } catch (e) {
                    return new Response('Recurso no disponible', { status: 404 });
                }
            })()
        );
        return;
    }
    
    // 3. PARA EL RESTO (HTML, API, etc.) → NETWORK FIRST
    event.respondWith(
        (async () => {
            try {
                // Intentar obtener de la red primero
                const networkResponse = await fetch(event.request);
                
                // Si es HTML, guardarlo en caché para offline
                if (networkResponse.headers.get('content-type')?.includes('text/html')) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(event.request, networkResponse.clone());
                }
                
                return networkResponse;
            } catch (error) {
                // Si falla la red, buscar en caché
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(event.request);
                
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Si no hay caché, mostrar página offline
                return caches.match('/offline.html');
            }
        })()
    );
});

// ─── MENSAJES DEL CLIENTE ──────────────────────────────
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
