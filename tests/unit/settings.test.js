// Template settings: defaults, merging, validation on write and the repository
const { test } = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../../app/js/core/documents/settings.js');

const { defaultSettings, mergeSettings, validateSettingsPatch, validatePrefsPatch, validateAsset, createRepository, ValidationError } = settings;

// In-memory stand-in for the IndexedDB 'settings' store
function memoryStore() {
    const rows = new Map();
    let next = 1;
    return {
        rows,
        getAll: async () => [...rows.values()].map(r => structuredClone(r)),
        add: async row => {
            const id = next++;
            rows.set(id, structuredClone({ ...row, id }));
            return id;
        },
        put: async row => rows.set(row.id, structuredClone(row)),
        delete: async id => rows.delete(id)
    };
}
const clock = () => '2026-10-18T10:00:00.000Z';

test('defaults come from the template: thermal hides columns and uses an 80 mm roll', () => {
    const s = defaultSettings('thermal');
    assert.equal(s.templateType, 'thermal');
    assert.equal(s.pageSize, '80mm');
    assert.equal(s.language, 'en');
    assert.equal(s.fieldFlags.isTimeRequired, true);
    assert.equal(s.fieldFlags.isPaymentDetailsRequired, false);
    assert.equal(s.fieldFlags.isTotalRequired, true);
    assert.deepEqual(
        s.columnConfig.filter(c => c.visible).map(c => c.key),
        ['name', 'qty', 'rate', 'total']
    );
    assert.match(s.accentColor, /^#[0-9a-f]{6}$/i);
    assert.throws(() => defaultSettings('../../etc/passwd'), /Unknown invoice template/);
});

test('stored values override defaults; unknown stored keys from other versions are ignored', () => {
    const s = mergeSettings('standard', {
        fieldFlags: { isDueDateRequired: false, isSomethingRemoved: true },
        columnConfig: [
            { key: 'name', visible: true },
            { key: 'index', visible: false },
            { key: 'gone', visible: true }
        ],
        labels: { en: { title: 'INVOICE' } },
        accentColor: '#aa0000'
    });
    assert.equal(s.fieldFlags.isDueDateRequired, false);
    assert.equal('isSomethingRemoved' in s.fieldFlags, false);
    assert.deepEqual(
        s.columnConfig.slice(0, 3).map(c => [c.key, c.visible]),
        [
            ['name', true],
            ['index', false],
            ['hsnOrSac', true]
        ]
    );
    assert.equal(s.columnConfig.length, 9);
    assert.equal(s.labels.en.title, 'INVOICE');
    assert.equal(s.accentColor, '#aa0000');
});

test('a page size the template does not support falls back to its default', () => {
    assert.equal(mergeSettings('thermal', { pageSize: 'A4' }).pageSize, '80mm');
    assert.equal(mergeSettings('standard', { pageSize: 'Letter' }).pageSize, 'Letter');
});

test('validation rejects malformed settings with messages that say what is wrong', () => {
    const errs = validateSettingsPatch('standard', {
        fieldFlags: { isDueDateRequired: 'yes', notAFlag: true },
        columnConfig: [
            { key: 'name', visible: true },
            { key: 'name', visible: false },
            { key: 'x', visible: true }
        ],
        labels: { en: { title: 'x'.repeat(81), nope: 'a' }, EN: {} },
        accentColor: 'red',
        pageSize: '80mm',
        language: 'english',
        logoAssetId: -1,
        extra: 1
    });
    for (const m of [
        /fieldFlags.isDueDateRequired must be true or false/,
        /fieldFlags.notAFlag is not a setting/,
        /columnConfig: "name" is listed twice/,
        /columnConfig: "x" is not a column/,
        /labels.en.title is longer than 80 characters/,
        /labels.en.nope is not a label/,
        /labels: "EN" is not a language code/,
        /accentColor must be a colour like #1f4e79/,
        /pageSize "80mm" is not available for this template/,
        /language must be a language code/,
        /logoAssetId must be a positive whole number or empty/,
        /"extra" is not a setting/
    ])
        assert.ok(
            errs.some(e => m.test(e)),
            `missing ${m}`
        );
    assert.deepEqual(validateSettingsPatch('standard', { fieldFlags: { isDueDateRequired: false }, accentColor: '#00AA11', logoAssetId: null }), []);
    assert.deepEqual(validateSettingsPatch('standard', 'nope'), ['Settings must be an object']);
});

test('prefs validation: default template, regions and extra tax ids', () => {
    assert.deepEqual(
        validatePrefsPatch({
            defaultTemplateType: 'compact',
            regions: { extraTaxId: true },
            extraTaxIds: [{ label: 'PAN', value: 'AABCU9603R' }]
        }),
        []
    );
    const errs = validatePrefsPatch({
        defaultTemplateType: 'fancy',
        regions: { mars: true, extraTaxId: 'no' },
        extraTaxIds: [{ label: '', value: 'x' }, 'bad']
    });
    assert.ok(errs.some(e => /defaultTemplateType "fancy" is not a template/.test(e)));
    assert.ok(errs.some(e => /regions.mars is not a region module/.test(e)));
    assert.ok(errs.some(e => /regions.extraTaxId must be true or false/.test(e)));
    assert.ok(errs.some(e => /extraTaxIds\[0\] needs a label/.test(e)));
    assert.ok(errs.some(e => /extraTaxIds\[1\] must be/.test(e)));
    assert.ok(validatePrefsPatch({ extraTaxIds: new Array(6).fill({ label: 'a', value: 'b' }) }).some(e => /at most 5/.test(e)));
});

test('logo assets: only small PNG, JPEG or WebP images', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    assert.deepEqual(validateAsset({ mime: 'image/png', dataUri: png, width: 300, height: 100 }), []);
    assert.ok(
        validateAsset({ mime: 'image/svg+xml', dataUri: 'data:image/svg+xml;base64,PHN2Zz4=', width: 10, height: 10 }).some(e => /PNG, JPEG or WebP/.test(e))
    );
    assert.ok(validateAsset({ mime: 'image/png', dataUri: 'data:image/jpeg;base64,xx', width: 10, height: 10 }).some(e => /does not match/.test(e)));
    assert.ok(validateAsset({ mime: 'image/png', dataUri: png + 'A'.repeat(500 * 1024), width: 10, height: 10 }).some(e => /larger than 300 KB/.test(e)));
    assert.ok(validateAsset({ mime: 'image/png', dataUri: png, width: 4000, height: 10 }).some(e => /at most 2000/.test(e)));
    assert.ok(validateAsset({ mime: 'image/png', dataUri: 'javascript:alert(1)', width: 10, height: 10 }).some(e => /does not match/.test(e)));
});

