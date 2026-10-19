// Locale formatting for invoices: dates, times, quantities, rates and percentages.
// Pure: dates are 'YYYY-MM-DD' strings formatted in UTC, so the printed day never shifts with the time zone.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).format = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const cache = new Map();
    function cached(key, make) {
        if (!cache.has(key)) cache.set(key, make());
        return cache.get(key);
    }

    const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
    const isDate = s => typeof s === 'string' && DATE.test(s);

    // '2026-10-18' → '18/10/2026' in en-IN
    function formatDate(s, locale) {
        const m = DATE.exec(s || '');
        if (!m) return '';
        const f = cached(`d|${locale}`, () => new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }));
        return f.format(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    }

    // Time of an ISO timestamp in the business's time zone, e.g. '02:35 pm'
    function formatTime(iso, locale, timeZone) {
        const d = new Date(iso || '');
        if (Number.isNaN(d.getTime())) return '';
        return cached(`t|${locale}|${timeZone}`, () => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone })).format(d);
    }

    const decimal = (value, locale, min, max) =>
        cached(`n|${locale}|${min}|${max}`, () => new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max })).format(value || 0);
    const formatQty = (qty, unit, locale) => [decimal(qty, locale, 0, 3), unit].filter(Boolean).join(' ');
    const formatRate = (rate, locale) => decimal(rate, locale, 2, 4);
    const formatPercent = (pct, locale) => `${decimal(pct, locale, 0, 4)}%`;

    return { isDate, formatDate, formatTime, formatQty, formatRate, formatPercent };
});
