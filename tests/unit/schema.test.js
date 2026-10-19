// Boundary validation of the domain input and of the view model
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateDomain, validateViewModel, VM_FLAGS } = require('../../app/js/core/documents/schema.js');
const fx = require('../fixtures/invoices.js');

const errorsFor = (patch, org = fx.ORG) => validateDomain({ ...fx.simple, ...patch }, org);

test('a valid invoice has no errors', () => {
    assert.deepEqual(validateDomain(fx.simple, fx.ORG), []);
    assert.deepEqual(validateDomain(fx.indiaGst, fx.ORG), []);
});

test('every kind of bad input is reported', () => {
    assert.deepEqual(validateDomain(null, fx.ORG), ['invoice must be an object']);
    const cases = [
        [{ dueDate: '17/11/2026' }, /dueDate must be a YYYY-MM-DD date/],
        [{ lines: 'x' }, /the invoice has no items/],
        [{ lines: new Array(2001).fill(fx.simple.lines[0]) }, /more than 2000 items/],
        [{ lines: [null] }, /lines\[0\] must be an object/],
        [{ lines: [{ name: 5, qty: 1, rate: 1, gstRate: 5 }] }, /lines\[0\].name must be text/],
        [{ lines: [{ name: 'a', qty: 1, rate: 1, gstRate: 5, discount: { type: 'bogo', value: 1 } }] }, /discount must be/],
        [{ lines: [{ name: 'a', qty: 1, rate: 1, gstRate: 5, stored: 'yes' }] }, /stored must be an object/],
        [{ lines: [{ name: 'a', qty: 1, rate: 1, gstRate: 5, expiry: 'soon' }] }, /expiry must be a YYYY-MM-DD date/],
        [{ customer: { address: 'no name' } }, /customer must have a name/],
        [{ shipTo: 'Hyderabad' }, /shipTo must have a name/],
        [{ paidAmount: '100' }, /paidAmount must be a number/],
        [{ grandTotal: NaN }, /grandTotal must be a number/]
    ];
    for (const [patch, re] of cases)
        assert.ok(
            errorsFor(patch).some(e => re.test(e)),
            `${re} for ${JSON.stringify(patch).slice(0, 60)}`
        );
    assert.ok(errorsFor({}, null).some(e => /company must have a name/.test(e)));
    assert.deepEqual(errorsFor({ customer: null, shipTo: null, paidAmount: null }), [], 'optional parts may be empty');
});

test('validateViewModel checks flags, header, columns, totals and direction', () => {
    assert.deepEqual(validateViewModel('x'), ['view model must be an object']);
    const errs = validateViewModel({ flags: {}, header: {}, columns: [], totals: {}, meta: { dir: 'up' } });
    assert.equal(errs.filter(e => e.startsWith('flags.')).length, VM_FLAGS.length);
    for (const re of [/header.companyName/, /columns must be a non-empty list/, /totals.total/, /meta.dir/])
        assert.ok(
            errs.some(e => re.test(e)),
            String(re)
        );
});
