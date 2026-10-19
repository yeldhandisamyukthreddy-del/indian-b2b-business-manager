// Sales → Recurring Invoices: a profile creates an invoice on every due date (rent, AMC, subscriptions).
// Due invoices are created when the app starts and with the "Create due invoices" button, through core's one
// invoice path (hooks, numbering, balance, events). Each carries recurringKey 'recurring:<profile>:<date>',
// so running the generator twice, or on two devices restored from one backup, never doubles an invoice.
// Uses the app's helpers from app/index.html.
/* global dbOps, currentCompanyId, t, esc, formatCurrency, formatDate, todayStr, showModal, closeModal, showToast, renderPage, getCurrentCompany, partyOpts, lineEditor, lineEditorHtml, startLineEditor, applyLineTotals, partyFields, recordInvoice */
(function () {
    'use strict';
    const rules = window.Vyapar.core.recurring;
    const FREQ_LABELS = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

    async function renderRecurring() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const rows = await dbOps.getByCompany('recurringInvoices');
        const today = todayStr();
        const due = rows.reduce((n, p) => n + rules.dueDates(p, today).length, 0);
        return `
    <div class="page-header"><h1 class="page-title">${t('recurringInvoices')}</h1><div><button class="btn" onclick="runRecurring()" ${due ? '' : 'disabled'}>Create due invoices (${due})</button> <button class="btn btn-primary" onclick="showRecurringForm()">${t('addNew')}</button></div></div>
    <p style="color:var(--text-gray);margin-bottom:15px">Invoices are created on each due date when you open the app. Taxes and prices are worked out on the day they are created.</p>
    <div class="card"><table id="recurringTable"><thead><tr><th>Customer</th><th>Frequency</th><th>Next Date</th><th>Ends</th><th>Amount (approx.)</th><th>Status</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        rows
            .map(
                p => `<tr><td>${esc(p.customerName)}</td><td>${FREQ_LABELS[p.frequency] || esc(p.frequency)}</td><td>${formatDate(p.nextDate)}</td><td>${p.endDate ? formatDate(p.endDate) : '-'}</td><td>${formatCurrency(p.grandTotal)}</td>
        <td><span class="badge ${p.active === false ? 'badge-warning' : 'badge-success'}">${p.active === false ? 'Paused' : 'Active'}</span></td>
        <td><button class="action-btn edit" onclick="toggleRecurring(${p.id})" title="${p.active === false ? 'Resume' : 'Pause'}">${p.active === false ? '▶️' : '⏸️'}</button><button class="action-btn delete" onclick="deleteRecurring(${p.id})" title="Delete">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="7" style="text-align:center">${t('noData')}</td></tr>`
    }</tbody></table></div>`;
    }

    async function showRecurringForm() {
        if (!currentCompanyId) {
            showToast(t('selectCompanyFirst'), 'error');
            return;
        }
        const customers = await dbOps.getByCompany('customers');
        const products = await dbOps.getByCompany('products');
        const company = await getCurrentCompany();
        const html = `<form id="recurringForm">
    <div class="form-row">
        <div class="form-group"><label class="form-label">Customer *</label><select class="form-control" name="customerId" id="recCustomer" onchange="setLineParty(this)" required><option value="">Select</option>${partyOpts(customers)}</select></div>
        <div class="form-group"><label class="form-label">Frequency</label><select class="form-control" name="frequency">${Object.entries(FREQ_LABELS)
            .map(([v, l]) => `<option value="${v}" ${v === 'monthly' ? 'selected' : ''}>${l}</option>`)
            .join('')}</select></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label class="form-label">First invoice date *</label><input class="form-control" type="date" name="nextDate" value="${todayStr()}" required></div>
        <div class="form-group"><label class="form-label">End date (optional)</label><input class="form-control" type="date" name="endDate"></div>
    </div>
    ${lineEditorHtml(products, 'salePrice')}
    <div class="form-group"><label class="form-label">Notes on each invoice</label><input class="form-control" name="notes" maxlength="200"></div>
</form>`;
        showModal(
            'New Recurring Invoice',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveRecurring()">Save</button>`
        );
        await startLineEditor([], company?.stateCode, '');
    }

    async function saveRecurring() {
        const data = Object.fromEntries(new FormData(document.getElementById('recurringForm')));
        const customer = await dbOps.get('customers', parseInt(data.customerId));
        const profile = applyLineTotals({
            customerId: customer?.id,
            customerName: customer?.name,
            frequency: data.frequency,
            nextDate: data.nextDate,
            anchorDate: data.nextDate,
            endDate: data.endDate || '',
            notes: (data.notes || '').trim(),
            active: true,
            companyId: parseInt(currentCompanyId)
        });
        profile.items = lineEditor.items.map(i => ({ ...i }));
        const errors = rules.validateProfile(profile);
        if (errors.length) {
            showToast(errors[0], 'error');
            return;
        }
        await dbOps.add('recurringInvoices', profile);
        closeModal();
        showToast('Recurring invoice saved');
        await runRecurring({ quiet: true });
        renderPage('recurring-invoices');
    }

    async function toggleRecurring(id) {
        const p = await dbOps.get('recurringInvoices', id);
        if (!p) return;
        p.active = p.active === false;
        await dbOps.update('recurringInvoices', p);
        renderPage('recurring-invoices');
    }
    async function deleteRecurring(id) {
        if (!confirm('Delete this recurring invoice? Invoices already created stay.')) return;
        await dbOps.delete('recurringInvoices', id);
        renderPage('recurring-invoices');
    }

    // Creates every due invoice of the company's active profiles. Returns how many were created.
    let running = false;
    async function runRecurring({ quiet = false } = {}) {
        if (!currentCompanyId || running) return 0;
        running = true;
        let created = 0;
        try {
            const company = await getCurrentCompany();
            const today = todayStr();
            for (const p of await dbOps.getByCompany('recurringInvoices')) {
                const dates = rules.dueDates(p, today);
                if (!dates.length) continue;
                const customer = await dbOps.get('customers', p.customerId);
                if (!customer) continue;
                const done = new Set((await dbOps.getByCompany('invoices')).map(i => i.recurringKey).filter(Boolean));
                for (const date of dates) {
                    if (!done.has(rules.recurringKey(p.id, date))) {
                        await startLineEditor(p.items, company?.stateCode, customer.stateCode, customer);
                        const inv = applyLineTotals({ ...rules.invoiceFor(p, date), ...partyFields(customer) });
                        try {
                            if (await recordInvoice(inv, null, { confirmWarnings: false })) created++;
                        } catch (e) {
                            showToast(`Recurring invoice for ${customer.name} on ${formatDate(date)} was not created: ${e.message}`, 'error');
                            break;
                        }
                    }
                    p.nextDate = rules.nextDate(date, p.frequency, Number((p.anchorDate || p.nextDate).slice(8, 10)));
                    await dbOps.update('recurringInvoices', p);
                }
            }
        } finally {
            running = false;
        }
        if (created || !quiet) showToast(created ? `Created ${created} recurring invoice(s)` : 'No invoices are due');
        return created;
    }

    Object.assign(window, { renderRecurring, showRecurringForm, saveRecurring, toggleRecurring, deleteRecurring, runRecurring });
})();
