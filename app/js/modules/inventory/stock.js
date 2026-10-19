// Stock rules of the inventory module. Stock is a ledger of movements (store 'stockMovements'); a product's
// stock on hand is the sum of its movements, cached on product.stockQty for the screens. Movements come from
// domain events (invoices, credit notes, purchase bills, debit notes), opening stock and manual adjustments.
// Each movement has an id derived from the event and line, so a redelivered event changes nothing, and the
// cache is recomputed from the ledger, never incremented, so it can always be rebuilt.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        const mods = ((root.Vyapar = root.Vyapar || {}).modules = root.Vyapar.modules || {});
        (mods.inventory = mods.inventory || {}).stock = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MOVEMENTS = 'stockMovements';
    // Quantities are decimals (2.5 bags); sums are rounded to 6 places so 0.1 + 0.2 stays 0.3
    const roundQty = n => Math.round((n + Number.EPSILON) * 1e6) / 1e6;

    // What each document event does to stock: sign +1 brings goods in, -1 sends them out
    const RULES = Object.freeze({
        'invoice.finalized': { sign: -1, kind: 'Sale' },
        'invoice.voided': { sign: 1, kind: 'Sale cancelled' },
        'credit.applied': { sign: 1, kind: 'Sales return' },
        'credit.voided': { sign: -1, kind: 'Sales return cancelled' },
        'bill.recorded': { sign: 1, kind: 'Purchase' },
        'bill.voided': { sign: -1, kind: 'Purchase cancelled' },
        'debit.applied': { sign: -1, kind: 'Purchase return' },
        'debit.voided': { sign: 1, kind: 'Purchase return cancelled' }
    });

    // Movements for one event: one per stocked line, with ids '<event id>#<line>'
    function movementsFor(event) {
        const rule = RULES[event.type];
        const doc = event.payload && event.payload.doc;
        if (!rule || !doc) return [];
        return (doc.items || []).flatMap((it, i) => {
            const qty = Number(it.qty) || 0;
            if (!it.productId || !qty) return [];
            const ext = (it.extensions && it.extensions.inventory) || {};
            return [
                {
                    id: `${event.id}#${i}`,
                    productId: it.productId,
                    qty: roundQty(rule.sign * qty),
                    kind: rule.kind,
                    ref: doc.number || String(doc.id),
                    date: doc.date || '',
                    eventId: event.id,
                    ...(ext.batch ? { batch: ext.batch } : {}),
                    ...(ext.expiry ? { expiry: ext.expiry } : {})
                }
            ];
        });
    }

    const openingMovement = (product, qty, date) => ({
        id: `opening:${product.id}`,
        productId: product.id,
        qty: roundQty(Number(qty) || 0),
        kind: 'Opening stock',
        ref: '',
        date
    });

    // Stock on hand per product id
    function levels(movements) {
        const out = new Map();
        movements.forEach(m => out.set(m.productId, roundQty((out.get(m.productId) || 0) + m.qty)));
        return out;
    }

    // Quantity left per batch of one product (batches with nothing left are dropped), earliest expiry first
    function batches(movements, productId) {
        const out = new Map();
        movements
            .filter(m => m.productId === productId && m.batch)
            .forEach(m => {
                const b = out.get(m.batch) || { batch: m.batch, expiry: m.expiry || '', qty: 0 };
                out.set(m.batch, { ...b, expiry: b.expiry || m.expiry || '', qty: roundQty(b.qty + m.qty) });
            });
        return [...out.values()]
            .filter(b => b.qty !== 0)
            .sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999') || a.batch.localeCompare(b.batch));
    }

    // Lines that need more than is on hand. previousItems: what an edited document already took out.
    function shortages(items, products, previousItems = []) {
        const need = new Map();
        items.forEach(i => i.productId && need.set(i.productId, (need.get(i.productId) || 0) + (Number(i.qty) || 0)));
        previousItems.forEach(i => i.productId && need.set(i.productId, (need.get(i.productId) || 0) - (Number(i.qty) || 0)));
        const byId = new Map(products.map(p => [p.id, p]));
        return [...need.entries()]
            .map(([id, qty]) => ({ product: byId.get(id), qty: roundQty(qty) }))
            .filter(({ product, qty }) => product && qty > 0 && (product.stockQty || 0) - qty < 0)
            .map(({ product, qty }) => ({ productId: product.id, name: product.name, onHand: product.stockQty || 0, needed: qty }));
    }

    const lowStockLevel = p =>
        p.extensions && p.extensions.inventory && typeof p.extensions.inventory.minStock === 'number' ? p.extensions.inventory.minStock : (p.minStock ?? 10);
    const isLowStock = p => (p.stockQty || 0) <= lowStockLevel(p);

    // Writes movements that are not there yet, then recomputes the cached stock of the products they touch.
    // ctx: the module context (ctx.repo is scoped to the company).
    async function record(ctx, movements) {
        const repo = ctx.repo(MOVEMENTS);
        for (const m of movements) if (!(await repo.get(m.id))) await repo.add(m);
        await refreshLevels(ctx, [...new Set(movements.map(m => m.productId))]);
    }
    async function refreshLevels(ctx, productIds) {
        if (!productIds.length) return;
        const on = levels(await ctx.repo(MOVEMENTS).list());
        const products = ctx.repo('products');
        for (const id of productIds) {
            const p = await products.get(id);
            const level = on.get(id) || 0;
            if (p && p.stockQty !== level) await products.put({ ...p, stockQty: level });
        }
    }

    return { MOVEMENTS, RULES, movementsFor, openingMovement, levels, batches, shortages, lowStockLevel, isLowStock, record, refreshLevels, roundQty };
});
