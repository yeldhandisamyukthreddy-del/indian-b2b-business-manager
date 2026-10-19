// Unit tests for the integer money core: `npm run test:unit`
const { test } = require('node:test');
const assert = require('node:assert/strict');
const money = require('../../app/js/core/shared/money.js');

test('toPaise converts rupees exactly, rounding half away from zero', () => {
    assert.equal(money.toPaise(1180), 118000);
    assert.equal(money.toPaise(0.1 + 0.2), 30);
    assert.equal(money.toPaise(8.325), 833); // 8.325 is 8.32499999… in binary
    assert.equal(money.toPaise(1.005), 101);
    assert.equal(money.toPaise(-1.005), -101);
    assert.equal(money.toPaise(-0.004), 0);
    assert.equal(money.toPaise(undefined), 0);
    assert.equal(money.toPaise('12.5'), 1250);
    assert.equal(money.toPaise(NaN), 0);
});

test('fromPaise returns rupees', () => {
    assert.equal(money.fromPaise(118050), 1180.5);
    assert.equal(money.fromPaise(-5), -0.05);
});

test('scaleDecimal reads the decimal a person typed, not the binary approximation', () => {
    assert.equal(money.scaleDecimal(2.675, 2), 268);
    assert.equal(money.scaleDecimal(0.25, 4), 2500);
    assert.equal(money.scaleDecimal(1e-7, 6), 0);
    assert.equal(money.scaleDecimal(123456789.123456, 6), 123456789123456);
    assert.throws(() => money.scaleDecimal(1e21, 2), /too large/);
});

test('mulDivRound rounds half away from zero with exact integer maths', () => {
    assert.equal(money.mulDivRound(5, 1, 2), 3);
    assert.equal(money.mulDivRound(-5, 1, 2), -3);
    assert.equal(money.mulDivRound(4, 1, 2), 2);
    assert.equal(money.mulDivRound(1, 1, 3), 0);
    assert.equal(money.mulDivRound(2, 1, 3), 1);
    assert.equal(money.mulDivRound(9007199254740991, 10, 10), 9007199254740991);
    assert.throws(() => money.mulDivRound(1, 1, 0), /divide by zero/);
});

test('lineAmount multiplies quantity by rate without float error', () => {
    assert.equal(money.lineAmount(10, 100), 100000);
    assert.equal(money.lineAmount(3, 0.1), 30);
    assert.equal(money.lineAmount(2.5, 3.33), 833); // 8.325 → 8.33
    assert.equal(money.lineAmount(10, 1.234), 1234); // rates with more than 2 decimals keep their precision
    assert.equal(money.lineAmount(0.3333, 300), 9999);
    assert.equal(money.lineAmount(-2, 50), -10000);
    assert.equal(money.lineAmount(0, 50), 0);
});

test('percentOf applies GST rates, including fractional slabs', () => {
    assert.equal(money.percentOf(100000, 18), 18000);
    assert.equal(money.percentOf(100000, 0.25), 250);
    assert.equal(money.percentOf(33333, 5), 1667); // 1666.65 → 1667
    assert.equal(money.percentOf(-33333, 5), -1667);
    assert.equal(money.percentOf(5000, 0), 0);
});

test('splitInclusive separates taxable value and tax so they add back exactly', () => {
    assert.deepEqual(money.splitInclusive(118000, 18), { taxable: 100000, tax: 18000 });
    const odd = money.splitInclusive(9999, 12);
    assert.equal(odd.taxable + odd.tax, 9999);
    assert.deepEqual(money.splitInclusive(5000, 0), { taxable: 5000, tax: 0 });
});

test('splitHalf gives CGST the rounded half and SGST the rest', () => {
    assert.deepEqual(money.splitHalf(18000), { cgst: 9000, sgst: 9000 });
    assert.deepEqual(money.splitHalf(1667), { cgst: 834, sgst: 833 });
    assert.deepEqual(money.splitHalf(-1667), { cgst: -834, sgst: -833 });
});

test('allocate splits an amount by weights and never loses a paisa', () => {
    assert.deepEqual(money.allocate(100, [1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(money.allocate(1000, [300, 700]), [300, 700]);
    assert.deepEqual(money.allocate(0, [5, 5]), [0, 0]);
    assert.deepEqual(money.allocate(10, [0, 0]), [0, 0]);
    assert.deepEqual(money.allocate(-100, [1, 1, 1]), [-34, -33, -33]);
    const parts = money.allocate(99999, [17, 5, 3, 91]);
    assert.equal(
        parts.reduce((a, b) => a + b, 0),
        99999
    );
});

test('computeGst keeps its API: fills each line and returns rupee totals', () => {
    const items = [{ qty: 10, rate: 100, gstRate: 18 }];
    const inter = money.computeGst(items, true);
    assert.deepEqual(inter, { taxable: 1000, cgst: 0, sgst: 0, igst: 180, tax: 180, total: 1180 });
    assert.deepEqual(items[0], { qty: 10, rate: 100, gstRate: 18, taxable: 1000, igst: 180, cgst: 0, sgst: 0, tax: 180, amount: 1000, total: 1180 });
    const intra = money.computeGst([{ qty: 10, rate: 100, gstRate: 18 }], false);
    assert.deepEqual(intra, { taxable: 1000, cgst: 90, sgst: 90, igst: 0, tax: 180, total: 1180 });
    const mixed = money.computeGst(
        [
            { qty: 3, rate: 33.33, gstRate: 5 },
            { qty: 0.5, rate: 99.99, gstRate: 12 }
        ],
        false
    );
    assert.deepEqual(mixed, { taxable: 149.99, cgst: 5.5, sgst: 5.5, igst: 0, tax: 11, total: 160.99 });
});

test('formatMoney uses Indian grouping and can put the symbol after the amount', () => {
    assert.equal(money.formatMoney(12345678), '₹1,23,456.78');
    assert.equal(money.formatMoney(-5000), '-₹50.00');
    assert.equal(money.formatMoney(0), '₹0.00');
    assert.equal(money.formatMoney(150000, { currencyAfter: true }), '1,500.00 ₹');
    assert.equal(money.formatMoney(150000, { locale: 'en-US', currency: 'USD' }), '$1,500.00');
    assert.equal(money.formatMoney(150000, { symbol: false }), '1,500.00');
});

test('amountInWords uses the Indian numbering system', () => {
    assert.equal(money.amountInWords(1180), 'Rupees One Thousand One Hundred Eighty Only');
    assert.equal(money.amountInWords(123456.5), 'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only');
    assert.equal(money.amountInWords(105000000), 'Rupees Ten Crore Fifty Lakh Only');
    assert.equal(money.amountInWords(0), 'Rupees Zero Only');
    assert.equal(money.amountInWordsPaise(118005), 'Rupees One Thousand One Hundred Eighty and Five Paise Only');
});
