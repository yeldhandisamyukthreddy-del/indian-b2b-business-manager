// Settings → Invoice templates: pick a template, switch sections and columns on or off, rename labels,
// upload a logo and see the result live. Every change is validated and saved at once.
/* global dbOps, currentCompanyId, todayStr, esc, t, showToast, renderPage, stateName, DEFAULT_TERMS */
(function () {
    'use strict';
    const V = window.Vyapar;
    const T = () => window.InvoiceTemplates;
    const state = { type: null, timer: null };

    const FLAG_GROUPS = [
        [
            'Header',
            [
                ['showLogo', 'Logo'],
                ['isOrgNameRequired', 'Business name'],
                ['isOrgAddressRequired', 'Business address'],
                ['isTitleRequired', 'Title'],
                ['isStatusStampRequired', 'Paid / overdue stamp']
            ]
        ],
        [
            'Details',
            [
                ['isEntityDateRequired', 'Invoice date'],
                ['isTimeRequired', 'Time'],
                ['isDueDateRequired', 'Due date'],
                ['isPaymentTermsRequired', 'Payment terms'],
                ['isReferenceNumberRequired', 'Reference / PO number'],
                ['isBillToRequired', 'Bill to'],
                ['isShipToRequired', 'Ship to']
            ]
        ],
        [
            'Totals',
            [
                ['isSubTotalRequired', 'Sub total'],
                ['isTotalRequired', 'Grand total'],
                ['isBalanceDueRequired', 'Balance due'],
                ['isAmountInWordsRequired', 'Amount in words'],
                ['isTaxSummaryRequired', 'HSN tax summary'],
                ['showCurrencyAfterAmount', 'Put ₹ after the amount']
            ]
        ],
        [
            'Footer',
            [
                ['showNotes', 'Notes'],
                ['isTermsAndConditionsRequired', 'Terms & conditions'],
                ['isPaymentDetailsRequired', 'Bank details'],
                ['isSignatureRequired', 'Signature'],
                ['isPaymentStubRequired', 'Tear-off payment slip']
            ]
        ]
    ];
    const COLUMN_NAMES = {
        index: '#',
        name: 'Item',
        hsnOrSac: 'HSN/SAC',
        qty: 'Qty',
        rate: 'Rate',
        discount: 'Discount (only when used)',
        amount: 'Taxable value',
        tax: 'GST',
        total: 'Total'
    };
    const LABEL_FIELDS = [
        'title',
        'invoiceNumber',
        'invoiceDate',
        'dueDate',
        'billTo',
        'shipTo',
        'colName',
        'colQty',
        'colRate',
        'colAmount',
        'colTotal',
        'subTotal',
        'total',
        'balanceDue',
        'notes',
        'terms',
        'paymentDetails',
        'authorisedSignatory',
        'thankYou'
    ];
    const LANGUAGES = [
        ['en', 'English'],
        ['te', 'తెలుగు (Telugu)'],
        ['ur', 'اردو (Urdu, right to left)']
    ];
    const MAX_EXTRA_IDS = 3;

    const companyId = () => parseInt(currentCompanyId);
    const repo = () => T().repo;
    const run = promise => promise.catch(err => showToast(err.message || String(err), 'error'));
    const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;

    function flagsHtml(flags) {
        return FLAG_GROUPS.map(
            ([group, items]) =>
                `<fieldset class="tpl-group"><legend>${group}</legend>${items
                    .map(
                        ([k, label]) =>
                            `<label class="tpl-check"><input type="checkbox" data-flag="${k}" ${flags[k] ? 'checked' : ''} onchange="TemplateSettingsPage.toggleFlag('${k}', this.checked)"> ${label}</label>`
                    )
                    .join('')}</fieldset>`
        ).join('');
    }

    function columnsHtml(columns) {
        return columns
            .map(
                (c, i) => `<div class="tpl-column" data-column="${c.key}">
            <label class="tpl-check"><input type="checkbox" ${c.visible ? 'checked' : ''} onchange="TemplateSettingsPage.toggleColumn('${c.key}', this.checked)"> ${esc(COLUMN_NAMES[c.key])}</label>
            <span><button type="button" class="action-btn" title="Move up" ${i === 0 ? 'disabled' : ''} onclick="TemplateSettingsPage.moveColumn('${c.key}', -1)">↑</button><button type="button" class="action-btn" title="Move down" ${i === columns.length - 1 ? 'disabled' : ''} onclick="TemplateSettingsPage.moveColumn('${c.key}', 1)">↓</button></span></div>`
            )
            .join('');
    }

    function labelsHtml(s) {
        const defaults = V.labels.resolveLabels(s.language, {});
        const mine = s.labels[s.language] || {};
        return LABEL_FIELDS.map(
            k =>
                `<div class="form-group"><label class="form-label">${esc(V.labels.DEFAULT_LABELS.en[k])}</label><input class="form-control" data-label="${k}" maxlength="80" value="${esc(mine[k] || '')}" placeholder="${esc(defaults[k])}" onchange="TemplateSettingsPage.setLabel('${k}', this.value)"></div>`
        ).join('');
    }

    function extraIdsHtml(ids) {
        return Array.from({ length: MAX_EXTRA_IDS }, (_, i) => {
            const x = ids[i] || { label: '', value: '' };
            return `<div class="form-row tpl-extra-id"><input class="form-control" maxlength="30" placeholder="e.g. PAN, CIN, Udyam" value="${esc(x.label)}" onchange="TemplateSettingsPage.saveExtraIds()"><input class="form-control" maxlength="40" placeholder="Number" value="${esc(x.value)}" onchange="TemplateSettingsPage.saveExtraIds()"></div>`;
        }).join('');
    }

    async function render() {
        if (!companyId()) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const prefs = await repo().getPrefs(companyId());
        if (!V.registry.isTemplateType(state.type)) state.type = prefs.defaultTemplateType;
        const s = await repo().find(companyId(), state.type);
        const tpl = V.registry.getTemplate(state.type);
        const logo = prefs.logoAssetId ? await repo().getAsset(companyId(), prefs.logoAssetId) : null;
        const isDefault = prefs.defaultTemplateType === state.type;
        return `<div class="page-header"><h1 class="page-title">Invoice templates</h1><button class="btn btn-outline" onclick="navigateTo('settings')">← ${t('settings')}</button></div>
        <div class="tpl-editor">
          <div class="card tpl-controls">
            <div class="form-group"><label class="form-label" for="tplType">Template</label><select class="form-control" id="tplType" onchange="TemplateSettingsPage.selectType(this.value)">${V.registry
                .templateTypes()
                .map(k => option(k, V.registry.TEMPLATES[k].label, state.type))
                .join('')}</select></div>
            <p>${isDefault ? '✅ Used when you print an invoice.' : `<button class="btn btn-outline" id="tplMakeDefault" onclick="TemplateSettingsPage.makeDefault()">Use this template for printing</button>`}</p>
            <div class="form-row">
              <div class="form-group"><label class="form-label" for="tplPageSize">Paper</label><select class="form-control" id="tplPageSize" onchange="TemplateSettingsPage.save({ pageSize: this.value })">${tpl.pageSizes.map(k => option(k, V.registry.PAGE_SIZES[k].label, s.pageSize)).join('')}</select></div>
              <div class="form-group"><label class="form-label" for="tplLanguage">Language</label><select class="form-control" id="tplLanguage" onchange="TemplateSettingsPage.save({ language: this.value }, true)">${LANGUAGES.map(([k, l]) => option(k, l, s.language)).join('')}</select></div>
              <div class="form-group"><label class="form-label" for="tplAccent">Colour</label><input class="form-control" type="color" id="tplAccent" value="${esc(s.accentColor)}" onchange="TemplateSettingsPage.save({ accentColor: this.value })"></div>
            </div>
            <h4>Logo <small>(all templates)</small></h4>
            <div class="tpl-logo">${logo ? `<img src="${esc(logo.dataUri)}" alt="Current logo"><button class="btn" onclick="TemplateSettingsPage.removeLogo()">Remove</button>` : '<span class="muted">No logo yet</span>'}</div>
            <input type="file" id="tplLogoFile" accept="image/png,image/jpeg,image/webp" onchange="TemplateSettingsPage.uploadLogo(this.files[0])">
            <p class="tpl-hint">PNG, JPEG or WebP. It is shrunk to fit 600 × 200 pixels and stored in this app, so invoices print without internet.</p>
            <h4>Sections</h4>${flagsHtml(s.fieldFlags)}
            <h4>Item columns</h4><div class="tpl-columns">${columnsHtml(s.columnConfig)}</div>
            <h4>Labels <small>(${esc(LANGUAGES.find(l => l[0] === s.language)?.[1] || s.language)}; empty = default)</small></h4>${labelsHtml(s)}
            <h4>Extra registration numbers <small>(all templates)</small></h4>${extraIdsHtml(prefs.extraTaxIds)}
          </div>
          <div class="card tpl-preview-card"><div class="invoice-preview-host"><iframe id="tplLivePreview" class="invoice-preview-frame" sandbox title="Template preview"></iframe></div>
            <p class="tpl-hint">The preview uses your latest invoice, or a sample when there are none.</p></div>
        </div>`;
    }

    // A sample invoice for companies that have none yet
    async function sampleDomain() {
        const company = await dbOps.get('companies', companyId());
        const invoice = {
            number: 'SAMPLE-0001',
            date: todayStr(),
            customerName: 'Sample Customer',
            customerAddress: 'Customer address',
            customerState: company.stateCode,
            placeOfSupply: company.stateCode,
            notes: 'This is a sample invoice.',
            items: [
                { name: 'Sample product', hsn: '1234', unit: 'NOS', qty: 2, rate: 500, gstRate: 18 },
                { name: 'Sample service', hsn: '9983', unit: 'HRS', qty: 3, rate: 750, gstRate: 18 }
            ]
        };
        const banks = (await dbOps.getAll('bankAccounts')).filter(b => b.companyId === company.id);
        return V.adapter.toDomain({ invoice, company, banks, stateName, today: todayStr(), defaultTerms: DEFAULT_TERMS });
    }

    async function drawPreview() {
        const frame = document.getElementById('tplLivePreview');
        if (!frame) return;
        T().fitFrame(frame);
        try {
            const latest = (await dbOps.getByCompany('invoices')).at(-1);
            const out = latest
                ? await T().render(latest.id, state.type, { mode: 'preview' })
                : await T().renderDomain(await sampleDomain(), companyId(), state.type, 'preview');
            frame.srcdoc = out.html;
            frame.dataset.rendered = String(Date.now());
        } catch (err) {
            frame.srcdoc = T().errorPage(err.message || String(err));
        }
    }
    function refresh() {
        clearTimeout(state.timer);
        state.timer = setTimeout(() => run(drawPreview()), 120);
    }

    async function save(patch, redraw = false) {
        await repo().upsert(companyId(), state.type, patch);
        if (redraw) await renderPage('invoice-templates');
        else refresh();
    }

    async function currentColumns() {
        return (await repo().find(companyId(), state.type)).columnConfig.map(c => ({ ...c }));
    }
    async function toggleColumn(key, visible) {
        const cols = (await currentColumns()).map(c => (c.key === key ? { ...c, visible } : c));
        if (!cols.some(c => c.visible)) {
            await renderPage('invoice-templates');
            throw new Error('Keep at least one column');
        }
        await save({ columnConfig: cols });
    }
    async function moveColumn(key, step) {
        const cols = await currentColumns();
        const i = cols.findIndex(c => c.key === key);
        const j = i + step;
        if (i < 0 || j < 0 || j >= cols.length) return;
        [cols[i], cols[j]] = [cols[j], cols[i]];
        await save({ columnConfig: cols }, true);
    }
    async function setLabel(key, value) {
        const { language } = await repo().find(companyId(), state.type);
        await save({ labels: { [language]: { [key]: value.trim() } } });
    }

    // Read, check and shrink an uploaded logo; re-encoding also drops any metadata in the file
    async function readLogo(file) {
        if (!V.settings.LOGO_TYPES.includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image');
        if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB');
        const url = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = () => rej(new Error('Could not read the image'));
            r.readAsDataURL(file);
        });
        const img = await new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = () => rej(new Error('This file is not a valid image'));
            i.src = url;
        });
        const k = Math.min(1, 600 / img.naturalWidth, 200 / img.naturalHeight);
        const width = Math.max(1, Math.round(img.naturalWidth * k));
        const height = Math.max(1, Math.round(img.naturalHeight * k));
        const canvas = document.createElement('canvas');
        Object.assign(canvas, { width, height });
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        return { mime, dataUri: canvas.toDataURL(mime, 0.9), width, height };
    }
    async function uploadLogo(file) {
        if (!file) return;
        try {
            const id = await repo().saveAsset(companyId(), await readLogo(file));
            await repo().setPrefs(companyId(), { logoAssetId: id });
            await repo().pruneAssets(companyId());
            showToast('Logo saved');
        } finally {
            await renderPage('invoice-templates');
        }
    }
    async function removeLogo() {
        await repo().setPrefs(companyId(), { logoAssetId: null });
        await repo().pruneAssets(companyId());
        await renderPage('invoice-templates');
    }
    async function saveExtraIds() {
        const extraTaxIds = [...document.querySelectorAll('.tpl-extra-id')]
            .map(row => [...row.querySelectorAll('input')].map(i => i.value.trim()))
            .filter(([label, value]) => label && value)
            .map(([label, value]) => ({ label, value }));
        await repo().setPrefs(companyId(), { extraTaxIds });
        refresh();
    }

    window.TemplateSettingsPage = {
        render,
        refresh,
        selectType: type => {
            state.type = type;
            return run(renderPage('invoice-templates'));
        },
        makeDefault: () =>
            run(
                repo()
                    .setPrefs(companyId(), { defaultTemplateType: state.type })
                    .then(() => renderPage('invoice-templates'))
            ),
        save: (patch, redraw) => run(save(patch, redraw)),
        toggleFlag: (key, on) => run(save({ fieldFlags: { [key]: on } })),
        toggleColumn: (key, on) => run(toggleColumn(key, on)),
        moveColumn: (key, step) => run(moveColumn(key, step)),
        setLabel: (key, value) => run(setLabel(key, value)),
        uploadLogo: file => run(uploadLogo(file)),
        removeLogo: () => run(removeLogo()),
        saveExtraIds: () => run(saveExtraIds())
    };
})();
