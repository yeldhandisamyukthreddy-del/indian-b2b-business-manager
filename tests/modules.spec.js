// End-to-end tests for editions and modules, and the core pages added with them. Fresh database per test.
/* global dbOps, Vyapar, currentCompanyId, navigateTo, saveMoney, indexedDB -- used inside page.evaluate(), which runs in the app */
const { test, expect } = require('@playwright/test');

let pageErrors;
let dialogs;
test.beforeEach(async ({ page }) => {
    pageErrors = [];
    dialogs = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => {
        dialogs.push(d.message());
        d.accept();
    });
});
test.afterEach(() => expect(pageErrors).toEqual([]));

const db = (page, store) => page.evaluate(s => dbOps.getAll(s), store);
const nav = (page, name) => page.locator(`.nav-item[data-page="${name}"]`).click();
const navItems = page => page.locator('.nav-item').evaluateAll(els => els.map(e => e.dataset.page));
async function saved(page) {
    await page.locator('.modal-overlay.active .modal-footer .btn-primary').click();
    await expect(page.locator('.modal-overlay.active')).toHaveCount(0);
}
async function addNew(page) {
    await page.getByRole('button', { name: 'Add New', exact: true }).click();
    await expect(page.locator('.modal-overlay.active')).toBeVisible();
}
async function selectByText(select, text) {
    await select.selectOption(await select.locator('option', { hasText: text }).first().getAttribute('value'));
}
async function setup(page) {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Create your company' }).click();
    const f = page.locator('#companyForm');
    await f.locator('[name=name]').fill('Sri Lakshmi Traders');
    await f.locator('[name=gstin]').fill('27AAPFU0939F1ZV');
    await f.locator('[name=address]').fill('Pune');
    await saved(page);
    await nav(page, 'customers');
    await addNew(page);
    await page.locator('#customerForm [name=name]').fill('Anil Stores');
    await saved(page);
    await nav(page, 'products');
    await addNew(page);
    const p = page.locator('#productForm');
    await p.locator('[name=name]').fill('Cement 50kg');
    await p.locator('[name=gstRate]').selectOption('18');
    await p.locator('[name=stockQty]').fill('100');
    await p.locator('[name=salePrice]').fill('400');
    await saved(page);
}
async function createInvoice(page, qty) {
    await nav(page, 'invoices');
    await addNew(page);
    await selectByText(page.locator('#invCustomer'), 'Anil');
    await selectByText(page.locator('#lineProduct'), 'Cement');
    await page.locator('#lineQty').fill(String(qty));
    await page.getByRole('button', { name: '+ Add' }).click();
    await saved(page);
}
async function switchEdition(page, name) {
    await nav(page, 'features');
    await page.locator(`.feature-edition[data-edition="${name}"] button`).click();
    await expect(page.locator(`.feature-edition.current[data-edition="${name}"]`)).toBeVisible();
}

test('downgrading hides module pages without losing data; upgrading brings them back up to date', async ({ page }) => {
    await setup(page);
    await createInvoice(page, 5);
    expect((await db(page, 'products'))[0].stockQty).toBe(95);
    const full = await navItems(page);
    expect(full).toEqual(expect.arrayContaining(['stock', 'purchase-bills', 'sales-orders', 'accounts', 'employees', 'vehicles', 'gst-reports']));

    await switchEdition(page, 'invoicing');
    expect(dialogs.at(-1)).toContain('will be turned off');
    const invoicing = await navItems(page);
    expect(invoicing).not.toContain('stock');
    expect(invoicing).not.toContain('purchase-bills');
    expect(invoicing).toEqual(expect.arrayContaining(['invoices', 'receipts', 'expenses', 'gst-reports']));
    // A module page is not found while its module is off, and says how to get it back
    await page.evaluate(() => navigateTo('stock'));
    await expect(page.locator('[data-not-found="stock"]')).toContainText('part of Inventory, which is turned off');
    // Products show no stock column; invoicing goes on without touching stock
    await nav(page, 'products');
    await expect(page.locator('#prodTable thead')).not.toContainText('Stock');
    await createInvoice(page, 10);
    expect((await db(page, 'products'))[0].stockQty).toBe(95);
    expect((await db(page, 'stockMovements')).length).toBe(2);

    await switchEdition(page, 'full');
    expect((await db(page, 'products'))[0].stockQty).toBe(85);
    await nav(page, 'stock');
    await expect(page.locator('#stockTable')).toContainText('85');
    // The invoice made while accounting was off is in the books too, and they balance
    await nav(page, 'reports');
    await page.locator('#rptType').selectOption('trial-balance');
    await page.getByRole('button', { name: '📊 Generate Report' }).click();
    await expect(page.locator('#reportContent h3')).toHaveText('⚖️ Trial Balance');
    const values = await page.locator('#reportContent .stat-value').allTextContents();
    expect(values[0]).toBe(values[1]);
    expect(values[0]).toBe('₹7,080.00');
});

