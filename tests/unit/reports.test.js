// core/reports: report definitions, module contributions and the shared renderer
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const reports = require('../../app/js/core/reports/reports.js');

const data = {
    invoices: [
        {
            id: 1,
            number: 'INV-0001',
            date: '2026-10-02',
            customerId: 1,
            customerName: 'Anil Stores',
            taxable: 1000,
            tax: 180,
            grandTotal: 1180,
            items: [{ productId: 5, name: 'Cement', hsn: '2523', qty: 10, taxable: 1000, gstRate: 18, tax: 180 }]
        },
        {
            id: 2,
            number: 'INV-0002',
            date: '2026-10-09',
            customerId: 2,
            customerName: 'Ravi & Co',
            taxable: 500.5,
            tax: 25.03,
            grandTotal: 525.53,
            items: [{ productId: 6, name: 'Sand', qty: 1, taxable: 500.5, gstRate: 5, tax: 25.03 }]
        },
        { id: 3, number: 'INV-0003', date: '2026-09-30', customerId: 1, customerName: 'Anil Stores', taxable: 100, tax: 0, grandTotal: 100, items: [] }
    ],
    receipts: [{ id: 1, number: 'RCP-0001', date: '2026-10-03', customerId: 1, customerName: 'Anil Stores', amount: 500, mode: 'UPI' }],
    salesReturns: [
        {
            id: 1,
            number: 'CN-0001',
            date: '2026-10-05',
            customerName: 'Anil Stores',
            taxable: 100,
            tax: 18,
            grandTotal: 118,
            items: [{ gstRate: 18, taxable: 100, tax: 18 }]
        }
    ],
    expenses: [{ id: 1, date: '2026-10-04', category: 'Rent', payee: 'Landlord', amount: 15000, mode: 'Bank Transfer' }],
    customers: [
        { id: 1, name: 'Anil Stores', phone: '1', creditDays: 30, balance: 680 },
        { id: 2, name: 'Ravi & Co', balance: 0 }
    ]
};
const ctx = (extra = {}) => ({ list: async store => data[store] || [], contributions: async point => extra[point] || [] });
const october = { from: '2026-10-01', to: '2026-10-31' };
const def = id => reports.CORE_REPORTS.find(r => r.id === id);

test('core reports are the basics: sales, receivables, day book, items, parties, receipts, expenses, tax', () => {
    assert.deepEqual(
        reports.CORE_REPORTS.map(r => r.id),
        ['sales', 'outstanding', 'daybook', 'itemwise', 'partywise', 'receipts', 'expenses', 'tax-summary']
    );
});

test('sales report: filters by date, customer and amount; totals in paise', async () => {
    const r = await def('sales').run(ctx(), october);
    assert.equal(r.title, '📊 Sales Report');
    assert.deepEqual(
        r.summary.map(s => [s.label, s.value]),
        [
            ['Invoices', 2],
            ['Total Sales', 170553],
            ['Total Tax', 20503]
        ]
    );
    assert.deepEqual(
        r.tables[0].rows.map(x => x.number),
        ['INV-0001', 'INV-0002']
    );
    assert.deepEqual(r.csv[0], { Invoice: 'INV-0001', Date: '2026-10-02', Customer: 'Anil Stores', Taxable: 1000, Tax: 180, Total: 1180 });
    assert.equal((await def('sales').run(ctx(), { ...october, customerId: 2 })).tables[0].rows.length, 1);
    assert.equal((await def('sales').run(ctx(), { ...october, min: 600 })).tables[0].rows.length, 1);
    assert.equal((await def('sales').run(ctx(), { ...october, productId: 6 })).tables[0].rows[0].number, 'INV-0002');
});

