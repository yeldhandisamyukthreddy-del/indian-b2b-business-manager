// View-model builder: one normalized, formatted, immutable object per invoice
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildInvoiceViewModel } = require('../../app/js/invoice/view-model.js');
const { validateViewModel } = require('../../app/js/invoice/schema.js');
const { formatMoney } = require('../../app/js/money.js');
const fx = require('../fixtures/invoices.js');

const build = (inv = fx.simple, s = fx.settingsFor('standard'), locale = 'en-IN', mode = 'preview', org = fx.ORG) =>
    buildInvoiceViewModel(inv, org, s, locale, mode);
const colKeys = vm => vm.columns.map(c => c.key);
function deepFreeze(o) {
    Object.values(o).forEach(v => v && typeof v === 'object' && deepFreeze(v));
    return Object.freeze(o);
}
function isDeepFrozen(o) {
    return Object.isFrozen(o) && Object.values(o).every(v => !v || typeof v !== 'object' || isDeepFrozen(v));
}

test('simple intra-state invoice: totals, round off, paid and balance', () => {
    const vm = build();
    assert.equal(vm.header.companyName, 'Sri Lakshmi Traders');
    assert.deepEqual(vm.header.companyAddress, ['12-3, Main Road', 'Abids, Hyderabad 500001']);
    assert.equal(vm.header.title, 'TAX INVOICE');
    assert.deepEqual(vm.header.entityNumber, { sectionLabel: 'Invoice No', sectionValue: 'INV-0007' });
    assert.deepEqual(vm.header.date, { sectionLabel: 'Invoice Date', sectionValue: '18/10/2026' });
    assert.equal(vm.totals.subTotal.sectionValue, '₹5,600.13');
    assert.deepEqual(
        vm.totals.taxRows.map(r => [r.sectionLabel, r.sectionValue]),
        [
            ['CGST @ 9%', '₹144.01'],
            ['SGST @ 9%', '₹144.01'],
            ['CGST @ 14%', '₹560.00'],
            ['SGST @ 14%', '₹560.00']
        ]
    );
    assert.equal(vm.totals.roundOff.sectionValue, '-₹0.15');
    assert.equal(vm.totals.total.sectionValue, '₹7,008.00');
    assert.equal(vm.totals.paid.sectionValue, '-₹2,000.00');
    assert.equal(vm.totals.credits, null);
    assert.equal(vm.totals.balanceDue.sectionValue, '₹5,008.00');
    assert.equal(vm.totals.amountInWords, 'Rupees Seven Thousand Eight Only');
    assert.equal(vm.totals.raw.total, 700800);
    assert.equal(vm.totals.raw.balanceDue, 500800);
    assert.deepEqual(validateViewModel(vm), []);
});

test('the displayed total equals the sum of the displayed parts (raw numbers kept for tests)', () => {
    const r = build(fx.multiPage).totals.raw;
    const taxes = r.taxRows.reduce((a, t) => a + t.amount, 0);
    assert.equal(r.total, r.subTotal - r.discount + r.shipping + taxes + r.roundOff);
});

test('line items are formatted and every row has a cell for every column', () => {
    const vm = build();
    assert.deepEqual(colKeys(vm), ['index', 'name', 'hsnOrSac', 'qty', 'rate', 'amount', 'cgstPercent', 'cgstAmount', 'sgstPercent', 'sgstAmount', 'total']);
    const [, steel] = vm.lineItems;
    assert.equal(steel.index, 2);
    assert.equal(steel.qtyWithUnit, '25.5 KG');
    assert.equal(steel.rate, '62.75');
    assert.equal(steel.amount, '1,600.13');
    assert.equal(steel.taxName, 'CGST+SGST');
    assert.equal(steel.taxPercent, '18%');
    assert.equal(steel.taxAmount, '288.02');
    assert.deepEqual(
        steel.cells.map(c => c.value),
        ['2', 'TMT Bar 12mm', '7214', '25.5 KG', '62.75', '1,600.13', '9%', '144.01', '9%', '144.01', '1,888.15']
    );
    vm.lineItems.forEach(item =>
        assert.deepEqual(
            item.cells.map(c => c.key),
            colKeys(vm)
        )
    );
});

test('the discount column appears only when a line has a discount', () => {
    assert.ok(!colKeys(build()).includes('discount'));
    const vm = build(fx.multiPage);
    assert.ok(colKeys(vm).includes('discount'));
    assert.equal(vm.lineItems[0].discount, '5.03'); // 5% of 1 × 100.50
    assert.deepEqual(vm.lineItems[0].cells.find(c => c.key === 'discount').sub, ['5%']);
    assert.equal(vm.lineItems[1].discount, '');
});

