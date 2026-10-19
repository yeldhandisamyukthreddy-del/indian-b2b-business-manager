// Fleet pages: vehicles and fuel expenses. Uses the app's helpers from app/index.html.
/* global dbOps, currentCompanyId, t, esc, formatCurrency, formatDate, todayStr, showModal, closeModal, showToast, renderPage, listSearchBox, listRows, listFooter */
(function () {
    'use strict';

    async function renderVehicles() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const vehicles = await dbOps.getByCompany('vehicles');
        return `
    <div class="page-header"><h1 class="page-title">${t('vehicleList')}</h1><button class="btn btn-primary" onclick="showVehicleForm()">${t('addNew')}</button></div>
    <div class="card"><table><thead><tr><th>Reg. Number</th><th>Type</th><th>Make/Model</th><th>Driver</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        vehicles
            .map(
                v => `<tr><td>${esc(v.regNumber)}</td><td>${esc(v.type) || '-'}</td><td>${esc(v.make)} ${esc(v.model)}</td><td>${esc(v.driverName) || '-'}</td>
        <td><button class="action-btn edit" onclick="editVehicle(${v.id})">✏️</button><button class="action-btn delete" onclick="deleteVehicle(${v.id})">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="5" style="text-align:center">${t('noData')}</td></tr>`
    }</tbody></table></div>`;
    }
    function showVehicleForm(v = null) {
        const html = `<form id="vehicleForm">
    <div class="form-row">
        <div class="form-group"><label class="form-label">Registration Number *</label><input class="form-control" name="regNumber" value="${esc(v?.regNumber)}" placeholder="TS 01 AB 1234" required></div>
        <div class="form-group"><label class="form-label">Type</label><select class="form-control" name="type">
            <option ${v?.type === 'Truck' ? 'selected' : ''}>Truck</option><option ${v?.type === 'Mini Truck' ? 'selected' : ''}>Mini Truck</option><option ${v?.type === 'Tempo' ? 'selected' : ''}>Tempo</option><option ${v?.type === 'Pickup' ? 'selected' : ''}>Pickup</option><option ${v?.type === 'Other' ? 'selected' : ''}>Other</option>
        </select></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label class="form-label">Make</label><input class="form-control" name="make" value="${esc(v?.make)}" placeholder="Tata, Ashok Leyland, etc."></div>
        <div class="form-group"><label class="form-label">Model</label><input class="form-control" name="model" value="${esc(v?.model)}"></div>
    </div>
    <div class="form-group"><label class="form-label">Driver Name</label><input class="form-control" name="driverName" value="${esc(v?.driverName)}"></div>
    <div class="form-group"><label class="form-label">Driver Phone</label><input class="form-control" name="driverPhone" value="${esc(v?.driverPhone)}"></div>
    <input type="hidden" name="id" value="${v?.id || ''}">
</form>`;
        showModal(
            v ? 'Edit Vehicle' : 'Add Vehicle',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveVehicle()">${t('save')}</button>`
        );
    }
    async function saveVehicle() {
        const form = document.getElementById('vehicleForm');
        const data = Object.fromEntries(new FormData(form));
        data.regNumber = (data.regNumber || '').trim().toUpperCase();
        if (!data.regNumber) {
            showToast('Registration number is required', 'error');
            return;
        }
        data.companyId = parseInt(currentCompanyId);
        if (data.id) {
            data.id = parseInt(data.id);
            await dbOps.update('vehicles', data);
        } else {
            delete data.id;
            await dbOps.add('vehicles', data);
        }
        closeModal();
        showToast(t('success'));
        renderPage('vehicles');
    }
    async function editVehicle(id) {
        const v = await dbOps.get('vehicles', id);
        showVehicleForm(v);
    }
    async function deleteVehicle(id) {
        if (confirm('Delete?')) {
            await dbOps.delete('vehicles', id);
            showToast('Deleted');
            renderPage('vehicles');
        }
    }

    // ===== FUEL EXPENSES =====
    async function renderFuel() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const fuel = await dbOps.getByCompany('fuelExpenses');
        const totalFuel = fuel.reduce((s, f) => s + (f.amount || 0), 0);
        const thisMonth = todayStr().slice(0, 7);
        const monthlyFuel = fuel.filter(f => f.date?.startsWith(thisMonth)).reduce((s, f) => s + (f.amount || 0), 0);

        return `
    <div class="page-header"><h1 class="page-title">${t('fuel')}</h1><button class="btn btn-primary" onclick="showFuelForm()">${t('addNew')}</button></div>
    <div class="dashboard-grid">
        <div class="stat-card primary"><div class="stat-label">This Month</div><div class="stat-value">${formatCurrency(monthlyFuel)}</div></div>
        <div class="stat-card warning"><div class="stat-label">Total Fuel Expenses</div><div class="stat-value">${formatCurrency(totalFuel)}</div></div>
    </div>
    <div class="card">${listSearchBox('Search fuel entries...')}<table><thead><tr><th>Date</th><th>Vehicle</th><th>Liters</th><th>Rate/L</th><th>Amount</th><th>Odometer</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        listRows(fuel.slice().reverse())
            .map(
                f => `<tr><td>${formatDate(f.date)}</td><td>${esc(f.vehicleNumber) || '-'}</td><td>${f.liters || '-'}</td><td>${formatCurrency(f.rate)}</td><td>${formatCurrency(f.amount)}</td><td>${f.odometer || '-'} km</td>
        <td><button class="action-btn delete" onclick="deleteFuel(${f.id})">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="7" style="text-align:center">${t('noData')}</td></tr>`
    }${listFooter(7)}</tbody></table></div>`;
    }
    async function showFuelForm() {
        const vehicles = await dbOps.getByCompany('vehicles');
        const today = todayStr();
        const html = `<form id="fuelForm">
    <div class="form-row">
        <div class="form-group"><label class="form-label">Date</label><input class="form-control" type="date" name="date" value="${today}" required></div>
        <div class="form-group"><label class="form-label">Vehicle *</label><select class="form-control" name="vehicleId" id="fuelVehicle" required>
            <option value="">Select Vehicle</option>${vehicles.map(v => `<option value="${v.id}">${esc(v.regNumber)}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label class="form-label">Liters</label><input class="form-control" type="number" name="liters" step="0.01" id="fuelLiters" onchange="calcFuelAmount()"></div>
        <div class="form-group"><label class="form-label">Rate per Liter</label><input class="form-control" type="number" name="rate" step="0.01" id="fuelRate" onchange="calcFuelAmount()"></div>
        <div class="form-group"><label class="form-label">Total Amount *</label><input class="form-control" type="number" name="amount" step="0.01" id="fuelAmount" required></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label class="form-label">Odometer Reading (km)</label><input class="form-control" type="number" name="odometer"></div>
        <div class="form-group"><label class="form-label">Pump/Station</label><input class="form-control" name="pump"></div>
    </div>
</form>`;
        showModal(
            'Add Fuel Expense',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveFuel()">Save</button>`
        );
    }
    function calcFuelAmount() {
        const liters = parseFloat(document.getElementById('fuelLiters').value) || 0;
        const rate = parseFloat(document.getElementById('fuelRate').value) || 0;
        document.getElementById('fuelAmount').value = (liters * rate).toFixed(2);
    }
    async function saveFuel() {
        const form = document.getElementById('fuelForm');
        const data = Object.fromEntries(new FormData(form));
        if (!data.vehicleId) {
            showToast('Select a vehicle', 'error');
            return;
        }
        if (!(parseFloat(data.amount) > 0)) {
            showToast('Enter the amount', 'error');
            return;
        }
        const v = document.getElementById('fuelVehicle');
        data.vehicleNumber = v.options[v.selectedIndex].text;
        data.vehicleId = parseInt(data.vehicleId);
        data.companyId = parseInt(currentCompanyId);
        data.liters = parseFloat(data.liters) || 0;
        data.rate = parseFloat(data.rate) || 0;
        data.amount = parseFloat(data.amount) || 0;
        data.odometer = parseFloat(data.odometer) || 0;
        await dbOps.add('fuelExpenses', data);
        closeModal();
        showToast('Fuel expense saved!');
        renderPage('fuel');
    }
    async function deleteFuel(id) {
        if (confirm('Delete?')) {
            await dbOps.delete('fuelExpenses', id);
            showToast('Deleted');
            renderPage('fuel');
        }
    }

    window.Vyapar.app.definePages('fleet', { vehicles: renderVehicles, fuel: renderFuel });
    Object.assign(window, { showVehicleForm, saveVehicle, editVehicle, deleteVehicle, showFuelForm, calcFuelAmount, saveFuel, deleteFuel });
})();
