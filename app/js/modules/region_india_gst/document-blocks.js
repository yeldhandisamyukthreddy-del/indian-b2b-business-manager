// India GST blocks for printed invoices ('document.blocks'): GSTIN and state of both parties, place of supply,
// reverse charge, e-way bill, CGST/SGST or IGST columns and the HSN/SAC summary. Built on core's region helpers.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const regions = node ? require('../../core/documents/regions.js') : root.Vyapar.regions;
    const api = factory(regions);
    if (node) module.exports = api;
    else {
        const mods = ((root.Vyapar = root.Vyapar || {}).modules = root.Vyapar.modules || {});
        (mods.region_india_gst = mods.region_india_gst || {}).documentBlocks = api;
    }
})(typeof self !== 'undefined' ? self : this, function (regions) {
    'use strict';
    const { block, blocks, col, cell, pct } = regions.helpers;

    const stateText = (name, code, labels) => (code ? `${name || ''} (${labels.stateCode}: ${code})`.trim() : null);

    function splitColumns(interstate, labels) {
        if (interstate) return [col('igstPercent', `${labels.igst} %`), col('igstAmount', labels.igst)];
        return [col('cgstPercent', `${labels.cgst} %`), col('cgstAmount', labels.cgst), col('sgstPercent', `${labels.sgst} %`), col('sgstAmount', labels.sgst)];
    }
    function splitCells(line, interstate, ctx) {
        if (interstate) return [cell('igstPercent', pct(line.gstRate, ctx)), cell('igstAmount', ctx.amount(line.igst))];
        const half = line.gstRate / 2;
        return [
            cell('cgstPercent', pct(half, ctx)),
            cell('cgstAmount', ctx.amount(line.cgst)),
            cell('sgstPercent', pct(half, ctx)),
            cell('sgstAmount', ctx.amount(line.sgst))
        ];
    }

    // HSN/SAC-wise summary: taxable value and tax per HSN code and rate
    function hsnSummary(ctx) {
        const { totals, invoice, labels, interstate } = ctx;
        const groups = new Map();
        const add = (hsn, l) => {
            const key = `${hsn}|${l.gstRate}`;
            const g = groups.get(key) || { hsn, gstRate: l.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
            groups.set(key, { ...g, taxable: g.taxable + l.taxable, cgst: g.cgst + l.cgst, sgst: g.sgst + l.sgst, igst: g.igst + l.igst, tax: g.tax + l.tax });
        };
        totals.lines.forEach((l, i) => add(invoice.lines[i].hsn || '-', l));
        if (totals.shipping) add(labels.shipping, totals.shipping);
        const rows = [...groups.values()].sort((a, b) => String(a.hsn).localeCompare(String(b.hsn)) || a.gstRate - b.gstRate);
        const sum = k => rows.reduce((a, r) => a + r[k], 0);
        const taxCols = splitColumns(interstate, labels);
        const cellsFor = (r, isTotal) => [
            cell('hsn', isTotal ? labels.colTotal : r.hsn, 'start'),
            cell('taxable', ctx.amount(r.taxable)),
            ...(interstate
                ? [cell('igstPercent', isTotal ? '' : pct(r.gstRate, ctx)), cell('igstAmount', ctx.amount(r.igst))]
                : [
                      cell('cgstPercent', isTotal ? '' : pct(r.gstRate / 2, ctx)),
                      cell('cgstAmount', ctx.amount(r.cgst)),
                      cell('sgstPercent', isTotal ? '' : pct(r.gstRate / 2, ctx)),
                      cell('sgstAmount', ctx.amount(r.sgst))
                  ]),
            cell('tax', ctx.amount(r.tax))
        ];
        return {
            columns: [col('hsn', labels.colHsnOrSac, 'start'), col('taxable', labels.taxableValue), ...taxCols, col('tax', labels.totalTax)],
            rows: rows.map(r => ({ cells: cellsFor(r, false) })),
            totalRow: { cells: cellsFor({ taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), tax: sum('tax') }, true) }
        };
    }

    // E-way bill number: kept by this module in invoice.extensions (older invoices: invoice.ewayBillNumber)
    const ewayBill = invoice => {
        const ext = invoice.extensions && invoice.extensions.region_india_gst;
        return ext && 'ewayBillNumber' in ext ? ext.ewayBillNumber : invoice.ewayBillNumber;
    };

    return regions.region({
        id: 'india',
        orgBlocks: ({ org, labels }) => blocks(block(labels.gstin, org.gstin), block(labels.state, stateText(org.stateName, org.stateCode, labels))),
        partyBlocks: (party, { labels }) => blocks(block(labels.gstin, party.gstin), block(labels.state, stateText(party.stateName, party.stateCode, labels))),
        documentBlocks: ({ invoice, labels }) => {
            const pos = invoice.placeOfSupply;
            return blocks(
                block(labels.placeOfSupply, pos ? `${invoice.placeOfSupplyName || ''} (${pos})`.trim() : '-'),
                block(labels.reverseCharge, invoice.reverseCharge ? labels.yes : labels.no)
            );
        },
        customFieldBlocks: ({ invoice, labels }) => blocks(block(labels.ewayBill, ewayBill(invoice))),
        taxColumns: (style, ctx) => (style === 'split' ? splitColumns(ctx.interstate, ctx.labels) : regions.generic.taxColumns(style, ctx)),
        taxCells: (line, style, ctx) => (style === 'split' ? splitCells(line, ctx.interstate, ctx) : regions.generic.taxCells(line, style, ctx)),
        taxSummary: hsnSummary
    });
});
