'use strict'; // module code is strict, so writing to a frozen object throws, as it would in a real module
// platform: module registry, editions, extension hooks, event bus and the per-company runtime
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRegistry, RegistryError } = require('../../app/js/platform/registry.js');
const editions = require('../../app/js/platform/editions.js');
const hooks = require('../../app/js/platform/hooks.js');
const { createEventBus, EventDeliveryError } = require('../../app/js/platform/events.js');
const { createRuntime } = require('../../app/js/platform/runtime.js');
const { fakeDb } = require('./helpers/fake-db.js');

// A minimal valid manifest; tests override what they need
const manifest = (id, extra = {}) => ({ id, version: '1.0.0', displayName: id.toUpperCase(), description: `The ${id} module`, dependsOn: [], ...extra });

// ---------- registry ----------
test('registry: a valid manifest registers; an invalid one is rejected with every problem named', () => {
    const r = createRegistry();
    r.register(manifest('alpha', { navItems: [{ id: 'alpha-home', label: 'Alpha', route: 'alpha', section: 'sales', order: 1 }] }));
    assert.deepEqual(r.ids(), ['alpha']);
    assert.throws(
        () => r.register({ id: 'Bad Id', version: 1, dependsOn: 'x', nonsense: true }),
        err =>
            err instanceof RegistryError &&
            /Module "Bad Id" has an invalid manifest/.test(err.message) &&
            /id has an invalid format/.test(err.message) &&
            /version must be text/.test(err.message) &&
            /nonsense is not allowed/.test(err.message)
    );
    assert.throws(() => r.register(manifest('alpha')), /Module "alpha" is registered twice/);
    assert.throws(() => r.register(manifest('beta', { migrations: [{ id: 'm1', up: () => {} }] })), /migrations\[0\].down must be a function/);
    assert.throws(
        () => r.register(manifest('gamma', { eventSubscriptions: { 'invoice.finalized': 'nope' } })),
        /eventSubscriptions.invoice.finalized must be a handler/
    );
});

test('registry: modules are ordered after their dependencies, deterministically', () => {
    const r = createRegistry();
    ['zeta', 'beta', 'alpha'].forEach(id => r.register(manifest(id)));
    r.register(manifest('omega', { dependsOn: ['zeta', 'alpha'] }));
    r.register(manifest('mu', { dependsOn: ['omega'] }));
    assert.deepEqual(r.order(), ['alpha', 'beta', 'zeta', 'omega', 'mu']);
    assert.deepEqual(r.withDependencies(['mu']), ['alpha', 'zeta', 'omega', 'mu']);
    assert.deepEqual(r.dependentsOf('zeta', ['alpha', 'zeta', 'omega', 'mu']), ['omega', 'mu']);
});

test('registry: a missing dependency or a cycle fails fast and names the modules', () => {
    const missing = createRegistry();
    missing.register(manifest('accounting', { dependsOn: ['ledger'] }));
    assert.throws(() => missing.check(), /Module "accounting" depends on "ledger", which is not installed/);
    const cyclic = createRegistry();
    cyclic.register(manifest('alpha', { dependsOn: ['charlie'] }));
    cyclic.register(manifest('bravo', { dependsOn: ['alpha'] }));
    cyclic.register(manifest('charlie', { dependsOn: ['bravo'] }));
    cyclic.register(manifest('delta'));
    assert.throws(() => cyclic.check(), /Modules depend on each other in a cycle: alpha → charlie → bravo → alpha/);
    assert.throws(() => createRegistry().register(manifest('self', { dependsOn: ['self'] })), /cannot depend on itself/);
});

