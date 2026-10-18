// Offline support for the installed web app.
// Pages: network first (so updates arrive when online), cache as fallback. Other files: cache first.
const CACHE = 'vyapareasy-v2';
const FILES = [
    './',
    'index.html',
    'manifest.webmanifest',
    'icons/icon.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/maskable-512.png',
    'icons/apple-touch-icon.png',
    'fonts/plus-jakarta-sans-latin-wght-normal.woff2',
    'fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2',
    'js/money.js',
    'js/invoice/adapter.js',
    'js/invoice/format.js',
    'js/invoice/labels.js',
    'js/invoice/mustache.js',
    'js/invoice/regions.js',
    'js/invoice/registry.js',
    'js/invoice/renderer.js',
    'js/invoice/sanitize.js',
    'js/invoice/schema.js',
    'js/invoice/settings-page.js',
    'js/invoice/settings.js',
    'js/invoice/totals.js',
    'js/invoice/ui.js',
    'js/invoice/view-model-table.js',
    'js/invoice/view-model.js',
    'templates/invoices/compact.mustache',
    'templates/invoices/excel_compact.mustache',
    'templates/invoices/pos_thermal.mustache',
    'templates/invoices/standard.mustache',
    'templates/invoices/thermal.mustache',
    'templates/partial/footer.mustache',
    'templates/partial/header.mustache',
    'templates/partial/header_other_pages.mustache',
    'templates/partial/line_item_table.mustache',
    'templates/partial/notes_terms.mustache',
    'templates/partial/payment_details.mustache',
    'templates/partial/payment_stub.mustache',
    'templates/partial/styles_base.mustache',
    'templates/partial/styles_thermal.mustache',
    'templates/partial/subject_block.mustache',
    'templates/partial/subtotal_block.mustache',
    'templates/partial/tax_summary.mustache'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then(cache => cache.addAll(FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches
            .keys()
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
                .then(res => {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put('index.html', copy));
                    return res;
                })
                .catch(() => caches.match('index.html'))
        );
        return;
    }
    event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
