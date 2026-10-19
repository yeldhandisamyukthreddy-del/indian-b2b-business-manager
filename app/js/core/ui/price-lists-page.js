// Masters → Price Lists: a markup, a discount or fixed prices per product. A customer can have one; their
// invoices and quotations then start each line at that price. Uses the app's helpers from app/index.html.
/* global dbOps, currentCompanyId, t, esc, formatCurrency, showModal, closeModal, showToast, renderPage */
(function () {
    'use strict';
    const catalog = window.Vyapar.core.catalog;
    const KIND_LABELS = { markup: 'Markup on sale price', discount: 'Discount on sale price', fixed: 'Fixed price per product' };

    async function renderPriceLists() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const lists = await dbOps.getByCompany('priceLists');
        const customers = await dbOps.getByCompany('customers');
        return `
    <div class="page-header"><h1 class="page-title">${t('priceLists')}</h1><button class="btn btn-primary" onclick="showPriceListForm()">${t('addNew')}</button></div>
    <p style="color:var(--text-gray);margin-bottom:15px">Choose a price list on a customer (Masters → Customers) and their invoices start at these prices.</p>
    <div class="card"><table id="priceListTable"><thead><tr><th>${t('name')}</th><th>Kind</th><th>Customers</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        lists
            .map(
                l => `<tr><td>${esc(l.name)}</td><td>${esc(KIND_LABELS[l.kind])}${l.kind === 'fixed' ? '' : ` (${l.percent}%)`}</td><td>${customers.filter(c => c.priceListId === l.id).length}</td>
        <td><button class="action-btn edit" onclick="editPriceList(${l.id})">✏️</button><button class="action-btn delete" onclick="deletePriceList(${l.id})">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="4" style="text-align:center">${t('noData')}</td></tr>`
    }</tbody></table></div>`;
    }

    async function showPriceListForm(l = null) {
        const products = await dbOps.getByCompany('products');
        const kind = l?.kind || 'discount';
        const html = `<form id="priceListForm">
    <input type="hidden" name="id" value="${l?.id || ''}">
    <div class="form-row">
        <div class="form-group"><label class="form-label">${t('name')} *</label><input class="form-control" name="name" maxlength="60" value="${esc(l?.name)}" placeholder="Wholesale, Dealer..." required></div>
        <div class="form-group"><label class="form-label">Kind</label><select class="form-control" name="kind" onchange="document.getElementById('plFixed').style.display = this.value === 'fixed' ? '' : 'none'; document.getElementById('plPercent').style.display = this.value === 'fixed' ? 'none' : ''">
            ${Object.entries(KIND_LABELS)
                .map(([v, label]) => `<option value="${v}" ${v === kind ? 'selected' : ''}>${label}</option>`)
                .join('')}</select></div>
        <div class="form-group" id="plPercent" style="${kind === 'fixed' ? 'display:none' : ''}"><label class="form-label">Percent</label><input class="form-control" type="number" step="0.01" min="0" max="100" name="percent" value="${l?.percent ?? 5}"></div>
    </div>
    <div id="plFixed" style="${kind === 'fixed' ? '' : 'display:none'}"><table><thead><tr><th>Product</th><th>Sale price</th><th>Price in this list</th></tr></thead><tbody>
        ${products.map(p => `<tr><td>${esc(p.name)}</td><td>${formatCurrency(p.salePrice)}</td><td><input class="form-control pl-price" type="number" step="0.01" min="0" data-product="${p.id}" value="${l?.prices?.[p.id] ?? ''}" placeholder="same as sale price"></td></tr>`).join('') || '<tr><td colspan="3">No products yet</td></tr>'}
    </tbody></table></div>
</form>`;
        showModal(
            l ? 'Edit Price List' : 'New Price List',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="savePriceList()">${t('save')}</button>`
        );
    }

    async function savePriceList() {
        const form = document.getElementById('priceListForm');
        const data = Object.fromEntries(new FormData(form));
        const list = {
            name: (data.name || '').trim(),
            kind: data.kind,
            percent: parseFloat(data.percent) || 0,
            prices: {},
            companyId: parseInt(currentCompanyId)
        };
        if (list.kind === 'fixed')
            form.querySelectorAll('.pl-price').forEach(el => {
                if (el.value !== '') list.prices[el.dataset.product] = parseFloat(el.value);
            });
        const errors = catalog.validatePriceList(list);
        if (errors.length) {
            showToast(errors[0], 'error');
            return;
        }
        if (data.id) await dbOps.update('priceLists', { ...list, id: parseInt(data.id) });
        else await dbOps.add('priceLists', list);
        closeModal();
        showToast(t('success'));
        renderPage('price-lists');
    }
    async function editPriceList(id) {
        const l = await dbOps.get('priceLists', id);
        if (l) showPriceListForm(l);
    }
    async function deletePriceList(id) {
        const used = (await dbOps.getByCompany('customers')).filter(c => c.priceListId === id).length;
        if (!confirm(used ? `${used} customer(s) use this price list. They will go back to normal prices. Delete?` : 'Delete this price list?')) return;
        await dbOps.delete('priceLists', id);
        renderPage('price-lists');
    }

    Object.assign(window, { renderPriceLists, showPriceListForm, savePriceList, editPriceList, deletePriceList });
})();
