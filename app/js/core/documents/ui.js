// Invoice templates inside the app: render(invoiceId, templateType, { mode }), the preview window,
// printing and PDF. Browser only; uses the app's own helpers from app/index.html.
/* global dbOps, contrib, getSettings, DEFAULT_TERMS, stateName, todayStr, showModal, showToast, esc, printHtmlDocument, navigateTo */
(function () {
    'use strict';
    const V = window.Vyapar;

    // The IndexedDB 'settings' store, as the repository expects it
    const repo = V.settings.createRepository({
        getAll: () => dbOps.getAll('settings'),
        add: row => dbOps.add('settings', row),
        put: row => dbOps.update('settings', row),
        delete: id => dbOps.delete('settings', id)
    });

    // Template files come from the app itself (cached by the service worker for offline use)
    const renderer = V.renderer.createRenderer({
        loadFile: async path => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.text();
        }
    });

    const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const localeFor = settings => `${settings.language}-IN`;

    async function loadDomain(invoiceId) {
        const invoice = await dbOps.get('invoices', invoiceId);
        if (!invoice) throw new Error('Invoice not found. It may have been deleted.');
        const company = await dbOps.get('companies', invoice.companyId);
        if (!company) throw new Error('The company of this invoice no longer exists.');
        const customer = invoice.customerId ? await dbOps.get('customers', invoice.customerId) : null;
        const banks = (await dbOps.getAll('bankAccounts')).filter(b => b.companyId === invoice.companyId);
        const domain = V.adapter.toDomain({
            invoice,
            company,
            customer,
            banks,
            appSettings: getSettings(),
            stateName,
            today: todayStr(),
            timeZone: timeZone(),
            defaultTerms: DEFAULT_TERMS
        });
        return { ...domain, companyId: invoice.companyId, number: invoice.number };
    }

    const defaultTemplate = async companyId => (await repo.getPrefs(companyId)).defaultTemplateType;

    async function renderDomain(domain, companyId, templateType, mode) {
        const type = templateType || (await defaultTemplate(companyId));
        // Region blocks come from the enabled modules ('document.blocks', e.g. India GST)
        const settings = { ...(await repo.getEffective(companyId, type)), regionModules: contrib('document.blocks').map(c => c.value) };
        return renderer.renderInvoice({ invoice: domain.invoice, org: domain.org, settings, locale: localeFor(settings), mode });
    }

    // Preview and print return HTML; pdf also returns the PDF bytes (desktop app only)
    async function render(invoiceId, templateType, { mode = 'preview' } = {}) {
        const domain = await loadDomain(invoiceId);
        const out = await renderDomain(domain, domain.companyId, templateType, mode);
        if (mode !== 'pdf') return out;
        if (!window.vyaparDesktop) throw new Error('Saving a PDF directly needs the desktop app. Use Print and choose "Save as PDF".');
        const bytes = await window.vyaparDesktop.renderPdf({ html: out.html, pageSize: out.viewModel.meta.pageSize });
        return { ...out, bytes };
    }

    // Show the whole page in a narrow preview: lay the iframe out at sheet width and scale it down to fit
    const SHEET_PX = 860; // an A4 sheet (794 px) plus the preview's margins
    function fitFrame(frame) {
        const host = frame && frame.parentElement;
        if (!host || !host.clientWidth) return;
        const k = Math.min(1, host.clientWidth / SHEET_PX);
        Object.assign(frame.style, { width: `${SHEET_PX}px`, height: `${Math.round(host.clientHeight / k)}px`, transform: `scale(${k})` });
        if (!frame.dataset.fitted) {
            frame.dataset.fitted = '1';
            new ResizeObserver(() => fitFrame(frame)).observe(host);
        }
    }

    const errorPage = message =>
        `<!DOCTYPE html><meta charset="utf-8"><body style="font:14px sans-serif;padding:24px;color:#b91c1c"><strong>This invoice cannot be shown.</strong><p>${esc(message)}</p></body>`;

    async function print(invoiceId, templateType) {
        const { html } = await render(invoiceId, templateType, { mode: 'print' });
        printHtmlDocument(html);
    }

    async function downloadPdf(invoiceId, templateType) {
        if (!window.vyaparDesktop) {
            await print(invoiceId, templateType);
            showToast('In the print window, choose "Save as PDF" as the printer');
            return;
        }
        const { bytes, viewModel } = await render(invoiceId, templateType, { mode: 'pdf' });
        const safeName = viewModel.header.entityNumber.sectionValue.replace(/[^\w.-]+/g, '-');
        const res = await window.vyaparDesktop.savePdf({ bytes, fileName: `Invoice-${safeName}.pdf` });
        if (res && res.saved) showToast(`PDF saved: ${res.fileName}`);
    }

    const run = promise => promise.catch(err => showToast(err.message || String(err), 'error'));
    const previewType = () => document.getElementById('tplPreviewType').value;

    async function refreshPreview(invoiceId) {
        const frame = document.getElementById('tplPreviewFrame');
        if (!frame) return;
        fitFrame(frame);
        try {
            frame.srcdoc = (await render(invoiceId, previewType(), { mode: 'preview' })).html;
        } catch (err) {
            frame.srcdoc = errorPage(err.message || String(err));
        }
    }

    async function preview(invoiceId) {
        const inv = await dbOps.get('invoices', invoiceId);
        if (!inv) return;
        const current = await defaultTemplate(inv.companyId);
        const options = V.registry
            .templateTypes()
            .map(k => `<option value="${k}" ${k === current ? 'selected' : ''}>${esc(V.registry.TEMPLATES[k].label)}</option>`)
            .join('');
        const pdfLabel = window.vyaparDesktop ? '⬇️ Download PDF' : '⬇️ Save as PDF';
        showModal(
            `Invoice ${esc(inv.number)}`,
            `<div class="invoice-preview-bar"><label class="form-label" for="tplPreviewType">Template</label>
            <select class="form-control" id="tplPreviewType" onchange="InvoiceTemplates.refreshPreview(${inv.id})">${options}</select>
            <button type="button" class="btn btn-outline" onclick="navigateTo('invoice-templates')">⚙️ Customize</button></div>
            <div class="invoice-preview-host"><iframe id="tplPreviewFrame" class="invoice-preview-frame" sandbox title="Invoice preview"></iframe></div>`,
            `<button class="btn" onclick="InvoiceTemplates.downloadPdf(${inv.id}, document.getElementById('tplPreviewType').value)">${pdfLabel}</button>
            <button class="btn btn-primary" onclick="InvoiceTemplates.print(${inv.id}, document.getElementById('tplPreviewType').value)">🖨️ Print</button>`
        );
        await refreshPreview(inv.id);
    }

    window.InvoiceTemplates = {
        repo,
        renderer,
        render,
        renderDomain,
        loadDomain,
        errorPage,
        fitFrame,
        preview: id => run(preview(id)),
        refreshPreview: id => run(refreshPreview(id)),
        print: (id, type) => run(print(id, type)),
        printOrThrow: print,
        downloadPdf: (id, type) => run(downloadPdf(id, type)),
        customize: () => navigateTo('invoice-templates')
    };
})();