test('registry: pages and stores know their owning module', () => {
    const r = createRegistry();
    r.register(
        manifest('purchasing', {
            stores: ['purchaseBills'],
            routes: ['bill-view'],
            navItems: [{ id: 'po', label: 'POs', route: 'purchase-orders', section: 'purchase', order: 1 }]
        })
    );
    assert.equal(r.pageOwner('purchase-orders'), 'purchasing');
    assert.equal(r.pageOwner('bill-view'), 'purchasing');
    assert.equal(r.pageOwner('invoices'), null);
    assert.deepEqual(r.stores(), [{ store: 'purchaseBills', moduleId: 'purchasing' }]);
    assert.throws(() => r.register(manifest('copycat', { stores: ['purchaseBills'] })), /store "purchaseBills" already belongs to "purchasing"/);
});

// ---------- editions ----------
test('editions are data: each one lists its modules, full means every installed module', () => {
    const r = createRegistry();
    ['region_india_gst', 'purchasing', 'inventory', 'accounting', 'fulfilment', 'hr'].forEach(id => r.register(manifest(id)));
    assert.deepEqual(editions.editionNames(), ['invoicing', 'business', 'full']);
    assert.deepEqual(editions.modulesForEdition('invoicing', r), ['region_india_gst']);
    assert.deepEqual(editions.modulesForEdition('business', r), ['region_india_gst', 'purchasing', 'inventory', 'accounting']);
    assert.deepEqual(editions.modulesForEdition('full', r), r.ids());
    assert.throws(() => editions.modulesForEdition('platinum', r), /Unknown edition "platinum"/);
    assert.equal(editions.DEFAULT_EDITION, 'full');
});

// ---------- hooks ----------
test('hooks run in priority order, then by module id', () => {
    const manifests = [
        manifest('zeta', { extensionPoints: { 'document.blocks': { priority: 10, name: 'z10' } } }),
        manifest('alpha', { extensionPoints: { 'document.blocks': [{ name: 'a100' }, { priority: 10, name: 'a10' }] } }),
        manifest('beta', {})
    ];
    assert.deepEqual(
        hooks.collect(manifests, 'document.blocks').map(c => c.value.name),
        ['a10', 'z10', 'a100']
    );
    assert.deepEqual(hooks.collect(manifests, 'nothing'), []);
});

test('hooks cannot change what core hands them; transformers return new values', () => {
    const doc = { lines: [{ qty: 1 }] };
    const sneaky = [{ moduleId: 'sneaky', priority: 100, value: d => (d.lines[0].qty = 99) }];
    assert.throws(
        () => hooks.pipe(sneaky, doc),
        err => err.name === 'HookError' && /sneaky/.test(err.message)
    );
    assert.equal(doc.lines[0].qty, 1);
    const tidy = [
        { moduleId: 'a', priority: 1, value: d => ({ ...d, tagged: true }) },
        { moduleId: 'b', priority: 2, value: d => ({ ...d, count: d.lines.length }) }
    ];
    assert.deepEqual(hooks.pipe(tidy, doc), { lines: [{ qty: 1 }], tagged: true, count: 1 });
    assert.throws(() => hooks.pipe([{ moduleId: 'lazy', priority: 1, value: () => undefined }], doc), /"lazy" must return a new value/);
});

test('validation hooks collect vetoes and warnings with the module that raised them', async () => {
    const contribs = [
        { moduleId: 'region_india_gst', priority: 10, value: async inv => (inv.gstin ? null : { veto: 'Enter the customer GSTIN for a B2B invoice' }) },
        { moduleId: 'inventory', priority: 20, value: () => [{ warning: 'Cement: only 2 in stock' }] },
        { moduleId: 'quiet', priority: 30, value: () => undefined }
    ];
    const result = await hooks.runValidators(contribs, { gstin: '' });
    assert.deepEqual(result, {
        vetoes: [{ moduleId: 'region_india_gst', message: 'Enter the customer GSTIN for a B2B invoice' }],
        warnings: [{ moduleId: 'inventory', message: 'Cement: only 2 in stock' }]
    });
    await assert.rejects(
        () =>
            hooks.runValidators(
                [
                    {
                        moduleId: 'broken',
                        priority: 1,
                        value: () => {
                            throw new Error('boom');
                        }
                    }
                ],
                {}
            ),
        /Module "broken" failed in a validation hook: boom/
    );
});

