// Offline support for the installed web app.
// Pages: network first (so updates arrive when online), cache as fallback. Other files: cache first.
const CACHE = 'vyapareasy-v5';
const FILES = [
    './',
    'index.html',
    'manifest.webmanifest',
    'icons/apple-touch-icon.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon.svg',
    'icons/maskable-512.png',
    'fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2',
    'fonts/plus-jakarta-sans-latin-wght-normal.woff2',
    'js/core/catalog/catalog.js',
    'js/core/contacts/contacts.js',
    'js/core/currency/currency.js',
    'js/core/documents/adapter.js',
    'js/core/documents/format.js',
    'js/core/documents/labels.js',
    'js/core/documents/mustache.js',
    'js/core/documents/regions.js',
    'js/core/documents/registry.js',
    'js/core/documents/renderer.js',
    'js/core/documents/sanitize.js',
    'js/core/documents/schema.js',
    'js/core/documents/settings-page.js',
    'js/core/documents/settings.js',
    'js/core/documents/totals.js',
    'js/core/documents/ui.js',
    'js/core/documents/view-model-table.js',
    'js/core/documents/view-model.js',
    'js/core/expenses/expenses.js',
    'js/core/navigation.js',
    'js/core/reports/reports.js',
    'js/core/sales/recurring.js',
    'js/core/sales/sales.js',
    'js/core/shared/money.js',
    'js/core/shared/repository.js',
    'js/core/shared/result.js',
    'js/core/shared/validate.js',
    'js/core/tax/tax.js',
    'js/core/ui/expenses-page.js',
    'js/core/ui/price-lists-page.js',
    'js/core/ui/recurring-page.js',
    'js/modules/accounting/books.js',
    'js/modules/accounting/index.js',
    'js/modules/accounting/ui.js',
    'js/modules/export_accounting/index.js',
    'js/modules/export_accounting/ui.js',
    'js/modules/fleet/index.js',
    'js/modules/fleet/ui.js',
    'js/modules/fulfilment/index.js',
    'js/modules/fulfilment/ui.js',
    'js/modules/hr/index.js',
    'js/modules/hr/ui.js',
    'js/modules/inventory/index.js',
    'js/modules/inventory/stock.js',
    'js/modules/inventory/ui.js',
    'js/modules/purchasing/index.js',
    'js/modules/purchasing/ui.js',
    'js/modules/region_eu_vat/document-blocks.js',
    'js/modules/region_eu_vat/index.js',
    'js/modules/region_india_gst/document-blocks.js',
    'js/modules/region_india_gst/gst.js',
    'js/modules/region_india_gst/index.js',
    'js/modules/region_india_gst/returns.js',
    'js/modules/region_india_gst/ui.js',
    'js/platform/bootstrap.js',
    'js/platform/editions.js',
    'js/platform/events.js',
    'js/platform/features-page.js',
    'js/platform/hooks.js',
    'js/platform/registry.js',
    'js/platform/runtime.js',
    'js/platform/ui-shell.js',
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
