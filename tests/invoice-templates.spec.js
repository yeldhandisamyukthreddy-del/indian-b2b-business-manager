// End-to-end tests for invoice templates: preview, print, settings and PDF, in the real app.
/* global dbOps, Vyapar, InvoiceTemplates, printInvoice -- used inside page.evaluate(), which runs in the app */
const { test, expect } = require('@playwright/test');
const path = require('path');
const { htmlToPdf, pdfPageCount } = require('../scripts/invoice-pdf.js');

let pageErrors;
test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => d.accept());
});
test.afterEach(() => expect(pageErrors).toEqual([]));

const save = page => page.locator('.modal-overlay.active .modal-footer .btn-primary').click();
const nav = (page, name) => page.locator(`.nav-item[data-page="${name}"]`).click();
const toast = page => page.locator('.toast').last();
const printed = page => page.frameLocator('#printFrame').locator('body');
// The printed document's own <body>, by template class
const printedAs = (page, cls) => page.frameLocator('#printFrame').locator(`body.${cls}`);

async function createCompany(page) {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Create your company' }).click();
    const f = page.locator('#companyForm');
    await f.locator('[name=name]').fill('Sri Lakshmi Traders');
    await f.locator('[name=gstin]').fill('36AABCU9603R1ZM');
    await f.locator('[name=address]').fill('12-3, Main Road, Hyderabad');
    await save(page);
    await expect(page.locator('#currentCompanyName')).toHaveText('Sri Lakshmi Traders');
}

// A customer in Karnataka, a product, and a bank account, straight into the database
async function seedMasters(page) {
    return page.evaluate(async () => {
        const companyId = 1;
        const customerId = await dbOps.add('customers', {
            companyId,
            name: 'Bengaluru Build Mart',
            stateCode: '29',
            gstin: '29AAACB1234F1Z5',
            address: 'Peenya, Bengaluru',
            creditDays: 30,
            balance: 0
        });
        const productId = await dbOps.add('products', {
            companyId,
            name: 'Cement 50kg',
            hsn: '2523',
            gstRate: 18,
            unit: 'BAG',
            stockQty: 1000,
            salePrice: 400
        });
        await dbOps.add('bankAccounts', { companyId, bankName: 'State Bank of India', accountNo: '30123456789', ifsc: 'SBIN0001234', balance: 0 });
        return { customerId, productId };
    });
}

// A saved invoice with n lines, computed the way the app saves it
async function seedInvoice(page, { customerId, productId }, lines = 1) {
    return page.evaluate(
        async ({ customerId, productId, lines }) => {
            const items = Array.from({ length: lines }, (_, i) => ({
                productId,
                name: `Cement 50kg lot ${i + 1}`,
                hsn: '2523',
                unit: 'BAG',
                qty: 1 + (i % 5),
                rate: 400,
                gstRate: 18
            }));
            const t = Vyapar.modules.region_india_gst.gst.computeGst(items, true);
            return dbOps.add('invoices', {
                companyId: 1,
                customerId,
                customerName: 'Bengaluru Build Mart',
                customerGstin: '29AAACB1234F1Z5',
                customerState: '29',
                date: '2026-10-18',
                number: `INV-${String(lines).padStart(4, '0')}`,
                items,
                interstate: true,
                placeOfSupply: '29',
                taxable: t.taxable,
                cgst: 0,
                sgst: 0,
                igst: t.igst,
                tax: t.tax,
                roundOff: 0,
                grandTotal: t.total,
                paidAmount: 0,
                status: 'pending'
            });
        },
        { customerId, productId, lines }
    );
}

