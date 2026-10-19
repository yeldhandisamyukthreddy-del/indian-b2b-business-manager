// Orders & Delivery pages: sales orders and delivery challans. Uses the app's helpers from app/index.html
// and the stock check of the inventory module (a declared dependency).
/* global dbOps, currentCompanyId, t, esc, formatCurrency, formatDate, todayStr, showModal, closeModal, showToast, renderPage, navigateTo, listSearchBox, listRows, listFooter, getNextNumber, getCurrentCompany, startLineEditor, applyLineTotals, partyFields, recordInvoice, printSimpleDoc, printHeader, partyBlock, printDocument, contrib */
(function () {
    'use strict';
    const inventory = window.Vyapar.modules.inventory.stock;

    async function convertToOrder(id) {
        const q = await dbOps.get('quotations', id);
        if (!q) return;
        if (q.status === 'converted' && !confirm('This quotation was already converted. Create another sales order?')) return;
        const order = { ...q, quotationId: q.id, quotationNumber: q.number, number: await getNextNumber('salesOrder'), status: 'pending', date: todayStr() };
        delete order.id;
        delete order.validTill;
        delete order.terms;
        delete order.createdAt;
        await dbOps.add('salesOrders', order);
        q.status = 'converted';
        await dbOps.update('quotations', q);
        showToast('Converted to Sales Order!');
        navigateTo('sales-orders');
    }

    async function renderSalesOrders() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const orders = await dbOps.getByCompany('salesOrders');
        return `
    <div class="page-header"><h1 class="page-title">${t('salesOrders')}</h1></div>
    <p style="color:var(--text-gray);margin-bottom:15px">Sales orders are created from Quotations (📋 button).</p>
    <div class="card">${listSearchBox('Search orders...')}<table><thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Amount</th><th>Status</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        listRows(orders.slice().reverse())
            .map(
                o => `<tr><td>${esc(o.number || o.id)}</td><td>${formatDate(o.date)}</td><td>${esc(o.customerName) || '-'}</td><td>${formatCurrency(o.grandTotal)}</td>
        <td><span class="badge ${['delivered', 'invoiced'].includes(o.status) ? 'badge-success' : 'badge-warning'}">${esc(o.status || 'pending')}</span></td>
        <td><button class="action-btn view" onclick="printSalesOrder(${o.id})" title="Print">🖨️</button><button class="action-btn edit" onclick="createChallanFromOrder(${o.id})" title="Create Delivery Challan">🚚</button><button class="action-btn view" onclick="createInvoiceFromOrder(${o.id})" title="Create Invoice">📄</button><button class="action-btn delete" onclick="deleteSalesOrder(${o.id})" title="Delete">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="6" style="text-align:center">${t('noData')}</td></tr>`
    }${listFooter(6)}</tbody></table></div>`;
    }
    async function printSalesOrder(id) {
        const o = await dbOps.get('salesOrders', id);
        if (o) printSimpleDoc(o, 'SALES ORDER', 'Customer:', o.customerName, o.customerId, 'customers');
    }
    async function deleteSalesOrder(id) {
        if (confirm('Delete?')) {
            await dbOps.delete('salesOrders', id);
            showToast('Deleted');
            renderPage('sales-orders');
        }
    }
    async function createChallanFromOrder(id) {
        const o = await dbOps.get('salesOrders', id);
        if (!o) return;
        if (o.challanNumber && !confirm(`Challan ${o.challanNumber} already exists for this order. Create another?`)) return;
        // Inventory (a dependency) says what is short before the goods leave
        const short = inventory.shortages(o.items || [], await dbOps.getByCompany('products'));
        if (
            short.length &&
            !confirm(
                `Not enough stock to dispatch:\n${short.map(s => `${s.name}: in stock ${s.onHand}, ordered ${s.needed}`).join('\n')}\n\nCreate the challan anyway?`
            )
        )
            return;
        const challan = {
            ...o,
            salesOrderId: o.id,
            salesOrderNumber: o.number,
            number: await getNextNumber('challan'),
            status: 'pending',
            date: todayStr(),
            vehicleNumber: ''
        };
        delete challan.id;
        delete challan.createdAt;
        delete challan.challanNumber;
        delete challan.invoiceNumber;
        await dbOps.add('challans', challan);
        o.challanNumber = challan.number;
        if (o.status !== 'invoiced') o.status = 'dispatched';
        await dbOps.update('salesOrders', o);
        showToast(`Challan ${challan.number} created!`);
        navigateTo('challans');
    }
    // The invoice goes through core's one invoice path (hooks, numbering, balance, events)
    async function createInvoiceFromOrder(id) {
        const o = await dbOps.get('salesOrders', id);
        if (!o) return;
        if (o.status === 'invoiced' && !confirm(`Invoice ${o.invoiceNumber || ''} was already created from this order. Create another?`)) return;
        const customer = await dbOps.get('customers', o.customerId);
        if (!customer) {
            showToast('The customer of this order no longer exists', 'error');
            return;
        }
        const company = await getCurrentCompany();
        await startLineEditor(o.items, company?.stateCode, customer.stateCode, customer);
        const inv = applyLineTotals({ date: todayStr(), ...partyFields(customer), salesOrderId: o.id, salesOrderNumber: o.number, notes: '' });
        let saved;
        try {
            saved = await recordInvoice(inv);
        } catch (e) {
            showToast(e.message, 'error');
            return;
        }
        if (!saved) return;
        o.status = 'invoiced';
        o.invoiceNumber = saved.number;
        await dbOps.update('salesOrders', o);
        showToast(`Invoice ${saved.number} created!`);
        navigateTo('invoices');
    }

    // ===== DELIVERY CHALLANS =====
    async function renderChallans() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const challans = await dbOps.getByCompany('challans');
        return `
    <div class="page-header"><h1 class="page-title">${t('challans')}</h1></div>
    <p style="color:var(--text-gray);margin-bottom:15px">Delivery challans are created from Sales Orders (🚚 button).</p>
    <div class="card">${listSearchBox('Search challans...')}<table><thead><tr><th>Challan #</th><th>Date</th><th>Customer</th><th>Vehicle</th><th>Status</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        listRows(challans.slice().reverse())
            .map(
                c => `<tr><td>${esc(c.number || c.id)}</td><td>${formatDate(c.date)}</td><td>${esc(c.customerName) || '-'}</td><td>${esc(c.vehicleNumber) || '-'}</td>
        <td><span class="badge ${c.status === 'delivered' ? 'badge-success' : 'badge-warning'}">${esc(c.status || 'pending')}</span></td>
        <td><button class="action-btn view" onclick="printChallan(${c.id})" title="Print">🖨️</button><button class="action-btn" onclick="setChallanVehicle(${c.id})" title="Set vehicle">🚛</button>${c.status !== 'delivered' ? `<button class="action-btn edit" onclick="markDelivered(${c.id})" title="Mark delivered">✅</button>` : ''}<button class="action-btn delete" onclick="deleteChallan(${c.id})" title="Delete">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="6" style="text-align:center">${t('noData')}</td></tr>`
    }${listFooter(6)}</tbody></table></div>`;
    }
    async function deleteChallan(id) {
        if (confirm('Delete?')) {
            await dbOps.delete('challans', id);
            showToast('Deleted');
            renderPage('challans');
        }
    }
    async function markDelivered(id) {
        const c = await dbOps.get('challans', id);
        c.status = 'delivered';
        await dbOps.update('challans', c);
        if (c.salesOrderId) {
            const o = await dbOps.get('salesOrders', c.salesOrderId);
            if (o && o.status !== 'invoiced') {
                o.status = 'delivered';
                await dbOps.update('salesOrders', o);
            }
        }
        showToast('Marked as delivered!');
        renderPage('challans');
    }
    async function setChallanVehicle(id) {
        const c = await dbOps.get('challans', id);
        // Vehicles come from any module that offers them ('fulfilment.vehicles', e.g. Fleet)
        const vehicles = (await Promise.all(contrib('fulfilment.vehicles').map(c => c.value({ list: s => dbOps.getByCompany(s) })))).flat();
        const html = `<form id="challanVehicleForm"><div class="form-group"><label class="form-label">Vehicle</label><select class="form-control" name="vehicleId" onchange="if(this.value)this.form.vehicleNumber.value=this.selectedOptions[0].text">
            <option value="">Other / not listed</option>${vehicles.map(v => `<option value="${v.id}" ${v.id === c.vehicleId ? 'selected' : ''}>${esc(v.number)}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label">Vehicle Number</label><input class="form-control" name="vehicleNumber" value="${esc(c.vehicleNumber)}"></div></form>`;
        showModal(
            `Vehicle for ${esc(c.number)}`,
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveChallanVehicle(${id})">${t('save')}</button>`
        );
    }
    async function saveChallanVehicle(id) {
        const data = Object.fromEntries(new FormData(document.getElementById('challanVehicleForm')));
        const c = await dbOps.get('challans', id);
        c.vehicleId = parseInt(data.vehicleId) || null;
        c.vehicleNumber = data.vehicleNumber.trim();
        await dbOps.update('challans', c);
        closeModal();
        showToast(t('success'));
        renderPage('challans');
    }
    async function printChallan(id) {
        const c = await dbOps.get('challans', id);
        const company = await dbOps.get('companies', c.companyId);
        const customer = await dbOps.get('customers', c.customerId);
        const body = `${printHeader(company, 'DELIVERY CHALLAN', `<div><strong>Challan No:</strong> ${esc(c.number)}</div><div><strong>Date:</strong> ${formatDate(c.date)}</div>${c.salesOrderNumber ? `<div><strong>Order:</strong> ${esc(c.salesOrderNumber)}</div>` : ''}${c.vehicleNumber ? `<div><strong>Vehicle:</strong> ${esc(c.vehicleNumber)}</div>` : ''}`)}
        ${partyBlock('Ship To:', c.customerName, customer?.address, customer?.gstin, customer?.stateCode)}
        <table><thead><tr><th>#</th><th>Item</th><th>HSN/SAC</th><th class="r">Qty</th><th>Unit</th></tr></thead>
        <tbody>${(c.items || []).map((item, i) => `<tr><td>${i + 1}</td><td>${esc(item.name)}</td><td>${esc(item.hsn) || '-'}</td><td class="r">${item.qty}</td><td>${esc(item.unit) || '-'}</td></tr>`).join('')}</tbody></table>
        <div style="margin-top:50px;display:flex;justify-content:space-between"><div><p>Receiver Signature</p><div style="border-bottom:1px solid #000;width:200px;height:50px"></div></div><div><p>For ${esc(company?.name)}</p><div style="border-bottom:1px solid #000;width:200px;height:50px"></div><p>Authorised Signatory</p></div></div>`;
        printDocument(`Challan ${c.number}`, body);
    }

    window.Vyapar.app.definePages('fulfilment', { 'sales-orders': renderSalesOrders, challans: renderChallans });
    Object.assign(window, {
        convertToOrder,
        printSalesOrder,
        deleteSalesOrder,
        createChallanFromOrder,
        createInvoiceFromOrder,
        deleteChallan,
        markDelivered,
        setChallanVehicle,
        saveChallanVehicle,
        printChallan
    });
})();
