// The real modules on the real runtime, over an in-memory database: editions, migrations, events delivered
// twice, tenant isolation, permissions, rollback, and a property test that the books always balance.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createRegistry } = require('../../app/js/platform/registry.js');
const { createRuntime } = require('../../app/js/platform/runtime.js');
const { fakeDb } = require('./helpers/fake-db.js');
const repository = require('../../app/js/core/shared/repository.js');
const sales = require('../../app/js/core/sales/sales.js');
const gst = require('../../app/js/modules/region_india_gst/gst.js');
const stock = require('../../app/js/modules/inventory/stock.js');
const books = require('../../app/js/modules/accounting/books.js');

const MODULES_DIR = path.join(__dirname, '..', '..', 'app', 'js', 'modules');
const MODULE_IDS = fs.readdirSync(MODULES_DIR).filter(d => fs.existsSync(path.join(MODULES_DIR, d, 'index.js')));
const silent = { error() {}, warn() {}, info() {} };

function seed() {
    return {
        companies: [
            { id: 1, name: 'Sri Lakshmi Traders', stateCode: '36' },
            { id: 2, name: 'Other Co', stateCode: '29' }
        ],
        customers: [{ id: 30, companyId: 1, name: 'Anil Stores', stateCode: '36', balance: 1180 }],
        vendors: [{ id: 31, companyId: 1, name: 'Ultra Cement', stateCode: '36', balance: 500 }],
        products: [
            { id: 10, companyId: 1, name: 'Cement', unit: 'BAG', stockQty: 100, purchasePrice: 350 },
            { id: 20, companyId: 2, name: 'Sand', unit: 'TON', stockQty: 5, purchasePrice: 900 }
        ],
        // Saved before the modules existed: no events for them
        invoices: [
            {
                id: 40,
                companyId: 1,
                number: 'INV-0001',
                date: '2026-09-01',
                customerId: 30,
                customerName: 'Anil Stores',
                taxable: 1000,
                tax: 180,
                grandTotal: 1180,
                items: [{ productId: 10, qty: 2, rate: 500, gstRate: 18 }]
            }
        ],
        purchaseBills: [
            {
                id: 50,
                companyId: 1,
                number: 'BILL-0001',
                date: '2026-09-02',
                vendorId: 31,
                taxable: 1000,
                tax: 180,
                grandTotal: 1180,
                paidAmount: 0,
                status: 'pending'
            }
        ],
        payments: [{ id: 60, companyId: 1, number: 'PAY-0001', date: '2026-09-03', vendorId: 31, amount: 680 }]
    };
}

function makeApp({ can, data = seed() } = {}) {
    const registry = createRegistry();
    MODULE_IDS.forEach(id => registry.register(require(path.join(MODULES_DIR, id, 'index.js'))));
    const db = fakeDb(data);
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 9, 1, 10, 0, tick++)).toISOString();
    const rt = createRuntime({ adapter: db, registry, now, can, log: silent });
    return { db, rt, registry };
}

// What core's recordInvoice publishes, for a computed invoice
function invoice(id, items, { companyId = 1, rev = 0, date = '2026-10-05' } = {}) {
    const { lines, totals } = gst.calculator.computeLines(items, { fromState: '36', toState: '36' });
    return {
        id,
        rev,
        companyId,
        number: `INV-${id}`,
        date,
        customerId: 30,
        customerName: 'Anil Stores',
        items: lines,
        taxable: totals.taxable,
        tax: totals.tax,
        ...totals.docFields,
        grandTotal: totals.total
    };
}
const finalize = (rt, doc) => rt.publish(doc.companyId, 'invoice.finalized', { doc }, { id: sales.eventId('invoice.finalized', doc) });
const stockOf = (db, id) => db.rows('products').find(p => p.id === id).stockQty;
const journal = (db, org = 1) => db.rows('journalEntries').filter(e => e.companyId === org);

