// The adapter turns the app's stored records (current and older shapes) into the builder's input
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toDomain, addDays } = require('../../app/js/core/documents/adapter.js');
const { buildInvoiceViewModel } = require('../../app/js/core/documents/view-model.js');
const fx = require('../fixtures/invoices.js');

const STATES = { 36: 'Telangana', 29: 'Karnataka' };
const stateName = code => STATES[code] || '';
const company = {
    id: 1,
    name: 'Sri Lakshmi Traders',
    gstin: '36AABCU9603R1ZM',
    stateCode: '36',
    stateName: 'Telangana',
    address: 'Hyd',
    phone: '1',
    email: ''
};
const customer = { id: 2, name: 'Karnataka Buyer', stateCode: '29', gstin: '29AAACB1234F1Z5', creditDays: 15, address: 'Blr', phone: '080' };
const ctx = {
    company,
    customer,
    banks: [{ bankName: 'SBI', accountNo: '1', ifsc: 'SBIN0001' }],
    appSettings: { terms: 'T&C' },
    stateName,
    today: '2026-10-18',
    timeZone: 'Asia/Kolkata'
};

test('addDays works on local dates across month ends', () => {
    assert.equal(addDays('2026-01-31', 30), '2026-03-02');
    assert.equal(addDays('2026-10-18', 0), '2026-10-18');
    assert.equal(addDays('', 5), null);
});

test('an invoice saved by the current app keeps its stored values and split', () => {
    const inv = {
        number: 'INV-0001',
        date: '2026-10-01',
        createdAt: '2026-10-01T04:00:00.000Z',
        customerName: 'Karnataka Buyer',
        customerGstin: '29AAACB1234F1Z5',
        customerAddress: 'Blr office',
        customerState: '29',
        placeOfSupply: '29',
        interstate: true,
        items: [{ name: 'Rod', hsn: '7214', unit: 'KG', qty: 10, rate: 100, gstRate: 18, taxable: 1000, cgst: 0, sgst: 0, igst: 180, tax: 180, total: 1180 }],
        roundOff: 0,
        grandTotal: 1180,
        paidAmount: 100,
        creditedAmount: 0,
        status: 'pending',
        notes: 'n',
        referenceNumber: 'PO-9',
        ewayBillNumber: 'EWB1',
        shipToName: 'Site',
        shipToAddress: 'Plot 9'
    };
    const { invoice, org } = toDomain({ ...ctx, invoice: inv });
    assert.equal(invoice.interstate, true);
    assert.deepEqual(invoice.lines[0].stored, { taxable: 1000, tax: 180, cgst: 0, sgst: 0, igst: 180 });
    assert.deepEqual(invoice.roundOff, { fixed: 0 });
    assert.equal(invoice.grandTotal, 1180);
    assert.equal(invoice.dueDate, '2026-10-16');
    assert.equal(invoice.creditDays, 15);
    assert.equal(invoice.asOfDate, '2026-10-18');
    assert.equal(invoice.placeOfSupplyName, 'Karnataka');
    assert.equal(invoice.customer.address, 'Blr office', 'the address printed is the one saved on the invoice');
    assert.deepEqual(invoice.shipTo, { name: 'Site', address: 'Plot 9', gstin: '', stateCode: '', stateName: '' });
    assert.equal(invoice.reference, 'PO-9');
    assert.equal(invoice.ewayBillNumber, 'EWB1');
    assert.equal(org.terms, 'T&C');
    assert.equal(org.bankAccounts.length, 1);
    const vm = buildInvoiceViewModel(invoice, org, fx.settingsFor('standard'), 'en-IN', 'print');
    assert.equal(vm.totals.total.sectionValue, '₹1,180.00');
});

test('a record from an older version (no split, no interstate flag, no customer snapshot) still prints', () => {
    const legacy = {
        number: 'INV-0001',
        date: '2026-10-01',
        customerName: 'Karnataka Buyer',
        status: 'pending',
        paidAmount: 0,
        items: [{ name: 'Steel Rod', hsn: '7214', unit: 'KG', qty: 10, rate: 100, taxable: 1000, gstRate: 18, tax: 180, total: 1180 }],
        taxable: 1000,
        tax: 180,
        grandTotal: 1180
    };
    const { invoice, org } = toDomain({ ...ctx, invoice: legacy });
    assert.equal(invoice.interstate, true, 'decided from the company and customer states');
    assert.equal(invoice.customer.gstin, '29AAACB1234F1Z5');
    assert.equal(invoice.placeOfSupply, '29');
    const vm = buildInvoiceViewModel(invoice, org, fx.settingsFor('standard'), 'en-IN', 'print');
    assert.deepEqual(vm.totals.raw.taxRows, [{ name: 'IGST', rate: 18, amount: 18000 }]);
});

test('a saved split decides inter-state when the flag is missing; lines without values are computed', () => {
    const { invoice } = toDomain({
        ...ctx,
        invoice: { number: 'X', date: '2026-10-01', cgst: 9, sgst: 9, igst: 0, items: [{ name: 'a', qty: 1, rate: 100, gstRate: 18 }] }
    });
    assert.equal(invoice.interstate, false);
    assert.equal(invoice.lines[0].stored, null);
    assert.equal(toDomain({ ...ctx, customer: null, invoice: { number: 'X', date: '2026-10-01', items: [] } }).invoice.creditDays, 30);
});
