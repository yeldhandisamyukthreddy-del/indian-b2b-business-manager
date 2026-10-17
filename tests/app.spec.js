// End-to-end tests for VyaparEasy. Each test starts with an empty database (fresh browser context).
const { test, expect } = require('@playwright/test');
const fs = require('fs');

let pageErrors;
test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => d.accept());
});
test.afterEach(() => expect(pageErrors).toEqual([]));

// ---------- helpers ----------
const db = (page, store) => page.evaluate(s => dbOps.getAll(s), store);
const save = page => page.locator('.modal-overlay.active .modal-footer .btn-primary').click();
// Save and wait until the form closed (the save finished)
async function saved(page) {
    await save(page);
    await expect(page.locator('.modal-overlay.active')).toHaveCount(0);
}
const nav = (page, name) => page.locator(`.nav-item[data-page="${name}"]`).click();
async function addNew(page) {
    await page.getByRole('button', { name: 'Add New', exact: true }).click();
    await expect(page.locator('.modal-overlay.active')).toBeVisible();
}

async function selectByText(select, text) {
    const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
    await select.selectOption(value);
}
async function createCompany(page) {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Create your company' }).click();
    const f = page.locator('#companyForm');
    await f.locator('[name=name]').fill('Sri Lakshmi Traders');
    await f.locator('[name=gstin]').fill('36aabcu9603r1zm'); // lower case is normalised and fills the state
    await expect(f.locator('[name=stateCode]')).toHaveValue('36');
    await f.locator('[name=address]').fill('12-3, Main Road, Hyderabad');
    await saved(page);
    await expect(page.locator('#currentCompanyName')).toHaveText('Sri Lakshmi Traders');
}
async function addParty(page, page_, { name, gstin, state }) {
    await nav(page, page_);
    await addNew(page);
    const f = page.locator(page_ === 'customers' ? '#customerForm' : '#vendorForm');
    await f.locator('[name=name]').fill(name);
    if (gstin) await f.locator('[name=gstin]').fill(gstin);
    if (state) await f.locator('[name=stateCode]').selectOption(state);
    await saved(page);
}
async function addProduct(page) {
    await nav(page, 'products');
    await addNew(page);
    const f = page.locator('#productForm');
    await f.locator('[name=name]').fill('Cement 50kg');
    await f.locator('[name=hsn]').fill('2523');
    await f.locator('[name=gstRate]').selectOption('18');
    await f.locator('[name=unit]').selectOption('BAG');
    await f.locator('[name=stockQty]').fill('100');
    await f.locator('[name=purchasePrice]').fill('350');
    await f.locator('[name=salePrice]').fill('400');
    await saved(page);
    await expect(page.locator('#prodTable')).toContainText('Cement 50kg');
}
async function addLine(page, product, qty, rate) {
    await selectByText(page.locator('#lineProduct'), product);
    await page.locator('#lineQty').fill(String(qty));
    if (rate !== undefined) await page.locator('#lineRate').fill(String(rate));
    await page.getByRole('button', { name: '+ Add' }).click();
}
async function createInvoice(page, customer, qty) {
    await nav(page, 'invoices');
    await addNew(page);
    await selectByText(page.locator('#invCustomer'), customer);
    await addLine(page, 'Cement 50kg', qty);
    await saved(page);
}
// Wait for a specific modal (the previous one may still be fading out)
const expectModal = (page, title) => expect(page.locator('.modal-overlay.active .modal-title')).toContainText(title);
const rowOf = (page, table, text) => page.locator(`${table} tbody tr`, { hasText: text });

// ---------- tests ----------
test('first run shows onboarding and every page renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.page-title')).toHaveText('Welcome to VyaparEasy');
    await createCompany(page);
    const pages = await page.locator('.nav-item').evaluateAll(els => els.map(e => e.dataset.page));
    for (const p of pages) {
        await nav(page, p);
        await expect(page.locator('#pageContent')).not.toBeEmpty();
    }
});

test('GSTIN must match the selected state', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Create your company' }).click();
    const f = page.locator('#companyForm');
    await f.locator('[name=name]').fill('Test Co');
    await f.locator('[name=gstin]').fill('36AABCU9603R1ZM');
    await f.locator('[name=stateCode]').selectOption('29');
    await save(page);
    await expect(page.locator('.toast.error')).toContainText('does not match');
    expect(await db(page, 'companies')).toHaveLength(0);
});