test('every module registers and the full edition turns them all on, dependencies first', async () => {
    const { rt, registry } = makeApp();
    assert.deepEqual(MODULE_IDS.sort(), [
        'accounting',
        'export_accounting',
        'fleet',
        'fulfilment',
        'hr',
        'inventory',
        'purchasing',
        'region_eu_vat',
        'region_india_gst'
    ]);
    const on = await rt.syncState(1);
    assert.deepEqual(on, registry.order());
    assert.ok(on.indexOf('inventory') < on.indexOf('fulfilment'));
    assert.ok(on.indexOf('accounting') < on.indexOf('export_accounting'));
});

test('first enable runs the migrations: opening stock, chart of accounts, books from existing documents, legacy payments linked', async () => {
    const { db, rt } = makeApp();
    await rt.syncState(1);
    assert.deepEqual(
        db.rows('stockMovements').map(m => [m.id, m.qty, m.companyId]),
        [['opening:10', 100, 1]]
    );
    assert.equal(stockOf(db, 10), 100);
    assert.ok(db.rows('accounts').some(a => a.code === books.ACCOUNTS.debtors && a.companyId === 1));
    // The legacy invoice, the bill and the payment are in the books, and they balance
    assert.deepEqual(
        journal(db)
            .map(e => e.id)
            .sort(),
        ['je:backfill:bill.recorded:50', 'je:backfill:invoice.finalized:40', 'je:backfill:vendor_payment.recorded:60']
    );
    const tb = books.trialBalance(
        journal(db),
        db.rows('accounts').filter(a => a.companyId === 1)
    );
    assert.equal(tb.debit, tb.credit);
    // The old payment now pays the bill it was meant for
    assert.deepEqual(db.rows('purchaseBills')[0], { ...seed().purchaseBills[0], paidAmount: 680, status: 'pending' });
    assert.equal(db.rows('payments')[0].allocations[0].billId, 50);
});

test('an invoice moves stock and posts a balanced entry; delivering the same event again changes nothing', async () => {
    const { db, rt } = makeApp();
    await rt.syncState(1);
    const inv = invoice(41, [{ productId: 10, name: 'Cement', qty: 5, rate: 400, gstRate: 18 }]);
    const first = await finalize(rt, inv);
    assert.ok(first.delivered.includes('inventory:invoice.finalized'));
    assert.equal(stockOf(db, 10), 95);
    const entry = journal(db).find(e => e.id === 'je:invoice.finalized:41:0');
    assert.ok(books.isBalanced(entry.lines));
    assert.deepEqual(
        entry.lines.find(l => l.account === books.ACCOUNTS.debtors),
        { account: '1100', debit: 236000, credit: 0 }
    );

    // The same event published twice (a retried save) is recognised as done
    assert.equal((await finalize(rt, inv)).duplicate, true);
    // A crash after the handlers ran but before their receipts were written: the event is delivered again
    // and every handler runs again, but movements and entries have ids from the event, so nothing doubles
    const event = db.rows('eventLog').find(e => e.id === 'invoice.finalized:41:0');
    db.stores.get('eventLog').set(event.id, { ...event, status: 'pending' });
    db.rows('eventReceipts')
        .filter(r => r.eventId === event.id)
        .forEach(r => db.stores.get('eventReceipts').delete(r.id));
    assert.deepEqual(await rt.redeliver(1), []);
    assert.equal(stockOf(db, 10), 95);
    assert.equal(db.rows('stockMovements').filter(m => m.eventId === event.id).length, 1);
    assert.equal(journal(db).filter(e => e.id === 'je:invoice.finalized:41:0').length, 1);
});

