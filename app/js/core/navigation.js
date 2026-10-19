// Core navigation: the sections and pages that are always there (what is needed to invoice and get paid).
// Modules add their own pages and sections through their manifests (navItems, sections);
// platform/ui-shell.js merges both into the sidebar.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).navigation = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    // i18n: key in the app's translation table; label: English fallback
    const SECTIONS = Object.freeze([
        { id: 'masters', i18n: 'masters', label: 'Masters', order: 10 },
        { id: 'sales', i18n: 'sales', label: 'Sales', order: 20 },
        { id: 'money', i18n: 'moneySection', label: 'Payments', order: 50 },
        { id: 'reports', i18n: 'reports', label: 'Reports', order: 90 },
        { id: 'settings', i18n: 'settings', label: 'Settings', order: 100 }
    ]);
    const ITEMS = Object.freeze([
        {
            route: 'dashboard',
            i18n: 'dashboard',
            label: 'Dashboard',
            section: 'main',
            order: 10,
            icon: '<rect x="3" y="3" width="7" height="7" /> <rect x="14" y="3" width="7" height="7" /> <rect x="14" y="14" width="7" height="7" /> <rect x="3" y="14" width="7" height="7" />'
        },
        {
            route: 'companies',
            i18n: 'companies',
            label: 'Companies',
            section: 'masters',
            order: 10,
            icon: '<path d="M3 21h18M3 7v14m18-14v14M6 11h4m-4 4h4m6-4h4m-4 4h4M9 7V3h6v4" />'
        },
        {
            route: 'customers',
            i18n: 'customers',
            label: 'Customers',
            section: 'masters',
            order: 20,
            icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /> <circle cx="9" cy="7" r="4" /> <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />'
        },
        {
            route: 'vendors',
            i18n: 'vendors',
            label: 'Vendors',
            section: 'masters',
            order: 30,
            icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <circle cx="9" cy="7" r="4" /> <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />'
        },
        {
            route: 'products',
            i18n: 'products',
            label: 'Products',
            section: 'masters',
            order: 40,
            icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />'
        },
        {
            route: 'quotations',
            i18n: 'quotations',
            label: 'Quotations',
            section: 'sales',
            order: 10,
            icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /> <path d="M14 2v6h6M16 13H8m8 4H8m2-8H8" />'
        },
        {
            route: 'invoices',
            i18n: 'invoices',
            label: 'Tax Invoices',
            section: 'sales',
            order: 40,
            icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /> <path d="M14 2v6h6M9 15h6M9 11h6" />'
        },
        {
            route: 'sales-returns',
            i18n: 'salesReturns',
            label: 'Sales Returns',
            section: 'sales',
            order: 50,
            icon: '<path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6M3 10l6-6" />'
        },
        {
            route: 'receipts',
            i18n: 'receipts',
            label: 'Receipts',
            section: 'money',
            order: 10,
            icon: '<line x1="12" y1="1" x2="12" y2="23" /> <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />'
        },
        {
            route: 'banking',
            i18n: 'banking',
            label: 'Banking',
            section: 'money',
            order: 30,
            icon: '<path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11m16-11v11M8 14v3m4-3v3m4-3v3" />'
        },
        {
            route: 'reports',
            i18n: 'allReports',
            label: 'All Reports',
            section: 'reports',
            order: 10,
            icon: '<line x1="18" y1="20" x2="18" y2="10" /> <line x1="12" y1="20" x2="12" y2="4" /> <line x1="6" y1="20" x2="6" y2="14" />'
        },
        {
            route: 'settings',
            i18n: 'settings',
            label: 'Settings',
            section: 'settings',
            order: 10,
            icon: '<circle cx="12" cy="12" r="3" /> <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />'
        },
        {
            route: 'price-lists',
            i18n: 'priceLists',
            label: 'Price Lists',
            section: 'masters',
            order: 45,
            icon: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />'
        },
        {
            route: 'recurring-invoices',
            i18n: 'recurringInvoices',
            label: 'Recurring Invoices',
            section: 'sales',
            order: 45,
            icon: '<polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />'
        },
        {
            route: 'expenses',
            i18n: 'expenses',
            label: 'Expenses',
            section: 'money',
            order: 25,
            icon: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" />'
        },
        {
            route: 'features',
            i18n: 'features',
            label: 'Features & Editions',
            section: 'settings',
            order: 20,
            icon: '<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M17.5 14v7M14 17.5h7" />'
        }
    ]);
    return { SECTIONS, ITEMS };
});
