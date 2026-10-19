// Inventory pages: stock summary with adjustments, movement history and batches, and warehouses.
// Uses the app's helpers from app/index.html and this module's stock rules (stock.js).
/* global dbOps, currentCompanyId, t, esc, formatCurrency, formatDate, todayStr, showModal, closeModal, showToast, renderPage */
(function () {
    'use strict';
    const V = window.Vyapar;
    const stock = V.modules.inventory.stock;
    // The module's own context (tenant-scoped repositories) from the runtime
    const ctx = () => V.app.runtime.ctxFor(parseInt(currentCompanyId), 'inventory');

    async function renderStock() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const products = await dbOps.getByCompany('products');
        const movements = await dbOps.getByCompany(stock.MOVEMENTS);
        const totalValue = products.reduce((s, p) => s + Math.max(p.stockQty || 0, 0) * (p.purchasePrice || 0), 0);
        const withBatches = products.map(p => ({ p, b: stock.batches(movements, p.id) })).filter(x => x.b.length);
        return `
    <div class="page-header"><h1 class="page-title">${t('stock')}</h1><button class="btn btn-primary" onclick="showStockAdjustment()">Adjust Stock</button></div>
    <div class="dashboard-grid">
        <div class="stat-card primary"><div class="stat-label">Total Items</div><div class="stat-value">${products.length}</div></div>
        <div class="stat-card success"><div class="stat-label">Stock Value</div><div class="stat-value">${formatCurrency(totalValue)}</div></div>
        <div class="stat-card danger"><div class="stat-label">Low Stock Items</div><div class="stat-value">${products.filter(stock.isLowStock).length}</div></div>
    </div>
    <div class="card"><table id="stockTable"><thead><tr><th>${t('name')}</th><th>HSN</th><th>Unit</th><th>Stock Qty</th><th>Purchase Price</th><th>Value</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        products
            .map(
                p => `<tr><td>${esc(p.name)}</td><td>${esc(p.hsn) || '-'}</td><td>${esc(p.unit) || '-'}</td><td style="color:${stock.isLowStock(p) ? 'red' : 'inherit'}">${p.stockQty || 0}</td><td>${formatCurrency(p.purchasePrice)}</td><td>${formatCurrency((p.stockQty || 0) * (p.purchasePrice || 0))}</td>
        <td><button class="action-btn edit" onclick="showStockAdjustment(${p.id})" title="Adjust stock">±</button><button class="action-btn view" onclick="showStockHistory(${p.id})" title="Movements">📋</button></td></tr>`
            )
            .join('') || `<tr><td colspan="7" style="text-align:center">${t('noData')}</td></tr>`
    }</tbody></table></div>
    ${
        withBatches.length
            ? `<div class="card"><h3 style="margin-bottom:10px">Batches on hand</h3><table><thead><tr><th>Product</th><th>Batch</th><th>Expiry</th><th>Qty</th></tr></thead>
    <tbody>${withBatches.flatMap(({ p, b }) => b.map(x => `<tr><td>${esc(p.name)}</td><td>${esc(x.batch)}</td><td>${x.expiry ? formatDate(x.expiry) : '-'}</td><td>${x.qty}</td></tr>`)).join('')}</tbody></table></div>`
            : ''
    }`;
    }

    // An adjustment is a movement like any other: counted stock, damage, samples...
    async function showStockAdjustment(productId) {
        const products = await dbOps.getByCompany('products');
        const html = `<form id="stockAdjustForm">
        <div class="form-row">
            <div class="form-group"><label class="form-label">Product *</label><select class="form-control" name="productId" required>
                <option value="">Select</option>${products.map(p => `<option value="${p.id}" ${p.id === productId ? 'selected' : ''}>${esc(p.name)} (on hand: ${p.stockQty || 0})</option>`).join('')}
            </select></div>
            <div class="form-group"><label class="form-label">Date</label><input class="form-control" type="date" name="date" value="${todayStr()}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">Change</label><select class="form-control" name="mode"><option value="add">Add to stock</option><option value="remove">Remove from stock</option><option value="set">Set counted quantity</option></select></div>
            <div class="form-group"><label class="form-label">Quantity *</label><input class="form-control" type="number" step="any" min="0" name="qty" required></div>
        </div>
        <div class="form-group"><label class="form-label">Reason</label><input class="form-control" name="reason" maxlength="80" placeholder="Stock count, damaged, samples..."></div>
    </form>`;
        showModal(
            'Adjust Stock',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveStockAdjustment()">${t('save')}</button>`
        );
    }
    async function saveStockAdjustment() {
        const data = Object.fromEntries(new FormData(document.getElementById('stockAdjustForm')));
        const product = await dbOps.get('products', parseInt(data.productId));
        if (!product) {
            showToast('Select a product', 'error');
            return;
        }
        const qty = parseFloat(data.qty);
        if (!(qty >= 0)) {
            showToast('Enter a quantity', 'error');
            return;
        }
        const change = data.mode === 'set' ? stock.roundQty(qty - (product.stockQty || 0)) : data.mode === 'remove' ? -qty : qty;
        if (!change) {
            closeModal();
            return;
        }
        await stock.record(ctx(), [
            {
                id: `adjust:${product.id}:${Date.now()}`,
                productId: product.id,
                qty: change,
                kind: 'Adjustment',
                ref: (data.reason || '').trim(),
                date: data.date || todayStr()
            }
        ]);
        closeModal();
        showToast('Stock adjusted');
        renderPage('stock');
    }
    async function showStockHistory(productId) {
        const product = await dbOps.get('products', productId);
        if (!product) return;
        const rows = (await dbOps.getByCompany(stock.MOVEMENTS))
            .filter(m => m.productId === productId)
            .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
        let bal = 0;
        const html = `<table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Batch</th><th>In / Out</th><th>Balance</th></tr></thead><tbody>${
            rows
                .map(m => {
                    bal = stock.roundQty(bal + m.qty);
                    return `<tr><td>${formatDate(m.date)}</td><td>${esc(m.kind)}</td><td>${esc(m.ref) || '-'}</td><td>${esc(m.batch) || '-'}</td><td style="color:${m.qty < 0 ? 'red' : 'green'}">${m.qty > 0 ? '+' : ''}${m.qty}</td><td>${bal}</td></tr>`;
                })
                .join('') || '<tr><td colspan="6" style="text-align:center">No movements</td></tr>'
        }</tbody></table>`;
        showModal(`Stock movements — ${esc(product.name)}`, html, `<button class="btn" onclick="closeModal()">Close</button>`);
    }

    // ----- Warehouses -----
    async function renderWarehouses() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const warehouses = await dbOps.getByCompany('warehouses');
        return `
    <div class="page-header"><h1 class="page-title">${t('warehouses')}</h1><button class="btn btn-primary" onclick="showWarehouseForm()">${t('addNew')}</button></div>
    <div class="card"><table><thead><tr><th>${t('name')}</th><th>${t('address')}</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        warehouses
            .map(
                w => `<tr><td>${esc(w.name)}</td><td>${esc(w.address) || '-'}</td>
        <td><button class="action-btn edit" onclick="editWarehouse(${w.id})">✏️</button><button class="action-btn delete" onclick="deleteWarehouse(${w.id})">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="3" style="text-align:center">${t('noData')}</td></tr>`
    }</tbody></table></div>`;
    }
    function showWarehouseForm(w = null) {
        const html = `<form id="warehouseForm">
    <div class="form-group"><label class="form-label">${t('name')} *</label><input class="form-control" name="name" value="${esc(w?.name)}" required></div>
    <div class="form-group"><label class="form-label">${t('address')}</label><textarea class="form-control" name="address">${esc(w?.address)}</textarea></div>
    <input type="hidden" name="id" value="${w?.id || ''}">
</form>`;
        showModal(
            w ? 'Edit Warehouse' : 'Add Warehouse',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveWarehouse()">${t('save')}</button>`
        );
    }
    async function saveWarehouse() {
        const form = document.getElementById('warehouseForm');
        const data = Object.fromEntries(new FormData(form));
        data.name = (data.name || '').trim();
        if (!data.name) {
            showToast('Name is required', 'error');
            return;
        }
        data.companyId = parseInt(currentCompanyId);
        if (data.id) {
            data.id = parseInt(data.id);
            await dbOps.update('warehouses', data);
        } else {
            delete data.id;
            await dbOps.add('warehouses', data);
        }
        closeModal();
        showToast(t('success'));
        renderPage('warehouses');
    }
    async function editWarehouse(id) {
        const w = await dbOps.get('warehouses', id);
        showWarehouseForm(w);
    }
    async function deleteWarehouse(id) {
        if (confirm('Delete?')) {
            await dbOps.delete('warehouses', id);
            showToast('Deleted');
            renderPage('warehouses');
        }
    }

    V.app.definePages('inventory', { stock: renderStock, warehouses: renderWarehouses });
    Object.assign(window, { showStockAdjustment, saveStockAdjustment, showStockHistory, showWarehouseForm, saveWarehouse, editWarehouse, deleteWarehouse });
})();
