/* ========================================
   PEDIDOS CRUZ - Service Worker (modo sin conexión)
   - App (HTML/CSS/JS/íconos/CDN): se guarda para abrir sin internet
   - API GET: red primero; si no hay señal (o tarda), responde lo guardado
   - Fotos de productos: se guardan la primera vez que se ven
   Los envíos (POST) NO pasan por aquí: la cola de pendientes vive en offline.js
   ======================================== */

const VERSION = 'v2';
const STATIC = 'pc-static-' + VERSION;
const API_CACHE = 'pc-api';
const IMG_CACHE = 'pc-img';
const API_TIMEOUT_MS = 6000; // señal débil: pasado este tiempo se usa lo guardado

// La URL base de la API llega como parámetro al registrar (sw.js?api=...)
const API_BASE = new URL(self.location.href).searchParams.get('api') || (self.location.origin + '/api/public');

// Fuentes de íconos (Font Awesome): el CSS las pide después, hay que guardarlas explícitamente
const FA = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/';
const FUENTES = [
    FA + 'css/all.min.css',
    FA + 'webfonts/fa-solid-900.woff2',
    FA + 'webfonts/fa-regular-400.woff2',
    FA + 'webfonts/fa-brands-400.woff2',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC)
            .then(async c => {
                await c.addAll(['./', './index.html', './manifest.webmanifest', './img/icon-192.png', './img/icon-512.png']);
                // Best effort: si un CDN falla, la instalación igual continúa
                await Promise.all(FUENTES.map(u => fetch(u, { mode: 'cors', credentials: 'omit' })
                    .then(r => r.ok && c.put(u, r)).catch(() => null)));
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k.startsWith('pc-static-') && k !== STATIC).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', event => {
    if (event.data === 'clear-api') event.waitUntil(caches.delete(API_CACHE));
    // La página envía los archivos que cargó antes de que el SW la controlara (primera visita)
    if (event.data?.type === 'cache-urls') {
        event.waitUntil(caches.open(STATIC).then(async cache => {
            for (const u of event.data.urls) {
                if (await cache.match(u)) continue;
                try {
                    // Los CDN (cdnjs/jsdelivr) permiten CORS: así las fuentes de íconos sirven desde la caché
                    const resp = await fetch(u, { mode: new URL(u).origin === self.location.origin ? 'same-origin' : 'cors', credentials: 'omit' });
                    if (resp.ok) await cache.put(u, resp);
                } catch (e) { /* se intentará en la próxima visita */ }
            }
        }));
    }
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = req.url;
    if (url.includes('__version_check')) return; // aviso de nueva versión: siempre al servidor

    if (url.startsWith(API_BASE + '/uploads/')) {
        event.respondWith(cacheFirst(req, IMG_CACHE));
    } else if (url.startsWith(API_BASE + '/')) {
        event.respondWith(apiNetworkFirst(req));
    } else if (req.mode === 'navigate') {
        event.respondWith(navigationNetworkFirst(req));
    } else if (new URL(url).origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(req));
    } else if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url)) {
        event.respondWith(cacheFirst(req, STATIC));
    }
});

/** API: red primero con tiempo límite; guarda cada respuesta buena para usarla sin señal */
async function apiNetworkFirst(req) {
    const cache = await caches.open(API_CACHE);
    const network = fetch(req).then(resp => {
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
    });

    try {
        return await Promise.race([
            network,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), API_TIMEOUT_MS)),
        ]);
    } catch (e) {
        const cached = await cache.match(req);
        if (cached) {
            // Si fue timeout, la red sigue en curso y actualizará lo guardado
            network.catch(() => {});
            const headers = new Headers(cached.headers);
            headers.set('X-Offline-Cache', '1');
            return new Response(await cached.blob(), { status: cached.status, headers });
        }
        // Sin guardado: si la red termina tarde, igual se devuelve su respuesta
        try {
            return await network;
        } catch (err) {
            return new Response(JSON.stringify({
                error: true, offline: true,
                mensaje: 'Sin conexión y sin datos guardados para esta sección. Ábrela una vez con internet.',
            }), { status: 503, headers: { 'Content-Type': 'application/json', 'X-Offline-Cache': '1' } });
        }
    }
}

async function navigationNetworkFirst(req) {
    const cache = await caches.open(STATIC);
    try {
        const resp = await fetch(req);
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
    } catch (e) {
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
    }
}

async function staleWhileRevalidate(req) {
    const cache = await caches.open(STATIC);
    const cached = await cache.match(req);
    const network = fetch(req).then(resp => {
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
    }).catch(() => null);
    return cached || (await network) || Response.error();
}

async function cacheFirst(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
        const resp = await fetch(req);
        if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone());
        return resp;
    } catch (e) {
        return Response.error();
    }
}
