// Expenses: money spent that is not a purchase bill (rent, electricity, travel…). Pure rules for the expense page,
// its report and the 'expense.created' event that modules such as accounting listen to.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { money: require('../shared/money.js') } : { money: root.Vyapar.money };
    const api = factory(deps.money);
    if (node) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).expenses = api;
})(typeof self !== 'undefined' ? self : this, function (money) {
    'use strict';

    const CATEGORIES = Object.freeze([
        'Rent',
        'Salaries & Wages',
        'Electricity & Water',
        'Telephone & Internet',
        'Travel & Conveyance',
        'Fuel',
        'Office Supplies',
        'Repairs & Maintenance',
        'Professional Fees',
        'Bank Charges',
        'Advertising',
        'Freight & Courier',
        'Other'
    ]);

    function validateExpense(e) {
        const errors = [];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) errors.push('Date must be a date');
        if (!CATEGORIES.includes(e.category)) errors.push('Category is not in the list');
        if (!(Number(e.amount) > 0)) errors.push('Amount must be more than 0');
        else if (Number(e.taxAmount) > Number(e.amount)) errors.push('Tax cannot be more than the amount');
        return errors;
    }

    // Unknown categories (e.g. from older data) go last
    const rank = c => (CATEGORIES.includes(c) ? CATEGORIES.indexOf(c) : CATEGORIES.length);
    // [{ category, amount (paise) }] in category order
    function totalsByCategory(list) {
        const sums = new Map();
        list.forEach(e => sums.set(e.category, (sums.get(e.category) || 0) + money.toPaise(e.amount)));
        return [...sums.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([category, amount]) => ({ category, amount }));
    }

    return { CATEGORIES, validateExpense, totalsByCategory };
});