test('sales, receipts, purchases, returns and GST are calculated correctly', async ({ page }) => {
    await createCompany(page);
    const trickyName = `Ravi's "Best" Traders <b>`;
    await addParty(page, 'customers', { name: trickyName, gstin: '36AAACR5055K1ZQ' });
    await addParty(page, 'customers', { name: 'Bengaluru Builders', gstin: '29AAACB1234F1Z5' });
    // Names are shown as text, never interpreted as HTML
    await expect(rowOf(page, '#custTable', 'Bengaluru').locator('td').nth(3)).toHaveText('Karnataka');
    await nav(page, 'customers');
    await expect(rowOf(page, '#custTable', 'Ravi').locator('td').first()).toHaveText(trickyName);
    await addProduct(page);

    // Intra-state sale: CGST + SGST
    await nav(page, 'invoices');
    await addNew(page);
    await selectByText(page.locator('#invCustomer'), 'Ravi');
    await addLine(page, 'Cement 50kg', 5);
    await expect(page.locator('#lineTotals')).toContainText('CGST: ₹180.00');
    await expect(page.locator('#lineTotals')).toContainText('Grand Total: ₹2,360.00');
    await saved(page);
    // Inter-state sale with a fractional quantity: IGST
    await createInvoice(page, 'Bengaluru', 2.5);

    let invoices = await db(page, 'invoices');
    expect(invoices.map(i => i.number)).toEqual(['INV-0001', 'INV-0002']);
    expect(invoices[0]).toMatchObject({ taxable: 2000, cgst: 180, sgst: 180, igst: 0, grandTotal: 2360, placeOfSupply: '36' });
    expect(invoices[1]).toMatchObject({ taxable: 1000, cgst: 0, sgst: 0, igst: 180, grandTotal: 1180, placeOfSupply: '29' });
    expect((await db(page, 'products'))[0].stockQty).toBe(92.5);

    // Full payment from the invoice list marks it paid
    await rowOf(page, '#invTable', 'INV-0001').locator('button[title="Record payment"]').click();
    await expectModal(page, 'New Receipt');
    await expect(page.locator('#moneyForm [name=amount]')).toHaveValue('2360');
    await saved(page);
    // Partial payment on the second invoice
    await nav(page, 'invoices');
    await rowOf(page, '#invTable', 'INV-0002').locator('button[title="Record payment"]').click();
    await expectModal(page, 'New Receipt');
    await expect(page.locator('#moneyForm [name=amount]')).toHaveValue('1180');
    await page.locator('#moneyForm [name=amount]').fill('500');
    await saved(page);
    await nav(page, 'invoices');
    await expect(rowOf(page, '#invTable', 'INV-0001')).toContainText('Paid');
    await expect(rowOf(page, '#invTable', 'INV-0002')).toContainText('Partial');
    let customers = await db(page, 'customers');
    expect(customers.map(c => c.balance)).toEqual([0, 680]);

    // Direct purchase bill (no PO) and payment
    await addParty(page, 'vendors', { name: 'Ultra Cement Ltd', gstin: '36AAACU1234A1Z5' });
    await nav(page, 'purchase-bills');
    await addNew(page);
    await page.locator('#billForm [name=vendorInvoiceNo]').fill('UC/889');
    await selectByText(page.locator('#billVendor'), 'Ultra');
    await addLine(page, 'Cement 50kg', 20, 350);
    await saved(page);
    const [bill] = await db(page, 'purchaseBills');
    expect(bill).toMatchObject({ number: 'BILL-0001', vendorInvoiceNo: 'UC/889', taxable: 7000, cgst: 630, sgst: 630, grandTotal: 8260, status: 'pending' });
    expect((await db(page, 'products'))[0].stockQty).toBe(112.5);
    await page.locator('button[title="Record payment"]').first().click();
    await expectModal(page, 'New Payment');
    await saved(page);
    expect((await db(page, 'purchaseBills'))[0].status).toBe('paid');
    expect((await db(page, 'vendors'))[0].balance).toBe(0);

    // Credit note on the inter-state invoice keeps IGST
    await nav(page, 'sales-returns');
    await addNew(page);
    await selectByText(page.locator('#returnForm [name=srcId]'), 'INV-0002');
    await page.locator('#retQty0').fill('0.5');
    await saved(page);
    const [cn] = await db(page, 'salesReturns');
    expect(cn).toMatchObject({ number: 'CN-0001', taxable: 200, igst: 36, grandTotal: 236 });
    expect((await db(page, 'products'))[0].stockQty).toBe(113);
    customers = await db(page, 'customers');
    expect(customers[1].balance).toBe(444);
    invoices = await db(page, 'invoices');
    expect(invoices[1]).toMatchObject({ paidAmount: 500, creditedAmount: 236 });

    // GST summary for the month
    await nav(page, 'gst-reports');
    await page.getByRole('button', { name: '📊 Generate GST Report' }).click();
    await expect(page.locator('#gstReportResults')).toContainText('GSTR-3B Summary');
    const g = await page.evaluate(() => gstData(...periodRange('thisMonth')));
    expect(g.out).toEqual({ taxable: 2800, cgst: 180, sgst: 180, igst: 144 });
    expect(g.itc).toEqual({ taxable: 7000, cgst: 630, sgst: 630, igst: 0 });
    expect(g.invoices.map(i => i.type)).toEqual(['B2B', 'B2B']);

    // Printed tax invoice has the GST details
    await page.evaluate(id => printInvoice(id), invoices[1].id);
    const printed = page.frameLocator('#printFrame').locator('body');
    await expect(printed).toContainText('TAX INVOICE');
    await expect(printed).toContainText('Place of Supply: Karnataka (29)');
    await expect(printed).toContainText('IGST');
    await expect(printed).toContainText('Rupees One Thousand One Hundred Eighty Only');
    await expect(printed).toContainText('29AAACB1234F1Z5');

    // Ledger closing balance matches the customer balance
    const ledger = await page.evaluate(id => ledgerEntries('customer', id), customers[1].id);
    expect(ledger.entries.at(-1).balance).toBe(444);
    expect(ledger.opening).toBe(0);
});

