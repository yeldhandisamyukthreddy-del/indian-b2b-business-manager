// India GST rules: rates, intra/inter-state split, GSTIN checks and the GST tax strategy the module offers
// to core ('tax.calculator'). Pure functions; loaded in the page (Vyapar.modules.region_india_gst.gst) and in Node tests.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { money: require('../../core/shared/money.js') } : { money: root.Vyapar.money };
    const api = factory(deps.money);
    if (node) module.exports = api;
    else {
        const mods = ((root.Vyapar = root.Vyapar || {}).modules = root.Vyapar.modules || {});
        (mods.region_india_gst = mods.region_india_gst || {}).gst = api;
    }
})(typeof self !== 'undefined' ? self : this, function (money) {
    'use strict';
    const { lineAmount, percentOf, splitHalf, fromPaise, toPaise } = money;

    // GST slabs. 12% and 28% were merged into 5%/18%/40% from 22 Sep 2025 but stay selectable for older documents.
    const GST_RATES = Object.freeze([0, 0.25, 1.5, 3, 5, 12, 18, 28, 40]);

    // Inter-state when the supplier's state differs from the place of supply. Unknown states are treated as intra-state.
    const isInterstate = (fromState, toState) => !!(fromState && toState && fromState !== toState);

    // Fills taxable/cgst/sgst/igst/tax/total on each line (rupees) and returns the document totals.
    // Whole paise, half away from zero per line; CGST gets the rounded half and SGST the rest.
    function computeGst(items, interstate) {
        const t = { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 };
        items.forEach(it => {
            const taxable = lineAmount(it.qty || 0, it.rate || 0);
            const tax = percentOf(taxable, it.gstRate || 0);
            const split = interstate ? { cgst: 0, sgst: 0, igst: tax } : { ...splitHalf(tax), igst: 0 };
            const line = { taxable, ...split, tax, total: taxable + tax };
            Object.keys(line).forEach(k => {
                t[k] += line[k];
                it[k] = fromPaise(line[k]);
            });
            it.amount = it.taxable;
        });
        Object.keys(t).forEach(k => (t[k] = fromPaise(t[k])));
        return t;
    }

    // A credit or debit note follows its original document: IGST if that one had IGST
    function interstateFor({ fromState, toState, source }) {
        if (source && source.igst !== undefined) return source.igst > 0;
        if (source && source.interstate !== undefined) return !!source.interstate;
        return isInterstate(fromState, toState);
    }

    // The strategy core uses for every document while this module is on
    const calculator = Object.freeze({
        id: 'india-gst',
        label: 'GST',
        taxIdLabel: 'GSTIN',
        computeLines(items, context = {}) {
            const interstate = interstateFor(context);
            const lines = items.map(it => ({ ...it }));
            const t = computeGst(lines, interstate);
            lines.forEach(l => {
                l.taxComponents = interstate
                    ? [{ code: 'IGST', rate: l.gstRate || 0, amount: l.igst }]
                    : [
                          { code: 'CGST', rate: (l.gstRate || 0) / 2, amount: l.cgst },
                          { code: 'SGST', rate: (l.gstRate || 0) / 2, amount: l.sgst }
                      ];
            });
            const components = interstate
                ? [{ label: 'IGST', amount: t.igst }]
                : [
                      { label: 'CGST', amount: t.cgst },
                      { label: 'SGST', amount: t.sgst }
                  ];
            return {
                lines,
                totals: {
                    taxable: t.taxable,
                    tax: t.tax,
                    total: t.total,
                    components,
                    docFields: { cgst: t.cgst, sgst: t.sgst, igst: t.igst, interstate, placeOfSupply: context.toState || '' }
                }
            };
        }
    });

    // CGST/SGST/IGST of a saved document. Older records only stored total tax, so split it using the states.
    function gstSplit(doc, companyState, partyState) {
        if (doc.cgst !== undefined || doc.igst !== undefined) return { cgst: doc.cgst || 0, sgst: doc.sgst || 0, igst: doc.igst || 0 };
        const tax = toPaise(doc.tax || 0);
        if (isInterstate(companyState, doc.placeOfSupply || partyState)) return { cgst: 0, sgst: 0, igst: fromPaise(tax) };
        const { cgst, sgst } = splitHalf(tax);
        return { cgst: fromPaise(cgst), sgst: fromPaise(sgst), igst: 0 };
    }

    // ---------- GSTIN ----------
    const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
    const CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    // Check character (15th) of a GSTIN: weights 1,2,1,2... on the first 14 characters, base 36
    function gstinCheckChar(first14) {
        let sum = 0;
        for (let i = 0; i < 14; i++) {
            const product = CODE_CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
            sum += Math.floor(product / 36) + (product % 36);
        }
        return CODE_CHARS[(36 - (sum % 36)) % 36];
    }
    const normalizeGstin = g =>
        String(g || '')
            .toUpperCase()
            .replace(/\s/g, '');

    // { error } blocks saving (format, state); { warning } asks first (check character, which a typo usually breaks)
    function checkGstin(gstin, stateCode) {
        const g = normalizeGstin(gstin);
        if (!g) return {};
        if (!GSTIN.test(g)) return { error: 'GSTIN must be 15 characters (e.g., 27AAPFU0939F1ZV)' };
        if (stateCode && g.slice(0, 2) !== stateCode)
            return { error: `GSTIN starts with ${g.slice(0, 2)}, which does not match the selected state (${stateCode})` };
        const expected = gstinCheckChar(g);
        if (g[14] !== expected)
            return { warning: `GSTIN ${g} looks mistyped: its last character should be ${expected}. Check it against the GST certificate.` };
        return {};
    }

    // Inter-state B2C invoices above this value are reported one by one (B2CL) in GSTR-1
    const B2CL_LIMIT = 100000;
    const supplyType = (gstin, igst, grandTotal) => (gstin ? 'B2B' : igst > 0 && grandTotal > B2CL_LIMIT ? 'B2CL' : 'B2CS');

    return { GST_RATES, isInterstate, computeGst, calculator, gstSplit, checkGstin, gstinCheckChar, normalizeGstin, B2CL_LIMIT, supplyType };
});
