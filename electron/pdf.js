// Invoice PDFs for the desktop app. A rendered invoice is printed to PDF in a hidden window that runs
// no JavaScript and can load nothing but the invoice file itself (images are inline data: URLs).
const { BrowserWindow, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const registry = require('../app/js/invoice/registry.js');

const MAX_HTML = 10 * 1024 * 1024;
const MAX_PDF = 50 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const MM_PER_INCH = 25.4;
const PX_PER_MM = 96 / MM_PER_INCH;

function checkRequest({ html, pageSize }) {
    if (typeof html !== 'string' || !html.includes('data-invoice-root')) throw new Error('Nothing to print: this is not a rendered invoice');
    if (html.length > MAX_HTML) throw new Error('The invoice is too large to turn into a PDF');
    if (!Object.prototype.hasOwnProperty.call(registry.PAGE_SIZES, pageSize)) throw new Error(`Unknown page size "${String(pageSize).slice(0, 20)}"`);
    return registry.PAGE_SIZES[pageSize];
}

function withTimeout(promise, what) {
    let timer;
    const timeout = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`${what} took longer than ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS)));
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Height of the printed invoice in mm, measured through the DevTools protocol (the page runs no script)
async function contentHeightMm(wc) {
    wc.debugger.attach('1.3');
    try {
        await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
        const { root } = await wc.debugger.sendCommand('DOM.getDocument');
        const { nodeId } = await wc.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-invoice-root]' });
        if (!nodeId) throw new Error('The receipt rendered empty');
        const { model } = await wc.debugger.sendCommand('DOM.getBoxModel', { nodeId });
        return Math.ceil(model.height / PX_PER_MM) + 6;
    } finally {
        wc.debugger.detach();
    }
}

function printOptions(size, heightMm) {
    if (!size.thermal) return { printBackground: true, preferCSSPageSize: true };
    return {
        printBackground: true,
        pageSize: { width: parseFloat(size.width) / MM_PER_INCH, height: heightMm / MM_PER_INCH },
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
    };
}

// One in-memory session for all PDF windows, separate from the app's data. It loads only the invoice
// files being printed right now (several PDFs can be in progress) and inline data: images.
const allowedUrls = new Set();
let pdfSes = null;
function pdfSession() {
    if (!pdfSes) {
        pdfSes = session.fromPartition('vyapareasy-pdf');
        pdfSes.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !(allowedUrls.has(details.url) || details.url.startsWith('data:')) }));
    }
    return pdfSes;
}

/** @returns {Promise<Buffer>} PDF bytes */
async function renderInvoicePdf(request) {
    const size = checkRequest(request);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vyapareasy-pdf-')), 'invoice.html');
    fs.writeFileSync(file, request.html, 'utf8');
    const fileUrl = pathToFileURL(file).toString();
    const ses = pdfSession();
    allowedUrls.add(fileUrl);
    const win = new BrowserWindow({
        show: false,
        width: 900,
        height: 1200,
        webPreferences: { javascript: false, sandbox: true, contextIsolation: true, session: ses }
    });
    try {
        await withTimeout(win.loadURL(fileUrl), 'Opening the invoice');
        const heightMm = size.thermal ? await contentHeightMm(win.webContents) : null;
        const pdf = await withTimeout(win.webContents.printToPDF(printOptions(size, heightMm)), 'Making the PDF');
        if (!pdf || pdf.length < 800 || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('The PDF engine returned an empty file');
        return pdf;
    } finally {
        win.destroy();
        allowedUrls.delete(fileUrl);
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
}

// Bytes from the page that will be written to disk: they must be a PDF of a sane size
function checkPdfBytes(bytes) {
    const buf = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes || []);
    if (buf.length < 800 || buf.length > MAX_PDF || buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('Not a PDF');
    return buf;
}

const safeFileName = name =>
    `${
        String(name || 'invoice')
            .replace(/\.pdf$/i, '')
            .replace(/[^\w.\- ]+/g, '-')
            .slice(0, 80) || 'invoice'
    }.pdf`;

module.exports = { renderInvoicePdf, checkPdfBytes, safeFileName };