// ---------- event bus ----------
function busWith(db, handlers) {
    let tick = 0;
    return createEventBus({ store: db, now: () => `2026-10-19T00:00:${String(tick++).padStart(2, '0')}.000Z`, subscribers: () => handlers });
}

test('events are stored, then delivered to subscribers in order', async () => {
    const db = fakeDb();
    const calls = [];
    const bus = busWith(db, [
        { key: 'a:x', moduleId: 'a', handler: e => calls.push(`a:${e.payload.n}`) },
        { key: 'b:x', moduleId: 'b', handler: e => calls.push(`b:${e.payload.n}`) }
    ]);
    const out = await bus.publish(1, 'x', { n: 1 }, { id: 'x:1' });
    assert.deepEqual(calls, ['a:1', 'b:1']);
    assert.deepEqual(out.delivered, ['a:x', 'b:x']);
    const [stored] = db.rows('eventLog');
    assert.equal(stored.status, 'done');
    assert.equal(stored.companyId, 1);
});

test('a duplicate event (same id) is applied once, even if delivered twice', async () => {
    const db = fakeDb();
    let applied = 0;
    const bus = busWith(db, [{ key: 'inventory:invoice.finalized', moduleId: 'inventory', handler: () => applied++ }]);
    await bus.publish(1, 'invoice.finalized', { id: 7 }, { id: 'invoice.finalized:7:1' });
    const again = await bus.publish(1, 'invoice.finalized', { id: 7 }, { id: 'invoice.finalized:7:1' });
    assert.equal(again.duplicate, true);
    // Redelivery after a crash: the receipt stops the handler from running twice
    await db.put('eventLog', { ...db.rows('eventLog')[0], status: 'pending' });
    await bus.redeliverPending(1);
    assert.equal(applied, 1);
});

test('a failing handler does not stop the others, is reported, and is retried later', async () => {
    const db = fakeDb();
    let fail = true;
    const seen = [];
    const bus = busWith(db, [
        {
            key: 'flaky:x',
            moduleId: 'flaky',
            handler: () => {
                if (fail) throw new Error('disk full');
                seen.push('flaky');
            }
        },
        { key: 'steady:x', moduleId: 'steady', handler: () => seen.push('steady') }
    ]);
    await assert.rejects(
        () => bus.publish(1, 'x', {}, { id: 'x:1' }),
        err => err instanceof EventDeliveryError && /flaky/.test(err.message) && /disk full/.test(err.message)
    );
    assert.deepEqual(seen, ['steady']);
    assert.equal(db.rows('eventLog')[0].status, 'failed');
    fail = false;
    await bus.redeliverPending(1);
    assert.deepEqual(seen, ['steady', 'flaky'], 'only the failed handler runs again');
    assert.equal(db.rows('eventLog')[0].status, 'done');
});

test('handlers get a frozen copy of the event', async () => {
    const db = fakeDb();
    const bus = busWith(db, [{ key: 'm:x', moduleId: 'm', handler: e => (e.payload.n = 2) }]);
    await assert.rejects(() => bus.publish(1, 'x', { n: 1 }, { id: 'x:frozen' }), /m/);
});