test('cancelling an invoice edit does not overwrite it later', async ({ page }) => {
    await createCompany(page);
    await addParty(page, 'customers', { name: 'Anil Stores' });
    await addProduct(page);
    await createInvoice(page, 'Anil', 1);
    await rowOf(page, '#invTable', 'INV-0001').locator('button[title="Edit"]').click();
    await expectModal(page, 'Edit Invoice INV-0001');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.modal-overlay.active')).toHaveCount(0);
    await createInvoice(page, 'Anil', 3);
    let invoices = await db(page, 'invoices');
    expect(invoices.map(i => [i.number, i.items[0].qty])).toEqual([['INV-0001', 1], ['INV-0002', 3]]);

    // A real edit updates totals, stock and balance without creating a new invoice
    await rowOf(page, '#invTable', 'INV-0001').locator('button[title="Edit"]').click();
    await expectModal(page, 'Edit Invoice INV-0001');
    await page.locator('.modal-overlay.active #lineItemsTable button').first().click();
    await addLine(page, 'Cement 50kg', 2);
    await saved(page);
    invoices = await db(page, 'invoices');
    expect(invoices).toHaveLength(2);
    expect(invoices[0]).toMatchObject({ number: 'INV-0001', grandTotal: 944 });
    expect((await db(page, 'products'))[0].stockQty).toBe(95);
    expect((await db(page, 'customers'))[0].balance).toBe(944 + 1416);
});

test('dates follow Indian time just after midnight', async ({ page }) => {
    // 01:30 IST on 1 April is still 31 March in UTC
    await page.clock.install({ time: new Date('2026-04-01T01:30:00+05:30') });
    await page.goto('/');
    expect(await page.evaluate(() => todayStr())).toBe('2026-04-01');
    expect(await page.evaluate(() => periodRange('thisMonth'))).toEqual(['2026-04-01', '2026-04-30']);
    expect(await page.evaluate(() => periodRange('thisYear'))).toEqual(['2026-04-01', '2027-03-31']);
    expect(await page.evaluate(() => periodRange('lastQuarter'))).toEqual(['2026-01-01', '2026-03-31']);
    expect(await page.evaluate(() => getDueDate('2026-03-15', 30))).toBe('2026-04-14');
});

test('amount in words uses the Indian numbering system', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => amountInWords(12345678.5))).toBe('Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only');
    expect(await page.evaluate(() => amountInWords(100000))).toBe('Rupees One Lakh Only');
});

