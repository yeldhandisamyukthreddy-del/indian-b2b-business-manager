// Purchasing pages: purchase orders and bills. Vendor payments and debit notes use core's money and
// returns screens with this module's kinds (see index.js). Uses the app's helpers from app/index.html.
/* global dbOps, currentCompanyId, t, esc, formatCurrency, formatDate, todayStr, showModal, closeModal, showToast, renderPage, navigateTo, listSearchBox, listRows, listFooter, getNextNumber, getCurrentCompany, startLineEditor, lineEditor, lineEditorHtml, applyLineTotals, partyOpts, setPaymentStatus, statusBadge, docDue, adjustPartyBalance, printSimpleDoc, emit, showMoneyForm, renderMoneyList, renderReturns */
(function () {
    'use strict';

    async function renderPurchaseOrders() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const orders = await dbOps.getByCompany('purchaseOrders');
        return `
    <div class="page-header"><h1 class="page-title">${t('purchaseOrders')}</h1><button class="btn btn-primary" onclick="showPOForm()">${t('addNew')}</button></div>
    <div class="card">${listSearchBox('Search purchase orders...')}<table><thead><tr><th>PO #</th><th>Date</th><th>Vendor</th><th>Amount</th><th>Status</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        listRows(orders.slice().reverse())
            .map(
                o => `<tr><td>${esc(o.number || o.id)}</td><td>${formatDate(o.date)}</td><td>${esc(o.vendorName) || '-'}</td><td>${formatCurrency(o.grandTotal)}</td>
        <td><span class="badge ${o.status === 'received' ? 'badge-success' : 'badge-warning'}">${esc(o.status || 'pending')}</span></td>
        <td><button class="action-btn view" onclick="printPO(${o.id})" title="Print">🖨️</button>${o.status !== 'received' ? `<button class="action-btn edit" onclick="convertToBill(${o.id})" title="Record purchase bill">📄</button>` : ''}<button class="action-btn delete" onclick="deletePO(${o.id})" title="Delete">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="6" style="text-align:center">${t('noData')}</td></tr>`
    }${listFooter(6)}</tbody></table></div>`;
    }
    async function showPOForm() {
        if (!currentCompanyId) {
            showToast(t('selectCompanyFirst'), 'error');
            return;
        }
        const vendors = await dbOps.getByCompany('vendors');
        const products = await dbOps.getByCompany('products');
        const company = await getCurrentCompany();
        const html = `<form id="poForm">
    <div class="form-row">
        <div class="form-group"><label class="form-label">Date</label><input class="form-control" type="date" name="date" value="${todayStr()}" required></div>
        <div class="form-group"><label class="form-label">Vendor *</label><select class="form-control" name="vendorId" id="poVendor" onchange="setLineParty(this)" required>
            <option value="">Select</option>${partyOpts(vendors)}
        </select></div>
    </div>
    ${lineEditorHtml(products, 'purchasePrice')}
</form>`;
        showModal(
            'New Purchase Order',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="savePO()">Save PO</button>`
        );
        await startLineEditor([], company?.stateCode, '');
    }
    async function savePO() {
        if (!lineEditor.items.length) {
            showToast('Add items!', 'error');
            return;
        }
        const data = Object.fromEntries(new FormData(document.getElementById('poForm')));
        const vendor = await dbOps.get('vendors', parseInt(data.vendorId));
        if (!vendor) {
            showToast('Select a vendor', 'error');
            return;
        }
        applyLineTotals(data);
        data.vendorId = vendor.id;
        data.vendorName = vendor.name;
        data.companyId = parseInt(currentCompanyId);
        data.status = 'pending';
        data.number = await getNextNumber('po');
        await dbOps.add('purchaseOrders', data);
        closeModal();
        showToast('PO saved!');
        renderPage('purchase-orders');
    }
    async function deletePO(id) {
        if (confirm('Delete?')) {
            await dbOps.delete('purchaseOrders', id);
            showToast('Deleted');
            renderPage('purchase-orders');
        }
    }
    async function printPO(id) {
        const po = await dbOps.get('purchaseOrders', id);
        if (po) printSimpleDoc(po, 'PURCHASE ORDER', 'To:', po.vendorName, po.vendorId, 'vendors');
    }
    async function convertToBill(id) {
        const po = await dbOps.get('purchaseOrders', id);
        if (!po) return;
        navigateTo('purchase-bills');
        await showBillForm(po);
    }

    // ===== PURCHASE BILLS =====
    async function renderPurchaseBills() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const bills = await dbOps.getByCompany('purchaseBills');
        return `
    <div class="page-header"><h1 class="page-title">${t('purchaseBills')}</h1><button class="btn btn-primary" onclick="showBillForm()">${t('addNew')}</button></div>
    <div class="card">${listSearchBox('Search bills...')}<table><thead><tr><th>Bill #</th><th>Vendor Invoice #</th><th>Date</th><th>Vendor</th><th>Amount</th><th>Balance Due</th><th>Status</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        listRows(bills.slice().reverse())
            .map(
                b => `<tr><td>${esc(b.number || b.id)}</td><td>${esc(b.vendorInvoiceNo) || '-'}</td><td>${formatDate(b.date)}</td><td>${esc(b.vendorName) || '-'}</td><td>${formatCurrency(b.grandTotal)}</td><td>${formatCurrency(Math.max(docDue(b), 0))}</td>
        <td>${statusBadge(b, false)}</td>
        <td>${b.status !== 'paid' ? `<button class="action-btn edit" onclick="payBill(${b.id})" title="Record payment">💰</button>` : ''}<button class="action-btn delete" onclick="deleteBill(${b.id})" title="Delete">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="8" style="text-align:center">${t('noData')}</td></tr>`
    }${listFooter(8)}</tbody></table></div>`;
    }
    // po: optional purchase order to pre-fill from
    async function showBillForm(po = null) {
        if (!currentCompanyId) {
            showToast(t('selectCompanyFirst'), 'error');
            return;
        }
        const vendors = await dbOps.getByCompany('vendors');
        const products = await dbOps.getByCompany('products');
        const company = await getCurrentCompany();
        const vendor = po ? vendors.find(v => v.id === po.vendorId) : null;
        const html = `<form id="billForm">
    <input type="hidden" name="purchaseOrderId" value="${po?.id || ''}">
    <div class="form-row">
        <div class="form-group"><label class="form-label">Bill Date (as on vendor invoice) *</label><input class="form-control" type="date" name="date" value="${todayStr()}" required></div>
        <div class="form-group"><label class="form-label">Vendor Invoice No *</label><input class="form-control" name="vendorInvoiceNo" required></div>
        <div class="form-group"><label class="form-label">Vendor *</label><select class="form-control" name="vendorId" id="billVendor" onchange="setLineParty(this)" required>
            <option value="">Select</option>${partyOpts(vendors, po?.vendorId)}
        </select></div>
    </div>
    ${po ? `<p style="color:var(--text-gray)">From purchase order ${esc(po.number)}. Adjust quantities and rates to match the vendor's invoice.</p>` : ''}
    ${lineEditorHtml(products, 'purchasePrice')}
</form>`;
        showModal(
            'Record Purchase Bill',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveBill()">Save Bill</button>`
        );
        await startLineEditor(po?.items, company?.stateCode, vendor?.stateCode);
    }
    async function saveBill() {
        if (!lineEditor.items.length) {
            showToast('Add items!', 'error');
            return;
        }
        const data = Object.fromEntries(new FormData(document.getElementById('billForm')));
        const vendor = await dbOps.get('vendors', parseInt(data.vendorId));
        if (!vendor) {
            showToast('Select a vendor', 'error');
            return;
        }
        data.vendorInvoiceNo = (data.vendorInvoiceNo || '').trim();
        if (!data.vendorInvoiceNo) {
            showToast("Enter the vendor's invoice number", 'error');
            return;
        }
        applyLineTotals(data);
        data.vendorId = vendor.id;
        data.vendorName = vendor.name;
        data.vendorGstin = vendor.gstin || '';
        data.companyId = parseInt(currentCompanyId);
        data.purchaseOrderId = parseInt(data.purchaseOrderId) || null;
        data.number = await getNextNumber('bill');
        data.paidAmount = 0;
        data.rev = 0;
        setPaymentStatus(data);
        data.id = await dbOps.add('purchaseBills', data);
        await adjustPartyBalance('vendors', vendor.id, data.grandTotal);
        // Inventory (if on) brings the goods into stock; accounting (if on) books the purchase
        await emit('bill.recorded', data, { doc: data });
        if (data.purchaseOrderId) {
            const po = await dbOps.get('purchaseOrders', data.purchaseOrderId);
            if (po) {
                po.status = 'received';
                po.billNumber = data.number;
                await dbOps.update('purchaseOrders', po);
            }
        }
        closeModal();
        showToast('Bill saved!');
        navigateTo('purchase-bills');
    }
    async function deleteBill(id) {
        const bill = await dbOps.get('purchaseBills', id);
        if (!bill || !confirm(`Delete bill ${bill.number}? The vendor's balance (and stock, if tracked) will be reversed.`)) return;
        await adjustPartyBalance('vendors', bill.vendorId, -(bill.grandTotal || 0));
        for (const p of (await dbOps.getByCompany('payments')).filter(p => (p.allocations || []).some(a => a.billId === id))) {
            p.allocations = p.allocations.filter(a => a.billId !== id);
            await dbOps.update('payments', p);
        }
        await dbOps.delete('purchaseBills', id);
        await emit('bill.voided', bill, { doc: bill });
        showToast('Deleted');
        renderPage('purchase-bills');
    }
    async function payBill(id) {
        const b = await dbOps.get('purchaseBills', id);
        if (!b) return;
        navigateTo('payments');
        await showMoneyForm('payment', { vendorId: b.vendorId, billId: id, amount: Math.max(docDue(b), 0) });
    }

    window.Vyapar.app.definePages('purchasing', {
        'purchase-orders': renderPurchaseOrders,
        'purchase-bills': renderPurchaseBills,
        'purchase-returns': () => renderReturns('purchase'),
        payments: () => renderMoneyList('payment')
    });
    Object.assign(window, {
        showPOForm,
        savePO,
        deletePO,
        printPO,
        convertToBill,
        showBillForm,
        saveBill,
        deleteBill,
        payBill,
        showVendorPaymentForm: () => showMoneyForm('payment'),
        showDebitNoteForm: () => window.showReturnForm('purchase')
    });
})();
