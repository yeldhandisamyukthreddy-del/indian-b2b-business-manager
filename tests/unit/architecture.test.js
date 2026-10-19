// Architecture rules, checked on the real source:
//   1. core (app/js/core and the app script in index.html) never refers to a module: no module paths,
//      no module ids, no stores a module owns, no functions a module defines
//   2. a module refers only to the modules it lists in dependsOn
//   3. platform code names no particular module (editions are data and are the one exception)
//   4. every module manifest is valid and the dependency graph has no cycles
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createRegistry } = require('../../app/js/platform/registry.js');

const APP = path.join(__dirname, '..', '..', 'app');
const MODULES_DIR = path.join(APP, 'js', 'modules');
const read = f => fs.readFileSync(f, 'utf8');
const walk = dir =>
    fs.existsSync(dir)
        ? fs
              .readdirSync(dir, { withFileTypes: true })
              .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []))
        : [];
const rel = f => path.relative(APP, f);

const moduleIds = () => (fs.existsSync(MODULES_DIR) ? fs.readdirSync(MODULES_DIR).filter(d => fs.existsSync(path.join(MODULES_DIR, d, 'index.js'))) : []);
const loadManifest = id => require(path.join(MODULES_DIR, id, 'index.js'));
// The inline app script of index.html (the composition root's <script src> tags may load modules)
const appScript = () => [...read(path.join(APP, 'index.html')).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const coreSources = () => [...walk(path.join(APP, 'js', 'core')).map(f => [rel(f), read(f)]), ['index.html <script>', appScript()]];

// Top-level functions and window.X = assignments in a module's browser files
function definedFunctions(file) {
    const src = read(file);
    return [...src.matchAll(/^\s{0,8}(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm), ...src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map(m => m[1]);
}
const quoted = name => new RegExp(`['"\`]${name}['"\`]`);

test('every module manifest is valid and the dependency graph has no cycles', () => {
    const registry = createRegistry();
    for (const id of moduleIds()) {
        const m = loadManifest(id);
        assert.equal(m.id, id, `app/js/modules/${id}/index.js must export the manifest of "${id}"`);
        registry.register(m);
    }
    assert.doesNotThrow(() => registry.check());
});

test('core never refers to a module', () => {
    const ids = moduleIds();
    const stores = ids.flatMap(id => (loadManifest(id).stores || []).map(s => [s, id]));
    const fns = ids.flatMap(id => walk(path.join(MODULES_DIR, id)).flatMap(f => definedFunctions(f).map(fn => [fn, id])));
    const problems = [];
    for (const [file, src] of coreSources()) {
        if (/Vyapar\.modules|['"`/]modules\//.test(src)) problems.push(`${file} refers to the modules folder`);
        ids.filter(id => quoted(id).test(src)).forEach(id => problems.push(`${file} names module "${id}"`));
        stores.filter(([s]) => quoted(s).test(src)).forEach(([s, id]) => problems.push(`${file} uses store "${s}" owned by ${id}`));
        fns.filter(([fn]) => new RegExp(`\\b${fn}\\s*\\(`).test(src)).forEach(([fn, id]) => problems.push(`${file} calls ${fn}() from ${id}`));
    }
    assert.deepEqual(problems, []);
});

test('a module refers only to the modules it depends on', () => {
    const ids = moduleIds();
    const problems = [];
    for (const id of ids) {
        const allowed = new Set([id, ...loadManifest(id).dependsOn]);
        for (const file of walk(path.join(MODULES_DIR, id))) {
            const src = read(file);
            for (const other of ids.filter(o => !allowed.has(o))) {
                if (new RegExp(`modules/${other}/|Vyapar\\.modules\\.${other}\\b`).test(src))
                    problems.push(`${rel(file)} uses ${other} without depending on it`);
            }
        }
    }
    assert.deepEqual(problems, []);
});

test('platform code names no particular module (editions are data)', () => {
    const ids = moduleIds();
    const problems = walk(path.join(APP, 'js', 'platform'))
        .filter(f => !f.endsWith('editions.js'))
        .flatMap(f => ids.filter(id => quoted(id).test(read(f))).map(id => `${rel(f)} names module "${id}"`));
    assert.deepEqual(problems, []);
});

test('the boundary check itself catches a violation', () => {
    // Guard against a check that can never fail: a core file naming a module id must be reported
    assert.ok(quoted('purchasing').test("const x = 'purchasing';"));
    assert.ok(/['"`/]modules\//.test("require('../modules/inventory/index.js')"));
    assert.ok(new RegExp(`\\bshowPOForm\\s*\\(`).test('onclick="showPOForm()"'));
});