test('backup and restore round-trip', async ({ page }, testInfo) => {
    await createCompany(page);
    await addParty(page, 'customers', { name: 'Anil Stores' });
    await nav(page, 'settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📥 Backup All Data' }).click()]);
    const file = testInfo.outputPath('backup.json');
    await download.saveAs(file);
    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(backup.companies).toHaveLength(1);
    expect(backup.customers).toHaveLength(1);

    // Deleting the company removes its records too
    await nav(page, 'companies');
    await page.locator('#pageContent .action-btn.delete').first().click();
    await expect(page.locator('#currentCompanyName')).toHaveText('Select Company');
    expect(await db(page, 'customers')).toHaveLength(0);

    // A broken file is rejected without touching data
    await nav(page, 'settings');
    await page.locator('#restoreFile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
    await expect(page.locator('.toast.error')).toContainText('not a valid backup');

    await page.locator('#restoreFile').setInputFiles(file);
    await page.waitForEvent('load');
    await expect(page.locator('#currentCompanyName')).toHaveText('Sri Lakshmi Traders');
    expect(await db(page, 'companies')).toHaveLength(1);
    expect(await db(page, 'customers')).toHaveLength(1);
});

test('data saved by the previous version keeps working', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.page-title')).toHaveText('Welcome to VyaparEasy');
    // Records shaped like the old app stored them: no CGST/SGST/IGST split, timestamp-based numbers
    await page.evaluate(async () => {
        const companyId = await dbOps.add('companies', { name: 'Old Co', gstin: '36AABCU9603R1ZM', stateCode: '36', stateName: 'Telangana', address: 'Hyd' });
        const customerId = await dbOps.add('customers', { companyId, name: 'Karnataka Buyer', stateCode: '29', gstin: '29AAACB1234F1Z5', creditLimit: 0, creditDays: 30, balance: 1080 }); // 1180 invoiced - 100 received
        const productId = await dbOps.add('products', { companyId, name: 'Steel Rod', hsn: '7214', gstRate: 18, unit: 'KG', stockQty: 50, purchasePrice: 80, salePrice: 100 });
        await dbOps.add('invoices', { companyId, customerId, customerName: 'Karnataka Buyer', date: todayStr(), number: 'INV-0001', status: 'pending', paidAmount: 0,
            items: [{ productId, name: 'Steel Rod', hsn: '7214', unit: 'KG', qty: 10, rate: 100, taxable: 1000, gstRate: 18, tax: 180, total: 1180 }], taxable: 1000, tax: 180, grandTotal: 1180 });
        await dbOps.add('receipts', { companyId, customerId, customerName: 'Karnataka Buyer', date: todayStr(), amount: 100, mode: 'Cash', number: 'RCP-482913' });
        await dbOps.add('purchaseReturns', { companyId, billId: 99, vendorName: 'Gone Vendor', grandTotal: 50, number: 'DN-123456', date: todayStr() });
        localStorage.setItem('vyaparSettings', JSON.stringify({ invPrefix: 'INV-', invCounter: 2 }));
    });
    await page.reload();
    await expect(page.locator('#currentCompanyName')).toHaveText('Old Co');
    for (const p of await page.locator('.nav-item').evaluateAll(els => els.map(e => e.dataset.page))) await nav(page, p);

    const g = await page.evaluate(() => gstData(...periodRange('thisMonth')));
    expect(g.out).toEqual({ taxable: 1000, cgst: 0, sgst: 0, igst: 180 });
    await page.evaluate(() => printInvoice(1));
    await expect(page.frameLocator('#printFrame').locator('body')).toContainText('IGST');

    // New documents continue the old series and old invoices can be paid
    await nav(page, 'receipts');
    await addNew(page);
    await page.locator('#moneyForm [name=partyId]').selectOption({ index: 1 });
    await page.locator('#moneyForm [name=amount]').fill('1080');
    await saved(page);
    const [inv] = await db(page, 'invoices');
    expect(inv.status).toBe('paid');
    expect((await db(page, 'customers'))[0].balance).toBe(0);
    expect(await page.evaluate(() => getNextNumber('invoice'))).toBe('INV-0002');
});

