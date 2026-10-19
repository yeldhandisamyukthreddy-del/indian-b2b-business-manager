// Purchasing module: purchase orders, purchase bills, debit notes (purchase returns) and vendor payments.
// Bills publish bill.recorded / bill.voided and debit notes debit.applied / debit.voided, which inventory and
// accounting act on when they are on. Vendor payments and debit notes use core's money and returns screens
// with the kinds defined here. Offers its bills to tax modules ('tax.inputDocuments', e.g. GST input credit).
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node
        ? { money: require('../../core/shared/money.js'), sales: require('../../core/sales/sales.js') }
        : { money: root.Vyapar.money, sales: root.Vyapar.core.sales };
    const api = factory(deps.money, deps.sales);
    if (node) module.exports = api;
    else root.Vyapar.app.register(api);
})(typeof self !== 'undefined' ? self : this, function (money, sales) {
    'use strict';
    const { toPaise, fromPaise } = money;
    // Paid once payments plus debit notes cover the total (same rule as core's documents)
    const settle = d => ({ ...d, status: toPaise(d.paidAmount) + toPaise(d.creditedAmount) >= toPaise(d.grandTotal) ? 'paid' : 'pending' });
    const addPaid = (d, amount) => settle({ ...d, paidAmount: fromPaise(Math.max(toPaise(d.paidAmount) + toPaise(amount), 0)) });

    // Older versions reduced the vendor balance on payments without linking them to bills, so those bills
    // never became 'paid'. Link such payments once, oldest bill first; rolling back unlinks exactly those.
    const linkLegacyPayments = {
        id: '001-link-legacy-payments',
        async up(ctx) {
            const pays = ctx.repo('payments');
            const billRepo = ctx.repo('purchaseBills');
            const legacy = (await pays.list()).filter(p => !Array.isArray(p.allocations)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
            for (const p of legacy) {
                const own = (await billRepo.list()).filter(b => b.vendorId === p.vendorId);
                const alloc = sales.allocatePayment(own, p.amount || 0, null);
                for (const a of alloc)
                    await billRepo.put(
                        addPaid(
                            own.find(b => b.id === a.id),
                            a.amount
                        )
                    );
                const allocations = alloc.map(a => ({ billId: a.id, id: a.id, amount: a.amount, number: own.find(b => b.id === a.id).number }));
                await pays.put({ ...p, allocations, linkedByMigration: true });
            }
        },
        async down(ctx) {
            const pays = ctx.repo('payments');
            const billRepo = ctx.repo('purchaseBills');
            for (const p of (await pays.list()).filter(x => x.linkedByMigration)) {
                for (const a of p.allocations || []) {
                    const b = await billRepo.get(a.id);
                    if (b) await billRepo.put(addPaid(b, -a.amount));
                }
                const rest = { ...p };
                delete rest.allocations;
                delete rest.linkedByMigration;
                await pays.put(rest);
            }
        }
    };
    const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
    const inDates = (d, f) => (!f.from || (d || '') >= f.from) && (!f.to || (d || '') <= f.to);
    const amountOf = x => x.grandTotal ?? x.amount ?? 0;
    const inAmount = (x, f) => (!f.min || amountOf(x) >= f.min) && (!f.max || amountOf(x) <= f.max);
    const col = (key, label, format) => ({ key, label, format });
    const stat = (label, value, format = 'money', tone = 'primary') => ({ label, value, format, tone });

    async function bills(ctx, f) {
        return (await ctx.list('purchaseBills')).filter(
            b =>
                inDates(b.date, f) &&
                inAmount(b, f) &&
                (!f.vendorId || b.vendorId == f.vendorId) &&
                (!f.productId || (b.items || []).some(it => it.productId == f.productId))
        );
    }
    const payments = async (ctx, f) =>
        (await ctx.list('payments')).filter(
            p => inDates(p.date, f) && inAmount(p, f) && (!f.vendorId || p.vendorId == f.vendorId) && (!f.mode || p.mode === f.mode)
        );

    // ---------- reports ----------
    async function purchaseReport(ctx, f) {
        const list = await bills(ctx, f);
        const rows = list.map(b => ({
            number: b.number || String(b.id),
            date: b.date,
            party: b.vendorName,
            taxable: toPaise(b.taxable ?? b.subtotal),
            tax: toPaise(b.tax),
            total: toPaise(b.grandTotal)
        }));
        return {
            title: '📦 Purchase Report',
            summary: [
                stat('Bills', rows.length, 'count'),
                stat(
                    'Total Purchases',
                    sum(rows, r => r.total),
                    'money',
                    'danger'
                ),
                stat(
                    'Input Tax',
                    sum(rows, r => r.tax),
                    'money',
                    'warning'
                )
            ],
            tables: [
                {
                    columns: [
                        col('number', 'Bill #'),
                        col('date', 'Date', 'date'),
                        col('party', 'Vendor'),
                        col('taxable', 'Taxable', 'money'),
                        col('tax', 'Tax', 'money'),
                        col('total', 'Total', 'money')
                    ],
                    rows
                }
            ],
            csv: list.map(b => ({
                Bill: b.number || b.id,
                Date: b.date,
                Vendor: b.vendorName,
                Taxable: b.taxable ?? b.subtotal,
                Tax: b.tax,
                Total: b.grandTotal
            }))
        };
    }
    async function paymentsReport(ctx, f) {
        const list = await payments(ctx, f);
        const rows = list.map(p => ({ number: p.number || String(p.id), date: p.date, party: p.vendorName, mode: p.mode || '', amount: toPaise(p.amount) }));
        return {
            title: '💸 Payments Report',
            summary: [
                stat('Payments', rows.length, 'count'),
                stat(
                    'Total Paid',
                    sum(rows, r => r.amount),
                    'money',
                    'danger'
                )
            ],
            tables: [
                {
                    columns: [
                        col('number', 'Payment #'),
                        col('date', 'Date', 'date'),
                        col('party', 'Vendor'),
                        col('mode', 'Mode'),
                        col('amount', 'Amount', 'money')
                    ],
                    rows
                }
            ],
            csv: list.map(p => ({ Payment: p.number || p.id, Date: p.date, Vendor: p.vendorName, Mode: p.mode, Amount: p.amount }))
        };
    }
    // Simplified: sales less purchases less expenses, before tax. The accounting module has the full statement.
    async function profitLoss(ctx, f) {
        const sales = sum(
            (await ctx.list('invoices')).filter(i => inDates(i.date, f)),
            i => toPaise(i.taxable)
        );
        const purchases = sum(await bills(ctx, { from: f.from, to: f.to }), b => toPaise(b.taxable ?? b.subtotal));
        const expenses = sum(
            (await ctx.list('expenses')).filter(e => inDates(e.date, f)),
            e => toPaise(e.amount)
        );
        const rows = [
            { line: 'Sales revenue (taxable value)', amount: sales },
            { line: 'Less: purchases (taxable value)', amount: -purchases },
            { line: 'Gross profit', amount: sales - purchases },
            { line: 'Less: expenses', amount: -expenses },
            { line: 'Net profit (simplified)', amount: sales - purchases - expenses }
        ];
        return {
            title: '📈 Profit & Loss Statement',
            summary: [
                stat('Gross Profit', sales - purchases, 'money', sales >= purchases ? 'success' : 'danger'),
                stat('Net Profit', sales - purchases - expenses)
            ],
            tables: [{ columns: [col('line', ''), col('amount', 'Amount', 'money')], rows }],
            note: 'Simplified: it does not adjust for opening and closing stock. Turn on Accounting for a profit and loss from the books.',
            csv: rows.map(r => ({ Line: r.line, Amount: fromPaise(r.amount) }))
        };
    }

    const payablesSection = async ctx => ({
        title: 'Payables (Vendors)',
        kind: 'payable',
        rows: (await ctx.list('vendors')).filter(v => (v.balance || 0) > 0).map(v => ({ name: v.name, phone: v.phone || '', balance: toPaise(v.balance) }))
    });
    const daybookRows = async (ctx, f) => [
        ...(await bills(ctx, { from: f.from, to: f.to })).map(b => ({
            date: b.date,
            type: 'Purchase',
            ref: b.number || String(b.id),
            party: b.vendorName,
            in: 0,
            out: toPaise(b.grandTotal)
        })),
        ...(await payments(ctx, { from: f.from, to: f.to })).map(p => ({
            date: p.date,
            type: 'Payment',
            ref: p.number || String(p.id),
            party: p.vendorName,
            in: 0,
            out: toPaise(p.amount)
        }))
    ];
    async function vendorSummary(ctx, f) {
        const byVendor = new Map();
        (await bills(ctx, { from: f.from, to: f.to })).forEach(b => {
            const row = byVendor.get(b.vendorId) || { name: b.vendorName, bills: 0, amount: 0 };
            byVendor.set(b.vendorId, { ...row, bills: row.bills + 1, amount: row.amount + toPaise(b.grandTotal) });
        });
        return {
            title: 'Vendor Purchase Summary',
            columns: [col('name', 'Vendor'), col('bills', 'Bills'), col('amount', 'Total Purchases', 'money')],
            rows: [...byVendor.values()].sort((a, b) => b.amount - a.amount)
        };
    }

    return {
        id: 'purchasing',
        version: '1.0.0',
        displayName: 'Purchasing',
        description: 'Purchase orders, purchase bills, debit notes and vendor payments.',
        dependsOn: [],
        adds: [
            'Purchase orders and bills',
            'Debit notes (purchase returns)',
            'Vendor payments and vendor ledger',
            'Purchase, payments and simplified profit reports',
            'Input tax from bills for the GST reports'
        ],
        stores: ['purchaseOrders', 'purchaseBills', 'purchaseReturns', 'payments'],
        sections: [{ id: 'purchase', label: 'Purchase', labels: { te: 'కొనుగోలు' }, order: 30 }],
        navItems: [
            {
                id: 'purchase-orders',
                label: 'Purchase Orders',
                labels: { te: 'కొనుగోలు ఆర్డర్లు' },
                route: 'purchase-orders',
                section: 'purchase',
                order: 10,
                requires: ['purchasing.view'],
                newAction: 'showPOForm',
                icon: '<circle cx="9" cy="21" r="1" /> <circle cx="20" cy="21" r="1" /> <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />'
            },
            {
                id: 'purchase-bills',
                label: 'Purchase Bills',
                labels: { te: 'కొనుగోలు బిల్లులు' },
                route: 'purchase-bills',
                section: 'purchase',
                order: 20,
                requires: ['purchasing.view'],
                newAction: 'showBillForm',
                icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /> <path d="M14 2v6h6" />'
            },
            {
                id: 'purchase-returns',
                label: 'Purchase Returns',
                labels: { te: 'కొనుగోలు రిటర్న్స్' },
                route: 'purchase-returns',
                section: 'purchase',
                order: 30,
                requires: ['purchasing.view'],
                newAction: 'showDebitNoteForm',
                icon: '<path d="M21 10h-10a8 8 0 0 0-8 8v2M21 10l-6 6M21 10l-6-6" />'
            },
            {
                id: 'payments',
                label: 'Payments',
                labels: { te: 'చెల్లింపులు' },
                route: 'payments',
                section: 'money',
                order: 20,
                requires: ['purchasing.pay'],
                newAction: 'showVendorPaymentForm',
                icon: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2" /> <line x1="1" y1="10" x2="23" y2="10" />'
            }
        ],
        permissions: ['purchasing.view', 'purchasing.manage', 'purchasing.pay'],
        migrations: [linkLegacyPayments],
        extensionPoints: {
            'numbering.series': [
                { type: 'po', store: 'purchaseOrders', prefix: 'PO-', setting: { key: 'poPrefix', label: 'PO Prefix' } },
                { type: 'bill', store: 'purchaseBills', prefix: 'BILL-' },
                { type: 'payment', store: 'payments', prefix: 'PAY-', setting: { key: 'payPrefix', label: 'Payment Prefix' } },
                { type: 'purchaseReturn', store: 'purchaseReturns', prefix: 'DN-' }
            ],
            // Money out to vendors against bills, on core's receipt/payment form
            'money.kinds': {
                kind: 'payment',
                store: 'payments',
                partyStore: 'vendors',
                docStore: 'purchaseBills',
                partyKey: 'vendorId',
                partyNameKey: 'vendorName',
                docKey: 'billId',
                title: 'Payment',
                party: 'Vendor',
                doc: 'bill',
                page: 'payments',
                i18n: 'payments',
                sign: -1,
                bankSign: -1,
                defaultMode: 'Bank Transfer',
                events: { recorded: 'vendor_payment.recorded', voided: 'vendor_payment.voided' }
            },
            // Debit notes against bills, on core's credit/debit note form
            'returns.kinds': {
                kind: 'purchase',
                store: 'purchaseReturns',
                srcStore: 'purchaseBills',
                partyStore: 'vendors',
                partyKey: 'vendorId',
                partyNameKey: 'vendorName',
                srcKey: 'billId',
                srcNumKey: 'billNumber',
                numberType: 'purchaseReturn',
                title: 'Debit Note (Purchase Return)',
                printTitle: 'DEBIT NOTE',
                noteLabel: 'DN #',
                srcLabel: 'Bill',
                partyLabel: 'Vendor',
                page: 'purchase-returns',
                i18n: 'purchaseReturns',
                events: { applied: 'debit.applied', voided: 'debit.voided' }
            },
            'ledger.sources': [
                { party: 'vendor', store: 'purchaseBills', key: 'vendorId', kind: 'Purchase Bill', debit: true },
                { party: 'vendor', store: 'payments', key: 'vendorId', kind: 'Payment', debit: false },
                { party: 'vendor', store: 'purchaseReturns', key: 'vendorId', kind: 'Debit Note', debit: false }
            ],
            'contact.references': async ({ list }, kind, id) => {
                if (kind !== 'vendor') return [];
                const n = async (store, label) => {
                    const count = (await list(store)).filter(r => r.vendorId === id).length;
                    return count ? [`${count} ${label}`] : [];
                };
                return [
                    ...(await n('purchaseBills', 'purchase bill(s)')),
                    ...(await n('payments', 'payment(s)')),
                    ...(await n('purchaseReturns', 'debit note(s)'))
                ];
            },
            'product.references': async ({ list }, id) => {
                const count = (await list('purchaseBills')).filter(b => (b.items || []).some(it => it.productId === id)).length;
                return count ? [`${count} purchase bill(s)`] : [];
            },
            'tax.inputDocuments': async ({ list }) => ({ bills: await list('purchaseBills'), debitNotes: await list('purchaseReturns') }),
            // Existing documents as the events they publish, for modules that start later (e.g. accounting's books)
            'documents.history': async ({ list }) => [
                ...(await list('purchaseBills')).map(doc => ({ type: 'bill.recorded', doc })),
                ...(await list('purchaseReturns')).map(doc => ({ type: 'debit.applied', doc })),
                ...(await list('payments')).map(doc => ({ type: 'vendor_payment.recorded', doc }))
            ],
            'dashboard.stats': async ({ list }) => [
                { label: 'Pending Payables', value: toPaise(sum(await list('vendors'), v => Math.max(v.balance || 0, 0))), format: 'money', tone: 'warning' }
            ],
            'dashboard.cashFlow': async ({ list }, month) => ({
                out: toPaise(
                    sum(
                        (await list('payments')).filter(p => (p.date || '').startsWith(month)),
                        p => p.amount || 0
                    )
                )
            }),
            'dashboard.quickActions': { label: '📦 New PO', page: 'purchase-orders', action: 'showPOForm' },
            'reports.entries': [
                {
                    id: 'purchase',
                    label: 'Purchase Report',
                    icon: '📦',
                    description: 'Bills, input tax, vendors',
                    order: 15,
                    filters: ['date', 'vendor', 'product', 'amount'],
                    run: purchaseReport
                },
                {
                    id: 'payments',
                    label: 'Payments Report',
                    icon: '💸',
                    description: 'Money paid to vendors',
                    order: 65,
                    filters: ['date', 'vendor', 'mode', 'amount'],
                    run: paymentsReport
                },
                {
                    id: 'profit-loss',
                    label: 'Profit & Loss (simplified)',
                    icon: '📈',
                    description: 'Sales less purchases and expenses',
                    order: 85,
                    filters: ['date'],
                    run: profitLoss
                }
            ],
            'reports.outstanding': payablesSection,
            'reports.daybook': daybookRows,
            'reports.partywise': vendorSummary
        }
    };
});
