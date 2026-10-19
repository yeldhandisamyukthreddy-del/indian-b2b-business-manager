// Double-entry books of the accounting module. Every journal entry is derived from a domain event (or typed by
// hand), in whole paise, and always balances. Entry ids come from the event id ('je:<event id>'), so a
// redelivered event posts nothing new. Pure: the module's handlers and pages pass the data in.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node
        ? { money: require('../../core/shared/money.js'), expenses: require('../../core/expenses/expenses.js') }
        : { money: root.Vyapar.money, expenses: root.Vyapar.core.expenses };
    const api = factory(deps.money, deps.expenses);
    if (node) module.exports = api;
    else {
        const mods = ((root.Vyapar = root.Vyapar || {}).modules = root.Vyapar.modules || {});
        (mods.accounting = mods.accounting || {}).books = api;
    }
})(typeof self !== 'undefined' ? self : this, function (money, expenseRules) {
    'use strict';
    const { toPaise } = money;
    const TYPES = Object.freeze(['asset', 'liability', 'equity', 'income', 'expense']);
    // Debit-normal accounts grow with debits; the others with credits
    const DEBIT_NORMAL = new Set(['asset', 'expense']);

    const A = Object.freeze({
        cash: '1000',
        bank: '1010',
        debtors: '1100',
        inputTax: '1300',
        creditors: '2000',
        outputTax: '2100',
        capital: '3000',
        sales: '4000',
        salesReturns: '4100',
        purchases: '5000',
        purchaseReturns: '5100',
        roundOff: '6990'
    });
    const expenseCode = category => {
        const i = expenseRules.CATEGORIES.indexOf(category);
        return i >= 0 ? String(6000 + (i + 1) * 10) : String(6000 + expenseRules.CATEGORIES.length * 10);
    };
    // The chart every company starts with; more accounts can be added
    const DEFAULT_CHART = Object.freeze([
        { code: A.cash, name: 'Cash in Hand', type: 'asset' },
        { code: A.bank, name: 'Bank Accounts', type: 'asset' },
        { code: A.debtors, name: 'Sundry Debtors (Customers)', type: 'asset' },
        { code: A.inputTax, name: 'Input Tax Credit', type: 'asset' },
        { code: A.creditors, name: 'Sundry Creditors (Vendors)', type: 'liability' },
        { code: A.outputTax, name: 'Output Tax Payable', type: 'liability' },
        { code: A.capital, name: "Owner's Capital", type: 'equity' },
        { code: A.sales, name: 'Sales', type: 'income' },
        { code: A.salesReturns, name: 'Sales Returns', type: 'income' },
        { code: A.purchases, name: 'Purchases', type: 'expense' },
        { code: A.purchaseReturns, name: 'Purchase Returns', type: 'expense' },
        ...expenseRules.CATEGORIES.map(c => ({ code: expenseCode(c), name: c, type: 'expense' })),
        { code: A.roundOff, name: 'Round Off', type: 'expense' }
    ]);

    const line = (account, debit, credit = 0) => ({ account, debit, credit });
    const dr = (account, paise) => (paise > 0 ? line(account, paise) : paise < 0 ? line(account, 0, -paise) : null);
    const cr = (account, paise) => (paise > 0 ? line(account, 0, paise) : paise < 0 ? line(account, -paise) : null);
    const moneyAccount = doc => (doc.bankId ? A.bank : A.cash);
    // Taxable + tax + round off always equals the total (round off takes any difference)
    function amounts(doc) {
        const total = toPaise(doc.grandTotal ?? doc.amount ?? 0);
        const taxable = toPaise(doc.taxable ?? doc.subtotal ?? total);
        const tax = toPaise(doc.tax || 0);
        return { total, taxable, tax, round: total - taxable - tax };
    }
    const reverse = lines => lines.map(l => line(l.account, l.credit, l.debit));

    // Lines for each document event; '.voided' events reverse the lines of the document they carry
    const RULES = {
        'invoice.finalized': d => {
            const a = amounts(d);
            return [dr(A.debtors, a.total), cr(A.sales, a.taxable), cr(A.outputTax, a.tax), cr(A.roundOff, a.round)];
        },
        'payment.recorded': d => [dr(moneyAccount(d), toPaise(d.amount)), cr(A.debtors, toPaise(d.amount))],
        'credit.applied': d => {
            const a = amounts(d);
            return [dr(A.salesReturns, a.taxable), dr(A.outputTax, a.tax), dr(A.roundOff, a.round), cr(A.debtors, a.total)];
        },
        'expense.created': d => {
            const total = toPaise(d.amount);
            const tax = toPaise(d.taxAmount || 0);
            return [dr(expenseCode(d.category), total - tax), dr(A.inputTax, tax), cr(moneyAccount(d), total)];
        },
        'bill.recorded': d => {
            const a = amounts(d);
            return [dr(A.purchases, a.taxable), dr(A.inputTax, a.tax), dr(A.roundOff, a.round), cr(A.creditors, a.total)];
        },
        'debit.applied': d => {
            const a = amounts(d);
            return [dr(A.creditors, a.total), cr(A.purchaseReturns, a.taxable), cr(A.inputTax, a.tax), cr(A.roundOff, a.round)];
        },
        'vendor_payment.recorded': d => [dr(A.creditors, toPaise(d.amount)), cr(moneyAccount(d), toPaise(d.amount))]
    };
    const VOIDS = {
        'invoice.voided': 'invoice.finalized',
        'payment.voided': 'payment.recorded',
        'credit.voided': 'credit.applied',
        'expense.voided': 'expense.created',
        'bill.voided': 'bill.recorded',
        'debit.voided': 'debit.applied',
        'vendor_payment.voided': 'vendor_payment.recorded'
    };
    const EVENT_TYPES = Object.freeze([...Object.keys(RULES), ...Object.keys(VOIDS)]);
    const LABELS = {
        'invoice.finalized': 'Sales invoice',
        'payment.recorded': 'Receipt',
        'credit.applied': 'Credit note',
        'expense.created': 'Expense',
        'bill.recorded': 'Purchase bill',
        'debit.applied': 'Debit note',
        'vendor_payment.recorded': 'Payment to vendor'
    };

    const isBalanced = lines => lines.length > 0 && lines.reduce((s, l) => s + l.debit - l.credit, 0) === 0 && lines.every(l => l.debit >= 0 && l.credit >= 0);

    // The journal entry an event posts (or null). id: the entry's id, e.g. 'je:invoice.finalized:12:0'
    function entryFor(type, doc, id) {
        const base = VOIDS[type] || type;
        const rule = RULES[base];
        if (!rule || !doc) return null;
        let lines = rule(doc).filter(Boolean);
        if (VOIDS[type]) lines = reverse(lines);
        if (!lines.length) return null;
        if (!isBalanced(lines)) throw new Error(`Entry for ${type} ${doc.number || doc.id} does not balance`);
        const party = doc.customerName || doc.vendorName || doc.payee || '';
        return {
            id,
            date: doc.date || '',
            ref: doc.number || String(doc.id),
            narration: `${VOIDS[type] ? 'Cancelled: ' : ''}${LABELS[base]}${party ? ` — ${party}` : ''}`,
            source: type,
            lines
        };
    }
    const entryForEvent = event => entryFor(event.type, event.payload && event.payload.doc, `je:${event.id}`);

    // Manual journal: at least two lines, every line one side only, debits equal credits
    function validateJournal(entry, accounts) {
        const errors = [];
        const codes = new Set(accounts.map(a => a.code));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date || '')) errors.push('Date must be a date');
        if (!Array.isArray(entry.lines) || entry.lines.length < 2) errors.push('A journal needs at least two lines');
        else {
            entry.lines.forEach((l, i) => {
                if (!codes.has(l.account)) errors.push(`Line ${i + 1}: choose an account`);
                if (!Number.isInteger(l.debit) || !Number.isInteger(l.credit) || l.debit < 0 || l.credit < 0)
                    errors.push(`Line ${i + 1}: amounts must be positive`);
                if (l.debit > 0 === l.credit > 0) errors.push(`Line ${i + 1}: enter either a debit or a credit`);
            });
            if (!errors.length && !isBalanced(entry.lines)) errors.push('Debits and credits must be equal');
        }
        return errors;
    }

    const inDates = (d, from, to) => (!from || d >= from) && (!to || d <= to);
    // { code: { debit, credit } } over the entries in the date range
    function totals(entries, from, to) {
        const out = {};
        entries
            .filter(e => inDates(e.date || '', from, to))
            .forEach(e =>
                e.lines.forEach(l => {
                    const t = out[l.account] || (out[l.account] = { debit: 0, credit: 0 });
                    t.debit += l.debit;
                    t.credit += l.credit;
                })
            );
        return out;
    }
    // Balance on the account's normal side (positive = normal)
    const balanceOf = (account, t) => (t ? (DEBIT_NORMAL.has(account.type) ? t.debit - t.credit : t.credit - t.debit) : 0);

    // Each account's net debit or credit; total debits always equal total credits
    function trialBalance(entries, accounts, to) {
        const t = totals(entries, '', to);
        const rows = accounts
            .map(a => {
                const net = t[a.code] ? t[a.code].debit - t[a.code].credit : 0;
                return { code: a.code, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
            })
            .filter(r => r.debit || r.credit);
        const unknown = Object.keys(t).filter(code => !accounts.some(a => a.code === code));
        unknown.forEach(code => {
            const net = t[code].debit - t[code].credit;
            rows.push({ code, name: `Unknown account ${code}`, type: 'asset', debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
        });
        rows.sort((a, b) => a.code.localeCompare(b.code));
        return { rows, debit: rows.reduce((s, r) => s + r.debit, 0), credit: rows.reduce((s, r) => s + r.credit, 0) };
    }

    // Income less expenses for the period, from the books
    function profitAndLoss(entries, accounts, from, to) {
        const t = totals(entries, from, to);
        const pick = type =>
            accounts
                .filter(a => a.type === type)
                .map(a => ({ code: a.code, name: a.name, amount: balanceOf(a, t[a.code]) }))
                .filter(r => r.amount);
        const income = pick('income');
        const expenses = pick('expense');
        const totalIncome = income.reduce((s, r) => s + r.amount, 0);
        const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
        return { income, expenses, totalIncome, totalExpenses, net: totalIncome - totalExpenses };
    }

    // Running balance of one account
    function ledger(entries, account) {
        let bal = 0;
        return entries
            .filter(e => e.lines.some(l => l.account === account.code))
            .sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.id).localeCompare(String(b.id)))
            .map(e => {
                const debit = e.lines.filter(l => l.account === account.code).reduce((s, l) => s + l.debit, 0);
                const credit = e.lines.filter(l => l.account === account.code).reduce((s, l) => s + l.credit, 0);
                bal += DEBIT_NORMAL.has(account.type) ? debit - credit : credit - debit;
                return { date: e.date, ref: e.ref, narration: e.narration, debit, credit, balance: bal };
            });
    }

    return {
        TYPES,
        ACCOUNTS: A,
        DEFAULT_CHART,
        EVENT_TYPES,
        expenseCode,
        entryFor,
        entryForEvent,
        isBalanced,
        validateJournal,
        trialBalance,
        profitAndLoss,
        ledger,
        balanceOf,
        totals
    };
});
