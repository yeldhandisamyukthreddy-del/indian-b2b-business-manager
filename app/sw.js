// Offline support for the installed web app.
// Pages: network first (so updates arrive when online), cache as fallback. Other files: cache first.
const CACHE = 'vyapareasy-v1';
const FILES = [
    './', 'index.html', 'manifest.webmanifest',
    'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
    'fonts/plus-jakarta-sans-latin-wght-normal.woff2', 'fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return res; })
                .catch(() => caches.match('index.html'))
        );
        return;
    }
    event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
