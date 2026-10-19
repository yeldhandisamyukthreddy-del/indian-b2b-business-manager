// Export for Accountant page: the journal for a date range as CSV. Uses the accounting module's books
// (a declared dependency) and the app's helpers from app/index.html.
/* global dbOps, currentCompanyId, t, esc, todayStr, periodRange, downloadFile, toCSV, showToast */
(function () {
    'use strict';
    const V = window.Vyapar;
    const { books } = V.modules.accounting;

    async function renderExport() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const [from, to] = periodRange('thisYear');
        const count = (await dbOps.getByCompany('journalEntries')).length;
        return `<div class="page-header"><h1 class="page-title">Export for Accountant</h1></div>
    <div class="card"><p>Download the journal (${count} entries) as a CSV with one row per voucher line: date, voucher, account code and name, debit, credit and narration.</p>
        <div class="form-row">
            <div class="form-group"><label class="form-label">From</label><input class="form-control" type="date" id="expFrom" value="${esc(from)}"></div>
            <div class="form-group"><label class="form-label">To</label><input class="form-control" type="date" id="expTo" value="${esc(to)}"></div>
            <div class="form-group" style="display:flex;align-items:flex-end"><button class="btn btn-primary" onclick="exportBooks()">📥 Download CSV</button></div>
        </div>
        <p style="color:var(--text-gray)">Preview feature. A Tally XML export is planned.</p></div>`;
    }
    async function exportBooks() {
        const from = document.getElementById('expFrom').value;
        const to = document.getElementById('expTo').value;
        const accounts = await dbOps.getByCompany('accounts');
        const name = code => (accounts.find(a => a.code === code) || { name: '' }).name;
        const entries = (await dbOps.getByCompany('journalEntries'))
            .filter(e => (!from || e.date >= from) && (!to || e.date <= to))
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const rows = entries.flatMap(e =>
            e.lines.map(l => [e.date, e.ref, l.account, name(l.account), V.money.fromPaise(l.debit), V.money.fromPaise(l.credit), e.narration])
        );
        if (!rows.length) {
            showToast('No journal entries in these dates', 'error');
            return;
        }
        downloadFile(
            `journal-${from || 'start'}-to-${to || todayStr()}.csv`,
            toCSV(['Date', 'Voucher', 'Account Code', 'Account', 'Debit', 'Credit', 'Narration'], rows),
            'text/csv'
        );
        showToast(`Exported ${entries.length} entries (${books.isBalanced(entries.flatMap(e => e.lines)) ? 'balanced' : 'NOT balanced'})`);
    }

    V.app.definePages('export_accounting', { 'export-books': renderExport });
    Object.assign(window, { exportBooks });
})();
