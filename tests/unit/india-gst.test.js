// region_india_gst: GST arithmetic vectors, the tax strategy core uses, GSTIN checks and the return summaries
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const gst = require('../../app/js/modules/region_india_gst/gst.js');
const returns = require('../../app/js/modules/region_india_gst/returns.js');
const india = require('../../app/js/modules/region_india_gst/index.js');
const { fakeDb } = require('./helpers/fake-db.js');
const repository = require('../../app/js/core/shared/repository.js');

test('computeGst: CGST + SGST within the state, IGST across states, in rupees from whole paise', () => {
    const items = [{ qty: 10, rate: 100, gstRate: 18 }];
    assert.deepEqual(gst.computeGst(items, true), { taxable: 1000, cgst: 0, sgst: 0, igst: 180, tax: 180, total: 1180 });
    assert.deepEqual(items[0], { qty: 10, rate: 100, gstRate: 18, taxable: 1000, igst: 180, cgst: 0, sgst: 0, tax: 180, amount: 1000, total: 1180 });
    assert.deepEqual(gst.computeGst([{ qty: 10, rate: 100, gstRate: 18 }], false), { taxable: 1000, cgst: 90, sgst: 90, igst: 0, tax: 180, total: 1180 });
});

test('GST vectors: per-line rounding, the odd paisa to CGST, fractional and new slabs', () => {
    const vectors = [
        // [items, interstate, expected totals]
        [
            [
                { qty: 3, rate: 33.33, gstRate: 5 },
                { qty: 0.5, rate: 99.99, gstRate: 12 }
            ],
            false,
            { taxable: 149.99, cgst: 5.5, sgst: 5.5, igst: 0, tax: 11, total: 160.99 }
        ],
        [[{ qty: 1, rate: 0.05, gstRate: 18 }], false, { taxable: 0.05, cgst: 0.01, sgst: 0, igst: 0, tax: 0.01, total: 0.06 }],
        [[{ qty: 1000, rate: 4567.89, gstRate: 0.25 }], true, { taxable: 4567890, cgst: 0, sgst: 0, igst: 11419.73, tax: 11419.73, total: 4579309.73 }],
        [[{ qty: 2, rate: 1250, gstRate: 40 }], false, { taxable: 2500, cgst: 500, sgst: 500, igst: 0, tax: 1000, total: 3500 }],
        [[{ qty: 1, rate: 99.99, gstRate: 1.5 }], false, { taxable: 99.99, cgst: 0.75, sgst: 0.75, igst: 0, tax: 1.5, total: 101.49 }]
    ];
    for (const [items, inter, expected] of vectors) assert.deepEqual(gst.computeGst(items, inter), expected, JSON.stringify(items));
});

test('the GST strategy: components to show, fields to keep, new line objects (input untouched)', () => {
    const items = Object.freeze([Object.freeze({ qty: 5, rate: 400, gstRate: 18 })]);
    const intra = gst.calculator.computeLines(items, { fromState: '36', toState: '36' });
    assert.deepEqual(intra.totals.components, [
        { label: 'CGST', amount: 180 },
        { label: 'SGST', amount: 180 }
    ]);
    assert.deepEqual(intra.totals.docFields, { cgst: 180, sgst: 180, igst: 0, interstate: false, placeOfSupply: '36' });
    assert.deepEqual(intra.lines[0].taxComponents, [
        { code: 'CGST', rate: 9, amount: 180 },
        { code: 'SGST', rate: 9, amount: 180 }
    ]);
    const inter = gst.calculator.computeLines(items, { fromState: '36', toState: '29' });
    assert.deepEqual(inter.totals.components, [{ label: 'IGST', amount: 360 }]);
    assert.equal(inter.totals.total, 2360);
    // A credit note follows its invoice, even if the party's state changed since
    const note = gst.calculator.computeLines(items, { fromState: '36', toState: '36', source: { igst: 36 } });
    assert.equal(note.totals.docFields.interstate, true);
    assert.equal(gst.calculator.computeLines(items, { source: { interstate: false } }).totals.docFields.interstate, false);
});

test('GSTIN: format and state block, a wrong check character only warns', () => {
    assert.equal(gst.gstinCheckChar('27AAPFU0939F1Z'), 'V');
    assert.deepEqual(gst.checkGstin('27aapfu0939f1zv', '27'), {});
    assert.deepEqual(gst.checkGstin('', '27'), {});
    assert.match(gst.checkGstin('27AAPFU0939F1Z', '27').error, /15 characters/);
    assert.match(gst.checkGstin('27AAPFU0939F1ZV', '29').error, /does not match the selected state \(29\)/);
    assert.match(gst.checkGstin('27AAPFU0939F1ZX', '27').warning, /last character should be V/);
});