// ---------- runtime ----------
function setup({ permissions } = {}) {
    const db = fakeDb({
        companies: [
            { id: 1, name: 'A' },
            { id: 2, name: 'B' }
        ]
    });
    const log = [];
    const registry = createRegistry();
    const track = id => ({
        onEnable: () => log.push(`enable:${id}`),
        onDisable: () => log.push(`disable:${id}`)
    });
    registry.register(manifest('region_india_gst', { ...track('region_india_gst') }));
    registry.register(
        manifest('inventory', {
            ...track('inventory'),
            stores: ['inventory_movements'],
            navItems: [{ id: 'stock', label: 'Stock', route: 'stock', section: 'inventory', order: 1, requires: ['inventory.view'] }],
            permissions: ['inventory.view'],
            migrations: [
                {
                    id: 'opening',
                    up: async ctx => ctx.repo('inventory_movements').add({ key: 'opening' }),
                    down: async ctx => {
                        for (const r of await ctx.repo('inventory_movements').find(m => m.key === 'opening'))
                            await ctx.repo('inventory_movements').remove(r.id);
                    }
                }
            ],
            eventSubscriptions: { 'invoice.finalized': async (e, ctx) => ctx.repo('inventory_movements').add({ key: `inv:${e.payload.id}` }) }
        })
    );
    registry.register(manifest('fulfilment', { ...track('fulfilment'), dependsOn: ['inventory'] }));
    registry.register(manifest('purchasing', { ...track('purchasing') }));
    registry.register(manifest('accounting', { ...track('accounting') }));
    const runtime = createRuntime({ adapter: db, registry, now: () => '2026-10-19T10:00:00.000Z', can: permissions });
    return { db, log, registry, runtime };
}

test('runtime: a company with no edition gets the full edition; enabling runs migrations once', async () => {
    const { db, log, runtime } = setup();
    await runtime.syncState(1);
    assert.deepEqual(await runtime.enabledModules(1), ['accounting', 'inventory', 'fulfilment', 'purchasing', 'region_india_gst']);
    assert.equal(await runtime.isModuleEnabled(1, 'fulfilment'), true);
    assert.equal(db.rows('inventory_movements').filter(r => r.key === 'opening').length, 1);
    await runtime.syncState(1);
    assert.equal(log.filter(l => l === 'enable:inventory').length, 1, 'onEnable is not called again');
    assert.equal(db.rows('inventory_movements').filter(r => r.key === 'opening').length, 1, 'migration ran once');
});

test('runtime: downgrading keeps the data; upgrading again restores access without re-running migrations', async () => {
    const { db, log, runtime } = setup();
    await runtime.syncState(1);
    await runtime.publish(1, 'invoice.finalized', { id: 10 }, { id: 'invoice.finalized:10:1' });
    const result = await runtime.setEdition(1, 'invoicing');
    assert.deepEqual(result.disabled.sort(), ['accounting', 'fulfilment', 'inventory', 'purchasing']);
    assert.deepEqual(await runtime.enabledModules(1), ['region_india_gst']);
    assert.ok(log.includes('disable:inventory'));
    assert.equal(db.rows('inventory_movements').length, 2, 'nothing deleted');
    assert.equal((await db.get('companies', 1)).edition, 'invoicing');
    await runtime.setEdition(1, 'full');
    assert.equal(db.rows('inventory_movements').filter(r => r.key === 'opening').length, 1);
    assert.equal(log.filter(l => l === 'enable:inventory').length, 2, 'onEnable runs on each enable and must be idempotent');
});

test('runtime: events missed while a module was off are delivered once when it comes back', async () => {
    const { db, runtime } = setup();
    await runtime.syncState(1);
    await runtime.disableModule(1, 'fulfilment');
    await runtime.disableModule(1, 'inventory');
    await runtime.publish(1, 'invoice.finalized', { id: 11 }, { id: 'invoice.finalized:11:1' });
    assert.equal(db.rows('inventory_movements').filter(r => r.key === 'inv:11').length, 0, 'disabled handlers do not run');
    await runtime.enableModule(1, 'inventory');
    await runtime.enableModule(1, 'inventory');
    assert.equal(db.rows('inventory_movements').filter(r => r.key === 'inv:11').length, 1, 'caught up exactly once');
});

