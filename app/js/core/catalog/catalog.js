// Catalog: products and services, units and price lists. Pure rules shared by the product and price-list
// pages and the line editor.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { money: require('../shared/money.js') } : { money: root.Vyapar.money };
    const api = factory(deps.money);
    if (node) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).catalog = api;
})(typeof self !== 'undefined' ? self : this, function (money) {
    'use strict';

    const UNITS = Object.freeze([
        'NOS',
        'PCS',
        'KG',
        'GM',
        'LTR',
        'ML',
        'MTR',
        'SQFT',
        'BOX',
        'BAG',
        'TON',
        'DOZ',
        'SET',
        'PAIR',
        'ROLL',
        'COIL',
        'HRS',
        'JOB',
        'TRIP'
    ]);
    const PRICE_LIST_KINDS = Object.freeze(['markup', 'discount', 'fixed']);

    function validateProduct(p) {
        const errors = [];
        if (!String(p.name || '').trim()) errors.push('Name is required');
        if (Number(p.salePrice) < 0) errors.push('Sale price cannot be negative');
        if (Number(p.purchasePrice) < 0) errors.push('Purchase price cannot be negative');
        if (!(Number(p.gstRate) >= 0 && Number(p.gstRate) <= 100)) errors.push('Tax rate must be between 0 and 100');
        return errors;
    }

    function validatePriceList(list) {
        const errors = [];
        if (!String(list.name || '').trim()) errors.push('Name is required');
        if (!PRICE_LIST_KINDS.includes(list.kind)) errors.push('Kind must be markup, discount or fixed');
        if ((list.kind === 'markup' || list.kind === 'discount') && !(Number(list.percent) >= 0 && Number(list.percent) <= 100))
            errors.push('Percent must be between 0 and 100');
        if (list.kind === 'fixed' && Object.values(list.prices || {}).some(v => !(Number(v) >= 0))) errors.push('Prices cannot be negative');
        return errors;
    }

    // Price of a product for a customer's price list (rupees, rounded to paise)
    function priceFor(product, priceList, field = 'salePrice') {
        const base = Number(product[field]) || 0;
        if (!priceList) return base;
        if (priceList.kind === 'fixed') return priceList.prices && priceList.prices[product.id] !== undefined ? Number(priceList.prices[product.id]) : base;
        const basePaise = money.toPaise(base);
        const change = money.percentOf(basePaise, priceList.percent || 0);
        return money.fromPaise(priceList.kind === 'markup' ? basePaise + change : basePaise - change);
    }

    return { UNITS, PRICE_LIST_KINDS, validateProduct, validatePriceList, priceFor };
});
