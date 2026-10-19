// core domain: tax strategy, currency, catalog, contacts, sales, recurring invoices, expenses
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tax = require('../../app/js/core/tax/tax.js');
const currency = require('../../app/js/core/currency/currency.js');
const catalog = require('../../app/js/core/catalog/catalog.js');
const contacts = require('../../app/js/core/contacts/contacts.js');
const sales = require('../../app/js/core/sales/sales.js');
const recurring = require('../../app/js/core/sales/recurring.js');
const expenses = require('../../app/js/core/expenses/expenses.js');

// ---------- tax ----------
test('default tax strategy: one tax per line at its rate, no regional split', () => {
    const calc = tax.defaultCalculator;
    const out = calc.computeLines(
        [
            { qty: 3, rate: 33.33, gstRate: 5 },
            { qty: 1, rate: 100, gstRate: 0 }
        ],
        {}
    );
    assert.deepEqual(out.totals, { taxable: 199.99, tax: 5, total: 204.99, components: [{ label: 'Tax', amount: 5 }], docFields: {} });
    assert.deepEqual(out.lines[0], {
        qty: 3,
        rate: 33.33,
        gstRate: 5,
        taxable: 99.99,
        tax: 5,
        amount: 99.99,
        total: 104.99,
        taxComponents: [{ code: 'TAX', rate: 5, amount: 5 }]
    });
    assert.deepEqual(out.lines[1].taxComponents, []);
});

test('the default strategy does not change the lines it is given', () => {
    const items = Object.freeze([Object.freeze({ qty: 1, rate: 10, gstRate: 18 })]);
    assert.doesNotThrow(() => tax.defaultCalculator.computeLines(items, {}));
});

test('a module strategy wins over the default, in hook order', () => {
    const india = { id: 'gst', computeLines: () => ({ lines: [], totals: { taxable: 0, tax: 0, total: 0 } }) };
    assert.equal(tax.resolveCalculator([]).id, 'default');
    assert.equal(tax.resolveCalculator([{ moduleId: 'region_india_gst', priority: 10, value: india }]).id, 'gst');
    assert.throws(
        () => tax.resolveCalculator([{ moduleId: 'odd', priority: 1, value: { id: 'x' } }]),
        /Module "odd" offers a tax strategy without computeLines/
    );
});

test('tax rates: a region may supply its own list, otherwise the default list', () => {
    assert.deepEqual(tax.resolveRates([]), tax.DEFAULT_RATES);
    assert.deepEqual(tax.resolveRates([{ moduleId: 'r', priority: 1, value: [0, 5, 18] }]), [0, 5, 18]);
});

// ---------- currency ----------
test('money values carry their currency and refuse to mix currencies', () => {
    const a = currency.money(12345, 'INR');
    assert.deepEqual(currency.add(a, currency.money(5, 'INR')), { amount: 12350, currency: 'INR' });
    assert.throws(() => currency.add(a, currency.money(1, 'USD')), /Cannot combine INR and USD/);
    assert.throws(() => currency.money(1.5, 'INR'), /whole number of minor units/);
    assert.throws(() => currency.money(1, 'XYZ'), /Unknown currency "XYZ"/);
    assert.deepEqual(currency.parse('1,234.56', 'INR'), { amount: 123456, currency: 'INR' });
    assert.deepEqual(currency.parse('7', 'JPY'), { amount: 7, currency: 'JPY' });
    assert.equal(currency.format(currency.money(123456, 'INR')), '₹1,234.56');
});

test('conversion uses one rounding rule (half away from zero)', () => {
    assert.deepEqual(currency.convert(currency.money(10000, 'USD'), 'INR', '83.125'), { amount: 831250, currency: 'INR' });
    assert.deepEqual(currency.convert(currency.money(1, 'USD'), 'INR', '0.5'), { amount: 1, currency: 'INR' });
    assert.deepEqual(currency.convert(currency.money(100, 'INR'), 'JPY', '1.8'), { amount: 2, currency: 'JPY' });
    assert.throws(() => currency.convert(currency.money(1, 'USD'), 'INR', '-2'), /rate must be a positive number/);
});

// ---------- catalog ----------
test('products are validated; units come from one list', () => {
    assert.ok(catalog.UNITS.includes('BAG'));
    assert.deepEqual(catalog.validateProduct({ name: 'Cement', salePrice: 400, gstRate: 18, unit: 'BAG' }), []);
    assert.deepEqual(
        catalog.validateProduct({ name: ' ', salePrice: -1, gstRate: 150, unit: 'BAG' }).sort(),
        ['Name is required', 'Sale price cannot be negative', 'Tax rate must be between 0 and 100'].sort()
    );
});

