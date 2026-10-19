// Currencies and the shared Money type: { amount: integer minor units, currency }. Amounts in different
// currencies never mix; conversion uses the one rounding rule (half away from zero, see shared/money.js).
// The app's documents are in INR today; this is the type multi-currency work builds on.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { money: require('../shared/money.js') } : { money: root.Vyapar.money };
    const api = factory(deps.money);
    if (node) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).currency = api;
})(typeof self !== 'undefined' ? self : this, function (moneyCore) {
    'use strict';

    const CURRENCIES = Object.freeze({
        INR: { minor: 2, locale: 'en-IN' },
        USD: { minor: 2, locale: 'en-US' },
        EUR: { minor: 2, locale: 'en-IE' },
        GBP: { minor: 2, locale: 'en-GB' },
        AED: { minor: 2, locale: 'en-AE' },
        SGD: { minor: 2, locale: 'en-SG' },
        JPY: { minor: 0, locale: 'ja-JP' }
    });

    function info(code) {
        if (!Object.prototype.hasOwnProperty.call(CURRENCIES, code)) throw new Error(`Unknown currency "${String(code).slice(0, 10)}"`);
        return CURRENCIES[code];
    }

    function money(amount, currency) {
        info(currency);
        if (!Number.isInteger(amount)) throw new Error('A money amount must be a whole number of minor units (paise, cents)');
        return Object.freeze({ amount, currency });
    }

    function same(a, b) {
        if (a.currency !== b.currency) throw new Error(`Cannot combine ${a.currency} and ${b.currency}`);
    }
    const add = (a, b) => (same(a, b), money(a.amount + b.amount, a.currency));
    const subtract = (a, b) => (same(a, b), money(a.amount - b.amount, a.currency));

    // '1,234.56' → 123456 paise
    const parse = (text, currency) => money(moneyCore.scaleDecimal(String(text).replace(/,/g, ''), info(currency).minor), currency);

    // rate: units of `to` per unit of the source currency, as decimal text (e.g. '83.125')
    function convert(m, to, rate) {
        const target = info(to);
        const r = Number(rate);
        if (!(r > 0)) throw new Error('An exchange rate must be a positive number');
        const RATE_PLACES = 6;
        const scaledRate = moneyCore.scaleDecimal(rate, RATE_PLACES);
        const shift = target.minor - info(m.currency).minor;
        const numerator = shift >= 0 ? scaledRate * 10 ** shift : scaledRate;
        const denominator = 10 ** RATE_PLACES * (shift < 0 ? 10 ** -shift : 1);
        return money(moneyCore.mulDivRound(m.amount, numerator, denominator), to);
    }

    const format = m =>
        new Intl.NumberFormat(info(m.currency).locale, { style: 'currency', currency: m.currency }).format(m.amount / 10 ** info(m.currency).minor);

    return { CURRENCIES, money, add, subtract, parse, convert, format };
});
