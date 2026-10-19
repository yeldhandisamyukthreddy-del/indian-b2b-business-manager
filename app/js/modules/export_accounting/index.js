// Export for your accountant (stub): the accounting module's journal as a CSV of vouchers, one row per line,
// which spreadsheet users and most accounting tools can import. Needs the accounting module.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.Vyapar.app.register(api);
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return {
        id: 'export_accounting',
        version: '0.1.0',
        displayName: 'Export for Accountant (preview)',
        description: 'Preview: download the journal as a CSV of vouchers for your accountant. Tally XML is planned.',
        dependsOn: ['accounting'],
        adds: ['Journal export (CSV) for a date range'],
        navItems: [
            {
                id: 'export-books',
                label: 'Export for Accountant',
                labels: { te: 'అకౌంటెంట్‌కు ఎగుమతి' },
                route: 'export-books',
                section: 'accounting',
                order: 90,
                requires: ['accounting.view'],
                icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /> <polyline points="7 10 12 15 17 10" /> <line x1="12" y1="15" x2="12" y2="3" />'
            }
        ],
        permissions: ['accounting.export']
    };
});
