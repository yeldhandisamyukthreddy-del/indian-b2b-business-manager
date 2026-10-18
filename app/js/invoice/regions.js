// Region modules: plug-in blocks for country-specific invoice details. Each module has the same shape:
//   orgBlocks(ctx), partyBlocks(party, ctx), documentBlocks(ctx), customFieldBlocks(ctx), notes(ctx)
//     → arrays of { sectionLabel, sectionValue } (notes: strings)
//   taxColumns(style, ctx) → column list for the 'tax' column, or null to use the generic one
//   taxCells(line, style, ctx) → cell values for those columns
//   taxSummary(ctx) → { columns, rows, totalRow } or null
// India GST is complete. EU VAT and the extra tax id block are smaller, with the same interface.
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

    // ---------- India GST ----------
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

    const india = {
        ...BASE,
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
        customFieldBlocks: ({ invoice, labels }) => blocks(block(labels.ewayBill, invoice.ewayBillNumber)),
        taxColumns: (style, ctx) => (style === 'split' ? splitColumns(ctx.interstate, ctx.labels) : generic.taxColumns(style, ctx)),
        taxCells: (line, style, ctx) => (style === 'split' ? splitCells(line, ctx.interstate, ctx) : generic.taxCells(line, style, ctx)),
        taxSummary: hsnSummary
    };

    // ---------- EU VAT (minimal) ----------
    const eu = {
        ...BASE,
        id: 'eu',
        orgBlocks: ({ org, labels }) => blocks(block(labels.vatNumber, org.vatNumber), block(labels.eori, org.eori)),
        partyBlocks: (party, { labels }) => blocks(block(labels.vatNumber, party.vatNumber)),
        notes: ({ invoice, labels }) => (invoice.reverseCharge ? [labels.reverseChargeNote] : [])
    };

    // ---------- Extra tax ids (PAN, CIN, Udyam, FSSAI…) from the company's preferences ----------
    const extraTaxId = {
        ...BASE,
        id: 'extraTaxId',
        orgBlocks: ({ settings }) => blocks(...(settings.extraTaxIds || []).map(x => block(x.label, x.value)))
    };

    const MODULES = { india, eu, extraTaxId };
    const ORDER = ['india', 'eu', 'extraTaxId'];
    const activeModules = (regions = {}) => ORDER.filter(id => regions[id] === true).map(id => MODULES[id]);

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

    return { MODULES, generic, activeModules, collect };
});