test('price lists: markup, discount and fixed prices', () => {
    const product = { id: 7, salePrice: 400 };
    assert.equal(catalog.priceFor(product, null), 400);
    assert.equal(catalog.priceFor(product, { kind: 'discount', percent: 12.5 }), 350);
    assert.equal(catalog.priceFor({ id: 8, salePrice: 99.99 }, { kind: 'markup', percent: 10 }), 109.99);
    assert.equal(catalog.priceFor(product, { kind: 'fixed', prices: { 7: 380 } }), 380);
    assert.equal(catalog.priceFor({ id: 9, salePrice: 50 }, { kind: 'fixed', prices: { 7: 380 } }), 50, 'items not on the list keep their price');
    assert.deepEqual(catalog.validatePriceList({ name: 'Dealers', kind: 'discount', percent: 5 }), []);
    assert.deepEqual(catalog.validatePriceList({ name: '', kind: 'bogo' }).sort(), ['Kind must be markup, discount or fixed', 'Name is required'].sort());
    assert.deepEqual(catalog.validatePriceList({ name: 'x', kind: 'discount', percent: 120 }), ['Percent must be between 0 and 100']);
    assert.deepEqual(catalog.validatePriceList({ name: 'x', kind: 'fixed', prices: { 7: -1 } }), ['Prices cannot be negative']);
});

// ---------- contacts ----------
test('customers and vendors are contact types of one model', () => {
    assert.deepEqual(contacts.typeOf('customers'), { type: 'customer', store: 'customers', label: 'Customer' });
    assert.deepEqual(contacts.typeOf('vendors').type, 'vendor');
    assert.deepEqual(contacts.validateContact({ name: 'Anil', email: 'a@b.in', phone: '98480 12345' }), []);
    assert.deepEqual(
        contacts.validateContact({ name: '', email: 'not-mail', phone: '12' }).sort(),
        ['Email looks wrong', 'Name is required', 'Phone number looks too short'].sort()
    );
});

// ---------- sales ----------
test('an estimate becomes an invoice with the same items and party', () => {
    const quote = {
        id: 3,
        number: 'QT-0003',
        status: 'pending',
        validTill: '2026-11-01',
        terms: 'x',
        customerId: 9,
        customerName: 'Anil',
        items: [{ productId: 1, qty: 2, rate: 50, gstRate: 18 }],
        grandTotal: 118,
        companyId: 1,
        createdAt: 'then'
    };
    const inv = sales.estimateToInvoice(quote, { date: '2026-10-19' });
    assert.deepEqual(inv, {
        customerId: 9,
        customerName: 'Anil',
        items: [{ productId: 1, qty: 2, rate: 50, gstRate: 18 }],
        companyId: 1,
        date: '2026-10-19',
        quotationId: 3,
        quotationNumber: 'QT-0003',
        notes: ''
    });
    assert.notEqual(inv.items, quote.items, 'items are copied, not shared');
    assert.equal(quote.status, 'pending', 'the estimate is not changed');
});

test('payments are allocated oldest first and never more than what is due', () => {
    const docs = [
        { id: 2, date: '2026-10-05', grandTotal: 500, paidAmount: 0 },
        { id: 1, date: '2026-10-01', grandTotal: 1000, paidAmount: 400, creditedAmount: 100 },
        { id: 3, date: '2026-10-09', grandTotal: 300, paidAmount: 300 }
    ];
    assert.deepEqual(sales.allocatePayment(docs, 700), [
        { id: 1, amount: 500 },
        { id: 2, amount: 200 }
    ]);
    assert.deepEqual(sales.allocatePayment(docs, 100, 2), [{ id: 2, amount: 100 }], 'a chosen document first');
    assert.deepEqual(
        sales.allocatePayment(docs, 5000),
        [
            { id: 1, amount: 500 },
            { id: 2, amount: 500 }
        ],
        'the rest stays on account'
    );
});

test('property: allocation never exceeds the amount or any document due', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 500; i++) {
        const docs = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, k) => ({
            id: k + 1,
            date: `2026-10-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`,
            grandTotal: Math.round(rnd() * 100000) / 100,
            paidAmount: Math.round(rnd() * 20000) / 100
        }));
        const amount = Math.round(rnd() * 200000) / 100;
        const alloc = sales.allocatePayment(docs, amount);
        const total = alloc.reduce((s, a) => s + Math.round(a.amount * 100), 0);
        assert.ok(total <= Math.round(amount * 100), `case ${i}`);
        alloc.forEach(a => assert.ok(a.amount > 0 && Math.round(a.amount * 100) <= Math.round(sales.due(docs.find(d => d.id === a.id)) * 100), `case ${i}`));
    }
});

test('payment status: pending, partially paid, paid', () => {
    assert.equal(sales.paymentStatus({ grandTotal: 100, paidAmount: 0 }), 'pending');
    assert.equal(sales.paymentStatus({ grandTotal: 100, paidAmount: 40 }), 'partial');
    assert.equal(sales.paymentStatus({ grandTotal: 100, paidAmount: 60, creditedAmount: 40 }), 'paid');
    assert.deepEqual(sales.withPaymentStatus({ grandTotal: 100, paidAmount: 100.004 }), { grandTotal: 100, paidAmount: 100, status: 'paid' });
});