test('a new invoice with reference, e-way bill and ship-to previews, switches template and prints', async ({ page }) => {
    await createCompany(page);
    await seedMasters(page);
    await nav(page, 'invoices');
    await page.getByRole('button', { name: 'Add New', exact: true }).click();
    const form = page.locator('#invoiceForm');
    await form.locator('#invCustomer').selectOption({ label: 'Bengaluru Build Mart' });
    await page.locator('#lineProduct').selectOption({ index: 1 });
    await page.locator('#lineQty').fill('10');
    await page.getByRole('button', { name: '+ Add' }).click();
    await form.locator('summary').click();
    await form.locator('[name=referenceNumber]').fill('PO-77');
    await form.locator('[name=ewayBillNumber]').fill(' 341012345678 ');
    await form.locator('[name=shipToName]').fill('Site Office');
    await form.locator('[name=shipToAddress]').fill('Plot 9, Hosur Road');
    await save(page);
    await expect(page.locator('.modal-overlay.active')).toHaveCount(0);
    const [inv] = await page.evaluate(() => dbOps.getAll('invoices'));
    expect(inv).toMatchObject({
        referenceNumber: 'PO-77',
        shipToName: 'Site Office',
        grandTotal: 4720,
        extensions: { region_india_gst: { ewayBillNumber: '341012345678' } }
    });

    await page.locator('button[title="Print / PDF"]').first().click();
    const frame = page.frameLocator('#tplPreviewFrame');
    await expect(frame.locator('.doc-title')).toHaveText('TAX INVOICE');
    for (const text of [
        'PO-77',
        '341012345678',
        'Site Office',
        'Place of Supply:',
        'Karnataka (29)',
        '₹4,720.00',
        'Rupees Four Thousand Seven Hundred Twenty Only',
        'State Bank of India'
    ])
        await expect(frame.locator('body')).toContainText(text);

    await page.locator('#tplPreviewType').selectOption('thermal');
    await expect(frame.locator('body.tpl-thermal')).toBeVisible();
    await page.locator('.modal-footer').getByRole('button', { name: '🖨️ Print' }).click();
    await expect(printedAs(page, 'tpl-thermal')).toHaveCount(1);
    await expect(printed(page)).toContainText('INV-0001');

    // Without the desktop app, "Save as PDF" opens the print window with a hint
    await page
        .locator('.modal-footer')
        .getByRole('button', { name: /Save as PDF/ })
        .click();
    await expect(toast(page)).toContainText('Save as PDF');
});

