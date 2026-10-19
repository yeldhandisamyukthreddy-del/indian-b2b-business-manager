// Unit and property tests for the document totals engine
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeTotals } = require('../../app/js/core/documents/totals.js');

const sum = (arr, k) => arr.reduce((a, x) => a + (k ? x[k] : x), 0);

test('exclusive tax, intra-state: CGST and SGST rows per rate', () => {
    const t = computeTotals({
        lines: [
            { qty: 10, rate: 100, gstRate: 18 },
            { qty: 1, rate: 50, gstRate: 5 }
        ],
        interstate: false
    });
    assert.equal(t.subTotal, 105000);
    assert.equal(t.taxTotal, 18250);
    assert.deepEqual(
        t.taxRows.map(r => [r.name, r.rate, r.amount]),
        [
            ['CGST', 2.5, 125],
            ['SGST', 2.5, 125],
            ['CGST', 9, 9000],
            ['SGST', 9, 9000]
        ]
    );
    assert.equal(t.total, 123250);
    assert.equal(t.roundOff, 0);
});

test('inter-state uses IGST at the full rate', () => {
    const t = computeTotals({ lines: [{ qty: 10, rate: 100, gstRate: 18 }], interstate: true });
    assert.deepEqual(t.taxRows, [{ name: 'IGST', rate: 18, amount: 18000 }]);
    assert.equal(t.lines[0].igst, 18000);
    assert.equal(t.lines[0].cgst, 0);
});

test('multi-tax grouping merges lines with the same tax and rate', () => {
    const t = computeTotals({
        lines: [
            { qty: 1, rate: 100, gstRate: 18 },
            { qty: 2, rate: 100, gstRate: 18 },
            { qty: 1, rate: 100, gstRate: 12 }
        ],
        interstate: true
    });
    assert.deepEqual(
        t.taxRows.map(r => [r.name, r.rate, r.amount]),
        [
            ['IGST', 12, 1200],
            ['IGST', 18, 5400]
        ]
    );
});

test('zero-rated lines add no tax rows', () => {
    const t = computeTotals({ lines: [{ qty: 3, rate: 40, gstRate: 0 }], interstate: false });
    assert.deepEqual(t.taxRows, []);
    assert.equal(t.total, 12000);
});

test('line discounts: percent and amount, applied before tax', () => {
    const t = computeTotals({
        lines: [
            { qty: 10, rate: 100, gstRate: 18, discount: { type: 'percent', value: 10 } },
            { qty: 1, rate: 500, gstRate: 18, discount: { type: 'amount', value: 50 } }
        ],
        interstate: true
    });
    assert.deepEqual(
        t.lines.map(l => [l.gross, l.lineDiscount, l.amount, l.tax]),
        [
            [100000, 10000, 90000, 16200],
            [50000, 5000, 45000, 8100]
        ]
    );
    assert.equal(t.total, 135000 + 24300);
});

test('a line discount larger than the line is rejected with a readable error', () => {
    assert.throws(
        () => computeTotals({ lines: [{ qty: 1, rate: 10, gstRate: 18, discount: { type: 'amount', value: 11 } }], interstate: false }),
        /Line 1: discount ₹11.00 is more than the line amount ₹10.00/
    );
    assert.throws(
        () => computeTotals({ lines: [{ qty: 1, rate: 10, gstRate: 18, discount: { type: 'percent', value: 101 } }] }),
        /Line 1: discount must be 0-100%/
    );
});

test('document discount is spread across lines before tax and never loses a paisa', () => {
    const t = computeTotals({
        lines: [
            { qty: 1, rate: 100, gstRate: 18 },
            { qty: 1, rate: 100, gstRate: 5 },
            { qty: 1, rate: 100, gstRate: 0 }
        ],
        interstate: true,
        discount: { type: 'amount', value: 100 }
    });
    assert.equal(t.discount, 10000);
    assert.deepEqual(
        t.lines.map(l => l.docDiscount),
        [3334, 3333, 3333]
    );
    assert.deepEqual(
        t.lines.map(l => l.taxable),
        [6666, 6667, 6667]
    );
    assert.equal(t.taxTotal, 1200 + 333);
    assert.equal(t.total, t.subTotal - t.discount + t.taxTotal);
    assert.throws(
        () => computeTotals({ lines: [{ qty: 1, rate: 10, gstRate: 0 }], discount: { type: 'amount', value: 20 } }),
        /Discount ₹20.00 is more than the subtotal ₹10.00/
    );
});

test('percent document discount', () => {
    const t = computeTotals({ lines: [{ qty: 4, rate: 250, gstRate: 18 }], interstate: true, discount: { type: 'percent', value: 5 } });
    assert.equal(t.discount, 5000);
    assert.equal(t.lines[0].taxable, 95000);
});

test('inclusive tax: the price includes GST and the parts add back to it', () => {
    const t = computeTotals({ lines: [{ qty: 1, rate: 118, gstRate: 18 }], interstate: false, inclusive: true });
    assert.equal(t.inclusive, true);
    assert.equal(t.lines[0].amount, 11800);
    assert.equal(t.lines[0].taxable, 10000);
    assert.equal(t.lines[0].cgst, 900);
    assert.equal(t.total, 11800);
    const odd = computeTotals({ lines: [{ qty: 3, rate: 99.99, gstRate: 12 }], interstate: true, inclusive: true });
    assert.equal(odd.taxableTotal + odd.taxTotal, odd.subTotal);
    assert.equal(odd.total, 29997);
});