test('runtime: a module that others need cannot be turned off; enabling pulls in dependencies', async () => {
    const { runtime } = setup();
    await runtime.setEdition(1, 'invoicing');
    const out = await runtime.enableModule(1, 'fulfilment');
    assert.deepEqual(out.enabled, ['inventory', 'fulfilment']);
    await assert.rejects(
        () => runtime.disableModule(1, 'inventory'),
        err => err.code === 'module.in_use' && /Turn off FULFILMENT first/.test(err.userMessage)
    );
    await runtime.disableModule(1, 'fulfilment');
    await runtime.disableModule(1, 'fulfilment');
    await runtime.disableModule(1, 'inventory');
    assert.deepEqual(await runtime.enabledModules(1), ['region_india_gst']);
});

test('runtime: unknown modules and editions are rejected', async () => {
    const { runtime } = setup();
    await assert.rejects(() => runtime.enableModule(1, 'crypto_mining'), /Unknown module "crypto_mining"/);
    await assert.rejects(() => runtime.setEdition(1, 'gold'), /Unknown edition "gold"/);
    await assert.rejects(() => runtime.setEdition(99, 'full'), /Company 99 not found/);
});

test('runtime: each company has its own modules', async () => {
    const { runtime } = setup();
    await runtime.setEdition(1, 'invoicing');
    await runtime.syncState(2);
    assert.deepEqual(await runtime.enabledModules(1), ['region_india_gst']);
    assert.equal((await runtime.enabledModules(2)).length, 5);
});

test('runtime: routes of a disabled module are not found (404); a missing permission is 403', async () => {
    const denied = setup({ permissions: p => p !== 'inventory.view' });
    await denied.runtime.syncState(1);
    assert.deepEqual(await denied.runtime.guard(1, 'stock'), { status: 403, moduleId: 'inventory' });
    const { runtime } = setup();
    await runtime.syncState(1);
    assert.deepEqual(await runtime.guard(1, 'stock'), { status: 200, moduleId: 'inventory' });
    assert.deepEqual(await runtime.guard(1, 'invoices'), { status: 200, moduleId: null });
    await runtime.setEdition(1, 'invoicing');
    assert.deepEqual(await runtime.guard(1, 'stock'), { status: 404, moduleId: 'inventory' });
});

test('runtime: contributions and validators come only from enabled modules', async () => {
    const db = fakeDb({ companies: [{ id: 1, name: 'A' }] });
    const registry = createRegistry();
    registry.register(
        manifest('region_india_gst', { extensionPoints: { 'invoice.validate': () => ({ veto: 'GSTIN missing' }), 'document.blocks': { name: 'gst' } } })
    );
    const runtime = createRuntime({ adapter: db, registry, now: () => 'now' });
    await runtime.syncState(1);
    assert.deepEqual((await runtime.validate(1, 'invoice.validate', {})).vetoes, [{ moduleId: 'region_india_gst', message: 'GSTIN missing' }]);
    assert.equal((await runtime.contributions(1, 'document.blocks')).length, 1);
    await runtime.disableModule(1, 'region_india_gst');
    assert.deepEqual((await runtime.validate(1, 'invoice.validate', {})).vetoes, []);
    assert.deepEqual(await runtime.contributions(1, 'document.blocks'), []);
});

test('runtime: rollback undoes a module migration, but only while the module is off', async () => {
    const { db, runtime } = setup();
    await runtime.syncState(1);
    await assert.rejects(() => runtime.rollbackModule(1, 'inventory'), /Turn off INVENTORY before rolling back/);
    await runtime.disableModule(1, 'fulfilment');
    await runtime.disableModule(1, 'inventory');
    await runtime.rollbackModule(1, 'inventory');
    assert.equal(db.rows('inventory_movements').filter(r => r.key === 'opening').length, 0);
    await runtime.enableModule(1, 'inventory');
    assert.equal(db.rows('inventory_movements').filter(r => r.key === 'opening').length, 1, 'runs again after a rollback');
});
