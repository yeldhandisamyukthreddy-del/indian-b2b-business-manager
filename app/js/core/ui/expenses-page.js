// Payments → Expenses: money spent that is not a purchase bill (rent, salaries, electricity...).
// Each expense publishes expense.created / expense.voided, which the accounting module books when it is on.
// Uses the app's helpers from app/index.html.
/* global dbOps, currentCompanyId, t, esc, formatCurrency, formatDate, todayStr, round2, showModal, closeModal, showToast, renderPage, listSearchBox, listRows, listFooter, getNextNumber, adjustBankBalance, emit */
(function () {
    'use strict';
    const rules = window.Vyapar.core.expenses;
    const MODES = ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Card'];

    async function renderExpenses() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const rows = await dbOps.getByCompany('expenses');
        const month = todayStr().slice(0, 7);
        const thisMonth = rows.filter(e => (e.date || '').startsWith(month)).reduce((s, e) => s + (e.amount || 0), 0);
        const byCategory = rules.totalsByCategory(rows.filter(e => (e.date || '').startsWith(month)));
        return `
    <div class="page-header"><h1 class="page-title">${t('expenses')}</h1><button class="btn btn-primary" onclick="showExpenseForm()">${t('addNew')}</button></div>
    <div class="dashboard-grid">
        <div class="stat-card danger"><div class="stat-label">This Month</div><div class="stat-value">${formatCurrency(thisMonth)}</div></div>
        <div class="stat-card"><div class="stat-label">Biggest Category This Month</div><div class="stat-value">${esc(byCategory.slice().sort((a, b) => b.amount - a.amount)[0]?.category || '-')}</div></div>
    </div>
    <div class="card">${listSearchBox('Search expenses...')}<table id="expenseTable"><thead><tr><th>#</th><th>Date</th><th>Category</th><th>Paid To</th><th>Mode</th><th>Amount</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        listRows(rows.slice().reverse())
            .map(
                e => `<tr><td>${esc(e.number || e.id)}</td><td>${formatDate(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.payee) || '-'}</td><td>${esc(e.mode) || '-'}</td><td>${formatCurrency(e.amount)}</td>
        <td><button class="action-btn delete" onclick="deleteExpense(${e.id})" title="Delete">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="7" style="text-align:center">${t('noData')}</td></tr>`
    }${listFooter(7)}</tbody></table></div>`;
    }

    async function showExpenseForm() {
        if (!currentCompanyId) {
            showToast(t('selectCompanyFirst'), 'error');
            return;
        }
        const banks = await dbOps.getByCompany('bankAccounts');
        const html = `<form id="expenseForm">
    <div class="form-row">
        <div class="form-group"><label class="form-label">Date *</label><input class="form-control" type="date" name="date" value="${todayStr()}" required></div>
        <div class="form-group"><label class="form-label">Category *</label><select class="form-control" name="category">${rules.CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label class="form-label">Paid To</label><input class="form-control" name="payee" maxlength="100"></div>
        <div class="form-group"><label class="form-label">Amount (incl. tax) *</label><input class="form-control" type="number" step="0.01" min="0" name="amount" required></div>
        <div class="form-group"><label class="form-label">Tax included (if any)</label><input class="form-control" type="number" step="0.01" min="0" name="taxAmount" value="0"></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label class="form-label">Mode</label><select class="form-control" name="mode">${MODES.map(m => `<option>${m}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Bank Account</label><select class="form-control" name="bankId"><option value="">Cash (no bank account)</option>${banks.map(b => `<option value="${b.id}">${esc(b.bankName)} - ${esc(b.accountNo)}</option>`).join('')}</select></div>
    </div>
    <div class="form-group"><label class="form-label">Reference / Notes</label><input class="form-control" name="notes" maxlength="200"></div>
</form>`;
        showModal(
            'New Expense',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveExpense()">Save Expense</button>`
        );
    }

    let saving = false;
    async function saveExpense() {
        if (saving) return;
        const data = Object.fromEntries(new FormData(document.getElementById('expenseForm')));
        data.amount = round2(parseFloat(data.amount));
        data.taxAmount = round2(parseFloat(data.taxAmount) || 0);
        const errors = rules.validateExpense(data);
        if (errors.length) {
            showToast(errors[0], 'error');
            return;
        }
        saving = true;
        try {
            const e = {
                ...data,
                payee: (data.payee || '').trim(),
                notes: (data.notes || '').trim(),
                bankId: parseInt(data.bankId) || null,
                companyId: parseInt(currentCompanyId),
                number: await getNextNumber('expense'),
                rev: 0
            };
            e.id = await dbOps.add('expenses', e);
            await adjustBankBalance(e.bankId, -e.amount);
            await emit('expense.created', e, { doc: e });
            closeModal();
            showToast(`Expense ${e.number} saved!`);
            renderPage('expenses');
        } finally {
            saving = false;
        }
    }

    async function deleteExpense(id) {
        const e = await dbOps.get('expenses', id);
        if (!e || !confirm(`Delete expense ${e.number || ''}? The bank balance will be adjusted.`)) return;
        await adjustBankBalance(e.bankId, e.amount || 0);
        await dbOps.delete('expenses', id);
        await emit('expense.voided', e, { doc: e });
        showToast('Deleted');
        renderPage('expenses');
    }

    Object.assign(window, { renderExpenses, showExpenseForm, saveExpense, deleteExpense });
})();