test('repository: upsert creates one row per company and template, then updates it', async () => {
    const store = memoryStore();
    const repo = createRepository(store, { now: clock });
    assert.deepEqual(await repo.findByOrg(1), []);
    const saved = await repo.upsert(1, 'standard', { fieldFlags: { isDueDateRequired: false } });
    assert.equal(saved.fieldFlags.isDueDateRequired, false);
    assert.equal(saved.fieldFlags.isTotalRequired, true);
    assert.equal(saved.updatedAt, clock());
    await repo.upsert(1, 'standard', { accentColor: '#112233' });
    await repo.upsert(2, 'standard', { accentColor: '#445566' });
    const mine = await repo.findByOrg(1);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].accentColor, '#112233');
    assert.equal(mine[0].fieldFlags.isDueDateRequired, false, 'earlier changes are kept');
    assert.equal((await repo.find(2, 'standard')).accentColor, '#445566');
    assert.equal((await repo.find(3, 'compact')).fieldFlags.isTaxSummaryRequired, false, 'defaults when nothing is stored');
});

test('repository: invalid settings are rejected and nothing is written', async () => {
    const store = memoryStore();
    const repo = createRepository(store, { now: clock });
    await assert.rejects(
        () => repo.upsert(1, 'standard', { accentColor: 'javascript:x' }),
        err => err instanceof ValidationError && /accentColor/.test(err.message) && err.errors.length === 1
    );
    await assert.rejects(() => repo.upsert(1, 'nope', {}), /Unknown invoice template/);
    await assert.rejects(() => repo.upsert('1; drop', 'standard', {}), /company id/);
    assert.equal(store.rows.size, 0);
});

test('repository: prefs, effective settings and logo fallback', async () => {
    const store = memoryStore();
    const repo = createRepository(store, { now: clock });
    assert.equal((await repo.getPrefs(1)).defaultTemplateType, 'standard');
    const logoId = await repo.saveAsset(1, { mime: 'image/png', dataUri: 'data:image/png;base64,iVBORw0KGgo=', width: 300, height: 100 });
    await repo.setPrefs(1, { defaultTemplateType: 'thermal', logoAssetId: logoId, extraTaxIds: [{ label: 'PAN', value: 'AABCU9603R' }] });
    const eff = await repo.getEffective(1, 'thermal');
    assert.equal(eff.logo.width, 300);
    assert.equal(eff.regions.extraTaxId, true);
    assert.deepEqual(eff.extraTaxIds, [{ label: 'PAN', value: 'AABCU9603R' }]);
    assert.equal((await repo.getPrefs(1)).defaultTemplateType, 'thermal');
    // A template's own logo wins; another company's asset is never used
    const other = await repo.saveAsset(2, { mime: 'image/png', dataUri: 'data:image/png;base64,iVBORw0KGgo=', width: 50, height: 50 });
    await repo.upsert(1, 'thermal', { logoAssetId: other });
    assert.equal((await repo.getEffective(1, 'thermal')).logo, null);
    await assert.rejects(() => repo.saveAsset(1, { mime: 'image/gif', dataUri: 'data:image/gif;base64,R0lG', width: 1, height: 1 }), ValidationError);
});

test('repository: removing a company removes its template settings and logos', async () => {
    const store = memoryStore();
    const repo = createRepository(store, { now: clock });
    await repo.upsert(1, 'standard', {});
    await repo.setPrefs(1, { defaultTemplateType: 'compact' });
    await repo.saveAsset(1, { mime: 'image/png', dataUri: 'data:image/png;base64,iVBORw0KGgo=', width: 1, height: 1 });
    await repo.upsert(2, 'standard', {});
    await repo.deleteForOrg(1);
    assert.deepEqual(
        [...store.rows.values()].map(r => r.companyId),
        [2]
    );
});

test('repository: logos no template uses any more are pruned', async () => {
    const store = memoryStore();
    const repo = createRepository(store, { now: clock });
    const asset = { mime: 'image/png', dataUri: 'data:image/png;base64,iVBORw0KGgo=', width: 1, height: 1 };
    const oldLogo = await repo.saveAsset(1, asset);
    const newLogo = await repo.saveAsset(1, asset);
    const thermalLogo = await repo.saveAsset(1, asset);
    await repo.setPrefs(1, { logoAssetId: newLogo });
    await repo.upsert(1, 'thermal', { logoAssetId: thermalLogo });
    await repo.pruneAssets(1);
    assert.equal(await repo.getAsset(1, oldLogo), null);
    assert.ok(await repo.getAsset(1, newLogo));
    assert.ok(await repo.getAsset(1, thermalLogo));
    assert.equal(await repo.getAsset(2, newLogo), null, 'another company cannot read it');
});