test('web app installs and works offline', async ({ page, context }) => {
    await page.goto('/');
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest.icons.map(i => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
    // Wait until the service worker controls the page and has cached the app
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await createCompany(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#currentCompanyName')).toHaveText('Sri Lakshmi Traders');
    expect(await page.evaluate(() => document.fonts.check('16px "Plus Jakarta Sans"'))).toBe(true);
    await context.setOffline(false);
});

test('every report generates, prints and exports', async ({ page }) => {
    await createCompany(page);
    await addParty(page, 'customers', { name: 'Anil Stores' });
    await addProduct(page);
    await createInvoice(page, 'Anil', 2);
    await nav(page, 'reports');
    await expect(page.locator('#rptType')).toBeVisible();
    const types = await page.locator('#rptType option').evaluateAll(o => o.map(x => x.value));
    expect(types.length).toBeGreaterThanOrEqual(10);
    for (const type of types) {
        await page.locator('#rptType').selectOption(type);
        await page.getByRole('button', { name: '📊 Generate Report' }).click();
        await expect(page.locator('#reportResults')).toBeVisible();
        await page.getByRole('button', { name: '🖨️ Print' }).click();
        await expect(page.frameLocator('#printFrame').locator('body')).not.toBeEmpty();
    }
    await page.locator('#rptType').selectOption('sales');
    await page.getByRole('button', { name: '📊 Generate Report' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '📥 Export CSV' }).click()]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    expect(csv).toContain('"INV-0001"');
    expect(csv).toContain('"Anil Stores"');
});

test('quotation to order to challan to invoice, and every document prints', async ({ page }) => {
    await createCompany(page);
    await addParty(page, 'customers', { name: 'Anil Stores' });
    await addParty(page, 'vendors', { name: 'Ultra Cement Ltd' });
    await addProduct(page);
    const printed = page.frameLocator('#printFrame').locator('body');

    await nav(page, 'quotations');
    await addNew(page);
    await selectByText(page.locator('#quoteCustomer'), 'Anil');
    await addLine(page, 'Cement 50kg', 10);
    await saved(page);
    await page.locator('button[title="Print / PDF"]').first().click();
    await expect(printed).toContainText('QUOTATION');
    await page.locator('button[title="Convert to Sales Order"]').click();
    await expect(page.locator('.page-title')).toHaveText('Sales Orders');
    await page.locator('button[title="Print"]').first().click();
    await expect(printed).toContainText('SALES ORDER');
    await page.locator('button[title="Create Delivery Challan"]').click();
    await expect(page.locator('.page-title')).toHaveText('Delivery Challans');
    await page.locator('button[title="Print"]').first().click();
    await expect(printed).toContainText('DELIVERY CHALLAN');
    await nav(page, 'sales-orders');
    await page.locator('button[title="Create Invoice"]').click();
    await expect(page.locator('.page-title')).toHaveText('Tax Invoices');
    const [inv] = await db(page, 'invoices');
    expect(inv).toMatchObject({ number: 'INV-0001', salesOrderNumber: 'SO-0001', grandTotal: 4720, cgst: 360 });
    expect((await db(page, 'products'))[0].stockQty).toBe(90);

    await nav(page, 'purchase-orders');
    await addNew(page);
    await selectByText(page.locator('#poVendor'), 'Ultra');
    await addLine(page, 'Cement 50kg', 5);
    await saved(page);
    await page.locator('button[title="Print"]').first().click();
    await expect(printed).toContainText('PURCHASE ORDER');
    await page.locator('button[title="Record purchase bill"]').click();
    await expectModal(page, 'Record Purchase Bill');
    await page.locator('#billForm [name=vendorInvoiceNo]').fill('V-1');
    await saved(page);
    expect((await db(page, 'purchaseOrders'))[0].status).toBe('received');

    await nav(page, 'employees');
    await addNew(page);
    await page.locator('#employeeForm [name=name]').fill(`D'Souza "Joe"`);
    await page.locator('#employeeForm [name=salary]').fill('30000');
    await saved(page);
    await page.locator('button.action-btn.view').first().click();
    await page.getByRole('button', { name: '🖨️ Print' }).click();
    await expect(printed).toContainText(`D'Souza "Joe"`);
    await expect(printed).toContainText('Net Pay');
});

test('long lists show 200 rows and search finds the rest', async ({ page }) => {
    await createCompany(page);
    await page.evaluate(async () => {
        for (let i = 1; i <= 250; i++) await dbOps.add('customers', { companyId: parseInt(currentCompanyId), name: `Customer ${String(i).padStart(3, '0')}`, stateCode: '36', balance: 0 });
    });
    await nav(page, 'customers');
    await expect(page.locator('#custTable tbody')).toContainText('Showing 200 of 250');
    await page.locator('#listSearch').fill('Customer 249');
    await expect(page.locator('#custTable tbody tr')).toHaveCount(1);
    await expect(page.locator('#listSearch')).toBeFocused();
    await page.locator('#listSearch').fill('');
    await page.getByRole('button', { name: 'Show all' }).click();
    await expect(page.locator('#custTable tbody tr')).toHaveCount(250);
});