test("a module that another one needs cannot be turned off, and turning modules off keeps their pages' data", async ({ page }) => {
    await setup(page);
    await nav(page, 'features');
    await expect(page.locator('#featuresTable tr[data-module="inventory"] button')).toBeDisabled();
    await page.locator('#featuresTable tr[data-module="fulfilment"] button').click();
    await expect(page.locator('#featuresTable tr[data-module="fulfilment"] .badge')).toHaveText('Off');
    await page.locator('#featuresTable tr[data-module="inventory"] button').click();
    await expect(page.locator('#featuresTable tr[data-module="inventory"] .badge')).toHaveText('Off');
    expect(await navItems(page)).not.toContain('sales-orders');
    // Turning fulfilment back on brings inventory with it
    await page.locator('#featuresTable tr[data-module="fulfilment"] button').click();
    await expect(page.locator('#featuresTable tr[data-module="inventory"] .badge')).toHaveText('On');
});

test('a receipt saved twice by a double click is recorded once', async ({ page }) => {
    await setup(page);
    await createInvoice(page, 1);
    await nav(page, 'receipts');
    await addNew(page);
    await page.locator('#moneyForm [name=partyId]').selectOption({ index: 1 });
    await page.locator('#moneyForm [name=amount]').fill('472');
    // Two saves of the same form, started together
    await page.evaluate(() => Promise.all([saveMoney('receipt'), saveMoney('receipt')]));
    await expect(page.locator('.modal-overlay.active')).toHaveCount(0);
    expect(await db(page, 'receipts')).toHaveLength(1);
    expect((await db(page, 'customers'))[0].balance).toBe(0);
    const events = (await db(page, 'eventLog')).filter(e => e.type === 'payment.recorded');
    expect(events).toHaveLength(1);
});

test('an estimate becomes an invoice through the invoice form', async ({ page }) => {
    await setup(page);
    await nav(page, 'quotations');
    await addNew(page);
    await selectByText(page.locator('#quoteCustomer'), 'Anil');
    await selectByText(page.locator('#lineProduct'), 'Cement');
    await page.locator('#lineQty').fill('3');
    await page.getByRole('button', { name: '+ Add' }).click();
    await saved(page);
    await page.locator('button[title="Convert to Invoice"]').click();
    await expect(page.locator('.modal-overlay.active .modal-title')).toHaveText('New Invoice');
    await expect(page.locator('#lineTotals')).toContainText('Grand Total: ₹1,416.00');
    await saved(page);
    const [inv] = await db(page, 'invoices');
    expect(inv).toMatchObject({ number: 'INV-0001', quotationNumber: 'QT-0001', grandTotal: 1416, rev: 0 });
    const [q] = await db(page, 'quotations');
    expect(q).toMatchObject({ status: 'invoiced', invoiceNumber: 'INV-0001' });
    expect((await db(page, 'eventLog')).map(e => e.id)).toContain(`invoice.finalized:${inv.id}:0`);
});

test('expenses, price lists and recurring invoices', async ({ page }) => {
    await setup(page);
    // Expense: listed, in the books
    await nav(page, 'expenses');
    await addNew(page);
    await page.locator('#expenseForm [name=category]').selectOption('Rent');
    await page.locator('#expenseForm [name=amount]').fill('15000');
    await saved(page);
    await expect(page.locator('#expenseTable')).toContainText('EXP-0001');
    expect((await db(page, 'journalEntries')).some(e => e.source === 'expense.created')).toBe(true);

    // Price list: the customer's invoices start at 10% off
    await nav(page, 'price-lists');
    await addNew(page);
    await page.locator('#priceListForm [name=name]').fill('Dealer');
    await page.locator('#priceListForm [name=percent]').fill('10');
    await saved(page);
    const [list] = await db(page, 'priceLists');
    await page.evaluate(async id => {
        const c = (await dbOps.getAll('customers'))[0];
        await dbOps.update('customers', { ...c, priceListId: id });
    }, list.id);
    await nav(page, 'invoices');
    await addNew(page);
    await selectByText(page.locator('#invCustomer'), 'Anil');
    await selectByText(page.locator('#lineProduct'), 'Cement');
    await expect(page.locator('#lineRate')).toHaveValue('360');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Recurring: the first invoice is created when the profile is saved, and never twice
    await nav(page, 'recurring-invoices');
    await addNew(page);
    await selectByText(page.locator('#recCustomer'), 'Anil');
    await selectByText(page.locator('#lineProduct'), 'Cement');
    await page.getByRole('button', { name: '+ Add' }).click();
    await saved(page);
    let invoices = await db(page, 'invoices');
    expect(invoices).toHaveLength(1);
    expect(invoices[0].recurringKey).toMatch(/^recurring:\d+:\d{4}-\d{2}-\d{2}$/);
    expect(invoices[0].grandTotal).toBe(425); // 360 + 18% GST, rounded
    await page.reload();
    await expect(page.locator('#currentCompanyName')).toHaveText('Sri Lakshmi Traders');
    invoices = await db(page, 'invoices');
    expect(invoices).toHaveLength(1);
    const [profile] = await db(page, 'recurringInvoices');
    expect(profile.nextDate > invoices[0].date).toBe(true);
});

