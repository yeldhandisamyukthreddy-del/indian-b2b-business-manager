// Reports. A report definition is data plus a run function:
//   { id, label, icon, description, order, filters: ['date','customer','vendor','product','mode','amount'], run(ctx, filters) }
// run returns { title, summary: [{ label, value, format, tone }], tables: [{ title, columns: [{ key, label, format }], rows }], csv }.
// Money values are integer paise. Modules add reports ('reports.entries') and rows for the day book ('reports.daybook'),
// the outstanding report ('reports.outstanding') and the party-wise report ('reports.partywise').
// ctx: { list(store) → the company's rows, contributions(point) → ordered hooks }
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node
        ? { money: require('../shared/money.js'), expenses: require('../expenses/expenses.js') }
        : { money: root.Vyapar.money, expenses: root.Vyapar.core.expenses };
    const api = factory(deps.money, deps.expenses);
    if (node) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).reports = api;
})(typeof self !== 'undefined' ? self : this, function (money, expenseRules) {
    'use strict';
    const { toPaise, fromPaise } = money;
    const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
    const inDates = (d, f) => (!f.from || (d || '') >= f.from) && (!f.to || (d || '') <= f.to);
    const amountOf = x => x.grandTotal ?? x.amount ?? 0;
    const inAmount = (x, f) => (!f.min || amountOf(x) >= f.min) && (!f.max || amountOf(x) <= f.max);
    const col = (key, label, format) => ({ key, label, format });
    const stat = (label, value, format = 'money', tone = 'primary') => ({ label, value, format, tone });

    async function filteredInvoices(ctx, f) {
        return (await ctx.list('invoices')).filter(
            i =>
                inDates(i.date, f) &&
                inAmount(i, f) &&
                (!f.customerId || i.customerId == f.customerId) &&
                (!f.productId || (i.items || []).some(it => it.productId == f.productId))
        );
    }
    const extra = async (ctx, point, f) => {
        const out = [];
        for (const c of await ctx.contributions(point)) out.push(await c.value(ctx, f));
        return out;
    };

    async function sales(ctx, f) {
        const inv = await filteredInvoices(ctx, f);
        const rows = inv.map(i => ({
            number: i.number || String(i.id),
            date: i.date,
            party: i.customerName,
            taxable: toPaise(i.taxable),
            tax: toPaise(i.tax),
            total: toPaise(i.grandTotal)
        }));
        return {
            title: '📊 Sales Report',
            summary: [
                stat('Invoices', inv.length, 'count'),
                stat(
                    'Total Sales',
                    sum(rows, r => r.total),
                    'money',
                    'success'
                ),
                stat(
                    'Total Tax',
                    sum(rows, r => r.tax),
                    'money',
                    'warning'
                )
            ],
            tables: [
                {
                    columns: [
                        col('number', 'Invoice #'),
                        col('date', 'Date', 'date'),
                        col('party', 'Customer'),
                        col('taxable', 'Taxable', 'money'),
                        col('tax', 'Tax', 'money'),
                        col('total', 'Total', 'money')
                    ],
                    rows
                }
            ],
            csv: inv.map(i => ({ Invoice: i.number || i.id, Date: i.date, Customer: i.customerName, Taxable: i.taxable, Tax: i.tax, Total: i.grandTotal }))
        };
    }

    async function outstanding(ctx, f) {
        const receivable = (await ctx.list('customers'))
            .filter(c => (c.balance || 0) > 0)
            .map(c => ({ name: c.name, phone: c.phone || '', creditDays: c.creditDays ?? '', balance: toPaise(c.balance) }));
        const sections = [{ title: 'Receivables (Customers)', kind: 'receivable', rows: receivable }, ...(await extra(ctx, 'reports.outstanding', f))];
        const total = kind =>
            sum(
                sections.filter(s => s.kind === kind),
                s => sum(s.rows, r => r.balance)
            );
        const hasPayables = sections.some(s => s.kind === 'payable');
        const summary = [stat('Total Receivable', total('receivable'), 'money', 'success')];
        if (hasPayables) summary.push(stat('Total Payable', total('payable'), 'money', 'danger'), stat('Net Position', total('receivable') - total('payable')));
        return {
            title: '💰 Outstanding Report',
            summary,
            tables: sections.map(s => ({
                title: s.title,
                columns: [col('name', 'Name'), col('phone', 'Phone'), col('balance', 'Balance', 'money')],
                rows: s.rows
            })),
            csv: sections.flatMap(s =>
                s.rows.map(r => ({ Type: s.kind === 'payable' ? 'Payable' : 'Receivable', Name: r.name, Phone: r.phone, Balance: fromPaise(r.balance) }))
            )
        };
    }

    async function daybook(ctx, f) {
        const inv = await filteredInvoices(ctx, f);
        const rec = (await ctx.list('receipts')).filter(r => inDates(r.date, f));
        const exp = (await ctx.list('expenses')).filter(e => inDates(e.date, f));
        const rows = [
            ...inv.map(i => ({ date: i.date, type: 'Sale', ref: i.number || String(i.id), party: i.customerName, in: toPaise(i.grandTotal), out: 0 })),
            ...rec.map(r => ({ date: r.date, type: 'Receipt', ref: r.number || String(r.id), party: r.customerName, in: toPaise(r.amount), out: 0 })),
            ...exp.map(e => ({ date: e.date, type: `Expense: ${e.category}`, ref: e.number || '—', party: e.payee || '', in: 0, out: toPaise(e.amount) })),
            ...(await extra(ctx, 'reports.daybook', f)).flat()
        ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const tin = sum(rows, r => r.in);
        const tout = sum(rows, r => r.out);
        return {
            title: '📅 Day Book',
            summary: [stat('Total In', tin, 'money', 'success'), stat('Total Out', tout, 'money', 'danger'), stat('Net', tin - tout)],
            tables: [
                {
                    columns: [
                        col('date', 'Date', 'date'),
                        col('type', 'Type'),
                        col('ref', 'Ref #'),
                        col('party', 'Party'),
                        col('in', 'In', 'money'),
                        col('out', 'Out', 'money')
                    ],
                    rows
                }
            ],
            csv: rows.map(r => ({ Date: r.date, Type: r.type, Ref: r.ref, Party: r.party, In: fromPaise(r.in), Out: fromPaise(r.out) }))
        };
    }

    async function itemwise(ctx, f) {
        const byItem = new Map();
        (await filteredInvoices(ctx, f)).forEach(inv =>
            (inv.items || []).forEach(it => {
                const key = it.productId ?? it.name;
                const row = byItem.get(key) || { name: it.name, hsn: it.hsn || '', qty: 0, amount: 0 };
                byItem.set(key, { ...row, qty: row.qty + (it.qty || 0), amount: row.amount + toPaise(it.taxable ?? it.amount) });
            })
        );
        const rows = [...byItem.values()].sort((a, b) => b.amount - a.amount);
        return {
            title: '📋 Item-wise Sales Report',
            summary: [],
            tables: [{ columns: [col('name', 'Product'), col('hsn', 'HSN'), col('qty', 'Qty Sold'), col('amount', 'Revenue', 'money')], rows }],
            csv: rows.map(r => ({ Product: r.name, HSN: r.hsn, Qty: r.qty, Revenue: fromPaise(r.amount) }))
        };
    }

    async function partywise(ctx, f) {
        const byParty = new Map();
        (await filteredInvoices(ctx, f)).forEach(i => {
            const row = byParty.get(i.customerId) || { name: i.customerName, invoices: 0, amount: 0 };
            byParty.set(i.customerId, { ...row, invoices: row.invoices + 1, amount: row.amount + toPaise(i.grandTotal) });
        });
        const customers = {
            title: 'Customer Sales Summary',
            columns: [col('name', 'Customer'), col('invoices', 'Invoices'), col('amount', 'Total Revenue', 'money')],
            rows: [...byParty.values()].sort((a, b) => b.amount - a.amount)
        };
        const tables = [customers, ...(await extra(ctx, 'reports.partywise', f))];
        return { title: '👥 Party-wise Ledger', summary: [], tables, csv: tables.flatMap(t => t.rows.map(r => ({ Section: t.title, ...r }))) };
    }

    async function receipts(ctx, f) {
        const rec = (await ctx.list('receipts')).filter(
            r => inDates(r.date, f) && inAmount(r, f) && (!f.customerId || r.customerId == f.customerId) && (!f.mode || r.mode === f.mode)
        );
        const rows = rec.map(r => ({ number: r.number || String(r.id), date: r.date, party: r.customerName, mode: r.mode || '', amount: toPaise(r.amount) }));
        return {
            title: '💵 Receipts Report',
            summary: [
                stat('Receipts', rows.length, 'count'),
                stat(
                    'Total Received',
                    sum(rows, r => r.amount),
                    'money',
                    'success'
                )
            ],
            tables: [
                {
                    columns: [
                        col('number', 'Receipt #'),
                        col('date', 'Date', 'date'),
                        col('party', 'Customer'),
                        col('mode', 'Mode'),
                        col('amount', 'Amount', 'money')
                    ],
                    rows
                }
            ],
            csv: rec.map(r => ({ Receipt: r.number || r.id, Date: r.date, Customer: r.customerName, Mode: r.mode, Amount: r.amount }))
        };
    }

    async function expensesReport(ctx, f) {
        const exp = (await ctx.list('expenses')).filter(e => inDates(e.date, f) && inAmount(e, f) && (!f.mode || e.mode === f.mode));
        const rows = exp.map(e => ({ date: e.date, category: e.category, payee: e.payee || '', mode: e.mode || '', amount: toPaise(e.amount) }));
        return {
            title: '🧾 Expenses Report',
            summary: [
                stat('Expenses', rows.length, 'count'),
                stat(
                    'Total Spent',
                    sum(rows, r => r.amount),
                    'money',
                    'danger'
                )
            ],
            tables: [
                {
                    columns: [
                        col('date', 'Date', 'date'),
                        col('category', 'Category'),
                        col('payee', 'Paid To'),
                        col('mode', 'Mode'),
                        col('amount', 'Amount', 'money')
                    ],
                    rows
                },
                { title: 'By Category', columns: [col('category', 'Category'), col('amount', 'Amount', 'money')], rows: expenseRules.totalsByCategory(exp) }
            ],
            csv: exp.map(e => ({ Date: e.date, Category: e.category, PaidTo: e.payee, Mode: e.mode, Amount: e.amount }))
        };
    }

    // Output tax by rate, net of credit notes (a region module adds its own detailed tax reports)
    async function taxSummary(ctx, f) {
        const byRate = new Map();
        const add = (items, sign) =>
            items.forEach(it => {
                const row = byRate.get(it.gstRate || 0) || { rate: it.gstRate || 0, taxable: 0, tax: 0 };
                byRate.set(row.rate, { ...row, taxable: row.taxable + sign * toPaise(it.taxable ?? it.amount), tax: row.tax + sign * toPaise(it.tax) });
            });
        (await filteredInvoices(ctx, f)).forEach(i => add(i.items || [], 1));
        (await ctx.list('salesReturns')).filter(r => inDates(r.date, f)).forEach(r => add(r.items || [], -1));
        const rows = [...byRate.values()].sort((a, b) => b.rate - a.rate);
        return {
            title: '📋 Tax Summary (sales)',
            summary: [
                stat(
                    'Taxable Sales',
                    sum(rows, r => r.taxable)
                ),
                stat(
                    'Output Tax',
                    sum(rows, r => r.tax),
                    'money',
                    'warning'
                )
            ],
            tables: [{ columns: [col('rate', 'Rate %'), col('taxable', 'Taxable', 'money'), col('tax', 'Tax', 'money')], rows }],
            csv: rows.map(r => ({ Rate: r.rate, Taxable: fromPaise(r.taxable), Tax: fromPaise(r.tax) }))
        };
    }

    const CORE_REPORTS = Object.freeze([
        {
            id: 'sales',
            label: 'Sales Report',
            icon: '📊',
            description: 'Invoices, revenue, tax',
            order: 10,
            filters: ['date', 'customer', 'product', 'amount'],
            run: sales
        },
        { id: 'outstanding', label: 'Outstanding', icon: '💰', description: 'Who owes you, and whom you owe', order: 20, filters: [], run: outstanding },
        { id: 'daybook', label: 'Day Book', icon: '📅', description: 'All transactions', order: 30, filters: ['date'], run: daybook },
        {
            id: 'itemwise',
            label: 'Item-wise Sales',
            icon: '📋',
            description: 'Product performance',
            order: 40,
            filters: ['date', 'customer', 'product'],
            run: itemwise
        },
        {
            id: 'partywise',
            label: 'Party-wise Ledger',
            icon: '👥',
            description: 'Totals per customer',
            order: 50,
            filters: ['date', 'customer'],
            run: partywise
        },
        {
            id: 'receipts',
            label: 'Receipts Report',
            icon: '💵',
            description: 'Money received',
            order: 60,
            filters: ['date', 'customer', 'mode', 'amount'],
            run: receipts
        },
        {
            id: 'expenses',
            label: 'Expenses Report',
            icon: '🧾',
            description: 'Money spent, by category',
            order: 70,
            filters: ['date', 'mode', 'amount'],
            run: expensesReport
        },
        { id: 'tax-summary', label: 'Tax Summary', icon: '📋', description: 'Output tax by rate', order: 80, filters: ['date'], run: taxSummary }
    ]);

    // Core reports plus those modules contribute, by order then id
    function resolveReports(contributions) {
        const list = [...CORE_REPORTS];
        contributions.forEach(c => {
            if (list.some(r => r.id === c.value.id)) throw new Error(`Report "${c.value.id}" from module "${c.moduleId}" is already defined`);
            list.push({ ...c.value, moduleId: c.moduleId });
        });
        return list.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
    }
    function find(list, id) {
        const r = list.find(x => x.id === id);
        if (!r) throw new Error(`Unknown report "${String(id).slice(0, 40)}"`);
        return r;
    }

    const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENTITIES[c]);
    const cell = (v, format, fm, fd) => (format === 'money' ? (v ? esc(fm(v)) : '-') : format === 'date' ? esc(fd(v)) : esc(v));

    // One renderer for every report: escaped text, formatted money; the title is the first heading
    function renderReportHtml(report, formatMoney, formatDate = d => d) {
        const summary = report.summary.length
            ? `<div class="dashboard-grid" style="margin:15px 0">${report.summary
                  .map(
                      s =>
                          `<div class="stat-card ${s.tone}"><div class="stat-label">${esc(s.label)}</div><div class="stat-value">${s.format === 'money' ? esc(formatMoney(s.value)) : esc(s.value)}</div></div>`
                  )
                  .join('')}</div>`
            : '';
        const tables = report.tables
            .map(t => {
                const head = t.columns.map(c => `<th>${esc(c.label)}</th>`).join('');
                const body =
                    t.rows.map(r => `<tr>${t.columns.map(c => `<td>${cell(r[c.key], c.format, formatMoney, formatDate)}</td>`).join('')}</tr>`).join('') ||
                    `<tr><td colspan="${t.columns.length}" style="text-align:center">No data</td></tr>`;
                return `${t.title ? `<h4 style="margin-top:20px">${esc(t.title)}</h4>` : ''}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
            })
            .join('');
        return `<h3>${esc(report.title)}</h3>${summary}${tables}${report.note ? `<p style="color:var(--text-gray);margin-top:20px">${esc(report.note)}</p>` : ''}`;
    }

    return { CORE_REPORTS, resolveReports, find, renderReportHtml };
});