test('an edit is the old revision voided and the new one finalized', async () => {
    const { db, rt } = makeApp();
    await rt.syncState(1);
    const v0 = invoice(42, [{ productId: 10, name: 'Cement', qty: 1, rate: 400, gstRate: 18 }]);
    await finalize(rt, v0);
    const v1 = { ...invoice(42, [{ productId: 10, name: 'Cement', qty: 2, rate: 400, gstRate: 18 }]), rev: sales.nextRevision(v0) };
    await rt.publish(1, 'invoice.voided', { doc: v0 }, { id: sales.eventId('invoice.voided', v0) });
    await finalize(rt, v1);
    assert.equal(stockOf(db, 10), 98);
    const debtors = books
        .trialBalance(
            journal(db),
            db.rows('accounts').filter(a => a.companyId === 1)
        )
        .rows.find(r => r.code === books.ACCOUNTS.debtors);
    assert.equal(debtors.debit, 118000 + 94400, 'the legacy invoice plus only the latest revision');
});

test('downgrade turns modules off without losing data; upgrade turns them on and catches up what they missed', async () => {
    const { db, rt } = makeApp();
    await rt.syncState(1);
    await finalize(rt, invoice(43, [{ productId: 10, name: 'Cement', qty: 5, rate: 400, gstRate: 18 }]));
    const movements = db.rows('stockMovements').length;
    const entries = journal(db).length;

    const down = await rt.setEdition(1, 'invoicing');
    assert.deepEqual(await rt.enabledModules(1), ['region_india_gst']);
    assert.ok(down.disabled.includes('inventory') && down.disabled.includes('accounting'));
    assert.equal(db.rows('stockMovements').length, movements, 'stock history kept');
    assert.equal(journal(db).length, entries, 'books kept');
    assert.deepEqual(await rt.guard(1, 'stock'), { status: 404, moduleId: 'inventory' });
    assert.deepEqual(await rt.guard(1, 'invoices'), { status: 200, moduleId: null });
    assert.equal((await rt.guard(1, 'gst-reports')).status, 200, 'India GST is in every edition');

    // Invoicing goes on while inventory and accounting are off
    await finalize(rt, invoice(44, [{ productId: 10, name: 'Cement', qty: 10, rate: 400, gstRate: 18 }]));
    assert.equal(stockOf(db, 10), 95);

    const up = await rt.setEdition(1, 'business');
    assert.deepEqual(up.enabled.sort(), ['accounting', 'inventory', 'purchasing']);
    assert.equal(stockOf(db, 10), 85, 'the missed invoice reached inventory');
    assert.ok(
        journal(db).some(e => e.id === 'je:invoice.finalized:44:0'),
        'and the books'
    );
    assert.equal((await rt.guard(1, 'sales-orders')).status, 404, 'fulfilment is not in the business edition');
});

test('a module others need cannot be turned off; turning one on brings its dependencies', async () => {
    const { rt } = makeApp();
    await rt.syncState(1);
    await assert.rejects(rt.disableModule(1, 'inventory'), /Turn off Orders & Delivery first: it needs Inventory/);
    await assert.rejects(rt.disableModule(1, 'accounting'), /Turn off Export for Accountant \(preview\) first/);
    await rt.setEdition(1, 'invoicing');
    assert.deepEqual((await rt.enableModule(1, 'fulfilment')).enabled, ['inventory', 'fulfilment']);
    await rt.disableModule(1, 'fulfilment');
    await rt.disableModule(1, 'inventory');
    assert.deepEqual(await rt.enabledModules(1), ['region_india_gst']);
});

test("tenant isolation: one company never reads or changes another company's rows", async () => {
    const { db, rt } = makeApp();
    await rt.syncState(1);
    await rt.syncState(2);
    // Company 2's invoice names company 1's product id: the movement is company 2's, the product is untouched
    await finalize(rt, invoice(45, [{ productId: 10, name: 'Cement', qty: 7, rate: 400, gstRate: 18 }], { companyId: 2 }));
    assert.equal(stockOf(db, 10), 100);
    assert.ok(
        db
            .rows('stockMovements')
            .filter(m => m.companyId === 2)
            .every(m => m.productId !== 10 || m.qty === -7)
    );
    assert.equal(
        journal(db, 1).some(e => e.id.includes(':45:')),
        false,
        "company 2's sale is not in company 1's books"
    );
    const repoOf2 = repository.createRepository(db, 'products', 2);
    assert.equal(await repoOf2.get(10), null);
    await assert.rejects(repoOf2.put({ ...db.rows('products')[0] }), /belongs to another company/);
    assert.equal(
        (await rt.ctxFor(2, 'inventory').repo('stockMovements').list()).some(m => m.companyId !== 2),
        false
    );
});