test('shipping is taxed at its own rate and shown separately', () => {
    const t = computeTotals({ lines: [{ qty: 1, rate: 1000, gstRate: 18 }], interstate: false, shipping: { amount: 100, gstRate: 18 } });
    assert.deepEqual(
        { amount: t.shipping.amount, taxable: t.shipping.taxable, tax: t.shipping.tax, cgst: t.shipping.cgst },
        { amount: 10000, taxable: 10000, tax: 1800, cgst: 900 }
    );
    assert.equal(t.taxTotal, 19800);
    assert.equal(t.total, 100000 + 10000 + 19800);
});

test('round off to the nearest rupee, or keep the paise', () => {
    const lines = [{ qty: 1, rate: 99.5, gstRate: 5 }]; // 99.50 + 4.98 = 104.48
    assert.equal(computeTotals({ lines, roundOff: 'nearest' }).roundOff, -48);
    assert.equal(computeTotals({ lines, roundOff: 'nearest' }).total, 10400);
    assert.equal(computeTotals({ lines, roundOff: 'none' }).total, 10448);
    assert.equal(computeTotals({ lines: [{ qty: 1, rate: 100.5, gstRate: 0 }], roundOff: 'nearest' }).roundOff, 50);
    assert.equal(computeTotals({ lines, roundOff: { fixed: -0.48 } }).total, 10400);
});

test('negative and zero lines are allowed (adjustments)', () => {
    const t = computeTotals({
        lines: [
            { qty: 2, rate: 100, gstRate: 18 },
            { qty: -1, rate: 100, gstRate: 18 },
            { qty: 0, rate: 100, gstRate: 18 }
        ],
        interstate: false
    });
    assert.equal(t.subTotal, 10000);
    assert.equal(t.taxTotal, 1800);
    assert.equal(t.lines[1].cgst, -900);
});

test('stored lines from a saved invoice print exactly as issued', () => {
    // Saved by the old float maths: 0.5 × 99.99 was stored as 49.99, not 50.00
    const t = computeTotals({
        lines: [{ qty: 0.5, rate: 99.99, gstRate: 12, stored: { taxable: 49.99, tax: 6, cgst: 3, sgst: 3 } }],
        interstate: false,
        roundOff: { fixed: 0.01 }
    });
    assert.equal(t.lines[0].taxable, 4999);
    assert.equal(t.lines[0].cgst, 300);
    assert.equal(t.total, 4999 + 600 + 1);
});

test('stored legacy lines without a CGST/SGST split are split by the place of supply', () => {
    const t = computeTotals({ lines: [{ qty: 10, rate: 100, gstRate: 18, stored: { taxable: 1000, tax: 180 } }], interstate: false });
    assert.deepEqual([t.lines[0].cgst, t.lines[0].sgst, t.lines[0].igst], [9000, 9000, 0]);
    const noTax = computeTotals({ lines: [{ qty: 10, rate: 100, gstRate: 18, stored: { amount: 1000 } }], interstate: true });
    assert.equal(noTax.lines[0].igst, 18000);
});

test('the input is never mutated', () => {
    const input = Object.freeze({ lines: Object.freeze([Object.freeze({ qty: 1, rate: 10, gstRate: 18 })]), interstate: false });
    assert.doesNotThrow(() => computeTotals(input));
});

// ---------- property test ----------
// Seeded so a failure is reproducible: the seed is in the assertion message.
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const RATES = [0, 0.25, 1.5, 3, 5, 12, 18, 28, 40];
function randomDoc(r) {
    const n = 1 + Math.floor(r() * 25);
    const lines = Array.from({ length: n }, () => ({
        qty: Math.round(r() * 100000) / (r() < 0.5 ? 1000 : 1),
        rate: Math.round(r() * 1000000) / 100,
        gstRate: RATES[Math.floor(r() * RATES.length)],
        discount: r() < 0.3 ? { type: 'percent', value: Math.round(r() * 5000) / 100 } : null
    }));
    return {
        lines,
        interstate: r() < 0.5,
        inclusive: r() < 0.3,
        discount: r() < 0.3 ? { type: 'percent', value: Math.round(r() * 3000) / 100 } : null,
        shipping: r() < 0.3 ? { amount: Math.round(r() * 50000) / 100, gstRate: 18 } : null,
        roundOff: r() < 0.5 ? 'nearest' : 'none'
    };
}

test('property: the displayed total always equals the sum of the displayed parts', () => {
    for (let seed = 1; seed <= 1500; seed++) {
        const doc = randomDoc(rng(seed));
        const t = computeTotals(doc);
        const msg = `seed ${seed}`;
        assert.equal(t.subTotal, sum(t.lines, 'amount'), msg);
        assert.equal(t.taxTotal, sum(t.taxRows, 'amount'), msg);
        assert.equal(t.discount, sum(t.lines, 'docDiscount'), msg);
        const ship = t.shipping ? t.shipping.amount : 0;
        if (t.inclusive) {
            assert.equal(t.total, t.subTotal - t.discount + ship + t.roundOff, msg);
            assert.equal(t.taxableTotal + t.taxTotal, t.subTotal - t.discount + ship, msg);
        } else {
            assert.equal(t.total, t.subTotal - t.discount + ship + t.taxTotal + t.roundOff, msg);
        }
        t.lines.forEach(l => assert.equal(l.cgst + l.sgst + l.igst, l.tax, msg));
        if (doc.roundOff === 'nearest') assert.equal(t.total % 100, 0, msg);
        for (const k of ['subTotal', 'taxTotal', 'total', 'roundOff', 'discount']) assert.ok(Number.isInteger(t[k]), `${msg} ${k}`);
    }
});
