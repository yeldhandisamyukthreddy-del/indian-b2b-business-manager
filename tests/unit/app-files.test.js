// The app loads and caches every invoice module and template (offline use breaks silently otherwise)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const registry = require('../../app/js/core/documents/registry.js');

const APP = path.join(__dirname, '..', '..', 'app');
const list = dir => fs.readdirSync(path.join(APP, dir)).map(f => `${dir}/${f}`);
// Every script under app/js, at any depth (core, platform, modules)
const walk = dir =>
    fs
        .readdirSync(path.join(APP, dir), { withFileTypes: true })
        .flatMap(e => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));
const sw = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');

test('the service worker caches every script and template', () => {
    for (const f of [...walk('js'), ...list('templates/invoices'), ...list('templates/partial')])
        assert.ok(sw.includes(`'${f}'`), `${f} is missing from app/sw.js`);
});

test('index.html loads every script under app/js', () => {
    for (const f of walk('js')) assert.match(html, new RegExp(`<script src="${f}"( defer)?></script>`), `${f} is not loaded by app/index.html`);
});

test('every registered template and partial exists on disk, and nothing unregistered is shipped', () => {
    const files = [...Object.values(registry.TEMPLATES).map(t => t.templatePath), ...Object.values(registry.PARTIALS)];
    files.forEach(f => assert.ok(fs.existsSync(path.join(APP, f)), `${f} does not exist`));
    assert.deepEqual([...list('templates/invoices'), ...list('templates/partial')].sort(), [...files].sort());
});
