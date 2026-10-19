// Accounting module: double-entry books derived from what the business already records. Every invoice,
// receipt, credit note and expense (and, when purchasing is on, every bill, debit note and vendor payment)
// posts a balanced journal entry through its event. Turning the module on for the first time posts the
// existing documents (a migration you can roll back). Adds the chart of accounts, manual journals with
// templates, account ledgers, a trial balance and a profit and loss from the books.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node
        ? { books: require('./books.js'), money: require('../../core/shared/money.js') }
        : { books: root.Vyapar.modules.accounting.books, money: root.Vyapar.money };
    const api = factory(deps.books, deps.money);
    if (node) module.exports = api;
    else root.Vyapar.app.register(api);
})(typeof self !== 'undefined' ? self : this, function (books, money) {
    'use strict';
    const JOURNAL = 'journalEntries';

    async function post(ctx, entry) {
        if (!entry) return;
        const repo = ctx.repo(JOURNAL);
        if (!(await repo.get(entry.id))) await repo.add(entry);
    }
    const onEvent = (event, ctx) => post(ctx, books.entryForEvent(event));

    // Core's documents as the events they would have published, plus what other modules offer ('documents.history')
    const CORE_HISTORY = [
        ['invoices', 'invoice.finalized'],
        ['receipts', 'payment.recorded'],
        ['salesReturns', 'credit.applied'],
        ['expenses', 'expense.created']
    ];
    const migrations = [
        {
            id: '001-chart-of-accounts',
            up: async ctx => {
                const repo = ctx.repo('accounts');
                const have = new Set((await repo.list()).map(a => a.code));
                for (const a of books.DEFAULT_CHART) if (!have.has(a.code)) await repo.add({ ...a, seeded: true });
            },
            down: async ctx => {
                const repo = ctx.repo('accounts');
                for (const a of (await repo.list()).filter(x => x.seeded)) await repo.remove(a.id);
            }
        },
        {
            // The books start with every document already recorded
            id: '002-post-existing-documents',
            up: async ctx => {
                const history = [];
                for (const [store, type] of CORE_HISTORY) (await ctx.repo(store).list()).forEach(doc => history.push({ type, doc }));
                for (const c of await ctx.contributions('documents.history')) history.push(...(await c.value({ list: s => ctx.repo(s).list() })));
                for (const { type, doc } of history) await post(ctx, books.entryFor(type, doc, `je:backfill:${type}:${doc.id}`));
            },
            // Rolling back removes every entry the books derived (manual journals stay); turning the module on
            // again posts the documents afresh
            down: async ctx => {
                const repo = ctx.repo(JOURNAL);
                for (const e of (await repo.list()).filter(x => x.source !== 'manual')) await repo.remove(e.id);
            }
        }
    ];

    const col = (key, label, format) => ({ key, label, format });
    async function trialBalanceReport(ctx, f) {
        const tb = books.trialBalance(await ctx.list(JOURNAL), await ctx.list('accounts'), f.to);
        return {
            title: '⚖️ Trial Balance',
            summary: [
                { label: 'Total Debit', value: tb.debit, format: 'money', tone: 'primary' },
                { label: 'Total Credit', value: tb.credit, format: 'money', tone: 'primary' }
            ],
            tables: [
                { columns: [col('code', 'Code'), col('name', 'Account'), col('debit', 'Debit', 'money'), col('credit', 'Credit', 'money')], rows: tb.rows }
            ],
            note: f.to ? `As on ${f.to}.` : '',
            csv: tb.rows.map(r => ({ Code: r.code, Account: r.name, Debit: money.fromPaise(r.debit), Credit: money.fromPaise(r.credit) }))
        };
    }
    async function booksProfitLoss(ctx, f) {
        const pl = books.profitAndLoss(await ctx.list(JOURNAL), await ctx.list('accounts'), f.from, f.to);
        const rows = [
            ...pl.income.map(r => ({ section: 'Income', name: r.name, amount: r.amount })),
            { section: '', name: 'Total income', amount: pl.totalIncome },
            ...pl.expenses.map(r => ({ section: 'Expenses', name: r.name, amount: r.amount })),
            { section: '', name: 'Total expenses', amount: pl.totalExpenses },
            { section: '', name: pl.net >= 0 ? 'Net profit' : 'Net loss', amount: pl.net }
        ];
        return {
            title: '📒 Profit & Loss (from the books)',
            summary: [
                { label: 'Income', value: pl.totalIncome, format: 'money', tone: 'success' },
                { label: 'Expenses', value: pl.totalExpenses, format: 'money', tone: 'danger' },
                { label: pl.net >= 0 ? 'Net Profit' : 'Net Loss', value: Math.abs(pl.net), format: 'money', tone: pl.net >= 0 ? 'success' : 'danger' }
            ],
            tables: [{ columns: [col('section', ''), col('name', 'Account'), col('amount', 'Amount', 'money')], rows }],
            note: 'Purchases are expensed when billed; closing stock is not valued.',
            csv: rows.map(r => ({ Section: r.section, Account: r.name, Amount: money.fromPaise(r.amount) }))
        };
    }

    return {
        id: 'accounting',
        version: '1.0.0',
        displayName: 'Accounting',
        description: 'Double-entry books from your invoices, receipts, notes, expenses and bills, with manual journals and a trial balance.',
        dependsOn: [],
        adds: [
            'Chart of accounts',
            'Journal entries posted from every document',
            'Manual journals and journal templates',
            'Account ledgers',
            'Trial balance and profit & loss from the books'
        ],
        stores: ['accounts', 'journalEntries', 'journalTemplates'],
        sections: [{ id: 'accounting', label: 'Accounting', labels: { te: 'లెక్కలు' }, order: 85 }],
        navItems: [
            {
                id: 'accounts',
                label: 'Chart of Accounts',
                labels: { te: 'ఖాతాల జాబితా' },
                route: 'accounts',
                section: 'accounting',
                order: 10,
                requires: ['accounting.view'],
                newAction: 'showAccountForm',
                icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /> <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />'
            },
            {
                id: 'journal',
                label: 'Journal',
                labels: { te: 'జర్నల్' },
                route: 'journal',
                section: 'accounting',
                order: 20,
                requires: ['accounting.view'],
                newAction: 'showJournalForm',
                icon: '<path d="M12 20h9" /> <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />'
            }
        ],
        permissions: ['accounting.view', 'accounting.post'],
        migrations,
        eventSubscriptions: Object.fromEntries(books.EVENT_TYPES.map(type => [type, onEvent])),
        extensionPoints: {
            'reports.entries': [
                {
                    id: 'trial-balance',
                    label: 'Trial Balance',
                    icon: '⚖️',
                    description: 'Debit and credit per account',
                    order: 90,
                    filters: ['date'],
                    run: trialBalanceReport
                },
                {
                    id: 'books-pl',
                    label: 'Profit & Loss (books)',
                    icon: '📒',
                    description: 'Income less expenses from the books',
                    order: 91,
                    filters: ['date'],
                    run: booksProfitLoss
                }
            ]
        }
    };
});
