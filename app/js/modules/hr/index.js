// HR & Payroll module: employees and simple monthly payslips. Optional; core never needs it.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Vyapar.app.register(api);
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    return {
        id: 'hr',
        version: '1.0.0',
        displayName: 'HR & Payroll',
        description: 'Employees and monthly payslips.',
        dependsOn: [],
        adds: ['Employees', 'Payslips with PF and professional tax'],
        stores: ['employees'],
        sections: [{ id: 'hr', label: 'HR', labels: { te: 'HR' }, order: 70 }],
        navItems: [
            {
                id: 'employees',
                label: 'Employees',
                labels: { te: 'ఉద్యోగులు' },
                route: 'employees',
                section: 'hr',
                order: 10,
                requires: ['hr.view'],
                newAction: 'showEmployeeForm',
                icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /> <circle cx="12" cy="7" r="4" />'
            },
            {
                id: 'payroll',
                label: 'Payroll',
                labels: { te: 'జీతాలు' },
                route: 'payroll',
                section: 'hr',
                order: 20,
                requires: ['hr.view'],
                newAction: 'showEmployeeForm',
                icon: '<rect x="2" y="7" width="20" height="14" rx="2" ry="2" /> <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />'
            }
        ],
        permissions: ['hr.view', 'hr.manage']
    };
});
