// Accounting pages: chart of accounts with balances and ledgers, and the journal (posted entries, manual
// journals and journal templates). Amounts in the books are paise. Uses the app's helpers from app/index.html.
/* global dbOps, currentCompanyId, t, esc, formatCurrency, formatDate, todayStr, showModal, closeModal, showToast, renderPage, listRows, listFooter, listSearchBox */
(function () {
    'use strict';
    const V = window.Vyapar;
    const { books } = V.modules.accounting;
    const { toPaise, fromPaise } = V.money;
    const rupees = p => formatCurrency(fromPaise(p));
    const TYPE_LABELS = { asset: 'Asset', liability: 'Liability', equity: 'Equity', income: 'Income', expense: 'Expense' };
    const accounts = async () => (await dbOps.getByCompany('accounts')).sort((a, b) => a.code.localeCompare(b.code));
    const accountName = (list, code) => (list.find(a => a.code === code) || { name: code }).name;

    async function renderAccounts() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const list = await accounts();
        const t2 = books.totals(await dbOps.getByCompany('journalEntries'));
        return `
    <div class="page-header"><h1 class="page-title">Chart of Accounts</h1><button class="btn btn-primary" onclick="showAccountForm()">${t('addNew')}</button></div>
    <div class="card"><table id="accountsTable"><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        list
            .map(a => {
                const x = t2[a.code] || { debit: 0, credit: 0 };
                return `<tr><td>${esc(a.code)}</td><td>${esc(a.name)}</td><td>${TYPE_LABELS[a.type] || esc(a.type)}</td><td>${rupees(x.debit)}</td><td>${rupees(x.credit)}</td><td>${rupees(books.balanceOf(a, x))}</td>
        <td><button class="action-btn view" onclick="showAccountLedger('${esc(a.code)}')" title="Ledger">📋</button></td></tr>`;
            })
            .join('') || `<tr><td colspan="7" style="text-align:center">${t('noData')}</td></tr>`
    }</tbody></table></div>`;
    }
    function showAccountForm() {
        const html = `<form id="accountForm"><div class="form-row">
        <div class="form-group"><label class="form-label">Code *</label><input class="form-control" name="code" maxlength="8" placeholder="e.g. 1500" required></div>
        <div class="form-group"><label class="form-label">${t('name')} *</label><input class="form-control" name="name" maxlength="60" required></div>
        <div class="form-group"><label class="form-label">Type</label><select class="form-control" name="type">${books.TYPES.map(x => `<option value="${x}">${TYPE_LABELS[x]}</option>`).join('')}</select></div>
    </div></form>`;
        showModal(
            'New Account',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveAccount()">${t('save')}</button>`
        );
    }
    async function saveAccount() {
        const d = Object.fromEntries(new FormData(document.getElementById('accountForm')));
        const code = d.code.trim();
        if (!/^\d{3,8}$/.test(code) || !d.name.trim()) {
            showToast('Enter a numeric code (3-8 digits) and a name', 'error');
            return;
        }
        if ((await accounts()).some(a => a.code === code)) {
            showToast(`Account ${code} already exists`, 'error');
            return;
        }
        await dbOps.add('accounts', { code, name: d.name.trim(), type: d.type, companyId: parseInt(currentCompanyId) });
        closeModal();
        showToast(t('success'));
        renderPage('accounts');
    }
    async function showAccountLedger(code) {
        const list = await accounts();
        const account = list.find(a => a.code === code);
        if (!account) return;
        const rows = books.ledger(await dbOps.getByCompany('journalEntries'), account);
        const html = `<table><thead><tr><th>Date</th><th>Ref</th><th>Narration</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${formatDate(r.date)}</td><td>${esc(r.ref)}</td><td>${esc(r.narration)}</td><td>${r.debit ? rupees(r.debit) : '-'}</td><td>${r.credit ? rupees(r.credit) : '-'}</td><td>${rupees(r.balance)}</td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center">No entries</td></tr>'}</tbody></table>`;
        showModal(`Ledger — ${esc(account.code)} ${esc(account.name)}`, html, `<button class="btn" onclick="closeModal()">Close</button>`);
    }

    async function renderJournal() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const list = await accounts();
        const entries = (await dbOps.getByCompany('journalEntries')).sort(
            (a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id))
        );
        const templates = await dbOps.getByCompany('journalTemplates');
        const amount = e => e.lines.reduce((s, l) => s + l.debit, 0);
        return `
    <div class="page-header"><h1 class="page-title">Journal</h1><button class="btn btn-primary" onclick="showJournalForm()">New Journal</button></div>
    <p style="color:var(--text-gray);margin-bottom:15px">Entries are posted automatically from invoices, receipts, notes, expenses and bills. Use a manual journal for anything else (depreciation, capital, corrections).</p>
    ${templates.length ? `<div class="card"><h3 style="margin-bottom:10px">Templates</h3>${templates.map(tp => `<button class="btn" style="margin:0 6px 6px 0" onclick="showJournalForm(${tp.id})">${esc(tp.name)}</button>`).join('')}</div>` : ''}
    <div class="card">${listSearchBox('Search the journal...')}<table id="journalTable"><thead><tr><th>Date</th><th>Ref</th><th>Narration</th><th>Accounts</th><th>Amount</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        listRows(entries)
            .map(
                e => `<tr><td>${formatDate(e.date)}</td><td>${esc(e.ref)}</td><td>${esc(e.narration)}</td><td>${e.lines.map(l => `${esc(accountName(list, l.account))} ${l.debit ? 'Dr' : 'Cr'} ${rupees(l.debit || l.credit)}`).join('<br>')}</td><td>${rupees(amount(e))}</td>
        <td>${e.source === 'manual' ? `<button class="action-btn delete" onclick="deleteJournal('${esc(e.id)}')" title="Delete">🗑️</button>` : ''}</td></tr>`
            )
            .join('') || `<tr><td colspan="6" style="text-align:center">${t('noData')}</td></tr>`
    }${listFooter(6)}</tbody></table></div>`;
    }

    const lineRow = (
        list,
        l = {}
    ) => `<tr class="jl"><td><select class="form-control jl-account"><option value="">Select</option>${list.map(a => `<option value="${esc(a.code)}" ${a.code === l.account ? 'selected' : ''}>${esc(a.code)} ${esc(a.name)}</option>`).join('')}</select></td>
        <td><input class="form-control jl-debit" type="number" step="0.01" min="0" value="${l.debit ? fromPaise(l.debit) : ''}" oninput="journalTotals()"></td><td><input class="form-control jl-credit" type="number" step="0.01" min="0" value="${l.credit ? fromPaise(l.credit) : ''}" oninput="journalTotals()"></td></tr>`;
    let journalAccounts = [];
    async function showJournalForm(templateId) {
        if (!currentCompanyId) {
            showToast(t('selectCompanyFirst'), 'error');
            return;
        }
        journalAccounts = await accounts();
        const tpl = templateId ? await dbOps.get('journalTemplates', templateId) : null;
        const lines = tpl ? tpl.lines : [{}, {}];
        const html = `<form id="journalForm">
    <div class="form-row">
        <div class="form-group"><label class="form-label">Date *</label><input class="form-control" type="date" name="date" value="${todayStr()}"></div>
        <div class="form-group"><label class="form-label">Narration</label><input class="form-control" name="narration" maxlength="120" value="${esc(tpl?.narration)}"></div>
    </div>
    <table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody id="journalLines">${lines.map(l => lineRow(journalAccounts, l)).join('')}</tbody></table>
    <button type="button" class="btn" onclick="addJournalLine()">+ Line</button>
    <p id="journalTotals" style="text-align:right"></p>
    <div class="form-group"><label><input type="checkbox" name="asTemplate"> Also save as a template named</label> <input class="form-control" name="templateName" maxlength="40" placeholder="e.g. Monthly depreciation"></div>
</form>`;
        showModal(
            tpl ? `Journal from "${esc(tpl.name)}"` : 'New Journal',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveJournal()">Post Journal</button>`
        );
        journalTotals();
    }
    function addJournalLine() {
        document.getElementById('journalLines').insertAdjacentHTML('beforeend', lineRow(journalAccounts));
    }
    function journalLines() {
        return [...document.querySelectorAll('#journalLines .jl')]
            .map(tr => ({
                account: tr.querySelector('.jl-account').value,
                debit: toPaise(parseFloat(tr.querySelector('.jl-debit').value) || 0),
                credit: toPaise(parseFloat(tr.querySelector('.jl-credit').value) || 0)
            }))
            .filter(l => l.account || l.debit || l.credit);
    }
    function journalTotals() {
        const lines = journalLines();
        const d = lines.reduce((s, l) => s + l.debit, 0);
        const c = lines.reduce((s, l) => s + l.credit, 0);
        const el = document.getElementById('journalTotals');
        if (el)
            el.innerHTML = `Debit ${rupees(d)} · Credit ${rupees(c)} ${d === c ? '✔' : `<strong style="color:var(--danger)">difference ${rupees(Math.abs(d - c))}</strong>`}`;
    }
    async function saveJournal() {
        const form = document.getElementById('journalForm');
        const d = Object.fromEntries(new FormData(form));
        const entry = {
            id: `manual:${Date.now()}`,
            date: d.date,
            ref: 'JV',
            narration: (d.narration || '').trim() || 'Journal',
            source: 'manual',
            lines: journalLines()
        };
        const errors = books.validateJournal(entry, journalAccounts);
        if (errors.length) {
            showToast(errors[0], 'error');
            return;
        }
        await dbOps.add('journalEntries', { ...entry, companyId: parseInt(currentCompanyId) });
        if (d.asTemplate && (d.templateName || '').trim())
            await dbOps.add('journalTemplates', {
                name: d.templateName.trim(),
                narration: entry.narration,
                lines: entry.lines,
                companyId: parseInt(currentCompanyId)
            });
        closeModal();
        showToast('Journal posted');
        renderPage('journal');
    }
    async function deleteJournal(id) {
        if (!confirm('Delete this manual journal?')) return;
        await dbOps.delete('journalEntries', id);
        renderPage('journal');
    }

    V.app.definePages('accounting', { accounts: renderAccounts, journal: renderJournal });
    Object.assign(window, { showAccountForm, saveAccount, showAccountLedger, showJournalForm, addJournalLine, journalTotals, saveJournal, deleteJournal });
})();
