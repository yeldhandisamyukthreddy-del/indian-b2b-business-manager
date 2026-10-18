// The Mustache subset used by invoice templates
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { render, TemplateError } = require('../../app/js/invoice/mustache.js');

test('variables are escaped; triple mustache is raw', () => {
    assert.equal(render('<p>{{name}}</p>', { name: '<b>&' }), '<p>&lt;b&gt;&amp;</p>');
    assert.equal(render('{{{html}}}|{{& html}}', { html: '<b>x</b>' }), '<b>x</b>|<b>x</b>');
    assert.equal(render('{{n}} {{z}} {{e}}', { n: 5, z: 0, e: null }), '5 0 ');
});

test('dotted names and the current item', () => {
    assert.equal(render('{{a.b.c}}', { a: { b: { c: 'deep' } } }), 'deep');
    assert.equal(render('{{#list}}[{{.}}]{{/list}}', { list: ['x', 'y'] }), '[x][y]');
});

test('sections: arrays repeat, objects push context, booleans toggle', () => {
    const view = { items: [{ n: 1 }, { n: 2 }], obj: { v: 'in' }, yes: true, no: false, empty: [], outer: 'O' };
    assert.equal(render('{{#items}}<{{n}}{{outer}}>{{/items}}', view), '<1O><2O>');
    assert.equal(render('{{#obj}}{{v}}{{/obj}}', view), 'in');
    assert.equal(render('{{#yes}}Y{{/yes}}{{#no}}N{{/no}}{{#empty}}E{{/empty}}', view), 'Y');
    assert.equal(render('{{^no}}not{{/no}}{{^empty}}none{{/empty}}{{^yes}}X{{/yes}}', view), 'notnone');
});

test('a lookup inside a section falls back to outer contexts', () => {
    assert.equal(render('{{#a}}{{#b}}{{x}}{{/b}}{{/a}}', { x: 'root', a: { b: { y: 1 } } }), 'root');
});

test('partials render with the current context', () => {
    const partials = { row: '<td>{{name}}</td>' };
    assert.equal(render('{{#rows}}{{>row}}{{/rows}}', { rows: [{ name: 'a' }, { name: 'b' }] }, partials), '<td>a</td><td>b</td>');
});

test('standalone section and comment lines leave no blank lines behind', () => {
    const tpl = 'a\n  {{#yes}}\n  b\n  {{/yes}}\n{{! note }}\nc\n';
    assert.equal(render(tpl, { yes: true }), 'a\n  b\nc\n');
});

test('a missing partial is a readable error', () => {
    assert.throws(
        () => render('x {{>footer}}', {}, {}, { name: 'standard' }),
        err => err instanceof TemplateError && /Missing partial "footer" in "standard"/.test(err.message)
    );
});

test('strict mode reports an unknown field with its line', () => {
    assert.throws(() => render('ok\n{{totl}}', { total: 1 }, {}, { name: 'compact' }), /Unknown field "totl" in "compact" line 2/);
    assert.throws(() => render('{{#flags.isMissing}}x{{/flags.isMissing}}', { flags: {} }), /Unknown field "flags.isMissing"/);
    assert.equal(render('{{totl}}', {}, {}, { strict: false }), '');
});

test('objects cannot be printed as text by mistake', () => {
    assert.throws(() => render('{{obj}}', { obj: { a: 1 } }), /"obj" is an object/);
});

test('prototype properties are never reachable', () => {
    assert.throws(() => render('{{constructor}}', {}), /Unknown field "constructor"/);
    assert.throws(() => render('{{a.__proto__}}', { a: {} }), /Unknown field "a.__proto__"/);
});

test('syntax errors name the template and line', () => {
    assert.throws(() => render('{{#a}}x', { a: 1 }, {}, { name: 't' }), /Unclosed section "a" in "t" line 1/);
    assert.throws(() => render('{{/a}}', {}, {}, { name: 't' }), /Unexpected "\/a" in "t" line 1/);
    assert.throws(() => render('{{#a}}{{/b}}', { a: 1 }), /Section "a" closed by "b"/);
    assert.throws(() => render('{{=<% %>=}}', {}), /Unsupported tag/);
    assert.throws(() => render('{{a b}}', {}), /Unsupported tag/);
    assert.throws(() => render('{{unterminated', {}), /Unclosed tag/);
});

test('functions (lambdas) are not supported', () => {
    assert.throws(() => render('{{f}}', { f: () => 'x' }), /"f" is a function/);
});

test('partials cannot recurse forever', () => {
    assert.throws(() => render('{{>loop}}', {}, { loop: '{{>loop}}' }), /nested too deeply/);
});