test('India GST checks the GSTIN check character and blocks a GSTIN from another state', async ({ page }) => {
    await setup(page);
    await nav(page, 'customers');
    await addNew(page);
    const f = page.locator('#customerForm');
    await f.locator('[name=name]').fill('Typo Traders');
    await f.locator('[name=gstin]').fill('27AAPFU0939F1ZX');
    await expect(f.locator('[name=stateCode]')).toHaveValue('27');
    await saved(page);
    expect(dialogs.at(-1)).toContain('last character should be V');
    await addNew(page);
    await page.locator('#customerForm [name=name]').fill('Elsewhere');
    await page.locator('#customerForm [name=gstin]').fill('27AAPFU0939F1ZV');
    await page.locator('#customerForm [name=stateCode]').selectOption('29');
    await page.locator('.modal-overlay.active .modal-footer .btn-primary').click();
    await expect(page.locator('.toast.error')).toContainText('does not match the selected state (29)');
    expect((await db(page, 'customers')).map(c => c.name)).toEqual(['Anil Stores', 'Typo Traders']);
});

test('without India GST core uses one tax per line, and GST pages are gone', async ({ page }) => {
    await setup(page);
    await nav(page, 'features');
    await page.locator('#featuresTable tr[data-module="region_india_gst"] button').click();
    await expect(page.locator('#featuresTable tr[data-module="region_india_gst"] .badge')).toHaveText('Off');
    expect(await navItems(page)).not.toContain('gst-reports');
    await nav(page, 'invoices');
    await addNew(page);
    await selectByText(page.locator('#invCustomer'), 'Anil');
    await selectByText(page.locator('#lineProduct'), 'Cement');
    await page.getByRole('button', { name: '+ Add' }).click();
    await expect(page.locator('#lineTotals')).toContainText('Tax: ₹72.00');
    await expect(page.locator('#lineTotals')).not.toContainText('CGST');
    await saved(page);
    const [inv] = await db(page, 'invoices');
    expect(inv).toMatchObject({ taxable: 400, tax: 72, grandTotal: 472, taxFields: [] });
    expect(inv.cgst).toBeUndefined();
});

test("another company's records cannot be read or changed from this one", async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(async () => {
        const other = await dbOps.add('companies', { name: 'Other Co', stateCode: '29' });
        // Written directly, as if by the other company
        const hiddenId = await new Promise((res, rej) => {
            const req = indexedDB.open('VyaparEasyDB');
            req.onsuccess = () => {
                const t = req.result.transaction('customers', 'readwrite');
                const r = t.objectStore('customers').add({ companyId: other, name: 'Hidden' });
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
            };
        });
        const read = await dbOps.get('customers', hiddenId);
        const listed = (await dbOps.getByCompany('customers')).map(c => c.name);
        let writeError = '';
        try {
            await dbOps.update('customers', { id: hiddenId, companyId: other, name: 'Changed' });
        } catch (e) {
            writeError = e.message;
        }
        let deleteError = '';
        try {
            await dbOps.delete('customers', hiddenId);
        } catch (e) {
            deleteError = e.message;
        }
        return { read: read ?? null, listed, writeError, deleteError };
    });
    expect(result.read).toBeNull();
    expect(result.listed).toEqual(['Anil Stores']);
    expect(result.writeError).toContain('belongs to another company');
    expect(result.deleteError).toContain('belongs to another company');
    // Module reads are scoped the same way
    const scoped = await page.evaluate(async () =>
        (await Vyapar.app.runtime.ctxFor(parseInt(currentCompanyId), 'inventory').repo('customers').list()).map(c => c.name)
    );
    expect(scoped).toEqual(['Anil Stores']);
});

test('accounting pages: chart of accounts, a manual journal and an account ledger', async ({ page }) => {
    await setup(page);
    await createInvoice(page, 2);
    await nav(page, 'accounts');
    await expect(page.locator('#accountsTable')).toContainText('Sundry Debtors');
    await nav(page, 'journal');
    await expect(page.locator('#journalTable')).toContainText('Sales invoice — Anil Stores');
    await page.getByRole('button', { name: 'New Journal' }).click();
    const rows = page.locator('#journalLines .jl');
    await rows.nth(0).locator('.jl-account').selectOption('1010');
    await rows.nth(0).locator('.jl-debit').fill('50000');
    await rows.nth(1).locator('.jl-account').selectOption('3000');
    await rows.nth(1).locator('.jl-credit').fill('50000');
    await expect(page.locator('#journalTotals')).toContainText('✔');
    await page.locator('#journalForm [name=narration]').fill('Capital brought in');
    await saved(page);
    await expect(page.locator('#journalTable')).toContainText('Capital brought in');
    await nav(page, 'accounts');
    await page.locator('#accountsTable tr', { hasText: 'Bank Accounts' }).locator('button[title="Ledger"]').click();
    await expect(page.locator('.modal-overlay.active')).toContainText('₹50,000.00');
});