test('column config hides and reorders columns, and cells follow', () => {
    const s = fx.settingsFor('standard', {
        columnConfig: [
            { key: 'name', visible: true },
            { key: 'total', visible: true },
            { key: 'qty', visible: true },
            { key: 'index', visible: false },
            { key: 'hsnOrSac', visible: false },
            { key: 'rate', visible: false },
            { key: 'amount', visible: false },
            { key: 'tax', visible: false }
        ]
    });
    const vm = build(fx.simple, s);
    assert.deepEqual(colKeys(vm), ['name', 'total', 'qty']);
    assert.deepEqual(
        vm.lineItems[0].cells.map(c => c.value),
        ['Cement 50kg', '5,120.00', '10 BAG']
    );
    assert.equal(vm.columnCount, 3);
    assert.equal(vm.fillerCells.length, 2);
});

test('inter-state invoices get IGST columns; compact templates combine tax into one column', () => {
    const vm = build(fx.indiaGst, fx.indiaGstSettings('standard'));
    assert.ok(colKeys(vm).includes('igstAmount'));
    assert.ok(!colKeys(vm).includes('cgstAmount'));
    assert.equal(vm.flags.isInterState, true);
    const compact = build(fx.indiaGst, fx.indiaGstSettings('compact'));
    assert.deepEqual(
        compact.columns.filter(c => c.key.startsWith('tax')).map(c => c.label),
        ['GST %', 'GST']
    );
});

test('India GST: GSTINs, state codes, place of supply, reverse charge and e-way bill', () => {
    const vm = build(fx.indiaGst, fx.indiaGstSettings('standard'));
    assert.deepEqual(
        vm.header.taxIdBlocks.map(b => `${b.sectionLabel}: ${b.sectionValue}`),
        ['GSTIN: 36AABCU9603R1ZM', 'State: Telangana (Code: 36)', 'PAN: AABCU9603R', 'Udyam: UDYAM-TS-02-0012345']
    );
    assert.deepEqual(
        vm.parties.billingAddress.taxIdBlocks.map(b => b.sectionValue),
        ['29AAACB1234F1Z5', 'Karnataka (Code: 29)']
    );
    assert.deepEqual(
        vm.regionBlocks.map(b => `${b.sectionLabel}: ${b.sectionValue}`),
        ['Place of Supply: Karnataka (29)', 'Reverse Charge: No']
    );
    assert.deepEqual(vm.customFieldBlocks, [{ sectionLabel: 'E-way Bill No', sectionValue: '3410 1234 5678' }]);
    assert.equal(vm.parties.customerTaxId, '29AAACB1234F1Z5');
    assert.equal(vm.parties.placeOfSupply, 'Karnataka (29)');
    assert.equal(vm.flags.isShipToRequired, true);
    assert.equal(vm.parties.shippingAddress.name, 'Bengaluru Build Mart — Site Office');
    assert.deepEqual(vm.blocks.referenceBlock, { sectionLabel: 'Reference', sectionValue: 'PO-BBM-7781' });
});

test('HSN summary groups by HSN and rate and adds up to the tax total', () => {
    const vm = build(fx.indiaGst, fx.indiaGstSettings('standard'));
    assert.equal(vm.flags.isTaxSummaryRequired, true);
    assert.deepEqual(
        vm.taxSummary.rows.map(r => r.cells[0].value),
        ['2523', '3917', '7214', '9965']
    );
    assert.equal(vm.taxSummary.totalRow.cells.at(-1).value, formatMoney(vm.totals.raw.taxTotal, { symbol: false }));
});

test('without the India module there are no GST blocks and tax columns are generic', () => {
    const s = fx.settingsFor('standard', {}, { regions: { india: false, eu: false, extraTaxId: false } });
    const vm = build(fx.indiaGst, s);
    assert.deepEqual(vm.header.taxIdBlocks, []);
    assert.deepEqual(vm.regionBlocks, []);
    assert.equal(vm.taxSummary, null);
    assert.equal(vm.flags.isTaxSummaryRequired, false);
    assert.ok(colKeys(vm).includes('taxPercent'));
});

test('EU module (stub): VAT number, EORI and the reverse-charge note', () => {
    const s = fx.settingsFor('standard', {}, { regions: { india: false, eu: true, extraTaxId: false } });
    const org = { ...fx.ORG, vatNumber: 'DE123456789', eori: 'DE1234567890123' };
    const vm = build({ ...fx.simple, reverseCharge: true, customer: { ...fx.LOCAL_BUYER, vatNumber: 'FR12345678901' } }, s, 'en-IN', 'preview', org);
    assert.deepEqual(
        vm.header.taxIdBlocks.map(b => b.sectionValue),
        ['DE123456789', 'DE1234567890123']
    );
    assert.deepEqual(vm.parties.billingAddress.taxIdBlocks, [{ sectionLabel: 'VAT No', sectionValue: 'FR12345678901' }]);
    assert.deepEqual(vm.regionNotes, ['Reverse charge: the customer accounts for the VAT.']);
});

