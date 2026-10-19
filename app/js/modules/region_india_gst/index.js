// India GST module: the GST tax strategy (CGST + SGST within a state, IGST across states), GST rates,
// GSTIN checks, the GST blocks on printed invoices, the e-way bill field, GST reports (GSTR-1, GSTR-3B, HSN)
// and a TDS/TCS register. Input tax credit comes from bills a purchasing module offers ('tax.inputDocuments').
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node
        ? { gst: require('./gst.js'), blocks: require('./document-blocks.js'), returns: require('./returns.js'), money: require('../../core/shared/money.js') }
        : (m => ({ gst: m.gst, blocks: m.documentBlocks, returns: m.returns, money: root.Vyapar.money }))(root.Vyapar.modules.region_india_gst);
    const api = factory(deps);
    if (node) module.exports = api;
    else root.Vyapar.app.register(api);
})(typeof self !== 'undefined' ? self : this, function (deps) {
    'use strict';
    const { gst, blocks, returns, money } = deps;
    const EXT = 'region_india_gst';

    // GSTIN of a company, customer or vendor: wrong format or state blocks the save; a wrong check character asks
    function checkContactGstin(data) {
        const r = gst.checkGstin(data.gstin, data.stateCode);
        return r.error ? { veto: r.error } : r.warning ? { warning: r.warning } : null;
    }
    // An invoice to a customer whose saved GSTIN is malformed would be rejected in GSTR-1
    function validateInvoice(doc) {
        if (!doc.customerGstin) return null;
        const r = gst.checkGstin(doc.customerGstin);
        return r.error ? { veto: `The customer's GSTIN is not valid (${r.error}). Correct it under Masters → Customers.` } : null;
    }
    // Typing a GSTIN fills in the matching state (company, customer and vendor forms)
    function gstinStateSync(form, { states }) {
        const g = form.querySelector('[name="gstin"]');
        const st = form.querySelector('[name="stateCode"]');
        if (!g || !st) return;
        g.addEventListener('input', () => {
            g.value = gst.normalizeGstin(g.value);
            const code = g.value.slice(0, 2);
            if (/^\d{2}$/.test(code) && states.some(s => s.c === code)) st.value = code;
        });
    }

    // The e-way bill number used to be a top-level invoice field; this module keeps it in invoice.extensions
    const moveEwayBills = {
        id: '001-eway-bill-to-extensions',
        async up(ctx) {
            const repo = ctx.repo('invoices');
            for (const inv of (await repo.list()).filter(i => i.ewayBillNumber !== undefined)) {
                const next = { ...inv, extensions: { ...inv.extensions, [EXT]: { ...(inv.extensions || {})[EXT], ewayBillNumber: inv.ewayBillNumber } } };
                delete next.ewayBillNumber;
                await repo.put(next);
            }
        },
        async down(ctx) {
            const repo = ctx.repo('invoices');
            for (const inv of (await repo.list()).filter(i => i.extensions && i.extensions[EXT] && 'ewayBillNumber' in i.extensions[EXT])) {
                const ext = { ...inv.extensions[EXT] };
                const next = { ...inv, ewayBillNumber: ext.ewayBillNumber, extensions: { ...inv.extensions } };
                delete ext.ewayBillNumber;
                if (Object.keys(ext).length) next.extensions[EXT] = ext;
                else delete next.extensions[EXT];
                await repo.put(next);
            }
        }
    };

    // Reports → GST Summary: output tax, input tax credit and the net, for the chosen dates
    async function gstSummaryReport(ctx, f) {
        const inputs = await Promise.all((await ctx.contributions('tax.inputDocuments')).map(c => c.value(ctx)));
        const invoices = await ctx.list('invoices');
        const g = returns.buildGstData(
            {
                company: await ctx.company(),
                customers: await ctx.list('customers'),
                vendors: await ctx.list('vendors'),
                invoices,
                creditNotes: await ctx.list('salesReturns'),
                bills: inputs.flatMap(x => x.bills || []),
                debitNotes: inputs.flatMap(x => x.debitNotes || [])
            },
            f.from,
            f.to
        );
        const p = money.toPaise;
        const tax = x => p(x.cgst) + p(x.sgst) + p(x.igst);
        const rows = ['cgst', 'sgst', 'igst'].map(k => ({ head: k.toUpperCase(), output: p(g.out[k]), input: p(g.itc[k]), net: p(g.out[k]) - p(g.itc[k]) }));
        const netTotal = tax(g.out) - tax(g.itc);
        return {
            title: '📋 GST Summary Report',
            summary: [
                { label: 'Output GST', value: tax(g.out), format: 'money', tone: 'success' },
                { label: 'Input GST Credit', value: tax(g.itc), format: 'money', tone: 'primary' },
                { label: netTotal >= 0 ? 'GST Payable' : 'GST Credit', value: Math.abs(netTotal), format: 'money', tone: netTotal >= 0 ? 'danger' : 'success' }
            ],
            tables: [
                {
                    columns: [
                        { key: 'head', label: 'Tax' },
                        { key: 'output', label: 'Output', format: 'money' },
                        { key: 'input', label: 'Input credit', format: 'money' },
                        { key: 'net', label: 'Net', format: 'money' }
                    ],
                    rows
                }
            ],
            note: 'Taxable sales and output tax are net of credit notes; input credit is net of debit notes. See GST & Tax → GST Reports for GSTR-1 and GSTR-3B.',
            csv: rows.map(r => ({ Tax: r.head, Output: money.fromPaise(r.output), InputCredit: money.fromPaise(r.input), Net: money.fromPaise(r.net) }))
        };
    }

    return {
        id: 'region_india_gst',
        version: '1.0.0',
        displayName: 'India GST',
        description: 'GST on every document, GSTIN checks, GST invoice format, GSTR-1 / GSTR-3B summaries and a TDS register.',
        dependsOn: [],
        adds: [
            'CGST + SGST within the state, IGST across states',
            'GST rates (0.25% to 40%)',
            'GSTIN format, state and check-character checks',
            'GST blocks and HSN summary on printed invoices',
            'E-way bill number on invoices',
            'GSTR-1, GSTR-3B and HSN summaries with CSV export',
            'TDS/TCS register'
        ],
        stores: ['tdsEntries'],
        sections: [{ id: 'gstTax', label: 'GST & Tax', labels: { te: 'GST & పన్ను' }, order: 60 }],
        navItems: [
            {
                id: 'gst-reports',
                label: 'GST Reports',
                labels: { te: 'GST నివేదికలు' },
                route: 'gst-reports',
                section: 'gstTax',
                order: 10,
                requires: ['gst.reports'],
                icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /> <path d="M14 2v6h6M12 18v-6M9 15h6" />'
            },
            {
                id: 'tds',
                label: 'TDS/TCS',
                labels: { te: 'TDS/TCS' },
                route: 'tds',
                section: 'gstTax',
                order: 20,
                requires: ['gst.reports'],
                newAction: 'showTdsForm',
                icon: '<circle cx="12" cy="12" r="10" /> <path d="M12 6v6l4 2" />'
            }
        ],
        permissions: ['gst.reports', 'gst.tds'],
        migrations: [moveEwayBills],
        extensionPoints: {
            'tax.calculator': { ...gst.calculator, priority: 10 },
            'tax.rates': gst.GST_RATES,
            'contact.validate': checkContactGstin,
            'contact.form': gstinStateSync,
            'invoice.validate': validateInvoice,
            'invoice.fields': { name: 'ewayBillNumber', label: 'E-way bill number', maxlength: 20, legacy: 'ewayBillNumber' },
            'document.blocks': blocks,
            'reports.entries': {
                id: 'gst-summary',
                label: 'GST Summary',
                icon: '📋',
                description: 'Output GST, input credit, net',
                order: 82,
                filters: ['date'],
                run: gstSummaryReport
            }
        }
    };
});
