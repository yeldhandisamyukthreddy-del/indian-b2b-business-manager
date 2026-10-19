// Inventory module: stock on hand as a ledger of movements, built from the documents' events.
// Listens to invoices and credit notes (core) and to purchase bills and debit notes (from purchasing, if it
// is on) without depending on either. Adds stock fields and columns to products, a stock check to invoices,
// batch and expiry per line, warehouses and the stock pages.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const stock = node ? require('./stock.js') : root.Vyapar.modules.inventory.stock;
    const api = factory(stock);
    if (node) module.exports = api;
    else root.Vyapar.app.register(api);
})(typeof self !== 'undefined' ? self : this, function (stock) {
    'use strict';
    const { MOVEMENTS } = stock;
    const today = now => String(now()).slice(0, 10);

    const onDocument = (event, ctx) => stock.record(ctx, stock.movementsFor(event));
    // A product created with an opening quantity (the field this module adds to the product form)
    async function onProductSaved(event, ctx) {
        const p = event.payload.product;
        const opening = p.extensions && p.extensions.inventory && p.extensions.inventory.stockQty;
        if (event.payload.created && typeof opening === 'number') await stock.record(ctx, [stock.openingMovement(p, opening, today(ctx.now))]);
    }

    const stockReport = {
        id: 'stock',
        label: 'Stock Summary',
        icon: '📦',
        description: 'Stock on hand and its value',
        order: 45,
        filters: [],
        async run(ctx) {
            const rows = (await ctx.list('products')).map(p => ({
                name: p.name,
                unit: p.unit || '',
                qty: p.stockQty || 0,
                low: stock.isLowStock(p) ? 'Low' : '',
                value: Math.round(Math.max(p.stockQty || 0, 0) * (p.purchasePrice || 0) * 100)
            }));
            return {
                title: '📦 Stock Summary',
                summary: [
                    { label: 'Items', value: rows.length, format: 'count', tone: 'primary' },
                    { label: 'Stock Value (at purchase price)', value: rows.reduce((s, r) => s + r.value, 0), format: 'money', tone: 'success' },
                    { label: 'Low Stock Items', value: rows.filter(r => r.low).length, format: 'count', tone: 'danger' }
                ],
                tables: [
                    {
                        columns: [
                            { key: 'name', label: 'Product' },
                            { key: 'unit', label: 'Unit' },
                            { key: 'qty', label: 'Stock Qty' },
                            { key: 'low', label: '' },
                            { key: 'value', label: 'Value', format: 'money' }
                        ],
                        rows
                    }
                ],
                csv: rows.map(r => ({ Product: r.name, Unit: r.unit, Qty: r.qty, Value: r.value / 100 }))
            };
        }
    };

    return {
        id: 'inventory',
        version: '1.0.0',
        displayName: 'Inventory',
        description: 'Stock on hand from every sale, return and purchase, with adjustments, batches and low-stock alerts.',
        dependsOn: [],
        adds: [
            'Stock on hand per product, updated by invoices, returns and bills',
            'Stock adjustments with a movement history',
            'Batch and expiry per line',
            'Low stock alerts and a stock check when invoicing',
            'Warehouses'
        ],
        stores: ['stockMovements', 'warehouses', 'stock'],
        sections: [{ id: 'inventory', label: 'Inventory', labels: { te: 'స్టాక్' }, order: 40 }],
        navItems: [
            {
                id: 'stock',
                label: 'Stock Summary',
                labels: { te: 'స్టాక్ సారాంశం' },
                route: 'stock',
                section: 'inventory',
                order: 10,
                requires: ['inventory.view'],
                newAction: 'showStockAdjustment',
                icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /> <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />'
            },
            {
                id: 'warehouses',
                label: 'Warehouses',
                labels: { te: 'గిడ్డంగులు' },
                route: 'warehouses',
                section: 'masters',
                order: 50,
                requires: ['inventory.view'],
                newAction: 'showWarehouseForm',
                icon: '<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />'
            }
        ],
        permissions: ['inventory.view', 'inventory.adjust'],
        migrations: [
            {
                // Stock tracking starts from the quantities products have when the module is first turned on
                id: '001-opening-stock',
                up: async ctx =>
                    stock.record(
                        ctx,
                        (await ctx.repo('products').list()).map(p => stock.openingMovement(p, p.stockQty || 0, today(ctx.now)))
                    ),
                // Rolling back removes the movement history; products keep their last stock figure
                down: async ctx => {
                    const repo = ctx.repo(MOVEMENTS);
                    for (const m of await repo.list()) await repo.remove(m.id);
                }
            }
        ],
        eventSubscriptions: {
            ...Object.fromEntries(Object.keys(stock.RULES).map(type => [type, onDocument])),
            'product.saved': onProductSaved
        },
        extensionPoints: {
            'product.fields': [
                {
                    name: 'stockQty',
                    label: 'Opening Stock Qty',
                    type: 'number',
                    step: 'any',
                    on: 'create',
                    default: 0,
                    value: () => 0,
                    hint: p => `Stock on hand: ${p.stockQty || 0} ${p.unit || ''}. Change it with an adjustment under Inventory → Stock Summary.`
                },
                { name: 'minStock', label: 'Low stock alert at', type: 'number', step: 'any', on: 'both', default: 10, value: p => stock.lowStockLevel(p) }
            ],
            'product.columns': { label: 'Stock Qty', value: p => p.stockQty || 0, className: p => (stock.isLowStock(p) ? 'low-stock-alert' : '') },
            'catalog.productHint': p => `Stock: ${p.stockQty || 0} ${p.unit || ''}`.trim(),
            'line.fields': [
                { name: 'batch', label: 'Batch no (optional)' },
                { name: 'expiry', label: 'Expiry (optional)', type: 'date' }
            ],
            // Selling more than is on hand is allowed (stock goes negative), but asked first
            'invoice.validate': async (doc, { previous, list }) =>
                stock.shortages(doc.items || [], await list('products'), (previous && previous.items) || []).map(s => ({
                    warning: `Not enough stock of ${s.name}: in stock ${s.onHand}, invoicing ${s.needed}. Stock will go negative.`
                })),
            'dashboard.stats': async ({ list }) => [
                { label: 'Low Stock Items', value: (await list('products')).filter(stock.isLowStock).length, format: 'count', tone: 'danger' }
            ],
            'dashboard.lists': async ({ list }) => {
                const low = (await list('products')).filter(stock.isLowStock);
                return low.length
                    ? [
                          {
                              title: '⚠️ Low Stock Alerts',
                              columns: [
                                  { key: 'name', label: 'Product' },
                                  { key: 'qty', label: 'Current Stock' },
                                  { key: 'unit', label: 'Unit' }
                              ],
                              rows: low.map(p => ({ name: p.name, qty: p.stockQty || 0, unit: p.unit || '-' }))
                          }
                      ]
                    : [];
            },
            'reports.entries': stockReport
        }
    };
});
