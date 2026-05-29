'use strict';

const CACHE_NAME = 'radio-player-v14';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/css/animate.css',
    '/css/font-awesome.min.css',
    '/js/plasma.js',
    '/js/script.js',
    '/js/bootstrap.min.js',
    '/img/cover.png',
    '/manifest.json'
];

// Install: cache core assets with graceful fallback
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[ServiceWorker] Caching static assets');
                // Try to add all assets, but don't fail if some are missing
                return cache.addAll(STATIC_ASSETS)
                    .catch((err) => {
                        console.warn('[ServiceWorker] Some assets failed to cache (this may be expected for CDN resources):', err);
                        // Continue with installation even if some assets fail
                        // Try adding assets individually to identify problematic ones
                        return Promise.allSettled(
                            STATIC_ASSETS.map(asset => cache.add(asset))
                        ).then((results) => {
                            const failed = results
                                .map((r, i) => ({ asset: STATIC_ASSETS[i], status: r.status }))
                                .filter(r => r.status === 'rejected');
                            if (failed.length > 0) {
                                console.warn('[ServiceWorker] Failed to cache:', failed);
                            }
                        });
                    });
            })
            .then(() => self.skipWaiting())
    );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[ServiceWorker] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: network-first for HTML, cache-first for static assets
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip cross-origin requests (e.g., streaming, APIs, CDNs)
    if (url.origin !== self.location.origin) return;

    // Network-first for navigation / HTML
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return networkResponse;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Cache-first for static assets
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                // Refresh cache in background
                fetch(request)
                    .then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, networkResponse.clone());
                            });
                        }
                    })
                    .catch(() => { /* ignore background refresh failures */ });
                return cachedResponse;
            }

            return fetch(request)
                .then((networkResponse) => {
                    // Only cache successful responses
                    if (networkResponse && networkResponse.status === 200) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return networkResponse;
                })
                .catch((err) => {
                    console.warn('[ServiceWorker] Fetch failed for:', request.url, err);
                    // Return a custom offline page or fallback if desired
                    return new Response('Offline - resource not available', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                });
        })
    );
});
