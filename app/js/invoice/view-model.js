// buildInvoiceViewModel(invoice, org, settings, locale, mode): the one object every invoice template renders.
// Pure and synchronous: no I/O, no template logic, no clock (the caller passes asOfDate). Every amount is
// formatted for display and kept as raw paise under totals.raw. The result is deeply frozen.
// Field reference: docs/invoice-templates.md.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node
        ? {
              money: require('../money.js'),
              totals: require('./totals.js'),
              format: require('./format.js'),
              labels: require('./labels.js'),
              registry: require('./registry.js'),
              regions: require('./regions.js'),
              sanitize: require('./sanitize.js'),
              schema: require('./schema.js'),
              viewModelTable: require('./view-model-table.js')
          }
        : root.Vyapar;
    const api = factory(deps);
    if (node) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).viewModel = api;
})(typeof self !== 'undefined' ? self : this, function (deps) {
    'use strict';
    const { money, totals, format, labels: labelsMod, registry, regions, sanitize, schema, viewModelTable } = deps;

    const MODES = ['preview', 'print', 'pdf'];
    const LOCALE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
    const LOGO_BOX = { A4: [180, 60], Letter: [180, 60], '80mm': [160, 56], '58mm': [120, 44] };
    const block = (sectionLabel, sectionValue) => ({ sectionLabel, sectionValue: String(sectionValue) });
    const lines = text =>
        String(text || '')
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(Boolean);
    const isNum = v => typeof v === 'number' && Number.isFinite(v);

    function deepFreeze(o) {
        Object.values(o).forEach(v => v && typeof v === 'object' && !Object.isFrozen(v) && deepFreeze(v));
        return Object.freeze(o);
    }

    function checkInputs(invoice, org, settings, locale, mode) {
        if (!MODES.includes(mode)) throw new Error(`mode must be preview, print or pdf (got "${String(mode).slice(0, 20)}")`);
        if (!LOCALE.test(String(locale))) throw new Error(`locale must look like en-IN (got "${String(locale).slice(0, 20)}")`);
        if (!settings || !registry.isTemplateType(settings.templateType) || !settings.fieldFlags || !Array.isArray(settings.columnConfig))
            throw new Error('settings must come from the template settings (mergeSettings)');
        const errors = schema.validateDomain(invoice, org);
        if (errors.length) throw new schema.InvoiceDataError(errors);
    }

    function makeContext(invoice, org, settings, locale) {
        const template = registry.getTemplate(settings.templateType);
        const interstate =
            typeof invoice.interstate === 'boolean'
                ? invoice.interstate
                : !!(org.stateCode && invoice.placeOfSupply && org.stateCode !== invoice.placeOfSupply);
        const t = totals.computeTotals({
            lines: invoice.lines.map(l => ({ qty: l.qty, rate: l.rate, gstRate: l.gstRate, discount: l.discount || null, stored: l.stored || null })),
            interstate,
            inclusive: !!invoice.inclusive,
            discount: invoice.discount || null,
            shipping: invoice.shipping || null,
            roundOff: invoice.roundOff || 'none'
        });
        const lang = locale.split('-')[0];
        const numLocale = `${locale}-u-nu-latn`; // Latin digits on tax documents in every language
        const currency = invoice.currency || 'INR';
        const after = settings.fieldFlags.showCurrencyAfterAmount;
        return {
            invoice,
            org,
            settings,
            template,
            page: registry.getPageSize(settings.templateType, settings.pageSize),
            labels: labelsMod.resolveLabels(lang, settings.labels),
            lang,
            locale,
            numLocale,
            currency,
            interstate,
            totals: t,
            taxStyle: template.taxColumns,
            amount: p => money.formatMoney(p, { locale: numLocale, currency, symbol: false }),
            money: p => money.formatMoney(p, { locale: numLocale, currency, currencyAfter: after })
        };
    }

    // A saved invoice prints exactly as issued; if its items no longer add up to its total, refuse to print it
    function checkSavedTotal(ctx) {
        const { invoice, totals: t } = ctx;
        if (!isNum(invoice.grandTotal) || money.toPaise(invoice.grandTotal) === t.total) return;
        throw new schema.InvoiceDataError([
            `${invoice.number}: the items add up to ${ctx.money(t.total)} but the saved total is ${ctx.money(money.toPaise(invoice.grandTotal))}. Open the invoice, check it and save it again`
        ]);
    }

    function scaleLogo(ctx) {
        const logo = ctx.settings.logo;
        if (!ctx.settings.fieldFlags.showLogo || !logo || !logo.dataUri) return null;
        const [maxW, maxH] = LOGO_BOX[ctx.page.key];
        const k = Math.min(1, maxW / logo.width, maxH / logo.height);
        return { dataUri: logo.dataUri, scaledWidth: Math.round(logo.width * k), scaledHeight: Math.round(logo.height * k) };
    }

    function statusStamp(ctx, raw) {
        const { invoice, labels } = ctx;
        if (raw.balanceDue <= 0 || invoice.status === 'paid') return { text: labels.stampPaid, tone: 'paid' };
        if (invoice.dueDate && invoice.asOfDate && invoice.dueDate < invoice.asOfDate) return { text: labels.stampOverdue, tone: 'overdue' };
        if (raw.paid + raw.credits > 0) return { text: labels.stampPartial, tone: 'partial' };
        return null;
    }

    function buildHeader(ctx, region, stamp) {
        const { org, invoice, labels, numLocale } = ctx;
        const time = invoice.createdAt ? format.formatTime(invoice.createdAt, numLocale, org.timeZone || 'Asia/Kolkata') : '';
        return {
            companyName: org.name,
            companyAddress: lines(org.address),
            contactLine: [org.phone, org.email].filter(Boolean).join(' · '),
            logo: scaleLogo(ctx),
            title: labels.title,
            entityNumber: block(labels.invoiceNumber, invoice.number),
            statusStamp: stamp,
            date: block(labels.invoiceDate, format.formatDate(invoice.date, numLocale)),
            time: time ? block(labels.time, time) : null,
            taxIdBlocks: region.orgBlocks
        };
    }

    function buildBlocks(ctx, region, totalsVm) {
        const { invoice, labels, numLocale } = ctx;
        const days = invoice.creditDays;
        return {
            taxIdBlock: region.orgBlocks[0] || null,
            dueDateBlock: invoice.dueDate ? block(labels.dueDate, format.formatDate(invoice.dueDate, numLocale)) : null,
            referenceBlock: invoice.reference ? block(labels.reference, invoice.reference) : null,
            paymentTermsBlock: isNum(days)
                ? block(labels.paymentTerms, days > 0 ? labels.paymentTermsValue.replace('{days}', days) : labels.dueOnReceipt)
                : null,
            balanceDueBlock: totalsVm.balanceDue
        };
    }

    function buildParties(ctx, region) {
        const { invoice, labels } = ctx;
        const party = (label, p, taxIdBlocks) => (p ? { sectionLabel: label, name: p.name, lines: lines(p.address), phone: p.phone || '', taxIdBlocks } : null);
        const pos = invoice.placeOfSupply;
        return {
            billingAddress: party(labels.billTo, invoice.customer, region.billToBlocks),
            shippingAddress: party(labels.shipTo, invoice.shipTo, region.shipToBlocks),
            customerTaxId: (invoice.customer && invoice.customer.gstin) || null,
            placeOfSupply: pos ? `${invoice.placeOfSupplyName || ''} (${pos})`.trim() : null
        };
    }

    function buildExtras(ctx, header, blocks, totalsVm) {
        const { org, invoice, labels } = ctx;
        const bank = (org.bankAccounts || [])[0];
        return {
            notes: { sectionLabel: labels.notes, html: sanitize.sanitizeRichText(invoice.notes) },
            terms: { sectionLabel: labels.terms, html: sanitize.sanitizeRichText(org.terms) },
            paymentDetails: bank
                ? {
                      sectionLabel: labels.paymentDetails,
                      blocks: [
                          block(labels.bankName, bank.bankName || ''),
                          block(labels.accountNo, bank.accountNo || ''),
                          ...(bank.ifsc ? [block(labels.ifsc, bank.ifsc)] : [])
                      ]
                  }
                : null,
            paymentStub: {
                title: labels.paymentStub,
                companyName: org.name,
                customerBlock: invoice.customer ? block(labels.customer, invoice.customer.name) : null,
                numberBlock: header.entityNumber,
                dueDateBlock: blocks.dueDateBlock,
                amountDueBlock: totalsVm.balanceDue,
                amountEnclosedLabel: labels.amountEnclosed
            },
            signature: { forLine: `${labels.signatureFor} ${org.name}`, label: labels.authorisedSignatory }
        };
    }

    function buildFlags(ctx, mode, vm) {
        const f = ctx.settings.fieldFlags;
        return {
            isForPdf: mode === 'pdf',
            isRtl: labelsMod.RTL_LANGUAGES.includes(ctx.lang),
            isThermal: ctx.page.thermal,
            isLogoExist: !!vm.header.logo,
            isOrgNameRequired: f.isOrgNameRequired,
            isOrgAddressRequired: f.isOrgAddressRequired && vm.header.companyAddress.length > 0,
            isTitleRequired: f.isTitleRequired,
            isEntityDateRequired: f.isEntityDateRequired,
            isTimeRequired: f.isTimeRequired && !!vm.header.time,
            isDueDateRequired: f.isDueDateRequired && !!vm.blocks.dueDateBlock,
            isBillToRequired: f.isBillToRequired && !!vm.parties.billingAddress,
            isShipToRequired: f.isShipToRequired && !!vm.parties.shippingAddress,
            isReferenceNumberRequired: f.isReferenceNumberRequired && !!vm.blocks.referenceBlock,
            isPaymentTermsRequired: f.isPaymentTermsRequired && !!vm.blocks.paymentTermsBlock,
            isSubTotalRequired: f.isSubTotalRequired,
            isTotalRequired: f.isTotalRequired,
            isBalanceDueRequired: f.isBalanceDueRequired,
            isAmountInWordsRequired: f.isAmountInWordsRequired && !!vm.totals.amountInWords,
            isTaxSummaryRequired: f.isTaxSummaryRequired && !!vm.taxSummary && vm.totals.taxRows.length > 0,
            isNotesExist: f.showNotes && !!vm.notes.html,
            isTermsAndConditionsRequired: f.isTermsAndConditionsRequired && !!vm.terms.html,
            isPaymentDetailsRequired: f.isPaymentDetailsRequired && !!vm.paymentDetails,
            isPaymentStubRequired: f.isPaymentStubRequired,
            isStatusStampRequired: f.isStatusStampRequired && !!vm.header.statusStamp,
            isSignatureRequired: f.isSignatureRequired,
            isInclusiveTax: ctx.totals.inclusive,
            isInterState: ctx.interstate,
            showCurrencyAfterAmount: f.showCurrencyAfterAmount
        };
    }

    function buildMeta(ctx, mode, isRtl) {
        const { page, labels, org, invoice, settings } = ctx;
        return {
            templateType: settings.templateType,
            locale: ctx.locale,
            lang: ctx.lang,
            dir: isRtl ? 'rtl' : 'ltr',
            mode,
            pageSize: page.key,
            pageWidth: page.width,
            pageHeight: page.height,
            pageMargin: page.margin,
            contentWidth: page.contentWidth || null,
            isThermal: page.thermal,
            accentColor: settings.accentColor,
            documentTitle: `${labels.title} ${invoice.number}`,
            runningHeaderCss: sanitize.cssString(`${org.name} · ${invoice.number}`),
            pageLabelCss: sanitize.cssString(`${labels.page} `),
            ofLabelCss: sanitize.cssString(` ${labels.of} `)
        };
    }

    function buildInvoiceViewModel(invoice, org, settings, locale = 'en-IN', mode = 'preview') {
        checkInputs(invoice, org, settings, locale, mode);
        const ctx = makeContext(invoice, org, settings, locale);
        checkSavedTotal(ctx);
        const region = regions.collect(regions.activeModules(settings.regions), ctx);
        const table = viewModelTable.buildTable(ctx, region);
        const totalsVm = viewModelTable.buildTotals(ctx, money.toPaise(invoice.paidAmount), money.toPaise(invoice.creditedAmount));
        const header = buildHeader(ctx, region, statusStamp(ctx, totalsVm.raw));
        const blocks = buildBlocks(ctx, region, totalsVm);
        const vm = {
            labels: ctx.labels,
            header,
            blocks,
            parties: buildParties(ctx, region),
            ...table,
            totals: totalsVm,
            taxSummary: region.taxSummary,
            regionBlocks: region.documentBlocks,
            customFieldBlocks: region.customFieldBlocks,
            regionNotes: region.notes,
            ...buildExtras(ctx, header, blocks, totalsVm)
        };
        const flags = buildFlags(ctx, mode, vm);
        return deepFreeze({ meta: buildMeta(ctx, mode, flags.isRtl), flags, ...vm });
    }

    return { buildInvoiceViewModel };
});
