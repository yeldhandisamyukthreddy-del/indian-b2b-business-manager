// EU VAT module (preview stub): shows VAT numbers, EORI and the reverse-charge note on printed invoices.
// It does not calculate VAT yet: no 'tax.calculator', so core's simple per-line tax (or another region's
// strategy) applies. Here to prove a second region plugs in without core changes.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const blocks = node ? require('./document-blocks.js') : root.Vyapar.modules.region_eu_vat.documentBlocks;
    const api = factory(blocks);
    if (node) module.exports = api;
    else root.Vyapar.app.register(api);
})(typeof self !== 'undefined' ? self : this, function (blocks) {
    'use strict';
    return {
        id: 'region_eu_vat',
        version: '0.1.0',
        displayName: 'EU VAT (preview)',
        description: 'Preview: EU VAT numbers, EORI and the reverse-charge note on invoices. No VAT calculation or returns yet.',
        dependsOn: [],
        adds: ['VAT number and EORI on printed invoices', 'Reverse-charge note'],
        permissions: ['vat.view'],
        extensionPoints: { 'document.blocks': blocks }
    };
});
