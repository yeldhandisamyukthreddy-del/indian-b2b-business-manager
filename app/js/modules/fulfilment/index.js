// Fulfilment module: sales orders and delivery challans between a quotation and the invoice.
// Depends on inventory: a challan checks the stock on hand before goods leave.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Vyapar.app.register(api);
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return {
        id: 'fulfilment',
        version: '1.0.0',
        displayName: 'Orders & Delivery',
        description: 'Sales orders from quotations, delivery challans and invoices from orders.',
        dependsOn: ['inventory'],
        adds: ['Sales orders (from quotations)', 'Delivery challans with vehicle', 'Invoice from a sales order', 'Stock check before dispatch'],
        stores: ['salesOrders', 'challans'],
        navItems: [
            {
                id: 'sales-orders',
                label: 'Sales Orders',
                labels: { te: 'అమ్మక ఆర్డర్లు' },
                route: 'sales-orders',
                section: 'sales',
                order: 20,
                requires: ['fulfilment.view'],
                icon: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2" />'
            },
            {
                id: 'challans',
                label: 'Delivery Challans',
                labels: { te: 'డెలివరీ ఛలాన్లు' },
                route: 'challans',
                section: 'sales',
                order: 30,
                requires: ['fulfilment.view'],
                icon: '<rect x="1" y="3" width="15" height="13" /> <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /> <circle cx="5.5" cy="18.5" r="2.5" /> <circle cx="18.5" cy="18.5" r="2.5" />'
            }
        ],
        permissions: ['fulfilment.view', 'fulfilment.manage'],
        extensionPoints: {
            'numbering.series': [
                { type: 'salesOrder', store: 'salesOrders', prefix: 'SO-' },
                { type: 'challan', store: 'challans', prefix: 'DC-' }
            ],
            'quotation.actions': {
                title: 'Convert to Sales Order',
                icon: '📋',
                when: q => q.status !== 'converted' && q.status !== 'invoiced',
                onclick: q => `convertToOrder(${q.id})`
            }
        }
    };
});
