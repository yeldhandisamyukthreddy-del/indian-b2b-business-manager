// Line-item table and totals of the invoice view model.
// Columns and cells are built from the same list, so a header and its cells always line up.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { money: require('../money.js'), format: require('./format.js') } : root.Vyapar;
    const api = factory(deps.money, deps.format);
    if (node) module.exports = api;
    else (root.Vyapar = root.Vyapar || {}).viewModelTable = api;
})(typeof self !== 'undefined' ? self : this, function (money, format) {
    'use strict';

    const block = (sectionLabel, sectionValue) => ({ sectionLabel, sectionValue });
    const col = (key, label, align = 'end') => ({ key, label, align });

    const BASE_COLUMNS = {
        index: l => col('index', l.colIndex, 'center'),
        name: l => col('name', l.colName, 'start'),
        hsnOrSac: l => col('hsnOrSac', l.colHsnOrSac, 'start'),
        qty: l => col('qty', l.colQty),
        rate: l => col('rate', l.colRate),
        discount: l => col('discount', l.colDiscount),
        amount: l => col('amount', l.colAmount),
        total: l => col('total', l.colTotal)
    };

    function lineItem(line, t, i, ctx) {
        const { labels, numLocale } = ctx;
        const expiry = line.expiry ? format.formatDate(line.expiry, numLocale) : null;
        const meta = [
            line.description,
            line.batch && `${labels.batch}: ${line.batch}`,
            line.serial && `${labels.serial}: ${line.serial}`,
            expiry && `${labels.expiry}: ${expiry}`
        ].filter(Boolean);
        const pctDiscount = line.discount && line.discount.type === 'percent' && t.lineDiscount;
        return {
            index: i + 1,
            name: line.name,
            description: line.description || '',
            hsnOrSac: line.hsn || '',
            qtyWithUnit: format.formatQty(line.qty, line.unit, numLocale),
            rate: format.formatRate(line.rate, numLocale),
            discount: t.lineDiscount ? ctx.amount(t.lineDiscount) : '',
            discountNote: pctDiscount ? format.formatPercent(line.discount.value, numLocale) : '',
            taxName: ctx.interstate ? labels.igst : `${labels.cgst}+${labels.sgst}`,
            taxPercent: format.formatPercent(t.gstRate, numLocale),
            taxAmount: ctx.amount(t.tax),
            // Inclusive prices: the amount column shows the taxable value taken out of the price
            amount: ctx.amount(ctx.totals.inclusive ? t.taxable : t.amount),
            total: ctx.amount(t.total),
            image: line.image || null,
            batch: line.batch || null,
            serial: line.serial || null,
            expiry,
            meta,
            raw: { amount: t.amount, taxable: t.taxable, tax: t.tax, total: t.total }
        };
    }

    function baseCell(key, item, column) {
        const values = {
            index: String(item.index),
            name: item.name,
            hsnOrSac: item.hsnOrSac,
            qty: item.qtyWithUnit,
            rate: item.rate,
            discount: item.discount,
            amount: item.amount,
            total: item.total
        };
        const sub = key === 'name' ? item.meta : key === 'discount' && item.discountNote ? [item.discountNote] : [];
        return { key, value: values[key], align: column.align, sub };
    }

    function buildTable(ctx, region) {
        const { settings, totals, labels, invoice } = ctx;
        const hasDiscount = totals.lines.some(t => t.lineDiscount !== 0);
        const visible = settings.columnConfig.filter(c => c.visible && (c.key !== 'discount' || hasDiscount)).map(c => c.key);
        const taxColumns = region.taxModule.taxColumns(ctx.taxStyle, ctx) || [];
        const columns = visible.flatMap(k => (k === 'tax' ? taxColumns : [BASE_COLUMNS[k](labels)]));
        if (!columns.length) throw new Error('Choose at least one column to show on the invoice');
        const lineItems = invoice.lines.map((line, i) => {
            const t = totals.lines[i];
            const item = lineItem(line, t, i, ctx);
            const cells = visible.flatMap(k => (k === 'tax' ? region.taxModule.taxCells(t, ctx.taxStyle, ctx) : [baseCell(k, item, BASE_COLUMNS[k](labels))]));
            return { ...item, cells };
        });
        // Empty cells for tables without colspan (spreadsheet layout): n-1 and n-2 of them
        const blanks = n => Array.from({ length: Math.max(0, n) }, () => ({ blank: '' }));
        return { columns, lineItems, columnCount: columns.length, fillerCells: blanks(columns.length - 1), padCells: blanks(columns.length - 2) };
    }

    // Totals as labelled blocks (null when a row does not apply), plus the raw paise for tests
    function buildTotals(ctx, paid, credits) {
        const { totals: t, labels, numLocale } = ctx;
        const m = ctx.money;
        const balanceDue = t.total - paid - credits;
        const shipping = t.shipping ? t.shipping.amount : 0;
        return {
            subTotal: block(labels.subTotal, m(t.subTotal)),
            discount: t.discount ? block(labels.discount, m(-t.discount)) : null,
            shipping: shipping ? block(labels.shipping, m(shipping)) : null,
            taxRows: t.taxRows.map(r => block(`${labels[r.name.toLowerCase()]} @ ${format.formatPercent(r.rate, numLocale)}`, m(r.amount))),
            roundOff: t.roundOff ? block(labels.roundOff, m(t.roundOff)) : null,
            total: block(labels.total, m(t.total)),
            paid: paid ? block(labels.paid, m(-paid)) : null,
            credits: credits ? block(labels.credits, m(-credits)) : null,
            balanceDue: block(labels.balanceDue, m(balanceDue)),
            amountInWords: ctx.currency === 'INR' ? money.amountInWordsPaise(t.total) : '',
            taxIncludedNote: t.inclusive ? labels.taxIncluded : null,
            itemCount: t.lines.length,
            raw: {
                subTotal: t.subTotal,
                discount: t.discount,
                shipping,
                taxableTotal: t.taxableTotal,
                taxTotal: t.taxTotal,
                roundOff: t.roundOff,
                total: t.total,
                paid,
                credits,
                balanceDue,
                taxRows: t.taxRows.map(r => ({ ...r }))
            }
        };
    }

    return { buildTable, buildTotals };
});
