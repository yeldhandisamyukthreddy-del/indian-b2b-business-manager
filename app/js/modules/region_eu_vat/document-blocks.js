// EU VAT blocks for printed invoices ('document.blocks'): VAT numbers, EORI and the reverse-charge note.
// Part of the EU VAT preview module; there is no EU VAT calculation yet.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const regions = node ? require('../../core/documents/regions.js') : root.Vyapar.regions;
    const api = factory(regions);
    if (node) module.exports = api;
    else {
        const mods = ((root.Vyapar = root.Vyapar || {}).modules = root.Vyapar.modules || {});
        (mods.region_eu_vat = mods.region_eu_vat || {}).documentBlocks = api;
    }
})(typeof self !== 'undefined' ? self : this, function (regions) {
    'use strict';
    const { block, blocks } = regions.helpers;

    return regions.region({
        id: 'eu',
        orgBlocks: ({ org, labels }) => blocks(block(labels.vatNumber, org.vatNumber), block(labels.eori, org.eori)),
        partyBlocks: (party, { labels }) => blocks(block(labels.vatNumber, party.vatNumber)),
        notes: ({ invoice, labels }) => (invoice.reverseCharge ? [labels.reverseChargeNote] : [])
    });
});