test('outstanding: receivables from core plus sections modules add', async () => {
    // Balances are paise, like every report amount
    const payables = async () => ({ title: 'Payables (Vendors)', kind: 'payable', rows: [{ name: 'Ultra Cement', phone: '', balance: 200000 }] });
    const r = await def('outstanding').run(ctx({ 'reports.outstanding': [{ moduleId: 'purchasing', value: payables }] }), {});
    assert.deepEqual(
        r.summary.map(s => [s.label, s.value]),
        [
            ['Total Receivable', 68000],
            ['Total Payable', 200000],
            ['Net Position', -132000]
        ]
    );
    assert.deepEqual(
        r.tables.map(t => t.title),
        ['Receivables (Customers)', 'Payables (Vendors)']
    );
    const coreOnly = await def('outstanding').run(ctx(), {});
    assert.equal(coreOnly.summary.length, 1, 'without payables only receivables are shown');
});

test('day book merges core documents with rows from modules, in date order', async () => {
    const bills = async () => [{ date: '2026-10-01', type: 'Purchase', ref: 'BILL-0001', party: 'Ultra', in: 0, out: 50000 }];
    const r = await def('daybook').run(ctx({ 'reports.daybook': [{ moduleId: 'purchasing', value: bills }] }), october);
    assert.deepEqual(
        r.tables[0].rows.map(x => x.ref),
        ['BILL-0001', 'INV-0001', 'RCP-0001', '—', 'INV-0002']
    );
    assert.deepEqual(
        r.summary.map(s => s.value),
        [170553 + 50000, 50000 + 1500000, 170553 + 50000 - 50000 - 1500000]
    );
});

test('item-wise, party-wise, receipts, expenses and tax summary', async () => {
    const items = await def('itemwise').run(ctx(), october);
    assert.deepEqual(
        items.tables[0].rows.map(x => [x.name, x.qty, x.amount]),
        [
            ['Cement', 10, 100000],
            ['Sand', 1, 50050]
        ]
    );
    const vendors = async () => ({ title: 'Vendor Purchase Summary', columns: [{ key: 'name', label: 'Vendor' }], rows: [{ name: 'Ultra' }] });
    const parties = await def('partywise').run(ctx({ 'reports.partywise': [{ moduleId: 'purchasing', value: vendors }] }), october);
    assert.deepEqual(
        parties.tables.map(t => t.title),
        ['Customer Sales Summary', 'Vendor Purchase Summary']
    );
    assert.equal((await def('receipts').run(ctx(), { ...october, mode: 'Cash' })).tables[0].rows.length, 0);
    const exp = await def('expenses').run(ctx(), october);
    assert.equal(exp.summary[1].value, 1500000);
    assert.deepEqual(
        exp.tables[1].rows.map(x => [x.category, x.amount]),
        [['Rent', 1500000]]
    );
    const taxes = await def('tax-summary').run(ctx(), october);
    assert.deepEqual(
        taxes.tables[0].rows.map(x => [x.rate, x.taxable, x.tax]),
        [
            [18, 90000, 16200],
            [5, 50050, 2503]
        ],
        'net of credit notes, highest rate first'
    );
});

test('reports from modules join the list in order, and unknown ids are refused', () => {
    const entry = { id: 'purchase', label: 'Purchase Report', icon: '📦', description: 'Bills', order: 15, filters: ['date', 'vendor'], run: async () => ({}) };
    const list = reports.resolveReports([{ moduleId: 'purchasing', value: entry }]);
    assert.deepEqual(
        list.map(r => r.id),
        ['sales', 'purchase', 'outstanding', 'daybook', 'itemwise', 'partywise', 'receipts', 'expenses', 'tax-summary']
    );
    assert.throws(() => reports.resolveReports([{ moduleId: 'x', value: { ...entry, id: 'sales' } }]), /Report "sales" from module "x" is already defined/);
    assert.throws(() => reports.find(list, 'nope'), /Unknown report "nope"/);
});

test('the renderer escapes text, formats money and starts with the title', async () => {
    const r = await def('sales').run(ctx(), october);
    const html = reports.renderReportHtml(r, p => `₹${(p / 100).toFixed(2)}`);
    assert.match(html, /^<h3>📊 Sales Report<\/h3>/);
    assert.match(html, /Ravi &amp; Co/);
    assert.match(html, /₹1705\.53/);
    assert.match(reports.renderReportHtml({ title: 'x', summary: [], tables: [{ columns: [{ key: 'a', label: 'A' }], rows: [] }] }, String), /No data/);
});
