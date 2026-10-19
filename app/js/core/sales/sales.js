// Sales rules shared by the invoice, receipt and credit-note screens: estimate to invoice, payment allocation
// and status, credit notes, document revisions and event ids, and payment idempotency. Pure: inputs are not changed.
// Amounts are rupees as stored; comparisons and sums run in whole paise.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { money: require('../shared/money.js') } : { money: root.Vyapar.money };
    const api = factory(deps.money);
    if (node) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).sales = api;
})(typeof self !== 'undefined' ? self : this, function (money) {
    'use strict';
    const { toPaise, fromPaise } = money;

    const due = doc => fromPaise(toPaise(doc.grandTotal) - toPaise(doc.paidAmount) - toPaise(doc.creditedAmount));

    // The fields an invoice takes from an estimate (quotation)
    function estimateToInvoice(quote, { date }) {
        return {
            customerId: quote.customerId,
            customerName: quote.customerName,
            items: (quote.items || []).map(i => ({ ...i })),
            companyId: quote.companyId,
            date,
            quotationId: quote.id,
            quotationNumber: quote.number,
            notes: ''
        };
    }

    // Split a payment over open documents: the chosen one first, then oldest first. The rest stays on account.
    function allocatePayment(docs, amount, preferredId = null) {
        const open = docs
            .filter(d => toPaise(due(d)) > 0)
            .sort((a, b) => (a.id === preferredId ? -1 : b.id === preferredId ? 1 : (a.date || '').localeCompare(b.date || '') || a.id - b.id));
        let left = toPaise(amount);
        const out = [];
        for (const d of open) {
            if (left <= 0) break;
            const take = Math.min(left, toPaise(due(d)));
            out.push({ id: d.id, amount: fromPaise(take) });
            left -= take;
        }
        return out;
    }

    function paymentStatus(doc) {
        const settled = toPaise(doc.paidAmount) + toPaise(doc.creditedAmount);
        if (settled >= toPaise(doc.grandTotal)) return 'paid';
        return settled > 0 ? 'partial' : 'pending';
    }
    const withPaymentStatus = doc => {
        const next = { ...doc, paidAmount: fromPaise(toPaise(doc.paidAmount)) };
        return { ...next, status: paymentStatus(next) };
    };

    // Apply a credit note to an invoice: at most what is still due
    function applyCredit(invoice, noteTotal) {
        const creditApplied = fromPaise(Math.min(Math.max(toPaise(due(invoice)), 0), toPaise(noteTotal)));
        return {
            creditApplied,
            invoice: withPaymentStatus({ ...invoice, creditedAmount: fromPaise(toPaise(invoice.creditedAmount) + toPaise(creditApplied)) })
        };
    }
    const removeCredit = (invoice, creditApplied) =>
        withPaymentStatus({ ...invoice, creditedAmount: fromPaise(Math.max(toPaise(invoice.creditedAmount) - toPaise(creditApplied), 0)) });

    // Every save of a document is a new revision, so events about it get distinct, repeatable ids
    const nextRevision = doc => (doc ? (doc.rev || 0) + 1 : 0);
    const eventId = (type, doc) => `${type}:${doc.id}:${doc.rev || 0}`;

    // Double submits of the same payment form carry the same key and are recorded once
    const findDuplicatePayment = (rows, key) => (key ? rows.find(r => r.idempotencyKey === key) || null : null);
    const newIdempotencyKey = (prefix, random = Math.random, now = Date.now) => `${prefix}-${now()}-${random().toString(36).slice(2, 10)}`;

    return {
        due,
        estimateToInvoice,
        allocatePayment,
        paymentStatus,
        withPaymentStatus,
        applyCredit,
        removeCredit,
        nextRevision,
        eventId,
        findDuplicatePayment,
        newIdempotencyKey
    };
});
