// India GST pages: GST reports (GSTR-1, GSTR-3B, HSN, rate-wise) and the TDS/TCS register.
// Uses the app's helpers from app/index.html and this module's GST rules (gst.js, returns.js).
/* global dbOps, currentCompanyId, t, esc, formatCurrency, formatDate, todayStr, round2, showModal, closeModal, showToast, renderPage, periodRange, stateName, downloadFile, toCSV, printDocument, getCurrentCompany, contrib */
(function () {
    'use strict';
    const V = window.Vyapar;
    const { returns } = V.modules.region_india_gst;

    async function renderGSTReports() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const [from, to] = periodRange('thisMonth');
        return `
    <div class="page-header"><h1 class="page-title">${t('gstReports')}</h1></div>
    <div class="card" style="margin-bottom:20px">
        <h3 style="margin-bottom:15px">📅 Select Period</h3>
        <div class="form-row">
            <div class="form-group"><label class="form-label">Quick Period</label>
                <select class="form-control" id="gstPeriod" onchange="applyGSTPeriod()">
                    <option value="thisMonth" selected>This Month</option><option value="lastMonth">Last Month</option>
                    <option value="thisQuarter">This Quarter</option><option value="lastQuarter">Last Quarter</option>
                    <option value="thisYear">This Financial Year</option><option value="lastYear">Last Financial Year</option>
                    <option value="custom">Custom Range</option>
                </select></div>
            <div class="form-group"><label class="form-label">From Date</label><input class="form-control" type="date" id="gstFromDate" value="${from}"></div>
            <div class="form-group"><label class="form-label">To Date</label><input class="form-control" type="date" id="gstToDate" value="${to}"></div>
            <div class="form-group" style="display:flex;align-items:flex-end"><button class="btn btn-primary" onclick="generateGSTReport()">📊 Generate GST Report</button></div>
        </div>
        <p style="color:var(--text-gray);margin-top:10px">These summaries help you prepare GSTR-1 and GSTR-3B. Check them with your accountant before filing on the GST portal.</p>
    </div>
    <div id="gstReportResults"></div>`;
    }
    function applyGSTPeriod() {
        const q = document.getElementById('gstPeriod').value;
        if (q === 'custom') return;
        const [from, to] = periodRange(q);
        document.getElementById('gstFromDate').value = from;
        document.getElementById('gstToDate').value = to;
    }
    // Collects everything the GST screens need for a date range. Bills and debit notes come from the modules that
    // offer them ('tax.inputDocuments', e.g. purchasing); without one there is no input tax credit.
    async function gstData(fromDate, toDate) {
        const ctx = { list: s => dbOps.getByCompany(s) };
        const inputs = await Promise.all(contrib('tax.inputDocuments').map(c => c.value(ctx)));
        return returns.buildGstData(
            {
                company: await getCurrentCompany(),
                customers: await dbOps.getByCompany('customers'),
                vendors: await dbOps.getByCompany('vendors'),
                invoices: await dbOps.getByCompany('invoices'),
                creditNotes: await dbOps.getByCompany('salesReturns'),
                bills: inputs.flatMap(x => x.bills || []),
                debitNotes: inputs.flatMap(x => x.debitNotes || [])
            },
            fromDate,
            toDate
        );
    }
    async function generateGSTReport() {
        const fromDate = document.getElementById('gstFromDate').value;
        const toDate = document.getElementById('gstToDate').value;
        const g = await gstData(fromDate, toDate);
        const net = k => round2(g.out[k] - g.itc[k]);
        const netTotal = round2(net('cgst') + net('sgst') + net('igst'));
        const money = v => formatCurrency(v);
        document.getElementById('gstReportResults').innerHTML = `
            <div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white"><h3>📊 GST Summary: ${formatDate(fromDate)} to ${formatDate(toDate)}</h3></div>
            <div class="dashboard-grid" style="margin-bottom:20px">
                <div class="stat-card primary"><div class="stat-label">Sales (Taxable, net of credit notes)</div><div class="stat-value">${money(g.out.taxable)}</div></div>
                <div class="stat-card success"><div class="stat-label">Output GST</div><div class="stat-value">${money(g.out.cgst + g.out.sgst + g.out.igst)}</div></div>
                <div class="stat-card warning"><div class="stat-label">Input Tax Credit</div><div class="stat-value">${money(g.itc.cgst + g.itc.sgst + g.itc.igst)}</div></div>
                <div class="stat-card ${netTotal >= 0 ? 'danger' : 'success'}"><div class="stat-label">Net GST ${netTotal >= 0 ? 'Payable' : 'Credit'} (approx.)</div><div class="stat-value">${money(Math.abs(netTotal))}</div></div>
            </div>
            <div class="card" style="margin-bottom:20px"><h3>📋 GST by Rate (sales invoices)</h3>
                <table><thead><tr><th>GST Rate</th><th>Taxable Value</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total Tax</th></tr></thead>
                <tbody>${
                    Object.entries(g.byRate)
                        .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
                        .map(
                            ([rate, d]) =>
                                `<tr><td>${rate}%</td><td>${money(d.taxable)}</td><td>${money(d.cgst)}</td><td>${money(d.sgst)}</td><td>${money(d.igst)}</td><td>${money(d.cgst + d.sgst + d.igst)}</td></tr>`
                        )
                        .join('') || '<tr><td colspan="6" style="text-align:center">No data</td></tr>'
                }</tbody></table>
            </div>
            <div class="card" style="margin-bottom:20px"><h3>📄 GSTR-1: Outward Supplies</h3>
                <table><thead><tr><th>Type</th><th>Invoice #</th><th>Date</th><th>Customer</th><th>GSTIN</th><th>Place of Supply</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead>
                <tbody>${
                    g.invoices
                        .map(
                            inv => `<tr><td>${inv.type}</td><td>${esc(inv.number || inv.id)}</td><td>${formatDate(inv.date)}</td><td>${esc(inv.customerName) || '-'}</td><td>${esc(inv.gstin) || '-'}</td><td>${esc(inv.pos)}-${esc(stateName(inv.pos))}</td>
                    <td>${money(inv.taxable)}</td><td>${money(inv.cgst)}</td><td>${money(inv.sgst)}</td><td>${money(inv.igst)}</td><td>${money(inv.grandTotal)}</td></tr>`
                        )
                        .join('') || '<tr><td colspan="11" style="text-align:center">No invoices</td></tr>'
                }</tbody></table>
                ${
                    g.creditNotes.length
                        ? `<h4 style="margin-top:15px">Credit Notes</h4><table><thead><tr><th>Note #</th><th>Date</th><th>Customer</th><th>Against</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th></tr></thead>
                <tbody>${g.creditNotes.map(r => `<tr><td>${esc(r.number)}</td><td>${formatDate(r.date)}</td><td>${esc(r.customerName)}</td><td>${esc(r.invoiceNumber)}</td><td>${money(r.taxable)}</td><td>${money(r.cgst)}</td><td>${money(r.sgst)}</td><td>${money(r.igst)}</td></tr>`).join('')}</tbody></table>`
                        : ''
                }
                <h4 style="margin-top:15px">HSN Summary</h4>
                <table><thead><tr><th>HSN/SAC</th><th>Description</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th></tr></thead>
                <tbody>${g.byHsn.map(h => `<tr><td>${esc(h.hsn)}</td><td>${esc(h.desc)}</td><td>${esc(h.unit)}</td><td>${round2(h.qty)}</td><td>${h.rate}%</td><td>${money(h.taxable)}</td><td>${money(h.cgst)}</td><td>${money(h.sgst)}</td><td>${money(h.igst)}</td></tr>`).join('') || '<tr><td colspan="9" style="text-align:center">No data</td></tr>'}</tbody></table>
                <div style="text-align:right;margin-top:10px" class="no-print">
                    <button class="btn" onclick="exportHSN('${fromDate}','${toDate}')">📥 Export HSN CSV</button>
                    <button class="btn btn-primary" onclick="exportGSTR1('${fromDate}','${toDate}')">📥 Export GSTR-1 CSV</button>
                </div>
            </div>
            <div class="card"><h3>📊 GSTR-3B Summary</h3>
                <table><thead><tr><th>Section</th><th>Taxable Value</th><th>IGST</th><th>CGST</th><th>SGST</th></tr></thead><tbody>
                    <tr><td>3.1(a) Outward taxable supplies (net of credit notes)</td><td>${money(g.out.taxable)}</td><td>${money(g.out.igst)}</td><td>${money(g.out.cgst)}</td><td>${money(g.out.sgst)}</td></tr>
                    <tr><td>4(A)(5) ITC available: all other ITC (net of debit notes)</td><td>${money(g.itc.taxable)}</td><td>${money(g.itc.igst)}</td><td>${money(g.itc.cgst)}</td><td>${money(g.itc.sgst)}</td></tr>
                    <tr style="font-weight:bold"><td>Net tax (output − ITC)</td><td></td><td>${money(net('igst'))}</td><td>${money(net('cgst'))}</td><td>${money(net('sgst'))}</td></tr>
                </tbody></table>
                <p style="color:var(--text-gray)">The portal sets off IGST credit against CGST/SGST in a fixed order, so the cash you pay per head can differ. Only bills recorded here are counted as ITC. Match them with GSTR-2B before claiming.</p>
                <div style="text-align:right;margin-top:10px" class="no-print"><button class="btn" onclick="printGSTReport()">🖨️ Print</button></div>
            </div>`;
    }
    // Invoice-wise, rate-wise rows similar to the GST offline tool's B2B / B2CL / B2CS sheets
    async function exportGSTR1(fromDate, toDate) {
        const rows = returns.gstr1Rows(await gstData(fromDate, toDate), stateName).map(row => row.map((v, i) => (i === 4 ? formatDate(v) : v)));
        downloadFile(`GSTR1-${fromDate}-to-${toDate}.csv`, toCSV(returns.GSTR1_HEADERS, rows), 'text/csv');
        showToast('GSTR-1 exported!');
    }
    async function exportHSN(fromDate, toDate) {
        const g = await gstData(fromDate, toDate);
        downloadFile(
            `HSN-summary-${fromDate}-to-${toDate}.csv`,
            toCSV(
                ['HSN', 'Description', 'UQC', 'Total Quantity', 'Rate', 'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax'],
                g.byHsn.map(h => [h.hsn, h.desc, h.unit, round2(h.qty), h.rate, round2(h.taxable), round2(h.igst), round2(h.cgst), round2(h.sgst)])
            ),
            'text/csv'
        );
        showToast('HSN summary exported!');
    }
    function printGSTReport() {
        printDocument(
            'GST Report',
            document.getElementById('gstReportResults').innerHTML,
            '.no-print{display:none}.stat-card{display:inline-block;padding:10px;margin:5px;border:1px solid #bbb;border-radius:6px;min-width:150px}.stat-label{font-size:12px;color:#555}.stat-value{font-size:18px;font-weight:bold}.card{margin-bottom:15px}'
        );
    }

    // ----- TDS / TCS register -----
    // Tax deducted by customers on payments to you (TDS, e.g. section 194C/194Q) or collected (TCS). Record each
    // certificate here so it can be matched with Form 26AS when filing income tax.
    const SECTIONS = ['194C', '194J', '194H', '194I', '194Q', '206C(1H)', 'Other'];
    async function renderTds() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const rows = (await dbOps.getByCompany('tdsEntries')).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const [from, to] = periodRange('thisYear');
        const fy = rows.filter(r => r.date >= from && r.date <= to);
        const total = kind => fy.filter(r => r.kind === kind).reduce((s, r) => s + (r.amount || 0), 0);
        return `
    <div class="page-header"><h1 class="page-title">${t('tds')}</h1><button class="btn btn-primary" onclick="showTdsForm()">${t('addNew')}</button></div>
    <p style="color:var(--text-gray);margin-bottom:15px">Record tax deducted (TDS) or collected (TCS) on your sales, with the certificate number, to match with Form 26AS.</p>
    <div class="dashboard-grid">
        <div class="stat-card primary"><div class="stat-label">TDS deducted by customers (this year)</div><div class="stat-value">${formatCurrency(total('TDS'))}</div></div>
        <div class="stat-card warning"><div class="stat-label">TCS (this year)</div><div class="stat-value">${formatCurrency(total('TCS'))}</div></div>
    </div>
    <div class="card"><table id="tdsTable"><thead><tr><th>Date</th><th>Type</th><th>Section</th><th>Party</th><th>Against</th><th>Amount</th><th>Certificate</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        rows
            .map(
                r => `<tr><td>${formatDate(r.date)}</td><td>${esc(r.kind)}</td><td>${esc(r.section)}</td><td>${esc(r.partyName) || '-'}</td><td>${esc(r.reference) || '-'}</td><td>${formatCurrency(r.amount)}</td><td>${esc(r.certificate) || '-'}</td>
        <td><button class="action-btn delete" onclick="deleteTds(${r.id})">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="8" style="text-align:center">${t('noData')}</td></tr>`
    }</tbody></table>
    ${rows.length ? `<div style="text-align:right;margin-top:10px"><button class="btn" onclick="exportTds()">📥 Export CSV</button></div>` : ''}</div>`;
    }
    async function showTdsForm() {
        const customers = await dbOps.getByCompany('customers');
        const html = `<form id="tdsForm">
    <div class="form-row">
        <div class="form-group"><label class="form-label">Date *</label><input class="form-control" type="date" name="date" value="${todayStr()}" required></div>
        <div class="form-group"><label class="form-label">Type</label><select class="form-control" name="kind"><option>TDS</option><option>TCS</option></select></div>
        <div class="form-group"><label class="form-label">Section</label><select class="form-control" name="section">${SECTIONS.map(s => `<option>${s}</option>`).join('')}</select></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label class="form-label">Customer</label><select class="form-control" name="partyId"><option value="">-</option>${customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Against (invoice / receipt no)</label><input class="form-control" name="reference" maxlength="40"></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label class="form-label">Amount *</label><input class="form-control" type="number" step="0.01" min="0" name="amount" required></div>
        <div class="form-group"><label class="form-label">Certificate no (Form 16A / 27D)</label><input class="form-control" name="certificate" maxlength="40"></div>
    </div>
</form>`;
        showModal(
            'TDS / TCS Entry',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveTds()">${t('save')}</button>`
        );
    }
    async function saveTds() {
        const d = Object.fromEntries(new FormData(document.getElementById('tdsForm')));
        const amount = round2(parseFloat(d.amount));
        if (!(amount > 0)) {
            showToast('Enter the amount', 'error');
            return;
        }
        const party = d.partyId ? await dbOps.get('customers', parseInt(d.partyId)) : null;
        await dbOps.add('tdsEntries', {
            date: d.date || todayStr(),
            kind: d.kind,
            section: d.section,
            partyId: party?.id || null,
            partyName: party?.name || '',
            reference: d.reference.trim(),
            amount,
            certificate: d.certificate.trim(),
            companyId: parseInt(currentCompanyId)
        });
        closeModal();
        showToast(t('success'));
        renderPage('tds');
    }
    async function deleteTds(id) {
        if (confirm('Delete this entry?')) {
            await dbOps.delete('tdsEntries', id);
            renderPage('tds');
        }
    }
    async function exportTds() {
        const rows = (await dbOps.getByCompany('tdsEntries')).map(r => [r.date, r.kind, r.section, r.partyName, r.reference, r.amount, r.certificate]);
        downloadFile(`tds-tcs-${todayStr()}.csv`, toCSV(['Date', 'Type', 'Section', 'Party', 'Against', 'Amount', 'Certificate'], rows), 'text/csv');
    }

    V.app.definePages('region_india_gst', { 'gst-reports': renderGSTReports, tds: renderTds });
    // gstData stays global: tests and the console use it to check the figures
    Object.assign(window, { gstData, applyGSTPeriod, generateGSTReport, exportGSTR1, exportHSN, printGSTReport, showTdsForm, saveTds, deleteTds, exportTds });
})();
