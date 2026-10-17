// Records docs/demo.gif: an inter-state invoice in about 15 seconds.
/* global window, document, dbOps, printInvoice -- used inside page.evaluate() / addInitScript(), which run in the app */
// Needs ffmpeg on PATH. Run: `npm run demo`
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
const PORT = 8198;
const out = path.join(root, 'docs', 'demo.gif');
const size = { width: 1280, height: 760 };

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

// Videos don't show the mouse, so draw a pointer that follows it
const cursorScript = () => {
    window.addEventListener('DOMContentLoaded', () => {
        const dot = document.createElement('div');
        dot.style.cssText =
            'position:fixed;z-index:99999;width:22px;height:22px;border-radius:50%;background:rgba(250,204,21,.85);border:2px solid #fff;pointer-events:none;transform:translate(-50%,-50%);transition:left .12s,top .12s;left:-50px;top:-50px';
        document.body.appendChild(dot);
        document.addEventListener('mousemove', e => {
            dot.style.left = e.clientX + 'px';
            dot.style.top = e.clientY + 'px';
        });
    });
};

(async () => {
    const server = spawn(process.execPath, [path.join(__dirname, 'serve.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
    const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyapareasy-demo-'));
    try {
        await waitForServer();
        const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
        // Set up sample data first, outside the recording
        const setup = await browser.newContext();
        const storageFile = path.join(videoDir, 'state.json');
        const s = await setup.newPage();
        await s.goto(`http://localhost:${PORT}/`);
        await s.waitForSelector('.page-title');
        await s.evaluate(async () => {
            const companyId = await dbOps.add('companies', {
                name: 'Sri Lakshmi Traders',
                gstin: '36AABCU9603R1ZM',
                stateCode: '36',
                stateName: 'Telangana',
                address: 'Kukatpally, Hyderabad'
            });
            localStorage.setItem('companyId', companyId);
            localStorage.setItem('lastBackupDate', new Date().toISOString());
            await dbOps.add('customers', {
                companyId,
                name: 'Bengaluru Builders Pvt Ltd',
                stateCode: '29',
                gstin: '29AAACB1234F1Z5',
                address: 'MG Road, Bengaluru',
                creditDays: 30,
                balance: 0
            });
            await dbOps.add('products', {
                companyId,
                name: 'Cement 50kg (OPC 53)',
                hsn: '2523',
                gstRate: 18,
                unit: 'BAG',
                stockQty: 900,
                purchasePrice: 350,
                salePrice: 400
            });
            await dbOps.add('products', {
                companyId,
                name: 'TMT Steel Bar 12mm',
                hsn: '7214',
                gstRate: 18,
                unit: 'KGS',
                stockQty: 5000,
                purchasePrice: 60,
                salePrice: 72.5
            });
        });
        await setup.storageState({ path: storageFile, indexedDB: true });
        await setup.close();

        const ctx = await browser.newContext({
            viewport: size,
            recordVideo: { dir: videoDir, size },
            storageState: storageFile,
            timezoneId: 'Asia/Kolkata',
            locale: 'en-IN'
        });
        await ctx.addInitScript(cursorScript);
        const page = await ctx.newPage();
        const pause = ms => page.waitForTimeout(ms);
        const clickOn = async selector => {
            const box = await page.locator(selector).first().boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
            await pause(150);
            await page.locator(selector).first().click();
        };
        await page.goto(`http://localhost:${PORT}/`);
        await page.waitForSelector('.stat-card');
        await pause(1200);
        await clickOn('.nav-item[data-page="invoices"]');
        await pause(500);
        await clickOn('button:has-text("Add New")');
        await pause(500);
        await page.selectOption('#invCustomer', { index: 1 });
        await pause(500);
        for (const [index, qty] of [
            [1, '150'],
            [2, '1200']
        ]) {
            await page.selectOption('#lineProduct', { index });
            await page.locator('#lineQty').fill('');
            await page.locator('#lineQty').pressSequentially(qty, { delay: 90 });
            await clickOn('button:has-text("+ Add")');
            await pause(600);
        }
        await page.locator('#lineTotals').scrollIntoViewIfNeeded();
        await pause(1600); // IGST picked automatically: Telangana → Karnataka
        await clickOn('.modal-overlay.active .modal-footer .btn-primary');
        await pause(900);
        // Show the printable tax invoice
        await page.evaluate(async () => {
            const [inv] = await dbOps.getAll('invoices');
            window.print = () => {};
            await printInvoice(inv.id);
        });
        await pause(400);
        const printed = await page
            .frameLocator('#printFrame')
            .locator('html')
            .evaluate(e => e.outerHTML);
        await page.evaluate(html => {
            const box = document.createElement('div');
            box.style.cssText =
                'position:fixed;inset:24px 140px;z-index:9999;background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.6);overflow:hidden';
            const frame = document.createElement('iframe');
            frame.style.cssText = 'width:100%;height:100%;border:0';
            frame.srcdoc = html;
            box.appendChild(frame);
            document.body.appendChild(box);
        }, printed);
        await pause(3200);
        await ctx.close();
        await browser.close();

        const video = fs.readdirSync(videoDir).find(f => f.endsWith('.webm'));
        const filters =
            'fps=10,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle';
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(videoDir, video), '-vf', filters, out]);
        console.log(`wrote ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
    } finally {
        server.kill();
        fs.rmSync(videoDir, { recursive: true, force: true });
    }
})().catch(e => {
    console.error(e);
    process.exit(1);
});
