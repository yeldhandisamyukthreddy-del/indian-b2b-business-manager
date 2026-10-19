// core/shared: errors and results, schema validation, pagination, tenant-scoped repository
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AppError, ValidationError, NotFoundError, ok, err, paginate } = require('../../app/js/core/shared/result.js');
const v = require('../../app/js/core/shared/validate.js');
const { createRepository, TenantError } = require('../../app/js/core/shared/repository.js');
const { fakeDb } = require('./helpers/fake-db.js');

test('errors carry a code, a user-facing message and details for the log', () => {
    const e = new AppError('payment.duplicate', 'This payment was already recorded', { key: 'k1' });
    assert.equal(e.code, 'payment.duplicate');
    assert.equal(e.userMessage, 'This payment was already recorded');
    assert.deepEqual(e.details, { key: 'k1' });
    const ve = new ValidationError(['amount must be more than 0', 'date is missing']);
    assert.match(ve.message, /amount must be more than 0; date is missing/);
    assert.deepEqual(ve.errors, ['amount must be more than 0', 'date is missing']);
    assert.equal(new NotFoundError('Invoice').status, 404);
    assert.deepEqual(ok(5), { ok: true, value: 5 });
    assert.deepEqual(err('x'), { ok: false, error: 'x' });
});

test('paginate slices a list and reports the page count', () => {
    const list = Array.from({ length: 45 }, (_, i) => i);
    assert.deepEqual(paginate(list, { page: 2, size: 20 }), { items: list.slice(20, 40), page: 2, pages: 3, total: 45 });
    assert.deepEqual(paginate(list, { page: 9, size: 20 }).items, list.slice(40));
    assert.deepEqual(paginate([], {}), { items: [], page: 1, pages: 1, total: 0 });
});

test('schema validation reports every problem with its path', () => {
    const schema = v.object({
        id: v.string({ pattern: /^[a-z_]+$/ }),
        version: v.string({ min: 1 }),
        tags: v.array(v.string(), { max: 2 }),
        order: v.optional(v.number({ int: true, min: 0 })),
        kind: v.oneOf(['a', 'b']),
        run: v.optional(v.func()),
        flag: v.boolean()
    });
    assert.deepEqual(v.validate(schema, { id: 'ok_id', version: '1', tags: ['x'], kind: 'a', flag: true }), []);
    const errors = v.validate(schema, { id: 'Bad-Id', version: '', tags: ['x', 'y', 3], order: 1.5, kind: 'c', run: 'no', flag: 'yes', extra: 1 });
    for (const m of [
        /id has an invalid format/,
        /version must have at least 1 character/,
        /tags must have at most 2 items/,
        /tags\[2\] must be text/,
        /order must be a whole number/,
        /kind must be one of a, b/,
        /run must be a function/,
        /flag must be true or false/,
        /extra is not allowed/
    ])
        assert.ok(
            errors.some(e => m.test(e)),
            `missing ${m}: ${errors.join(' | ')}`
        );
    assert.deepEqual(v.validate(v.object({ a: v.string() }, { allowUnknown: true }), { a: 'x', b: 1 }), []);
    assert.deepEqual(v.validate(schema, null), ['value must be an object']);
});

test('repository: every read and write is scoped to one company', async () => {
    const db = fakeDb({
        invoices: [
            { id: 1, companyId: 1, number: 'A-1' },
            { id: 2, companyId: 2, number: 'B-1' }
        ]
    });
    const a = createRepository(db, 'invoices', 1);
    const b = createRepository(db, 'invoices', 2);
    assert.deepEqual(
        (await a.list()).map(r => r.number),
        ['A-1']
    );
    assert.equal(await a.get(2), null, "company 1 cannot read company 2's invoice");
    assert.equal((await b.get(2)).number, 'B-1');
    const id = await a.add({ number: 'A-2' });
    assert.equal((await db.get('invoices', id)).companyId, 1, 'company id is stamped on create');
    await assert.rejects(() => a.add({ number: 'X', companyId: 2 }), TenantError);
    await assert.rejects(() => a.put({ id: 2, companyId: 1, number: 'stolen' }), TenantError, 'cannot overwrite another company row');
    await assert.rejects(() => a.remove(2), TenantError);
    assert.equal((await db.get('invoices', 2)).number, 'B-1');
    await a.put({ ...(await a.get(1)), number: 'A-1b' });
    assert.equal((await a.get(1)).number, 'A-1b');
    await a.remove(id);
    assert.equal(await a.get(id), null);
    assert.throws(() => createRepository(db, 'invoices', 0), /company id/);
    assert.deepEqual(
        (await a.find(r => r.number.startsWith('A'))).map(r => r.id),
        [1]
    );
});
