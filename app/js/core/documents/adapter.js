// Maps the app's stored records to the view-model builder's input (see schema.js for the shape).
// Handles records from older versions: no CGST/SGST/IGST split, no interstate flag, no customer snapshot.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).adapter = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const pad2 = n => String(n).padStart(2, '0');
    // 'YYYY-MM-DD' + days, in calendar days (no time zone involved)
    function addDays(date, days) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
        if (!m) return null;
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }

    const defined = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

    // A saved line prints the values it was saved with; a line without them is computed
    function toLine(it) {
        const taxable = it.taxable ?? it.amount;
        const stored = taxable === undefined ? null : defined({ taxable, tax: it.tax, cgst: it.cgst, sgst: it.sgst, igst: it.igst });
        return {
            name: it.name || '',
            hsn: it.hsn || '',
            unit: it.unit || '',
            qty: Number(it.qty) || 0,
            rate: Number(it.rate) || 0,
            gstRate: Number(it.gstRate) || 0,
            stored
        };
    }

    // A saved split wins (IGST means inter-state), otherwise compare the states
    function isInterstate(inv, company, pos) {
        if (typeof inv.interstate === 'boolean') return inv.interstate;
        if (inv.cgst !== undefined || inv.igst !== undefined) return (inv.igst || 0) > 0;
        return !!(company && company.stateCode && pos && company.stateCode !== pos);
    }

    /**
     * @param {{ invoice: object, company: object, customer?: object | null, banks?: object[], appSettings?: object,
     *   stateName: (code: string) => string, today: string, timeZone?: string, defaultTerms?: string }} records
     */
    function toDomain({ invoice: inv, company, customer, banks = [], appSettings = {}, stateName, today, timeZone, defaultTerms = '' }) {
        const c = customer || {};
        const pos = inv.placeOfSupply ?? c.stateCode ?? '';
        const custState = inv.customerState ?? c.stateCode ?? '';
        const creditDays = c.creditDays ?? 30;
        const hasShipTo = !!(inv.shipToName || inv.shipToAddress);
        return {
            invoice: {
                number: String(inv.number ?? inv.id ?? ''),
                date: inv.date,
                createdAt: inv.createdAt,
                dueDate: addDays(inv.date, creditDays),
                creditDays,
                asOfDate: today,
                status: inv.status,
                customer: {
                    name: inv.customerName || c.name || '',
                    address: inv.customerAddress ?? c.address ?? '',
                    gstin: inv.customerGstin ?? c.gstin ?? '',
                    stateCode: custState,
                    stateName: stateName(custState),
                    phone: c.phone || ''
                },
                shipTo: hasShipTo
                    ? { name: inv.shipToName || inv.customerName || '', address: inv.shipToAddress || '', gstin: '', stateCode: '', stateName: '' }
                    : null,
                placeOfSupply: pos,
                placeOfSupplyName: stateName(pos),
                interstate: isInterstate(inv, company, pos),
                reverseCharge: false,
                reference: inv.referenceNumber || '',
                // Fields modules keep on the invoice (e.g. the e-way bill number), for their document blocks
                extensions: inv.extensions || {},
                ewayBillNumber: inv.ewayBillNumber || '',
                notes: inv.notes || '',
                lines: (inv.items || []).map(toLine),
                roundOff: { fixed: inv.roundOff || 0 },
                grandTotal: inv.grandTotal,
                paidAmount: inv.paidAmount || 0,
                creditedAmount: inv.creditedAmount || 0,
                currency: 'INR'
            },
            org: {
                name: company.name || '',
                address: company.address || '',
                gstin: company.gstin || '',
                stateCode: company.stateCode || '',
                stateName: company.stateName || stateName(company.stateCode),
                phone: company.phone || '',
                email: company.email || '',
                bankAccounts: banks.map(b => ({ bankName: b.bankName || '', accountNo: b.accountNo || '', ifsc: b.ifsc || '' })),
                terms: appSettings.terms ?? defaultTerms,
                timeZone: timeZone || 'Asia/Kolkata'
            }
        };
    }

    return { toDomain, addDays };
});