test('permissions: a missing permission refuses the page (403); declared permissions are on every manifest', async () => {
    const { rt, registry } = makeApp({ can: p => p !== 'purchasing.view' });
    await rt.syncState(1);
    assert.deepEqual(await rt.guard(1, 'purchase-orders'), { status: 403, moduleId: 'purchasing' });
    assert.equal((await rt.guard(1, 'payments')).status, 200, 'paying vendors needs purchasing.pay, which is granted');
    for (const m of registry.list()) assert.ok((m.permissions || []).length, `${m.id} declares its permissions`);
    for (const m of registry.list())
        for (const item of m.navItems || [])
            assert.ok(
                (item.requires || []).every(p => m.permissions.includes(p)),
                `${m.id}: ${item.route} requires only its own permissions`
            );
});

test('rolling back accounting removes the derived books but keeps manual journals; turning it on posts them again', async () => {
    const { db, rt } = makeApp();
    await rt.syncState(1);
    // As core does: the invoice is saved, then its event is published
    const inv = invoice(46, [{ productId: 10, name: 'Cement', qty: 1, rate: 400, gstRate: 18 }]);
    await db.add('invoices', inv);
    await finalize(rt, inv);
    const manual = {
        id: 'manual:1',
        companyId: 1,
        date: '2026-10-06',
        ref: 'JV',
        narration: 'Capital',
        source: 'manual',
        lines: [
            { account: '1010', debit: 1000000, credit: 0 },
            { account: '3000', debit: 0, credit: 1000000 }
        ]
    };
    await db.add('journalEntries', manual);
    const before = books.trialBalance(
        journal(db),
        db.rows('accounts').filter(a => a.companyId === 1)
    );

    await assert.rejects(rt.rollbackModule(1, 'accounting'), /Turn off Accounting before rolling back/);
    await rt.disableModule(1, 'export_accounting');
    await rt.disableModule(1, 'accounting');
    await rt.rollbackModule(1, 'accounting');
    assert.deepEqual(
        journal(db).map(e => e.id),
        ['manual:1']
    );
    assert.equal(db.rows('accounts').filter(a => a.companyId === 1 && a.seeded).length, 0);

    await rt.enableModule(1, 'accounting');
    const after = books.trialBalance(
        journal(db),
        db.rows('accounts').filter(a => a.companyId === 1)
    );
    assert.equal(after.debit, after.credit);
    assert.deepEqual(after.rows, before.rows, 'the same balances, now posted from the documents');
});

