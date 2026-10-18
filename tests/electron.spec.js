// Desktop app smoke test: the window opens, data is saved and survives a restart.
/* global document, window, dbOps, computeGst, InvoiceTemplates -- used inside page.evaluate(), which runs in the app */
// On Linux run it under a display, e.g. `xvfb-run npx playwright test tests/electron.spec.js`.
const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
let electronAvailable = true;
try {
    require('electron');
} catch {
    electronAvailable = false;
}

test.skip(!electronAvailable, 'Electron binary not installed');

async function launch(userDataDir) {
    const args = [root, `--user-data-dir=${userDataDir}`];
    if (process.getuid && process.getuid() === 0) args.push('--no-sandbox'); // e.g. CI containers running as root
    const app = await electron.launch({ args, cwd: root });
    const win = await app.firstWindow();
    await win.waitForURL('app://vyapareasy/index.html');
    const errors = [];
    win.on('pageerror', e => errors.push(e.message));
    win.on('dialog', d => d.accept());
    return { app, win, errors };
}

test('desktop app saves data across restarts', async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyapareasy-'));
    let { app, win, errors } = await launch(userDataDir);
    await expect(win.locator('.page-title')).toHaveText('Welcome to VyaparEasy');
    await win.getByRole('button', { name: '+ Create your company' }).click();
    await win.locator('#companyForm [name=name]').fill('Desktop Traders');
    await win.locator('#companyForm [name=stateCode]').selectOption('27');
    await win.locator('.modal-overlay.active .modal-footer .btn-primary').click();
    await expect(win.locator('#currentCompanyName')).toHaveText('Desktop Traders');
    // The bundled font loads from the app itself (no internet needed)
    expect(await win.evaluate(() => document.fonts.check('16px "Plus Jakarta Sans"'))).toBe(true);
    expect(errors).toEqual([]);
    await app.close();

    ({ app, win, errors } = await launch(userDataDir));
    await expect(win.locator('#currentCompanyName')).toHaveText('Desktop Traders');
    expect(errors).toEqual([]);
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
});

test('desktop app makes invoice PDFs and saves them', async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyapareasy-'));
    const { app, win, errors } = await launch(userDataDir);
    await expect(win.locator('.page-title')).toHaveText('Welcome to VyaparEasy'); // database is open
    await win.evaluate(async () => {
        const companyId = await dbOps.add('companies', { name: 'Desktop Traders', stateCode: '27', stateName: 'Maharashtra', gstin: '27AAACB1234F1Z5' });
        const customerId = await dbOps.add('customers', { companyId, name: 'Pune Buyer', stateCode: '27', creditDays: 15, balance: 0 });
        const items = [{ name: 'Rice 25kg', hsn: '1006', unit: 'BAG', qty: 4, rate: 1250, gstRate: 5 }];
        const t = computeGst(items, false);
        await dbOps.add('invoices', {
            companyId,
            customerId,
            customerName: 'Pune Buyer',
            date: '2026-10-18',
            number: 'INV-0001',
            items,
            interstate: false,
            placeOfSupply: '27',
            ...t,
            grandTotal: t.total,
            roundOff: 0,
            paidAmount: 0,
            status: 'pending'
        });
    });
    const head = type =>
        win.evaluate(
            t => InvoiceTemplates.render(1, t, { mode: 'pdf' }).then(r => ({ magic: String.fromCharCode(...r.bytes.slice(0, 5)), size: r.bytes.length })),
            type
        );
    expect(await head('standard')).toMatchObject({ magic: '%PDF-' });
    expect(await head('thermal')).toMatchObject({ magic: '%PDF-' });

    // Save through the (stubbed) Save dialog
    const out = path.join(userDataDir, 'saved.pdf');
    await app.evaluate(({ dialog }, file) => (dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })), out);
    await win.evaluate(() => InvoiceTemplates.downloadPdf(1, 'standard'));
    await expect.poll(() => fs.existsSync(out)).toBe(true);
    expect(fs.readFileSync(out).subarray(0, 5).toString()).toBe('%PDF-');
    await expect(win.locator('.toast').last()).toHaveText('PDF saved: saved.pdf');

    // The bridge accepts only rendered invoices and real PDF bytes
    await expect(win.evaluate(() => window.vyaparDesktop.renderPdf({ html: '<p>x</p>', pageSize: 'A4' }))).rejects.toThrow(/not a rendered invoice/);
    await expect(win.evaluate(() => window.vyaparDesktop.renderPdf({ html: '<main data-invoice-root></main>', pageSize: '../A4' }))).rejects.toThrow(
        /Unknown page size/
    );
    await expect(win.evaluate(() => window.vyaparDesktop.savePdf({ bytes: new Uint8Array([1, 2, 3]), fileName: '../../x' }))).rejects.toThrow(/Not a PDF/);
    expect(errors).toEqual([]);
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
});
