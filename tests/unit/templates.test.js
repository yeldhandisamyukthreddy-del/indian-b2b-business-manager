// Templates: snapshots, equivalence with mustache.js, print safety and renderer errors.
// Update snapshots after an intended template change: UPDATE_SNAPSHOTS=1 npm run test:unit
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Mustache = require('mustache');
const registry = require('../../app/js/invoice/registry.js');
const { createRenderer, splitStyle } = require('../../app/js/invoice/renderer.js');
const { buildInvoiceViewModel } = require('../../app/js/invoice/view-model.js');
const fx = require('../fixtures/invoices.js');

const APP = path.join(__dirname, '..', '..', 'app');
const SNAPSHOTS = path.join(__dirname, '__snapshots__');
const loadFile = async p => fs.promises.readFile(path.join(APP, p), 'utf8');
const newRenderer = () => createRenderer({ loadFile });
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x2F;': '/', '&#x60;': '`', '&#x3D;': '=' };
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|#x2F|#x60|#x3D);/g, m => ENTITIES[m]);
const visibleText = html => decode(html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');

const FIXTURES = {
    simple: type => [fx.simple, fx.settingsFor(type)],
    multipage: type => [fx.multiPage, fx.settingsFor(type)],
    'india-gst': type => [fx.indiaGst, fx.indiaGstSettings(type)]
};
const vmFor = (type, fixture, locale = 'en-IN') => {
    const [inv, s] = FIXTURES[fixture](type);
    return buildInvoiceViewModel(inv, fx.ORG, s, locale, 'pdf');
};
// Whitespace between tags and the logo bytes do not matter for a layout snapshot
const normalize = html =>
    html
        .replace(/data:image\/png;base64,[A-Za-z0-9+/=&#x;]+/g, 'data:image/png;base64,LOGO')
        .replace(/>\s+</g, '>\n<')
        .replace(/[ \t]+/g, ' ')
        .trim() + '\n';

for (const type of registry.templateTypes()) {
    for (const fixture of Object.keys(FIXTURES)) {
        test(`snapshot: ${type} × ${fixture}`, async () => {
            const html = normalize(await newRenderer().renderHtml(vmFor(type, fixture)));
            const file = path.join(SNAPSHOTS, `${type}.${fixture}.html`);
            if (process.env.UPDATE_SNAPSHOTS || !fs.existsSync(file)) {
                fs.mkdirSync(SNAPSHOTS, { recursive: true });
                fs.writeFileSync(file, html);
            }
            assert.equal(html, fs.readFileSync(file, 'utf8'), `${type}.${fixture}.html differs; run UPDATE_SNAPSHOTS=1 if the change is intended`);
        });
    }
}

test('our renderer and mustache.js produce the same HTML for every template', async () => {
    const r = newRenderer();
    for (const type of registry.templateTypes()) {
        const src = await r.loadSources(type);
        for (const fixture of Object.keys(FIXTURES)) {
            const vm = vmFor(type, fixture);
            const ours = await r.renderHtml(vm);
            const theirs = Mustache.render(src.template, vm, src.partials);
            assert.equal(normalize(ours), normalize(theirs), `${type} × ${fixture}`);
        }
    }
});

test('templates print raw HTML only for sanitized fields and CSS strings', () => {
    const allowed = new Set(['notes.html', 'terms.html', 'meta.runningHeaderCss', 'meta.pageLabelCss', 'meta.ofLabelCss']);
    const files = [...Object.values(registry.TEMPLATES).map(t => t.templatePath), ...Object.values(registry.PARTIALS)];
    for (const f of files) {
        const src = fs.readFileSync(path.join(APP, f), 'utf8');
        for (const m of src.matchAll(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{&\s*([\w.]+)\s*\}\}/g))
            assert.ok(allowed.has(m[1] || m[2]), `${f} prints ${m[1] || m[2]} without escaping`);
        assert.ok(!/<script/i.test(src), `${f} contains a script`);
    }
});

test('rendered invoices make no network requests and have one style marker pair', async () => {
    for (const type of registry.templateTypes()) {
        const html = await newRenderer().renderHtml(vmFor(type, 'india-gst'));
        assert.ok(!/https?:\/\//i.test(html), `${type} links to the network`);
        assert.ok(!/url\(/i.test(html), `${type} loads something through CSS`);
        assert.ok(!/<script/i.test(html), `${type} has a script`);
        assert.ok(
            [...html.matchAll(/src="([^"]*)"/g)].every(m => decode(m[1]).startsWith('data:image/png;base64,')),
            `${type} image not inline`
        );
        assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
        assert.equal((html.match(/<!--style_start-->/g) || []).length, 1, type);
        assert.equal((html.match(/<!--style_end-->/g) || []).length, 1, type);
        const parts = splitStyle(html);
        assert.match(parts.css, /@page/);
        assert.ok(!parts.html.includes('<style>'));
        assert.ok(parts.html.includes('data-invoice-root'));
    }
});

test('the A4 templates repeat the table header and keep rows together; multi-page renders all 60 rows', async () => {
    const html = await newRenderer().renderHtml(vmFor('standard', 'multipage'));
    assert.match(html, /table\.items thead \{ display: table-header-group; \}/);
    assert.match(html, /table\.items tr \{ break-inside: avoid; \}/);
    // "Sri Lakshmi Traders · INV-0420": the space after each \hex escape ends the escape
    assert.ok(html.includes('@top-right { content: "Sri Lakshmi Traders \\b7  INV\\2d 0420"'));
    assert.equal((html.split('<tbody>')[1].split('</tbody>')[0].match(/<tr>/g) || []).length, 60);
});

test('the India GST invoice carries the Rule 46 details', async () => {
    const html = await newRenderer().renderHtml(vmFor('standard', 'india-gst'));
    const text = visibleText(html);
    for (const s of [
        'TAX INVOICE',
        'GSTIN: 36AABCU9603R1ZM',
        'GSTIN: 29AAACB1234F1Z5',
        'Place of Supply: Karnataka (29)',
        'Reverse Charge: No',
        'HSN/SAC',
        'IGST @ 18%',
        'E-way Bill No: 3410 1234 5678',
        'Rupees Two Lakh Forty One Thousand Two Hundred Seventy Nine Only',
        'Authorised Signatory'
    ])
        assert.ok(text.includes(s), `missing "${s}"`);
});

test('user text is escaped; notes keep only allowlisted tags', async () => {
    const vm = buildInvoiceViewModel({ ...fx.simple, notes: '<b>ok</b><script>alert(1)</script>' }, fx.ORG, fx.settingsFor('standard'), 'en-IN', 'preview');
    const html = await newRenderer().renderHtml(vm);
    assert.ok(html.includes('Anil &quot;Best&quot; Stores &amp; Sons'));
    assert.ok(html.includes('<b>ok</b>&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
});

test('a field toggle removes its section from the HTML', async () => {
    const on = await newRenderer().renderHtml(vmFor('standard', 'simple'));
    assert.ok(on.includes('Due Date'));
    assert.ok(!on.includes('Payment Slip'), 'payment slip is off by default');
    const off = await newRenderer().renderHtml(
        buildInvoiceViewModel(fx.simple, fx.ORG, fx.settingsFor('standard', { fieldFlags: { isDueDateRequired: false } }), 'en-IN', 'preview')
    );
    assert.ok(!off.includes('Due Date'));
    const stub = await newRenderer().renderHtml(
        buildInvoiceViewModel(fx.simple, fx.ORG, fx.settingsFor('standard', { fieldFlags: { isPaymentStubRequired: true } }), 'en-IN', 'preview')
    );
    assert.ok(stub.includes('Payment Slip'));
});

test('right-to-left invoices set dir on the document', async () => {
    const html = await newRenderer().renderHtml(vmFor('standard', 'simple', 'ur-IN'));
    assert.match(html, /<html lang="ur" dir="rtl">/);
    assert.match(html, /@top-left/);
});

test('repeat renders of the same view model come from the cache', async () => {
    const r = newRenderer();
    const vm = vmFor('compact', 'simple');
    const first = await r.renderHtml(vm);
    assert.equal(await r.renderHtml(vm), first);
    await r.renderHtml(vmFor('compact', 'india-gst'));
    assert.deepEqual(r.stats(), { hits: 1, misses: 2, cached: 2 });
});

test('a missing template file is a readable error, and a later render can recover', async () => {
    let fail = true;
    const r = createRenderer({ loadFile: async p => (fail && p.endsWith('footer.mustache') ? Promise.reject(new Error('ENOENT')) : loadFile(p)) });
    await assert.rejects(
        () => r.renderHtml(vmFor('standard', 'simple')),
        /Could not load templates\/partial\/footer.mustache for the "standard" template: ENOENT/
    );
    fail = false;
    assert.match(await r.renderHtml(vmFor('standard', 'simple')), /data-invoice-root/);
});

test('a template that references an unregistered partial fails loudly', async () => {
    const r = createRenderer({ loadFile: async p => (p.endsWith('standard.mustache') ? '<main data-invoice-root>{{>signature_block}}</main>' : loadFile(p)) });
    await assert.rejects(() => r.renderHtml(vmFor('standard', 'simple')), /Missing partial "signature_block" in "standard"/);
});

test('a view model that is not valid is refused before rendering', async () => {
    const vm = structuredClone(vmFor('standard', 'simple'));
    vm.lineItems[0].cells.pop();
    await assert.rejects(() => newRenderer().renderHtml(vm), /do not match the columns/);
});

test('renderInvoice builds and renders in one call', async () => {
    const { html, viewModel } = await newRenderer().renderInvoice({ invoice: fx.simple, org: fx.ORG, settings: fx.settingsFor('thermal'), mode: 'print' });
    assert.equal(viewModel.meta.mode, 'print');
    assert.match(html, /class="tpl-thermal"/);
});
