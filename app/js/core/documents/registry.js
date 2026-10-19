// Invoice template registry: the only place a template type becomes a file path.
// Renderers resolve templates through getTemplate(type), so a path is never built from user input.
// To add a template: add an entry here and its file under app/templates/invoices/ (see docs/invoice-templates.md).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).registry = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PARTIALS = Object.freeze({
        styles_base: 'templates/partial/styles_base.mustache',
        styles_thermal: 'templates/partial/styles_thermal.mustache',
        header: 'templates/partial/header.mustache',
        header_other_pages: 'templates/partial/header_other_pages.mustache',
        subject_block: 'templates/partial/subject_block.mustache',
        line_item_table: 'templates/partial/line_item_table.mustache',
        subtotal_block: 'templates/partial/subtotal_block.mustache',
        tax_summary: 'templates/partial/tax_summary.mustache',
        payment_details: 'templates/partial/payment_details.mustache',
        payment_stub: 'templates/partial/payment_stub.mustache',
        notes_terms: 'templates/partial/notes_terms.mustache',
        footer: 'templates/partial/footer.mustache'
    });

    // Paper sizes. Thermal rolls have a fixed width and grow with the content.
    const PAGE_SIZES = Object.freeze({
        A4: { label: 'A4', width: '210mm', height: '297mm', margin: '12mm', thermal: false },
        Letter: { label: 'Letter', width: '8.5in', height: '11in', margin: '0.5in', thermal: false },
        '80mm': { label: '80 mm roll', width: '80mm', height: null, margin: '0', contentWidth: '72mm', thermal: true },
        '58mm': { label: '58 mm roll', width: '58mm', height: null, margin: '0', contentWidth: '48mm', thermal: true }
    });

    const PAGE = [
        'styles_base',
        'header',
        'header_other_pages',
        'subject_block',
        'line_item_table',
        'subtotal_block',
        'tax_summary',
        'payment_details',
        'notes_terms',
        'payment_stub',
        'footer'
    ];
    const ROLL = ['styles_base', 'styles_thermal', 'header', 'subject_block', 'line_item_table', 'subtotal_block', 'tax_summary', 'notes_terms', 'footer'];

    // taxColumns: how the tax column expands. split = CGST/SGST (or IGST) rate and amount columns,
    // combined = one GST % and one tax column, none = no tax column (the tax summary carries it).
    const TEMPLATES = Object.freeze({
        standard: {
            label: 'Standard (A4)',
            templatePath: 'templates/invoices/standard.mustache',
            partials: PAGE,
            pageSizes: ['A4', 'Letter'],
            supportsPdf: true,
            taxColumns: 'split',
            defaults: { fieldFlags: {}, columns: ['index', 'name', 'hsnOrSac', 'qty', 'rate', 'discount', 'amount', 'tax', 'total'], hiddenColumns: [] }
        },
        compact: {
            label: 'Compact (A4, fewer columns)',
            templatePath: 'templates/invoices/compact.mustache',
            partials: PAGE,
            pageSizes: ['A4', 'Letter'],
            supportsPdf: true,
            taxColumns: 'combined',
            defaults: {
                fieldFlags: { isTaxSummaryRequired: false },
                columns: ['index', 'name', 'hsnOrSac', 'qty', 'rate', 'discount', 'amount', 'tax', 'total'],
                hiddenColumns: ['discount']
            }
        },
        thermal: {
            label: 'Thermal receipt (tax invoice)',
            templatePath: 'templates/invoices/thermal.mustache',
            partials: ROLL,
            pageSizes: ['80mm', '58mm'],
            supportsPdf: true,
            taxColumns: 'none',
            defaults: {
                fieldFlags: {
                    isShipToRequired: false,
                    isPaymentDetailsRequired: false,
                    isPaymentStubRequired: false,
                    isSignatureRequired: false,
                    isTimeRequired: true,
                    isDueDateRequired: false,
                    isPaymentTermsRequired: false
                },
                columns: ['index', 'name', 'hsnOrSac', 'qty', 'rate', 'discount', 'amount', 'tax', 'total'],
                hiddenColumns: ['index', 'hsnOrSac', 'discount', 'amount', 'tax']
            }
        },
        pos_thermal: {
            label: 'POS receipt (retail counter)',
            templatePath: 'templates/invoices/pos_thermal.mustache',
            partials: ROLL,
            pageSizes: ['80mm', '58mm'],
            supportsPdf: true,
            taxColumns: 'none',
            defaults: {
                fieldFlags: {
                    isBillToRequired: false,
                    isShipToRequired: false,
                    isDueDateRequired: false,
                    isPaymentTermsRequired: false,
                    isPaymentDetailsRequired: false,
                    isPaymentStubRequired: false,
                    isSignatureRequired: false,
                    isTermsAndConditionsRequired: false,
                    isBalanceDueRequired: false,
                    isAmountInWordsRequired: false,
                    isTaxSummaryRequired: false,
                    isTimeRequired: true
                },
                columns: ['index', 'name', 'hsnOrSac', 'qty', 'rate', 'discount', 'amount', 'tax', 'total'],
                hiddenColumns: ['index', 'hsnOrSac', 'rate', 'discount', 'amount', 'tax']
            }
        },
        excel_compact: {
            label: 'Spreadsheet (flat table)',
            templatePath: 'templates/invoices/excel_compact.mustache',
            partials: ['styles_base'],
            pageSizes: ['A4', 'Letter'],
            supportsPdf: true,
            taxColumns: 'combined',
            defaults: {
                fieldFlags: { isPaymentStubRequired: false, isStatusStampRequired: false },
                columns: ['index', 'name', 'hsnOrSac', 'qty', 'rate', 'discount', 'amount', 'tax', 'total'],
                hiddenColumns: []
            }
        }
    });

    const own = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
    const templateTypes = () => Object.keys(TEMPLATES);
    const isTemplateType = type => own(TEMPLATES, type);

    function getTemplate(type) {
        if (!isTemplateType(type)) throw new Error(`Unknown invoice template "${String(type).slice(0, 40)}". Choose one of: ${templateTypes().join(', ')}`);
        return TEMPLATES[type];
    }
    function partialPath(name) {
        if (!own(PARTIALS, name)) throw new Error(`Unknown partial "${String(name).slice(0, 40)}"`);
        return PARTIALS[name];
    }
    function getPageSize(type, size) {
        const t = getTemplate(type);
        const key = t.pageSizes.includes(size) ? size : t.pageSizes[0];
        return { key, ...PAGE_SIZES[key] };
    }

    return { TEMPLATES, PARTIALS, PAGE_SIZES, templateTypes, isTemplateType, getTemplate, partialPath, getPageSize };
});
