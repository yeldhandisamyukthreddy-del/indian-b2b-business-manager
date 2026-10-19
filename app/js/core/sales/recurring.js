// Recurring invoices: a profile (customer, items, frequency, next date, optional end date) creates an invoice on
// each due date. Each generated invoice carries recurringKey 'recurring:<profile>:<date>', so running the generator
// twice never creates the same invoice twice.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).recurring = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const FREQUENCIES = Object.freeze({ weekly: { days: 7 }, monthly: { months: 1 }, quarterly: { months: 3 }, yearly: { months: 12 } });
    const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
    const pad = n => String(n).padStart(2, '0');
    const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

    // anchorDay keeps monthly invoices on the 31st when months allow it (Jan 31 → Feb 28 → Mar 31)
    function nextDate(date, frequency, anchorDay) {
        const f = FREQUENCIES[frequency];
        if (!f) throw new Error(`Unknown frequency "${String(frequency).slice(0, 20)}"`);
        const [, y, m, d] = DATE.exec(date).map(Number);
        if (f.days) return iso(new Date(Date.UTC(y, m - 1, d + f.days)));
        const total = m - 1 + f.months;
        const ny = y + Math.floor(total / 12);
        const nm = total % 12;
        return iso(new Date(Date.UTC(ny, nm, Math.min(anchorDay || d, daysInMonth(ny, nm)))));
    }

    // Dates from the profile's next date up to today (inclusive), not past its end date, at most `max`
    function dueDates(profile, today, { max = 24 } = {}) {
        if (profile.active === false || !DATE.test(profile.nextDate || '')) return [];
        const anchor = Number((profile.anchorDate || profile.nextDate).slice(8, 10));
        const out = [];
        let date = profile.nextDate;
        while (date <= today && (!profile.endDate || date <= profile.endDate) && out.length < max) {
            out.push(date);
            date = nextDate(date, profile.frequency, anchor);
        }
        return out;
    }

    function validateProfile(p) {
        const errors = [];
        if (!p.customerId) errors.push('Choose a customer');
        if (!Array.isArray(p.items) || !p.items.length) errors.push('Add at least one item');
        if (!FREQUENCIES[p.frequency]) errors.push('Frequency must be weekly, monthly, quarterly or yearly');
        if (!DATE.test(p.nextDate || '')) errors.push('Next date must be a date');
        else if (p.endDate && DATE.test(p.endDate) && p.endDate < p.nextDate) errors.push('End date is before the next date');
        return errors;
    }

    const recurringKey = (profileId, date) => `recurring:${profileId}:${date}`;

    // The invoice fields for one due date (the invoice screen's save path adds tax, numbers and events)
    function invoiceFor(profile, date) {
        return {
            customerId: profile.customerId,
            customerName: profile.customerName,
            items: (profile.items || []).map(i => ({ ...i })),
            notes: profile.notes || '',
            companyId: profile.companyId,
            date,
            recurringId: profile.id,
            recurringKey: recurringKey(profile.id, date)
        };
    }

    return { FREQUENCIES, nextDate, dueDates, validateProfile, recurringKey, invoiceFor };
});
