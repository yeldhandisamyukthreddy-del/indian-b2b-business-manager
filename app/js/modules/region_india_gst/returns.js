// GST return summaries (GSTR-1 outward supplies, GSTR-3B, HSN, rate-wise) from the company's documents.
// Pure: the GST page and the GST summary report pass the documents in. Sums are in whole paise.
// Bills and debit notes come from whichever module offers them ('tax.inputDocuments', e.g. purchasing);
// without one there is no input tax credit.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node
        ? { money: require('../../core/shared/money.js'), gst: require('./gst.js') }
        : { money: root.Vyapar.money, gst: root.Vyapar.modules.region_india_gst.gst };
    const api = factory(deps.money, deps.gst);
    if (node) module.exports = api;
    else root.Vyapar.modules.region_india_gst.returns = api;
})(typeof self !== 'undefined' ? self : this, function (money, gst) {
    'use strict';
    const { toPaise, fromPaise } = money;
    const inRange = (date, from, to) => (!from || (date || '') >= from) && (!to || (date || '') <= to);
    const HEADS = ['taxable', 'cgst', 'sgst', 'igst'];
    const net = (plus, minus) =>
        Object.fromEntries(HEADS.map(k => [k, fromPaise(plus.reduce((s, r) => s + toPaise(r[k]), 0) - minus.reduce((s, r) => s + toPaise(r[k]), 0))]));

    /**
     * @param {{ company, customers: object[], vendors: object[], invoices: object[], creditNotes: object[], bills?: object[], debitNotes?: object[] }} data
     */
    function buildGstData({ company, customers = [], vendors = [], invoices = [], creditNotes = [], bills = [], debitNotes = [] }, from, to) {
        const byId = list => new Map(list.map(x => [x.id, x]));
        const cust = byId(customers);
        const vend = byId(vendors);
        const home = company && company.stateCode;
        const withSplit = (doc, party) => ({ ...doc, ...gst.gstSplit(doc, home, party && party.stateCode), taxable: doc.taxable ?? doc.subtotal ?? 0 });

        const outward = invoices
            .filter(i => inRange(i.date, from, to))
            .map(i => {
                const c = cust.get(i.customerId);
                const r = withSplit(i, c);
                r.gstin = i.customerGstin ?? (c && c.gstin) ?? '';
                r.pos = i.placeOfSupply ?? (c && c.stateCode) ?? home ?? '';
                r.type = gst.supplyType(r.gstin, r.igst, i.grandTotal || 0);
                return r;
            });
        const credit = creditNotes
            .filter(r => inRange(r.date, from, to))
            .map(r => {
                const src = invoices.find(i => i.id === r.invoiceId);
                return withSplit({ ...r, placeOfSupply: r.placeOfSupply ?? (src && src.placeOfSupply) }, cust.get(r.customerId));
            });
        const inward = bills.filter(b => inRange(b.date, from, to)).map(b => withSplit(b, vend.get(b.vendorId)));
        const debit = debitNotes
            .filter(r => inRange(r.date, from, to))
            .map(r => {
                const src = bills.find(b => b.id === r.billId);
                return withSplit(
                    { ...r, placeOfSupply: r.placeOfSupply ?? (src && src.placeOfSupply), tax: r.tax || 0, taxable: r.taxable ?? r.grandTotal },
                    vend.get(r.vendorId)
                );
            });

        // Rate-wise and HSN-wise summaries from invoice lines (older lines may lack the split: derive it)
        const byRate = {};
        const byHsn = {};
        outward.forEach(inv =>
            (inv.items || []).forEach(it => {
                const taxable = toPaise(it.taxable ?? it.amount ?? 0);
                const tax = it.tax !== undefined ? toPaise(it.tax) : money.percentOf(taxable, it.gstRate || 0);
                const inter = inv.igst > 0;
                const half = money.splitHalf(tax);
                const igst = it.igst !== undefined ? toPaise(it.igst) : inter ? tax : 0;
                const cgst = it.cgst !== undefined ? toPaise(it.cgst) : inter ? 0 : half.cgst;
                const sgst = it.sgst !== undefined ? toPaise(it.sgst) : inter ? 0 : half.sgst;
                const add = (map, key, extra) => {
                    const row = map[key] || (map[key] = { taxable: 0, cgst: 0, sgst: 0, igst: 0, qty: 0, ...extra });
                    row.taxable += taxable;
                    row.cgst += cgst;
                    row.sgst += sgst;
                    row.igst += igst;
                    row.qty += it.qty || 0;
                };
                add(byRate, it.gstRate || 0, {});
                add(byHsn, `${it.hsn || '-'}|${it.gstRate || 0}`, { hsn: it.hsn || '-', unit: it.unit || '', rate: it.gstRate || 0, desc: it.name });
            })
        );
        const toRupees = row => ({ ...row, ...Object.fromEntries(HEADS.map(k => [k, fromPaise(row[k])])), qty: Math.round(row.qty * 1e6) / 1e6 });
        return {
            company,
            invoices: outward,
            creditNotes: credit,
            bills: inward,
            debitNotes: debit,
            byRate: Object.fromEntries(Object.entries(byRate).map(([k, v]) => [k, toRupees(v)])),
            byHsn: Object.values(byHsn).map(toRupees),
            out: net(outward, credit),
            itc: net(inward, debit)
        };
    }

    // GSTR-1 rows like the GST offline tool's B2B / B2CL / B2CS sheets, one per invoice and rate, plus credit notes
    function gstr1Rows(g, stateName) {
        const rows = [];
        g.invoices.forEach(inv => {
            const rates = {};
            (inv.items || []).forEach(it => {
                const r = rates[it.gstRate || 0] || (rates[it.gstRate || 0] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
                const taxable = toPaise(it.taxable ?? it.amount ?? 0);
                const tax = it.tax !== undefined ? toPaise(it.tax) : money.percentOf(taxable, it.gstRate || 0);
                r.taxable += taxable;
                if (inv.igst > 0) r.igst += it.igst !== undefined ? toPaise(it.igst) : tax;
                else {
                    const half = money.splitHalf(tax);
                    r.cgst += it.cgst !== undefined ? toPaise(it.cgst) : half.cgst;
                    r.sgst += it.sgst !== undefined ? toPaise(it.sgst) : half.sgst;
                }
            });
            Object.entries(rates).forEach(([rate, r]) =>
                rows.push([
                    inv.type,
                    inv.gstin,
                    inv.customerName,
                    inv.number,
                    inv.date,
                    inv.grandTotal,
                    `${inv.pos}-${stateName(inv.pos)}`,
                    'N',
                    rate,
                    fromPaise(r.taxable),
                    fromPaise(r.igst),
                    fromPaise(r.cgst),
                    fromPaise(r.sgst),
                    0
                ])
            );
        });
        g.creditNotes.forEach(cn => {
            const gstin = (g.invoices.find(i => i.id === cn.invoiceId) || {}).gstin || '';
            rows.push([
                gstin ? 'CDNR' : 'CDNUR',
                gstin,
                cn.customerName,
                cn.number,
                cn.date,
                -cn.grandTotal,
                '',
                'N',
                '',
                -cn.taxable,
                -cn.igst,
                -cn.cgst,
                -cn.sgst,
                0
            ]);
        });
        return rows;
    }
    const GSTR1_HEADERS = [
        'Type',
        'GSTIN/UIN of Recipient',
        'Receiver Name',
        'Invoice Number',
        'Invoice Date',
        'Invoice Value',
        'Place Of Supply',
        'Reverse Charge',
        'Rate',
        'Taxable Value',
        'IGST',
        'CGST',
        'SGST',
        'Cess'
    ];

    return { buildGstData, gstr1Rows, GSTR1_HEADERS };
});