test('hooks: contact veto and warning, invoice veto for a malformed customer GSTIN', () => {
    const ep = india.extensionPoints;
    assert.equal(ep['contact.validate']({ gstin: '27AAPFU0939F1ZV', stateCode: '27' }), null);
    assert.ok(ep['contact.validate']({ gstin: '27AAPFU0939F1ZV', stateCode: '29' }).veto);
    assert.ok(ep['contact.validate']({ gstin: '27AAPFU0939F1ZX', stateCode: '27' }).warning);
    assert.match(ep['invoice.validate']({ customerGstin: 'NOT-A-GSTIN' }).veto, /customer's GSTIN is not valid/);
    assert.equal(ep['invoice.validate']({ customerGstin: '' }), null);
});

test('supply types for GSTR-1: B2B with a GSTIN, B2CL above the limit across states, else B2CS', () => {
    assert.equal(gst.supplyType('29AAACB1234F1Z5', 0, 50), 'B2B');
    assert.equal(gst.supplyType('', 18000, 118000), 'B2CL');
    assert.equal(gst.supplyType('', 0, 118000), 'B2CS');
    assert.equal(gst.supplyType('', 180, 1180), 'B2CS');
});

test('return summaries: output net of credit notes, input credit net of debit notes, older documents split', () => {
    const company = { id: 1, stateCode: '36' };
    const data = {
        company,
        customers: [
            { id: 1, stateCode: '36', gstin: '36AAACR5055K1ZQ' },
            { id: 2, stateCode: '29' }
        ],
        vendors: [{ id: 7, stateCode: '36' }],
        invoices: [
            {
                id: 1,
                date: '2026-10-02',
                customerId: 1,
                taxable: 2000,
                cgst: 180,
                sgst: 180,
                igst: 0,
                tax: 360,
                grandTotal: 2360,
                items: [{ hsn: '2523', gstRate: 18, qty: 5, taxable: 2000, cgst: 180, sgst: 180, igst: 0, tax: 360 }]
            },
            // saved by an old version: only the total tax, no split
            {
                id: 2,
                date: '2026-10-03',
                customerId: 2,
                taxable: 1000,
                tax: 180,
                grandTotal: 1180,
                items: [{ hsn: '2523', gstRate: 18, qty: 2.5, taxable: 1000 }]
            },
            { id: 3, date: '2026-09-30', customerId: 1, taxable: 100, tax: 18, grandTotal: 118, items: [] }
        ],
        creditNotes: [{ id: 1, date: '2026-10-05', invoiceId: 2, customerId: 2, taxable: 200, igst: 36, tax: 36, grandTotal: 236 }],
        bills: [{ id: 1, date: '2026-10-04', vendorId: 7, taxable: 7000, cgst: 630, sgst: 630, igst: 0, tax: 1260, grandTotal: 8260 }],
        debitNotes: [{ id: 1, date: '2026-10-06', billId: 1, vendorId: 7, grandTotal: 118, tax: 18, taxable: 100 }]
    };
    const g = returns.buildGstData(data, '2026-10-01', '2026-10-31');
    assert.deepEqual(g.out, { taxable: 2800, cgst: 180, sgst: 180, igst: 144 });
    assert.deepEqual(g.itc, { taxable: 6900, cgst: 621, sgst: 621, igst: 0 });
    assert.deepEqual(
        g.invoices.map(i => [i.type, i.pos]),
        [
            ['B2B', '36'],
            ['B2CS', '29']
        ]
    );
    assert.deepEqual(g.byRate['18'], { taxable: 3000, cgst: 180, sgst: 180, igst: 180, qty: 7.5 });
    const rows = returns.gstr1Rows(g, code => ({ 36: 'Telangana', 29: 'Karnataka' })[code]);
    assert.deepEqual(rows[1].slice(0, 13), ['B2CS', '', undefined, undefined, '2026-10-03', 1180, '29-Karnataka', 'N', '18', 1000, 180, 0, 0]);
    assert.equal(rows.at(-1)[0], 'CDNUR');
});

test('migration: the e-way bill moves into invoice.extensions and rolls back', async () => {
    const db = fakeDb({
        invoices: [
            { id: 1, companyId: 1, ewayBillNumber: '341012345678' },
            { id: 2, companyId: 1 },
            { id: 3, companyId: 2, ewayBillNumber: 'x' }
        ]
    });
    const ctx = { repo: store => repository.createRepository(db, store, 1) };
    const [mig] = india.migrations;
    await mig.up(ctx);
    assert.deepEqual(db.rows('invoices')[0], { id: 1, companyId: 1, extensions: { region_india_gst: { ewayBillNumber: '341012345678' } } });
    assert.equal(db.rows('invoices')[2].ewayBillNumber, 'x', "another company's invoices are not touched");
    await mig.up(ctx); // a second run changes nothing
    await mig.down(ctx);
    assert.deepEqual(db.rows('invoices')[0], { id: 1, companyId: 1, ewayBillNumber: '341012345678', extensions: {} });
});