test('a credit note reduces what is due, never below zero', () => {
    const inv = { id: 1, grandTotal: 1180, paidAmount: 1000 };
    const { creditApplied, invoice } = sales.applyCredit(inv, 236);
    assert.equal(creditApplied, 180);
    assert.deepEqual(invoice, { id: 1, grandTotal: 1180, paidAmount: 1000, creditedAmount: 180, status: 'paid' });
    assert.equal(inv.creditedAmount, undefined, 'input unchanged');
    const removed = sales.removeCredit(invoice, 180);
    assert.equal(removed.creditedAmount, 0);
    assert.equal(removed.status, 'partial');
});

test('each saved revision of a document has its own event id', () => {
    assert.equal(sales.eventId('invoice.finalized', { id: 12 }), 'invoice.finalized:12:0');
    assert.equal(sales.eventId('invoice.finalized', { id: 12, rev: 3 }), 'invoice.finalized:12:3');
    assert.equal(sales.nextRevision({ rev: 3 }), 4);
    assert.equal(sales.nextRevision(null), 0);
});

test('a payment with an idempotency key already recorded is a duplicate', () => {
    const rows = [{ id: 1, idempotencyKey: 'rcp-1' }];
    assert.equal(sales.findDuplicatePayment(rows, 'rcp-1').id, 1);
    assert.equal(sales.findDuplicatePayment(rows, 'rcp-2'), null);
    assert.equal(sales.findDuplicatePayment(rows, ''), null);
    assert.match(
        sales.newIdempotencyKey(
            'rcp',
            () => 0.5,
            () => 1700000000000
        ),
        /^rcp-1700000000000-[a-z0-9]+$/
    );
});

// ---------- recurring invoices ----------
test('recurring schedules: monthly keeps the day, clamped to short months', () => {
    assert.equal(recurring.nextDate('2026-01-31', 'monthly'), '2026-02-28');
    assert.equal(recurring.nextDate('2026-02-28', 'monthly', 31), '2026-03-31');
    assert.equal(recurring.nextDate('2026-10-19', 'weekly'), '2026-10-26');
    assert.equal(recurring.nextDate('2026-10-19', 'quarterly'), '2027-01-19');
    assert.equal(recurring.nextDate('2024-02-29', 'yearly'), '2025-02-28');
    assert.throws(() => recurring.nextDate('2026-10-19', 'hourly'), /Unknown frequency "hourly"/);
});

test('due dates: everything from the next date up to today, stopping at the end date, capped', () => {
    const profile = { nextDate: '2026-07-15', frequency: 'monthly', endDate: '2026-09-30' };
    assert.deepEqual(recurring.dueDates(profile, '2026-10-19'), ['2026-07-15', '2026-08-15', '2026-09-15']);
    assert.deepEqual(recurring.dueDates({ nextDate: '2026-11-01', frequency: 'monthly' }, '2026-10-19'), []);
    assert.equal(recurring.dueDates({ nextDate: '2020-01-01', frequency: 'weekly' }, '2026-10-19', { max: 12 }).length, 12);
    assert.deepEqual(recurring.dueDates({ nextDate: '2026-10-01', frequency: 'monthly', active: false }, '2026-10-19'), []);
});

test('a recurring profile is validated and creates invoices with a stable key', () => {
    assert.deepEqual(recurring.validateProfile({ customerId: 1, items: [{ qty: 1 }], frequency: 'monthly', nextDate: '2026-11-01' }), []);
    assert.deepEqual(
        recurring.validateProfile({ items: [], frequency: 'daily', nextDate: 'soon', endDate: '2026-01-01' }).sort(),
        ['Add at least one item', 'Choose a customer', 'Frequency must be weekly, monthly, quarterly or yearly', 'Next date must be a date'].sort()
    );
    const inv = recurring.invoiceFor(
        { id: 4, customerId: 1, customerName: 'A', items: [{ qty: 1, rate: 10 }], notes: 'Monthly AMC', companyId: 1 },
        '2026-11-01'
    );
    assert.deepEqual(inv, {
        customerId: 1,
        customerName: 'A',
        items: [{ qty: 1, rate: 10 }],
        notes: 'Monthly AMC',
        companyId: 1,
        date: '2026-11-01',
        recurringId: 4,
        recurringKey: 'recurring:4:2026-11-01'
    });
});

// ---------- expenses ----------
test('expenses are validated and summed by category in paise', () => {
    assert.deepEqual(expenses.validateExpense({ date: '2026-10-19', category: 'Rent', amount: 25000 }), []);
    assert.deepEqual(
        expenses.validateExpense({ date: 'x', category: 'Bribes', amount: 0 }).sort(),
        ['Amount must be more than 0', 'Category is not in the list', 'Date must be a date'].sort()
    );
    assert.deepEqual(expenses.validateExpense({ date: '2026-10-19', category: 'Rent', amount: 100, taxAmount: 200 }), ['Tax cannot be more than the amount']);
    assert.deepEqual(
        expenses.totalsByCategory([
            { category: 'Rent', amount: 0.1 },
            { category: 'Rent', amount: 0.2 },
            { category: 'Travel & Conveyance', amount: 5 },
            { category: 'Old category', amount: 1 }
        ]),
        [
            { category: 'Rent', amount: 30 },
            { category: 'Travel & Conveyance', amount: 500 },
            { category: 'Old category', amount: 100 }
        ]
    );
});