test('template settings: toggles, columns, labels and logo show in the live preview, are saved and reach printing', async ({ page }) => {
    await createCompany(page);
    const masters = await seedMasters(page);
    const id = await seedInvoice(page, masters, 2);
    await nav(page, 'settings');
    await page.getByRole('button', { name: 'Customize invoice templates' }).click();
    await expect(page.locator('.page-title')).toHaveText('Invoice templates');
    const preview = page.frameLocator('#tplLivePreview');
    await expect(preview.locator('body')).toContainText('Due Date');
    await expect(preview.locator('table.items thead')).toContainText('HSN/SAC');

    await page.locator('[data-flag="isDueDateRequired"]').uncheck();
    await expect(preview.locator('body')).not.toContainText('Due Date');
    await page.locator('[data-column="hsnOrSac"] input').uncheck();
    await expect(preview.locator('table.items thead')).not.toContainText('HSN/SAC');
    await page.locator('[data-label="title"]').fill('BILL OF SUPPLY');
    await page.locator('[data-label="title"]').blur();
    await expect(preview.locator('.doc-title')).toHaveText('BILL OF SUPPLY');

    await page.locator('#tplLogoFile').setInputFiles(path.join(__dirname, 'fixtures', 'logo.png'));
    await expect(toast(page)).toHaveText('Logo saved');
    await expect(page.locator('.tpl-logo img')).toBeVisible();
    await expect(preview.locator('img.logo')).toBeVisible();
    await page.locator('#tplLogoFile').setInputFiles({ name: 'logo.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    await expect(toast(page)).toContainText('PNG, JPEG or WebP');

    // Saved: still there after a reload, and used when the invoice is printed
    await page.reload();
    await expect(page.locator('.page-title')).toHaveText('Dashboard'); // the app has started
    await nav(page, 'settings');
    await page.getByRole('button', { name: 'Customize invoice templates' }).click();
    await expect(page.locator('[data-flag="isDueDateRequired"]')).not.toBeChecked();
    await expect(page.locator('[data-label="title"]')).toHaveValue('BILL OF SUPPLY');
    await page.evaluate(id => printInvoice(id), id);
    await expect(printed(page).locator('.doc-title')).toHaveText('BILL OF SUPPLY');
    await expect(printed(page)).not.toContainText('Due Date');
    await expect(printed(page).locator('img.logo')).toHaveCount(1);

    // Another template becomes the default for printing
    await page.locator('#tplType').selectOption('pos_thermal');
    await page.locator('#tplMakeDefault').click();
    await expect(page.locator('.tpl-controls')).toContainText('Used when you print an invoice');
    await page.evaluate(id => printInvoice(id), id);
    await expect(printedAs(page, 'tpl-pos-thermal')).toHaveCount(1);

    const rows = await page.evaluate(() => dbOps.getAll('settings'));
    expect(rows.map(r => r.kind).sort()).toEqual(['asset', 'invoiceTemplate', 'invoiceTemplatePrefs']);
});

test('the PDF of an invoice rendered by the app is a real PDF: A4 pages and a thermal roll', async ({ page, browser }) => {
    await createCompany(page);
    const masters = await seedMasters(page);
    const small = await seedInvoice(page, masters, 3);
    const big = await seedInvoice(page, masters, 60);
    const render = (id, type) => page.evaluate(([id, type]) => InvoiceTemplates.render(id, type, { mode: 'pdf' }).catch(e => e.message), [id, type]);
    // In the browser there is no PDF engine, so mode 'pdf' says how to get one
    expect(await render(small, 'standard')).toContain('needs the desktop app');

    const html = (id, type) => page.evaluate(([id, type]) => InvoiceTemplates.render(id, type, { mode: 'print' }).then(r => r.html), [id, type]);
    const one = await htmlToPdf(browser, await html(small, 'standard'), { pageSize: 'A4' });
    expect(one.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfPageCount(one)).toBe(1);
    const many = await htmlToPdf(browser, await html(big, 'standard'), { pageSize: 'A4' });
    expect(pdfPageCount(many)).toBeGreaterThanOrEqual(2);
    const roll = await htmlToPdf(browser, await html(big, 'thermal'), { pageSize: '80mm' });
    expect(pdfPageCount(roll)).toBe(1);
    await expect(htmlToPdf(browser, '<p>not an invoice</p>')).rejects.toThrow('Nothing to print');
});

test('a saved invoice that no longer adds up shows a readable error, never a blank print', async ({ page }) => {
    await createCompany(page);
    const masters = await seedMasters(page);
    const id = await seedInvoice(page, masters, 1);
    await page.evaluate(async id => {
        const inv = await dbOps.get('invoices', id);
        await dbOps.update('invoices', { ...inv, grandTotal: 99999 });
    }, id);
    await page.evaluate(id => printInvoice(id), id);
    await expect(toast(page)).toContainText('the items add up to ₹472.00 but the saved total is ₹99,999.00');
    await expect(page.locator('#printFrame')).toHaveCount(0);
});

test('invoice templates render offline from the service worker cache', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await createCompany(page);
    const masters = await seedMasters(page);
    const id = await seedInvoice(page, masters, 2);
    await context.setOffline(true);
    await page.reload();
    for (const type of ['standard', 'compact', 'thermal', 'pos_thermal', 'excel_compact']) {
        const html = await page.evaluate(([id, type]) => InvoiceTemplates.render(id, type).then(r => r.html), [id, type]);
        expect(html).toContain('data-invoice-root');
    }
    await context.setOffline(false);
});

test('deleting a company removes its template settings and logo', async ({ page }) => {
    await createCompany(page);
    await page.evaluate(async () => {
        await InvoiceTemplates.repo.upsert(1, 'compact', { accentColor: '#112233' });
        await InvoiceTemplates.repo.setPrefs(1, { defaultTemplateType: 'compact' });
    });
    await nav(page, 'companies');
    await page.locator('button[title="Delete"], .action-btn.delete').first().click();
    await expect.poll(() => page.evaluate(() => dbOps.getAll('settings').then(r => r.length))).toBe(0);
});
