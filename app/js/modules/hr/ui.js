// HR & Payroll pages: employees and payslips. Uses the app's helpers from app/index.html.
/* global dbOps, currentCompanyId, currentPage, t, esc, formatCurrency, formatDate, todayStr, round2, amountInWords, showModal, closeModal, showToast, renderPage, printDocument, getCurrentCompany */
(function () {
    'use strict';

    async function renderEmployees() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const employees = await dbOps.getByCompany('employees');
        return `
    <div class="page-header"><h1 class="page-title">${t('employees')}</h1><button class="btn btn-primary" onclick="showEmployeeForm()">${t('addNew')}</button></div>
    <div class="card"><table><thead><tr><th>ID</th><th>${t('name')}</th><th>${t('phone')}</th><th>Designation</th><th>Salary</th><th>Joining Date</th><th>${t('actions')}</th></tr></thead>
    <tbody>${
        employees
            .map(
                e => `<tr><td>EMP-${e.id}</td><td>${esc(e.name)}</td><td>${esc(e.phone) || '-'}</td><td>${esc(e.designation) || '-'}</td><td>${formatCurrency(e.salary)}</td><td>${formatDate(e.joiningDate)}</td>
        <td><button class="action-btn edit" onclick="editEmployee(${e.id})">✏️</button><button class="action-btn view" onclick="showPayslip(${e.id})">💰</button><button class="action-btn delete" onclick="deleteEmployee(${e.id})">🗑️</button></td></tr>`
            )
            .join('') || `<tr><td colspan="7" style="text-align:center">${t('noData')}</td></tr>`
    }</tbody></table></div>`;
    }
    function showEmployeeForm(e = null) {
        const today = todayStr();
        const html = `<form id="employeeForm">
    <div class="form-row">
        <div class="form-group"><label class="form-label">${t('name')} *</label><input class="form-control" name="name" value="${esc(e?.name)}" required></div>
        <div class="form-group"><label class="form-label">${t('phone')}</label><input class="form-control" name="phone" value="${esc(e?.phone)}"></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label class="form-label">Designation</label><input class="form-control" name="designation" value="${esc(e?.designation)}"></div>
        <div class="form-group"><label class="form-label">Joining Date</label><input class="form-control" type="date" name="joiningDate" value="${e?.joiningDate || today}"></div>
    </div>
    <div class="form-row">
        <div class="form-group"><label class="form-label">Monthly Salary *</label><input class="form-control" type="number" name="salary" value="${e?.salary || ''}" required></div>
        <div class="form-group"><label class="form-label">PF Applicable?</label><select class="form-control" name="pfApplicable"><option value="yes" ${e?.pfApplicable === 'yes' ? 'selected' : ''}>Yes</option><option value="no" ${e?.pfApplicable === 'no' ? 'selected' : ''}>No</option></select></div>
    </div>
    <div class="form-group"><label class="form-label">Bank Account</label><input class="form-control" name="bankAccount" value="${esc(e?.bankAccount)}" placeholder="Account Number"></div>
    <div class="form-group"><label class="form-label">${t('address')}</label><textarea class="form-control" name="address">${esc(e?.address)}</textarea></div>
    <input type="hidden" name="id" value="${e?.id || ''}">
</form>`;
        showModal(
            e ? 'Edit Employee' : 'Add Employee',
            html,
            `<button class="btn" onclick="closeModal()">${t('cancel')}</button><button class="btn btn-primary" onclick="saveEmployee()">${t('save')}</button>`
        );
    }
    async function saveEmployee() {
        const form = document.getElementById('employeeForm');
        const data = Object.fromEntries(new FormData(form));
        data.name = (data.name || '').trim();
        if (!data.name) {
            showToast('Name is required', 'error');
            return;
        }
        data.companyId = parseInt(currentCompanyId);
        data.salary = parseFloat(data.salary) || 0;
        if (data.id) {
            data.id = parseInt(data.id);
            await dbOps.update('employees', data);
        } else {
            delete data.id;
            await dbOps.add('employees', data);
        }
        closeModal();
        showToast(t('success'));
        renderPage(currentPage === 'payroll' ? 'payroll' : 'employees');
    }
    async function editEmployee(id) {
        const e = await dbOps.get('employees', id);
        showEmployeeForm(e);
    }
    async function deleteEmployee(id) {
        if (confirm('Delete?')) {
            await dbOps.delete('employees', id);
            showToast('Deleted');
            renderPage(currentPage);
        }
    }
    // Simplified salary structure: Basic 50%, HRA 20%, DA 10%, Other 20%; PF 12% of Basic; flat professional tax.
    // Adjust to your state's PT slabs and your PF policy.
    function payslipData(e) {
        const basicPay = round2(e.salary * 0.5),
            hra = round2(e.salary * 0.2),
            da = round2(e.salary * 0.1),
            other = round2(e.salary - basicPay - hra - da);
        const pf = e.pfApplicable === 'yes' ? round2(basicPay * 0.12) : 0,
            pt = 200;
        return {
            basicPay,
            hra,
            da,
            other,
            pf,
            pt,
            netPay: round2(e.salary - pf - pt),
            month: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        };
    }
    function payslipHtml(e, company, d) {
        return `<div style="text-align:center;margin-bottom:20px"><h2>${esc(company?.name || 'Company')}</h2><p>Payslip for ${d.month}</p></div>
    <table><tr><td><strong>Employee:</strong> ${esc(e.name)}</td><td><strong>ID:</strong> EMP-${e.id}</td></tr>
    <tr><td><strong>Designation:</strong> ${esc(e.designation) || '-'}</td><td><strong>Bank A/C:</strong> ${esc(e.bankAccount) || '-'}</td></tr></table>
    <h4 style="margin-top:20px">Earnings</h4>
    <table><tr><td>Basic Pay</td><td>${formatCurrency(d.basicPay)}</td></tr><tr><td>HRA</td><td>${formatCurrency(d.hra)}</td></tr><tr><td>DA</td><td>${formatCurrency(d.da)}</td></tr><tr><td>Other Allowances</td><td>${formatCurrency(d.other)}</td></tr>
    <tr style="font-weight:bold"><td>Gross Salary</td><td>${formatCurrency(e.salary)}</td></tr></table>
    <h4 style="margin-top:20px">Deductions</h4>
    <table><tr><td>PF (12% of Basic)</td><td>${formatCurrency(d.pf)}</td></tr><tr><td>Professional Tax</td><td>${formatCurrency(d.pt)}</td></tr>
    <tr style="font-weight:bold"><td>Total Deductions</td><td>${formatCurrency(d.pf + d.pt)}</td></tr></table>
    <h3 style="text-align:right;margin-top:20px">Net Pay: ${formatCurrency(d.netPay)}</h3><p style="text-align:right">${amountInWords(d.netPay)}</p>`;
    }
    async function showPayslip(id) {
        const e = await dbOps.get('employees', id);
        if (!e) return;
        const company = await getCurrentCompany();
        showModal(
            'Payslip',
            payslipHtml(e, company, payslipData(e)),
            `<button class="btn" onclick="closeModal()">Close</button><button class="btn btn-primary" onclick="printPayslip(${e.id})">🖨️ Print</button>`
        );
    }
    async function printPayslip(id) {
        const e = await dbOps.get('employees', id);
        if (!e) return;
        const company = await getCurrentCompany();
        printDocument(`Payslip - ${e.name}`, payslipHtml(e, company, payslipData(e)));
    }

    window.Vyapar.app.definePages('hr', { employees: renderEmployees, payroll: renderEmployees });
    Object.assign(window, { showEmployeeForm, saveEmployee, editEmployee, deleteEmployee, showPayslip, printPayslip });
})();