test('property: any mix of invoices, receipts, notes, expenses and bills keeps the books balanced and stock consistent', async () => {
    let seedNo = 7;
    const rand = () => (seedNo = (seedNo * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = list => list[Math.floor(rand() * list.length)];
    const { db, rt } = makeApp();
    await rt.syncState(1);
    let expectedStock = 100;
    let debtors = 118000; // the legacy invoice
    for (let i = 0; i < 60; i++) {
        const qty = Math.round(rand() * 900) / 100 + 0.01;
        const rate = Math.round(rand() * 99999) / 100;
        const gstRate = pick(gst.GST_RATES);
        const id = 1000 + i;
        const kind = pick(['invoice', 'receipt', 'credit', 'expense', 'bill']);
        if (kind === 'invoice') {
            const inv = invoice(id, [{ productId: 10, name: 'Cement', qty, rate, gstRate }]);
            assert.equal(sales.due({ ...inv, paidAmount: 0 }), inv.grandTotal);
            assert.equal(Math.round((inv.cgst + inv.sgst) * 100), Math.round(inv.tax * 100), 'CGST + SGST is the tax');
            await finalize(rt, inv);
            expectedStock = stock.roundQty(expectedStock - qty);
            debtors += Math.round(inv.grandTotal * 100);
        } else if (kind === 'receipt') {
            const doc = { id, companyId: 1, number: `RCP-${id}`, date: '2026-10-07', amount: rate, bankId: rand() > 0.5 ? 1 : null };
            await rt.publish(1, 'payment.recorded', { doc }, { id: sales.eventId('payment.recorded', doc) });
            debtors -= Math.round(rate * 100);
        } else if (kind === 'credit') {
            const { lines, totals } = gst.calculator.computeLines([{ productId: 10, qty, rate, gstRate }], { fromState: '36', toState: '29' });
            const doc = {
                id,
                companyId: 1,
                number: `CN-${id}`,
                date: '2026-10-08',
                items: lines,
                taxable: totals.taxable,
                tax: totals.tax,
                grandTotal: totals.total
            };
            await rt.publish(1, 'credit.applied', { doc }, { id: sales.eventId('credit.applied', doc) });
            expectedStock = stock.roundQty(expectedStock + qty);
            debtors -= Math.round(totals.total * 100);
        } else if (kind === 'expense') {
            const doc = { id, companyId: 1, number: `EXP-${id}`, date: '2026-10-09', category: 'Rent', amount: rate, taxAmount: Math.round(rate * 10) / 100 };
            await rt.publish(1, 'expense.created', { doc }, { id: sales.eventId('expense.created', doc) });
        } else {
            const { lines, totals } = gst.calculator.computeLines([{ productId: 10, qty, rate, gstRate }], {});
            const doc = {
                id,
                companyId: 1,
                number: `BILL-${id}`,
                date: '2026-10-10',
                items: lines,
                taxable: totals.taxable,
                tax: totals.tax,
                grandTotal: totals.total + 0.4
            };
            await rt.publish(1, 'bill.recorded', { doc }, { id: sales.eventId('bill.recorded', doc) });
            expectedStock = stock.roundQty(expectedStock + qty);
        }
    }
    assert.equal(stockOf(db, 10), expectedStock);
    assert.equal(stock.levels(db.rows('stockMovements').filter(m => m.companyId === 1)).get(10), expectedStock, 'the cache equals the ledger');
    const tb = books.trialBalance(
        journal(db),
        db.rows('accounts').filter(a => a.companyId === 1)
    );
    assert.equal(tb.debit, tb.credit);
    const d = tb.rows.find(r => r.code === books.ACCOUNTS.debtors) || { debit: 0, credit: 0 };
    assert.equal(d.debit - d.credit, debtors);
});

test('manual journals are checked: two lines, one side each, debits equal credits', () => {
    const accounts = books.DEFAULT_CHART;
    const ok = {
        date: '2026-10-01',
        lines: [
            { account: '1010', debit: 500, credit: 0 },
            { account: '3000', debit: 0, credit: 500 }
        ]
    };
    assert.deepEqual(books.validateJournal(ok, accounts), []);
    assert.deepEqual(books.validateJournal({ ...ok, lines: [ok.lines[0]] }, accounts), ['A journal needs at least two lines']);
    assert.deepEqual(books.validateJournal({ ...ok, lines: [ok.lines[0], { account: '3000', debit: 0, credit: 400 }] }, accounts), [
        'Debits and credits must be equal'
    ]);
    assert.match(
        books.validateJournal({ ...ok, lines: [{ account: '9999', debit: 5, credit: 5 }, ok.lines[1]] }, accounts).join(' '),
        /choose an account.*either a debit or a credit/
    );
    assert.deepEqual(books.validateJournal({ ...ok, date: 'soon' }, accounts), ['Date must be a date']);
});

test('inventory rules: shortages against what an edited invoice already took, batches by expiry', () => {
    const products = [{ id: 1, name: 'Paint', stockQty: 3 }];
    assert.deepEqual(stock.shortages([{ productId: 1, qty: 5 }], products), [{ productId: 1, name: 'Paint', onHand: 3, needed: 5 }]);
    assert.deepEqual(stock.shortages([{ productId: 1, qty: 5 }], products, [{ productId: 1, qty: 4 }]), [], 'the edit needs only 1 more');
    const moves = [
        { productId: 1, qty: 10, batch: 'B2', expiry: '2027-03-01' },
        { productId: 1, qty: 5, batch: 'B1', expiry: '2026-12-01' },
        { productId: 1, qty: -5, batch: 'B1' },
        { productId: 1, qty: -2, batch: 'B2' }
    ];
    assert.deepEqual(stock.batches(moves, 1), [{ batch: 'B2', expiry: '2027-03-01', qty: 8 }]);
    assert.equal(stock.isLowStock({ stockQty: 5, extensions: { inventory: { minStock: 4 } } }), false);
    assert.equal(stock.isLowStock({ stockQty: 5, minStock: 6 }), true, 'older products keep their own alert level');
});

test('reports from modules run on the same data', async () => {
    const { db, rt } = makeApp();
    await rt.syncState(1);
    const ctx = {
        list: async s => db.rows(s).filter(r => r.companyId === 1),
        company: async () => db.rows('companies')[0],
        contributions: point => rt.contributions(1, point)
    };
    const entries = (await rt.contributions(1, 'reports.entries')).map(c => c.value);
    // In hook order: by module id, then the module's own order
    assert.deepEqual(
        entries.map(r => r.id),
        ['trial-balance', 'books-pl', 'stock', 'purchase', 'payments', 'profit-loss', 'gst-summary']
    );
    for (const r of entries) {
        const out = await r.run(ctx, { from: '2026-09-01', to: '2026-10-31' });
        assert.ok(out.title && Array.isArray(out.tables) && Array.isArray(out.csv), r.id);
    }
    const tb = await entries.find(r => r.id === 'trial-balance').run(ctx, {});
    assert.equal(tb.summary[0].value, tb.summary[1].value);
    const gstSummary = await entries.find(r => r.id === 'gst-summary').run(ctx, { from: '2026-09-01', to: '2026-09-30' });
    assert.deepEqual(
        gstSummary.summary.map(s => s.value),
        [18000, 18000, 0],
        'output GST of the old invoice, input credit of the old bill'
    );
});

test('editions name only modules that exist, and the invoicing edition is core plus India GST', () => {
    const { registry } = makeApp();
    const { EDITIONS } = require('../../app/js/platform/editions.js');
    for (const [name, e] of Object.entries(EDITIONS))
        if (e.modules !== '*') e.modules.forEach(id => assert.ok(registry.get(id), `edition "${name}" names unknown module "${id}"`));
    assert.deepEqual(EDITIONS.invoicing.modules, ['region_india_gst']);
});

test('rolling back purchasing unlinks exactly the payments its migration linked', async () => {
    const { db, rt } = makeApp();
    await rt.syncState(1);
    const linkedByHand = { id: 61, companyId: 1, vendorId: 31, amount: 100, allocations: [] };
    await db.add('payments', linkedByHand);
    await rt.setEdition(1, 'invoicing');
    await rt.rollbackModule(1, 'purchasing');
    assert.deepEqual(db.rows('purchaseBills')[0], seed().purchaseBills[0]);
    assert.deepEqual(
        db.rows('payments').find(p => p.id === 60),
        seed().payments[0]
    );
    assert.deepEqual(
        db.rows('payments').find(p => p.id === 61),
        linkedByHand
    );
});

test('a product written straight to the database starts from the stock it shows', async () => {
    const { db, rt } = makeApp();
    await rt.syncState(1);
    await db.add('products', { id: 11, companyId: 1, name: 'Imported', stockQty: 50 });
    await finalize(rt, invoice(47, [{ productId: 11, name: 'Imported', qty: 5, rate: 10, gstRate: 5 }]));
    assert.equal(stockOf(db, 11), 45);
    await finalize(rt, invoice(48, [{ productId: 11, name: 'Imported', qty: 5, rate: 10, gstRate: 5 }]));
    assert.equal(stockOf(db, 11), 40);
});
