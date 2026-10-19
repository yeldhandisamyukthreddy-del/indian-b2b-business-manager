// Region blocks: plug-ins for country-specific invoice details. Each one has the same shape:
//   orgBlocks(ctx), partyBlocks(party, ctx), documentBlocks(ctx), customFieldBlocks(ctx), notes(ctx)
//     → arrays of { sectionLabel, sectionValue } (notes: strings)
//   taxColumns(style, ctx) → column list for the 'tax' column, or null to use the generic one
//   taxCells(line, style, ctx) → cell values for those columns
//   taxSummary(ctx) → { columns, rows, totalRow } or null
// Core has the generic tax columns and the company's extra tax ids. Region modules contribute their own
// ('document.blocks', e.g. India GST: GSTIN, place of supply, CGST/SGST columns, HSN summary), built with
// region() and the helpers below; the invoice screen passes them in settings.regionModules.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { format: require('./format.js') } : root.Vyapar;
    const api = factory(deps.format);
    if (node) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).regions = api;
})(typeof self !== 'undefined' ? self : this, function (format) {
    'use strict';

    const block = (sectionLabel, sectionValue) =>
        sectionValue === undefined || sectionValue === null || sectionValue === '' ? null : { sectionLabel, sectionValue: String(sectionValue) };
    const blocks = (...list) => list.filter(Boolean);
    const col = (key, label, align = 'end') => ({ key, label, align });
    const cell = (key, value, align = 'end') => ({ key, value, align, sub: [] });
    const pct = (rate, ctx) => format.formatPercent(rate, ctx.locale);

    const BASE = {
        orgBlocks: () => [],
        partyBlocks: () => [],
        documentBlocks: () => [],
        customFieldBlocks: () => [],
        notes: () => [],
        taxColumns: () => null,
        taxCells: () => [],
        taxSummary: () => null
    };

    // One GST % and one tax amount column; used by every region without its own columns
    const generic = {
        ...BASE,
        id: 'generic',
        taxColumns: (style, { labels }) => (style === 'none' ? [] : [col('taxPercent', labels.colTaxPercent), col('taxAmount', labels.colTaxAmount)]),
        taxCells: (line, style, ctx) => (style === 'none' ? [] : [cell('taxPercent', pct(line.gstRate, ctx)), cell('taxAmount', ctx.amount(line.tax))])
    };

    // ---------- Extra tax ids (PAN, CIN, Udyam, FSSAI…) from the company's preferences ----------
    const extraTaxId = {
        ...BASE,
        id: 'extraTaxId',
        orgBlocks: ({ settings }) => blocks(...(settings.extraTaxIds || []).map(x => block(x.label, x.value)))
    };

    // A region plug-in from the parts it has; the rest add nothing
    const region = parts => Object.freeze({ ...BASE, ...parts });
    // Contributed region plug-ins first (in hook order), then the extra tax ids if the company shows them
    const activeModules = (flags = {}, contributed = []) => [...contributed, ...(flags.extraTaxId === true ? [extraTaxId] : [])];

    // Gathers blocks from every active module, in a fixed order
    function collect(modules, ctx) {
        const all = fn => modules.flatMap(m => fn(m));
        const taxModule = modules.find(m => m.taxColumns(ctx.taxStyle, ctx) !== null) || generic;
        return {
            orgBlocks: all(m => m.orgBlocks(ctx)),
            billToBlocks: all(m => m.partyBlocks(ctx.invoice.customer || {}, ctx)),
            shipToBlocks: ctx.invoice.shipTo ? all(m => m.partyBlocks(ctx.invoice.shipTo, ctx)) : [],
            documentBlocks: all(m => m.documentBlocks(ctx)),
            customFieldBlocks: all(m => m.customFieldBlocks(ctx)),
            notes: all(m => m.notes(ctx)),
            taxModule,
            taxSummary: modules.map(m => m.taxSummary(ctx)).find(Boolean) || null
        };
    }

    return { generic, extraTaxId, region, activeModules, collect, helpers: { block, blocks, col, cell, pct } };
});
