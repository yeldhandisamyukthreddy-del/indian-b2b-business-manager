// Render the sample invoices with every template to HTML, PDF and PNG: `npm run render-invoice -- [out-dir]`
// Uses the same view-model builder and templates as the app, and the Node PDF service (Playwright Chromium).
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const registry = require('../app/js/core/documents/registry.js');
const { createRenderer } = require('../app/js/core/documents/renderer.js');
const fx = require('../tests/fixtures/invoices.js');
const { htmlToPdf, htmlToPng, pdfPageCount } = require('./invoice-pdf.js');

const APP = path.join(__dirname, '..', 'app');
const out = path.resolve(process.argv[2] || 'invoice-samples');
const FIXTURES = {
    simple: type => [fx.simple, fx.settingsFor(type, { fieldFlags: { isStatusStampRequired: true } })],
    multipage: type => [fx.multiPage, fx.settingsFor(type)],
    'india-gst': type => [fx.indiaGst, fx.indiaGstSettings(type)]
};

(async () => {
    fs.mkdirSync(out, { recursive: true });
    const renderer = createRenderer({ loadFile: p => fs.promises.readFile(path.join(APP, p), 'utf8') });
    const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
    try {
        for (const type of registry.templateTypes()) {
            for (const [name, make] of Object.entries(FIXTURES)) {
                const [invoice, settings] = make(type);
                const { html, viewModel } = await renderer.renderInvoice({ invoice, org: fx.ORG, settings, mode: 'pdf' });
                const base = path.join(out, `${type}.${name}`);
                fs.writeFileSync(`${base}.html`, html);
                const pdf = await htmlToPdf(browser, html, { pageSize: viewModel.meta.pageSize });
                fs.writeFileSync(`${base}.pdf`, pdf);
                await htmlToPng(browser, html, `${base}.png`, { pageSize: viewModel.meta.pageSize });
                console.log(`${type} × ${name}: ${pdfPageCount(pdf)} page(s), ${Math.round(pdf.length / 1024)} KB`);
            }
        }
    } finally {
        await browser.close();
    }
    console.log(`Written to ${out}`);
})().catch(err => {
    console.error(err.message);
    process.exit(1);
});
