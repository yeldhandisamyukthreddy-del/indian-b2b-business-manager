// Document totals in integer paise: line discounts, document discount, tax-inclusive prices,
// shipping, CGST/SGST/IGST split, tax rows grouped by tax and rate, and round off.
// Pure: returns a new object and never changes its input.
(function (root, factory) {
    const deps = typeof module === 'object' && module.exports ? { money: require('../money.js') } : root.Vyapar;
    const api = factory(deps.money);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).totals = api;
})(typeof self !== 'undefined' ? self : this, function (money) {
    'use strict';
    const { toPaise, lineAmount, percentOf, splitInclusive, splitHalf, allocate, mulDivRound, scaleDecimal, formatMoney } = money;

    /**
     * @typedef {{ type: 'percent' | 'amount', value: number }} Discount
     * @typedef {{ taxable?: number, amount?: number, tax?: number, cgst?: number, sgst?: number, igst?: number }} StoredLine
     *   Values (in rupees) of a line on an already saved document. When present they are printed as issued.
     * @typedef {{ qty: number, rate: number, gstRate: number, discount?: Discount | null, stored?: StoredLine | null }} TotalsLine
     * @typedef {{ lines: TotalsLine[], interstate?: boolean, inclusive?: boolean, discount?: Discount | null,
     *   shipping?: { amount: number, gstRate: number } | null, roundOff?: 'nearest' | 'none' | { fixed: number } }} TotalsInput
     */

    const rupees = p => formatMoney(p);

    function lineDiscountPaise(gross, discount, n) {
        if (!discount || !discount.value) return 0;
        if (discount.type === 'percent') {
            if (!(discount.value >= 0 && discount.value <= 100)) throw new Error(`Line ${n}: discount must be 0-100%`);
            return percentOf(gross, discount.value);
        }
        const d = toPaise(discount.value);
        if (d < 0 || d > Math.abs(gross)) throw new Error(`Line ${n}: discount ${rupees(d)} is more than the line amount ${rupees(Math.abs(gross))}`);
        return gross < 0 ? -d : d;
    }

    function docDiscountPaise(subTotal, discount) {
        if (!discount || !discount.value) return 0;
        if (discount.type === 'percent') {
            if (!(discount.value >= 0 && discount.value <= 100)) throw new Error('Discount must be 0-100%');
            return percentOf(subTotal, discount.value);
        }
        const d = toPaise(discount.value);
        if (d < 0 || d > subTotal) throw new Error(`Discount ${rupees(d)} is more than the subtotal ${rupees(subTotal)}`);
        return d;
    }

    // Tax on a net amount: exclusive adds tax on top, inclusive takes it out of the amount
    function taxOn(net, gstRate, inclusive, interstate) {
        const { taxable, tax } = inclusive ? splitInclusive(net, gstRate) : { taxable: net, tax: percentOf(net, gstRate) };
        const split = interstate ? { cgst: 0, sgst: 0, igst: tax } : { ...splitHalf(tax), igst: 0 };
        return { taxable, tax, ...split, total: taxable + tax };
    }

    // A saved line: its taxable value and tax are what was issued; only a missing split is derived
    function storedLine(line, interstate) {
        const s = line.stored;
        const taxable = toPaise(s.taxable ?? s.amount);
        const tax = s.tax !== undefined ? toPaise(s.tax) : percentOf(taxable, line.gstRate || 0);
        const hasSplit = s.cgst !== undefined || s.sgst !== undefined || s.igst !== undefined;
        const split = hasSplit
            ? { cgst: toPaise(s.cgst), sgst: toPaise(s.sgst), igst: toPaise(s.igst) }
            : interstate
              ? { cgst: 0, sgst: 0, igst: tax }
              : { ...splitHalf(tax), igst: 0 };
        return { gross: taxable, lineDiscount: 0, amount: taxable, docDiscount: 0, taxable, tax, ...split, total: taxable + tax, gstRate: line.gstRate || 0 };
    }

    function computeLines(input) {
        const { inclusive = false, interstate = false } = input;
        const pre = input.lines.map((line, i) => {
            if (line.stored) return { stored: true };
            const gross = lineAmount(line.qty || 0, line.rate || 0);
            const lineDiscount = lineDiscountPaise(gross, line.discount, i + 1);
            return { gross, lineDiscount, amount: gross - lineDiscount };
        });
        const subTotal = pre.reduce((a, p, i) => a + (p.stored ? toPaise(input.lines[i].stored.taxable ?? input.lines[i].stored.amount) : p.amount), 0);
        const discount = docDiscountPaise(subTotal, input.discount);
        const shares = allocate(
            discount,
            pre.map(p => (p.stored ? 0 : Math.max(0, p.amount)))
        );
        const lines = input.lines.map((line, i) => {
            if (line.stored) return storedLine(line, interstate);
            const p = pre[i];
            const t = taxOn(p.amount - shares[i], line.gstRate || 0, inclusive, interstate);
            return { gross: p.gross, lineDiscount: p.lineDiscount, amount: p.amount, docDiscount: shares[i], ...t, gstRate: line.gstRate || 0 };
        });
        return { lines, subTotal, discount };
    }

    function computeShipping(shipping, inclusive, interstate) {
        if (!shipping || !shipping.amount) return null;
        const amount = toPaise(shipping.amount);
        return { amount, gstRate: shipping.gstRate || 0, ...taxOn(amount, shipping.gstRate || 0, inclusive, interstate) };
    }

    // One row per tax name and rate, e.g. CGST 9% and SGST 9% for an 18% intra-state line
    function groupTaxRows(parts) {
        const rows = new Map();
        const add = (name, rate, amount) => {
            if (!scaleDecimal(rate, 4)) return;
            const key = `${scaleDecimal(rate, 4)}|${name}`;
            const row = rows.get(key) || { name, rate, amount: 0 };
            rows.set(key, { ...row, amount: row.amount + amount });
        };
        parts.forEach(p => {
            if (p.igst) add('IGST', p.gstRate, p.igst);
            if (p.cgst || p.sgst) {
                add('CGST', p.gstRate / 2, p.cgst);
                add('SGST', p.gstRate / 2, p.sgst);
            }
        });
        const order = { CGST: 0, SGST: 1, IGST: 2 };
        return [...rows.values()].sort((a, b) => a.rate - b.rate || order[a.name] - order[b.name]);
    }

    function roundOffPaise(mode, preTotal) {
        if (mode && typeof mode === 'object') return toPaise(mode.fixed);
        if (mode === 'nearest') return mulDivRound(preTotal, 1, 100) * 100 - preTotal;
        return 0;
    }

    /** @param {TotalsInput} input */
    function computeTotals(input) {
        const inclusive = !!input.inclusive;
        const interstate = !!input.interstate;
        const { lines, subTotal, discount } = computeLines(input);
        const shipping = computeShipping(input.shipping, inclusive, interstate);
        const parts = shipping ? [...lines, shipping] : lines;
        const taxRows = groupTaxRows(parts);
        const taxTotal = parts.reduce((a, p) => a + p.tax, 0);
        const taxableTotal = parts.reduce((a, p) => a + p.taxable, 0);
        const preTotal = taxableTotal + taxTotal;
        const roundOff = roundOffPaise(input.roundOff, preTotal);
        return { inclusive, interstate, lines, subTotal, discount, shipping, taxRows, taxTotal, taxableTotal, roundOff, total: preTotal + roundOff };
    }

    return { computeTotals };
});