test('field flags switch sections off; data-driven flags need the data', () => {
    const off = build(fx.simple, fx.settingsFor('standard', { fieldFlags: { isDueDateRequired: false, isSubTotalRequired: false, showNotes: false } }));
    assert.equal(off.flags.isDueDateRequired, false);
    assert.equal(off.flags.isSubTotalRequired, false);
    assert.equal(off.flags.isNotesExist, false);
    const on = build();
    assert.equal(on.flags.isDueDateRequired, true);
    assert.equal(on.flags.isShipToRequired, false, 'no ship-to address');
    assert.equal(on.flags.isReferenceNumberRequired, false, 'no reference');
    assert.equal(on.flags.isLogoExist, false, 'no logo uploaded');
    assert.equal(on.flags.isPaymentDetailsRequired, true);
    assert.equal(build(fx.simple, fx.settingsFor('standard'), 'en-IN', 'preview', { ...fx.ORG, bankAccounts: [] }).flags.isPaymentDetailsRequired, false);
    assert.equal(on.flags.isForPdf, false);
    assert.equal(build(fx.simple, fx.settingsFor('standard'), 'en-IN', 'pdf').flags.isForPdf, true);
});

test('label overrides and translations, with English as the fallback', () => {
    const renamed = build(fx.simple, fx.settingsFor('standard', { labels: { en: { title: 'BILL OF SUPPLY', billTo: 'Buyer' } } }));
    assert.equal(renamed.header.title, 'BILL OF SUPPLY');
    assert.equal(renamed.parties.billingAddress.sectionLabel, 'Buyer');
    const te = build(fx.simple, fx.settingsFor('standard'), 'te-IN');
    assert.equal(te.header.title, 'పన్ను ఇన్‌వాయిస్');
    assert.equal(te.blocks.dueDateBlock.sectionLabel, 'చెల్లింపు గడువు');
    assert.equal(te.labels.ewayBill, 'E-way Bill No', 'untranslated label falls back to English');
    assert.equal(te.meta.lang, 'te');
});

test('right-to-left languages set dir=rtl', () => {
    const vm = build(fx.simple, fx.settingsFor('standard', { labels: { ur: { title: 'ٹیکس انوائس' } } }), 'ur-IN');
    assert.equal(vm.flags.isRtl, true);
    assert.equal(vm.meta.dir, 'rtl');
    assert.equal(vm.header.title, 'ٹیکس انوائس');
    assert.equal(build().meta.dir, 'ltr');
});

test('currency formatting: symbol after the amount, and other locales', () => {
    const after = build(fx.simple, fx.settingsFor('standard', { fieldFlags: { showCurrencyAfterAmount: true } }));
    assert.equal(after.totals.total.sectionValue, '7,008.00 ₹');
    assert.equal(after.flags.showCurrencyAfterAmount, true);
    assert.equal(build(fx.simple, fx.settingsFor('standard'), 'en-US').totals.total.sectionValue, '₹7,008.00');
    assert.equal(
        build({ ...fx.simple, lines: [{ name: 'x', qty: 1, rate: 123456.78, gstRate: 0 }], paidAmount: 0, roundOff: 'none' }).totals.total.sectionValue,
        '₹1,23,456.78'
    );
});

test('status stamp: paid, partially paid and overdue', () => {
    const stamp = inv => build(inv, fx.settingsFor('standard', { fieldFlags: { isStatusStampRequired: true } })).header.statusStamp;
    assert.deepEqual(stamp({ ...fx.simple, paidAmount: 7008 }), { text: 'PAID', tone: 'paid' });
    assert.deepEqual(stamp(fx.simple), { text: 'PARTIALLY PAID', tone: 'partial' });
    assert.deepEqual(stamp({ ...fx.simple, asOfDate: '2026-12-01' }), { text: 'OVERDUE', tone: 'overdue' });
    assert.equal(stamp({ ...fx.simple, paidAmount: 0 }), null);
    assert.equal(build().flags.isStatusStampRequired, false, 'off by default');
});

test('payment terms from credit days', () => {
    assert.equal(build().blocks.paymentTermsBlock.sectionValue, 'Net 30 days');
    assert.equal(build({ ...fx.simple, creditDays: 0 }).blocks.paymentTermsBlock.sectionValue, 'Due on receipt');
    assert.equal(build({ ...fx.simple, creditDays: null }).flags.isPaymentTermsRequired, false);
});

