// Tax strategy. Core defines the TaxCalculator interface and a simple rate-based default; a region module
// (for example India GST) supplies its own strategy through the 'tax.calculator' extension point.
//   TaxCalculator: { id, computeLines(items, context) → { lines, totals: { taxable, tax, total } } }
// Lines and totals are in rupees (as stored); the arithmetic runs in whole paise.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { money: require('../shared/money.js') } : { money: root.Vyapar.money };
    const api = factory(deps.money);
    if (node) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).tax = api;
})(typeof self !== 'undefined' ? self : this, function (money) {
    'use strict';
    const { lineAmount, percentOf, fromPaise } = money;

    // Rates offered when no region module supplies its own list
    const DEFAULT_RATES = Object.freeze([0, 5, 10, 12, 18, 20, 28]);

    // One tax per line at the line's rate (field gstRate, kept for stored data)
    const defaultCalculator = Object.freeze({
        id: 'default',
        label: 'Tax',
        computeLines(items) {
            const sum = { taxable: 0, tax: 0, total: 0 };
            const lines = items.map(it => {
                const taxable = lineAmount(it.qty || 0, it.rate || 0);
                const t = percentOf(taxable, it.gstRate || 0);
                sum.taxable += taxable;
                sum.tax += t;
                sum.total += taxable + t;
                return {
                    ...it,
                    taxable: fromPaise(taxable),
                    tax: fromPaise(t),
                    amount: fromPaise(taxable),
                    total: fromPaise(taxable + t),
                    taxComponents: it.gstRate ? [{ code: 'TAX', rate: it.gstRate, amount: fromPaise(t) }] : []
                };
            });
            return { lines, totals: { taxable: fromPaise(sum.taxable), tax: fromPaise(sum.tax), total: fromPaise(sum.total) } };
        }
    });

    // contributions: ordered 'tax.calculator' hooks; the first one wins
    function resolveCalculator(contributions) {
        const first = contributions[0];
        if (!first) return defaultCalculator;
        if (!first.value || typeof first.value.computeLines !== 'function')
            throw new Error(`Module "${first.moduleId}" offers a tax strategy without computeLines`);
        return first.value;
    }

    const resolveRates = contributions => (contributions[0] && Array.isArray(contributions[0].value) ? contributions[0].value : DEFAULT_RATES);

    return { DEFAULT_RATES, defaultCalculator, resolveCalculator, resolveRates };
});
