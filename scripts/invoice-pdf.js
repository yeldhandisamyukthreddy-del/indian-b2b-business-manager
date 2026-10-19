// HTML → PDF with headless Chromium (Playwright), for tests and `npm run render-invoice`.
// The page runs with JavaScript disabled and every non-inline request blocked.
// Thermal rolls get their real content height, so the receipt has no blank tail.
const registry = require('../app/js/core/documents/registry.js');

const PX_TO_MM = 25.4 / 96;

function assertPdf(buf) {
    if (!buf || buf.length < 800 || buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('The PDF engine returned an empty or invalid file');
    return buf;
}

// Pages in a Chromium PDF (each page object is "/Type /Page"; the tree root is "/Type /Pages")
const pdfPageCount = buf => (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;

function withTimeout(promise, ms, what) {
    let timer;
    const timeout = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000} s`)), ms)));
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function openPrintPage(browser, html, timeoutMs) {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });
    await page.emulateMedia({ media: 'print' });
    return { context, page };
}

async function rollHeight(page) {
    const box = await page.locator('[data-invoice-root]').boundingBox();
    if (!box || box.height < 10) throw new Error('The receipt rendered empty');
    return `${Math.ceil(box.height * PX_TO_MM) + 6}mm`;
}

/** @returns {Promise<Buffer>} */
async function htmlToPdf(browser, html, { pageSize = 'A4', timeoutMs = 20000 } = {}) {
    const size = registry.PAGE_SIZES[pageSize];
    if (!size) throw new Error(`Unknown page size "${pageSize}"`);
    if (typeof html !== 'string' || !html.includes('data-invoice-root')) throw new Error('Nothing to print: the HTML is not a rendered invoice');
    const { context, page } = await openPrintPage(browser, html, timeoutMs);
    try {
        const height = size.thermal ? await rollHeight(page) : size.height;
        const pdf = await withTimeout(
            page.pdf({ width: size.width, height, printBackground: true, preferCSSPageSize: !size.thermal }),
            timeoutMs,
            'Making the PDF'
        );
        return assertPdf(pdf);
    } finally {
        await context.close();
    }
}

// PNG of the printed layout (print media), for visual checks
async function htmlToPng(browser, html, file, { pageSize = 'A4' } = {}) {
    const size = registry.PAGE_SIZES[pageSize];
    const { context, page } = await openPrintPage(browser, html, 20000);
    try {
        const widthPx = Math.round(parseFloat(size.width) * (size.width.endsWith('in') ? 96 : 96 / 25.4));
        await page.setViewportSize({ width: widthPx, height: 1200 });
        await page.locator('[data-invoice-root]').screenshot({ path: file });
    } finally {
        await context.close();
    }
}

module.exports = { htmlToPdf, htmlToPng, pdfPageCount, assertPdf };