test('logo is scaled to fit the header, keeping its shape', () => {
    const vm = build(fx.simple, fx.settingsFor('standard', {}, { logo: fx.LOGO }));
    assert.equal(vm.flags.isLogoExist, true);
    assert.deepEqual([vm.header.logo.scaledWidth, vm.header.logo.scaledHeight], [180, 60]);
    const thermal = build(fx.simple, fx.settingsFor('thermal', { pageSize: '58mm' }, { logo: fx.LOGO }));
    assert.deepEqual([thermal.header.logo.scaledWidth, thermal.header.logo.scaledHeight], [120, 40]);
    const hidden = build(fx.simple, fx.settingsFor('standard', { fieldFlags: { showLogo: false } }, { logo: fx.LOGO }));
    assert.equal(hidden.flags.isLogoExist, false);
    assert.equal(hidden.header.logo, null);
});

test('notes are sanitized; terms keep their line breaks', () => {
    const vm = build({ ...fx.simple, notes: 'ok <b>bold</b> <img src=x onerror=alert(1)>' });
    assert.equal(vm.notes.html, 'ok <b>bold</b> &lt;img src&#x3D;x onerror&#x3D;alert(1)&gt;');
    assert.match(vm.terms.html, /returned\.<br>Payment due/);
});

test('inclusive prices: flag and note', () => {
    const vm = build({ ...fx.simple, inclusive: true, lines: [{ name: 'Soap', qty: 2, rate: 59, gstRate: 18 }], paidAmount: 0, roundOff: 'none' });
    assert.equal(vm.flags.isInclusiveTax, true);
    assert.equal(vm.totals.taxIncludedNote, 'Prices include GST');
    assert.equal(vm.totals.total.sectionValue, '₹118.00');
    assert.equal(vm.lineItems[0].amount, '100.00');
});

test('thermal templates carry roll width and no fixed page height', () => {
    const vm = build(fx.simple, fx.settingsFor('thermal'));
    assert.equal(vm.meta.pageSize, '80mm');
    assert.equal(vm.meta.contentWidth, '72mm');
    assert.equal(vm.meta.pageHeight, null);
    assert.equal(vm.flags.isThermal, true);
    assert.deepEqual(colKeys(vm), ['name', 'qty', 'rate', 'total']);
});

test('zero, negative and long lines', () => {
    const long = 'Very long item name '.repeat(20).trim();
    const vm = build({
        ...fx.simple,
        paidAmount: 0,
        lines: [
            { name: long, qty: 2, rate: 100, gstRate: 18 },
            { name: 'Return adjustment', qty: -1, rate: 100, gstRate: 18 },
            { name: 'Free sample', qty: 1, rate: 0, gstRate: 0 }
        ]
    });
    assert.equal(vm.lineItems[0].name, long);
    assert.equal(vm.lineItems[1].amount, '-100.00');
    assert.equal(vm.lineItems[2].total, '0.00');
    assert.equal(vm.totals.total.sectionValue, '₹118.00');
});

test('a saved invoice whose lines do not add up to its total is refused, not printed', () => {
    const saved = {
        ...fx.simple,
        roundOff: { fixed: 0 },
        grandTotal: 9999,
        lines: [{ name: 'x', qty: 1, rate: 100, gstRate: 18, stored: { taxable: 100, tax: 18 } }]
    };
    assert.throws(() => build(saved), /INV-0007: the items add up to ₹118.00 but the saved total is ₹9,999.00/);
    assert.doesNotThrow(() => build({ ...saved, grandTotal: 118 }));
});

test('bad data is a readable error listing every problem', () => {
    assert.throws(
        () => build({ ...fx.simple, number: '', date: '18-10-2026', lines: [{ name: 'x', qty: 'ten', rate: 1, gstRate: 150 }] }),
        err =>
            err.name === 'InvoiceDataError' &&
            /number is missing/.test(err.message) &&
            /date must be/.test(err.message) &&
            /lines\[0\].qty must be a number/.test(err.message) &&
            /gstRate must be 0-100/.test(err.message)
    );
    assert.throws(() => build({ ...fx.simple, lines: [] }), /the invoice has no items/);
    assert.throws(() => build(fx.simple, fx.settingsFor('standard'), 'en-IN', 'fax'), /mode must be preview, print or pdf/);
});

test('the result is deeply frozen and the input is never mutated', () => {
    const input = deepFreeze(structuredClone(fx.indiaGst));
    const vm = build(input, fx.indiaGstSettings('standard'));
    assert.ok(isDeepFrozen(vm));
    assert.deepEqual(input, fx.indiaGst);
});

test('validateViewModel catches a row that does not line up with the columns', () => {
    const vm = structuredClone(build());
    vm.lineItems[0].cells.pop();
    assert.match(validateViewModel(vm).join(), /lineItems\[0\] cells/);
});
