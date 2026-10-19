// Product editions are data: a name and the modules it turns on. A company has an edition plus optional
// per-module choices (see runtime.js). India GST is in every edition because this app's invoices are GST invoices.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).platform = root.Vyapar.platform || {}).editions = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const EDITIONS = Object.freeze({
        invoicing: Object.freeze({
            label: 'Invoicing',
            description: 'Quotations, GST invoices, credit notes, receipts, expenses and recurring invoices.',
            modules: Object.freeze(['region_india_gst'])
        }),
        business: Object.freeze({
            label: 'Business',
            description: 'Invoicing plus purchases, stock and double-entry accounts.',
            modules: Object.freeze(['region_india_gst', 'purchasing', 'inventory', 'accounting'])
        }),
        full: Object.freeze({
            label: 'Full',
            description: 'Everything: also sales orders and delivery challans, HR and payroll, vehicles and the remaining modules.',
            modules: '*'
        })
    });
    const DEFAULT_EDITION = 'full';

    const editionNames = () => Object.keys(EDITIONS);
    const isEdition = name => typeof name === 'string' && Object.prototype.hasOwnProperty.call(EDITIONS, name);

    function modulesForEdition(name, registry) {
        if (!isEdition(name)) throw new Error(`Unknown edition "${String(name).slice(0, 30)}". Choose one of: ${editionNames().join(', ')}`);
        const list = EDITIONS[name].modules;
        return list === '*' ? registry.ids() : list.filter(id => registry.get(id));
    }

    return { EDITIONS, DEFAULT_EDITION, editionNames, isEdition, modulesForEdition };
});
