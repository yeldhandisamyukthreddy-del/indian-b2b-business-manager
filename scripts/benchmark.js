// Reproducible numbers quoted in the README: `npm run benchmark`
/* global dbOps, db, selectCompany, startLineEditor, applyLineTotals, gstData, navigateTo, showInvoiceForm, saveInvoice, document, requestAnimationFrame -- used inside page.evaluate(), which runs in the app */
// Measures download size, cold start, invoice save time and GST report time on a large dataset.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
const PORT = 8199;
const INVOICES = parseInt(process.env.BENCH_INVOICES, 10) || 5000;

function sizeOf(dir) {
    let raw = 0,
        gz = 0;
    for (const f of fs.readdirSync(dir, { recursive: true })) {
        const p = path.join(dir, f);
        if (!fs.statSync(p).isFile()) continue;
        const data = fs.readFileSync(p);
        raw += data.length;
        // Fonts and PNGs are already compressed; servers send them as-is
        gz += /\.(woff2|png)$/.test(p) ? data.length : zlib.gzipSync(data).length;
    }
    return { raw, gz };
}
const kb = n => `${Math.round(n / 1024)} KB`;
const median = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const waitForServer = () =>
    new Promise(resolve => {
        const tryOnce = () =>
            http
                .get(`http://localhost:${PORT}/`, res => {
                    res.resume();
                    resolve();
                })
                .on('error', () => setTimeout(tryOnce, 100));
        tryOnce();
    });

(async () => {
    const server = spawn(process.execPath, [path.join(__dirname, 'serve.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
    try {
        await waitForServer();
        const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});

        // Cold start: fresh profile each time, until the dashboard has rendered
        const starts = [];
        for (let i = 0; i < 5; i++) {
            const ctx = await browser.newContext();
            const page = await ctx.newPage();
            const t0 = Date.now();
            await page.goto(`http://localhost:${PORT}/`);
            await page.waitForSelector('.page-title');
            starts.push(Date.now() - t0);
            await ctx.close();
        }

        const ctx = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
        const page = await ctx.newPage();
        // A warning (e.g. stock going negative) asks for confirmation; accept it so a run never stalls
        page.on('dialog', d => d.accept());
        await page.goto(`http://localhost:${PORT}/`);
        await page.waitForSelector('.page-title');
        const result = await page.evaluate(async count => {
            const companyId = await dbOps.add('companies', { name: 'Bench Co', stateCode: '36' });
            await selectCompany(companyId);
            const customers = [];
            for (let i = 0; i < 200; i++)
                customers.push(
                    await dbOps.add('customers', {
                        companyId,
                        name: `Customer ${i}`,
                        stateCode: i % 3 ? '36' : '29',
                        gstin: i % 2 ? '' : '36AAACR5055K1ZQ',
                        balance: 0
                    })
                );
            const products = [];
            for (let i = 0; i < 500; i++)
                products.push({
                    id: await dbOps.add('products', {
                        companyId,
                        name: `Item ${i}`,
                        hsn: String(1000 + i),
                        gstRate: [5, 12, 18, 28][i % 4],
                        unit: 'PCS',
                        stockQty: 1e6,
                        salePrice: 100 + i
                    }),
                    gstRate: [5, 12, 18, 28][i % 4],
                    rate: 100 + i
                });
            const company = await dbOps.get('companies', companyId);
            // Invoices built with the app's own GST code, written in one transaction
            const t0 = performance.now();
            const docs = [];
            for (let n = 0; n < count; n++) {
                const custId = customers[n % customers.length];
                const items = [0, 1, 2].map(k => {
                    const p = products[(n * 3 + k) % products.length];
                    return { productId: p.id, name: 'x', qty: 1 + (n % 5), rate: p.rate, gstRate: p.gstRate };
                });
                await startLineEditor(items, company.stateCode, n % 3 ? '36' : '29');
                docs.push(
                    applyLineTotals({
                        companyId,
                        customerId: custId,
                        customerName: 'c',
                        date: `2026-${String(1 + (n % 12)).padStart(2, '0')}-15`,
                        number: `INV-${n}`,
                        paidAmount: 0,
                        status: 'pending'
                    })
                );
            }
            await new Promise((res, rej) => {
                const tx = db.transaction('invoices', 'readwrite');
                docs.forEach(d => tx.objectStore('invoices').add(d));
                tx.oncomplete = res;
                tx.onerror = rej;
            });
            const bulkMs = performance.now() - t0;

            const reportRuns = [];
            for (let i = 0; i < 3; i++) {
                const t = performance.now();
                await gstData('2026-01-01', '2026-12-31');
                reportRuns.push(performance.now() - t);
            }
            return { bulkMs, reportRuns };
        }, INVOICES);

        // One invoice saved through the real form, end to end
        await page.reload();
        await page.waitForSelector('.page-title');
        const saves = [];
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => navigateTo('invoices'));
            await page.waitForSelector('#invTable');
            await page.evaluate(() => showInvoiceForm());
            await page.waitForSelector('.modal-overlay.active #invCustomer');
            await page.selectOption('#invCustomer', { index: 1 });
            await page.selectOption('#lineProduct', { index: 1 });
            await page.click('text=+ Add');
            // Save, redraw the invoice list and paint the next frame
            saves.push(
                await page.evaluate(async () => {
                    const t = performance.now();
                    const before = document.querySelector('#invTable tbody tr')?.textContent;
                    await saveInvoice(); // also redraws the list
                    while (document.querySelector('#invTable tbody tr')?.textContent === before) await new Promise(r => setTimeout(r, 5));
                    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                    return Math.round(performance.now() - t);
                })
            );
        }
        await browser.close();

        const app = sizeOf(path.join(root, 'app'));
        const html = fs.readFileSync(path.join(root, 'app/index.html'));
        const report = {
            'App download (all files, gzip)': kb(app.gz),
            'App files on disk': kb(app.raw),
            'index.html (gzip)': kb(zlib.gzipSync(html).length),
            'Runtime dependencies': '0',
            'Cold start to dashboard (median of 5)': `${median(starts)} ms`,
            [`Save an invoice and redraw the list, ${INVOICES.toLocaleString('en-IN')} invoices stored (median of 5)`]: `${median(saves)} ms`,
            [`GST report over ${INVOICES.toLocaleString('en-IN')} invoices (median of 3)`]: `${Math.round(median(result.reportRuns))} ms`
        };
        console.log(`\nVyaparEasy benchmark (${process.platform}, ${require('os').cpus().length} CPUs, headless Chromium)\n`);
        for (const [k, v] of Object.entries(report)) console.log(`${k.padEnd(78)} ${v}`);
    } finally {
        server.kill();
    }
})().catch(e => {
    console.error(e);
    process.exit(1);
});
