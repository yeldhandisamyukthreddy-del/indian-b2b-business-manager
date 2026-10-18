// Runtime checks at the two boundaries of the template system:
//   validateDomain: the invoice and company handed to the view-model builder
//   validateViewModel: the object handed to a template (also guarantees table headers and cells line up)
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { format: require('./format.js') } : root.Vyapar;
    const api = factory(deps.format);
    if (node) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).schema = api;
})(typeof self !== 'undefined' ? self : this, function (format) {
    'use strict';

    /**
     * Domain input of buildInvoiceViewModel (amounts in rupees, as stored by the app).
     * @typedef {{ name: string, address?: string, gstin?: string, stateCode?: string, stateName?: string, phone?: string, email?: string, vatNumber?: string }} Party
     * @typedef {{ name: string, description?: string, hsn?: string, unit?: string, qty: number, rate: number, gstRate: number,
     *   discount?: { type: 'percent' | 'amount', value: number } | null, image?: string, batch?: string, serial?: string, expiry?: string,
     *   stored?: { taxable?: number, amount?: number, tax?: number, cgst?: number, sgst?: number, igst?: number } | null }} DomainLine
     * @typedef {{ number: string, date: string, createdAt?: string, dueDate?: string | null, creditDays?: number | null, asOfDate?: string,
     *   status?: 'paid' | 'pending', customer?: Party | null, shipTo?: Party | null, placeOfSupply?: string, placeOfSupplyName?: string,
     *   interstate?: boolean, reverseCharge?: boolean, reference?: string, ewayBillNumber?: string, notes?: string, lines: DomainLine[],
     *   inclusive?: boolean, discount?: object | null, shipping?: { amount: number, gstRate: number } | null,
     *   roundOff?: 'nearest' | 'none' | { fixed: number }, grandTotal?: number, paidAmount?: number, creditedAmount?: number, currency?: string }} DomainInvoice
     * @typedef {Party & { bankAccounts?: { bankName: string, accountNo: string, ifsc?: string }[], terms?: string, timeZone?: string, eori?: string }} DomainOrg
     */

    class InvoiceDataError extends Error {
        constructor(errors) {
            super(`Invoice data is not valid: ${errors.join('; ')}`);
            this.name = 'InvoiceDataError';
            this.errors = errors;
        }
    }

    const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const isNum = v => typeof v === 'number' && Number.isFinite(v);
    const MAX_LINES = 2000;

    function checkLine(line, i, errors) {
        const at = `lines[${i}]`;
        if (!isObj(line)) return errors.push(`${at} must be an object`);
        if (typeof line.name !== 'string') errors.push(`${at}.name must be text`);
        ['qty', 'rate', 'gstRate'].forEach(k => {
            if (!isNum(line[k])) errors.push(`${at}.${k} must be a number`);
        });
        if (isNum(line.gstRate) && (line.gstRate < 0 || line.gstRate > 100)) errors.push(`${at}.gstRate must be 0-100`);
        if (line.discount && !(isObj(line.discount) && ['percent', 'amount'].includes(line.discount.type) && isNum(line.discount.value)))
            errors.push(`${at}.discount must be { type: 'percent' | 'amount', value }`);
        if (line.stored && !isObj(line.stored)) errors.push(`${at}.stored must be an object`);
        if (line.expiry && !format.isDate(line.expiry)) errors.push(`${at}.expiry must be a YYYY-MM-DD date`);
    }

    function validateDomain(invoice, org) {
        const errors = [];
        if (!isObj(invoice)) return ['invoice must be an object'];
        if (typeof invoice.number !== 'string' || !invoice.number.trim()) errors.push('number is missing');
        if (!format.isDate(invoice.date)) errors.push('date must be a YYYY-MM-DD date');
        ['dueDate', 'asOfDate'].forEach(k => {
            if (invoice[k] && !format.isDate(invoice[k])) errors.push(`${k} must be a YYYY-MM-DD date`);
        });
        if (!Array.isArray(invoice.lines) || !invoice.lines.length) errors.push('the invoice has no items');
        else if (invoice.lines.length > MAX_LINES) errors.push(`the invoice has more than ${MAX_LINES} items`);
        else invoice.lines.forEach((l, i) => checkLine(l, i, errors));
        ['customer', 'shipTo'].forEach(k => {
            if (invoice[k] && !(isObj(invoice[k]) && typeof invoice[k].name === 'string')) errors.push(`${k} must have a name`);
        });
        ['paidAmount', 'creditedAmount', 'grandTotal'].forEach(k => {
            if (invoice[k] !== undefined && invoice[k] !== null && !isNum(invoice[k])) errors.push(`${k} must be a number`);
        });
        if (!isObj(org) || typeof org.name !== 'string') errors.push('company must have a name');
        return errors;
    }

    // Flags every view model carries (templates may rely on any of them)
    const VM_FLAGS = Object.freeze([
        'isForPdf',
        'isRtl',
        'isThermal',
        'isLogoExist',
        'isOrgNameRequired',
        'isOrgAddressRequired',
        'isTitleRequired',
        'isEntityDateRequired',
        'isTimeRequired',
        'isDueDateRequired',
        'isBillToRequired',
        'isShipToRequired',
        'isReferenceNumberRequired',
        'isPaymentTermsRequired',
        'isSubTotalRequired',
        'isTotalRequired',
        'isBalanceDueRequired',
        'isAmountInWordsRequired',
        'isTaxSummaryRequired',
        'isNotesExist',
        'isTermsAndConditionsRequired',
        'isPaymentDetailsRequired',
        'isPaymentStubRequired',
        'isStatusStampRequired',
        'isSignatureRequired',
        'isInclusiveTax',
        'isInterState',
        'showCurrencyAfterAmount'
    ]);

    const isBlock = b => isObj(b) && typeof b.sectionLabel === 'string' && typeof b.sectionValue === 'string';

    function validateViewModel(vm) {
        const errors = [];
        if (!isObj(vm)) return ['view model must be an object'];
        VM_FLAGS.forEach(k => {
            if (!vm.flags || typeof vm.flags[k] !== 'boolean') errors.push(`flags.${k} must be true or false`);
        });
        if (!vm.header || typeof vm.header.companyName !== 'string') errors.push('header.companyName must be text');
        if (!Array.isArray(vm.columns) || !vm.columns.length) errors.push('columns must be a non-empty list');
        const keys = (vm.columns || []).map(c => c.key).join(',');
        (vm.lineItems || []).forEach((item, i) => {
            const cellKeys = (item.cells || []).map(c => c.key).join(',');
            if (cellKeys !== keys) errors.push(`lineItems[${i}] cells (${cellKeys}) do not match the columns (${keys})`);
        });
        if (!vm.totals || !isBlock(vm.totals.total)) errors.push('totals.total must be a { sectionLabel, sectionValue } block');
        if (!vm.meta || !['ltr', 'rtl'].includes(vm.meta.dir)) errors.push('meta.dir must be ltr or rtl');
        return errors;
    }

    return { InvoiceDataError, validateDomain, validateViewModel, VM_FLAGS };
});
