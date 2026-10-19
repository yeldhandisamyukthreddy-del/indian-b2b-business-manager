// platform/ui-shell: the sidebar built from core pages and the pages of enabled modules
const { test } = require('node:test');
const assert = require('node:assert/strict');
const shell = require('../../app/js/platform/ui-shell.js');
const nav = require('../../app/js/core/navigation.js');

const t = key => ({ customers: 'Customers', masters: 'Masters', dashboard: 'Dashboard' })[key] || key;
const purchasing = {
    id: 'purchasing',
    sections: [{ id: 'purchase', label: 'Purchase', labels: { te: 'కొనుగోలు' }, order: 30 }],
    navItems: [
        {
            id: 'bills',
            label: 'Purchase Bills',
            labels: { te: 'కొనుగోలు బిల్లులు' },
            route: 'purchase-bills',
            section: 'purchase',
            order: 20,
            icon: '<path d="M1 1"/>'
        },
        { id: 'po', label: 'Purchase Orders', route: 'purchase-orders', section: 'purchase', order: 10 }
    ]
};
const core = {
    coreSections: [{ id: 'masters', i18n: 'masters', label: 'Masters', order: 10 }],
    coreItems: [
        { route: 'dashboard', i18n: 'dashboard', label: 'Dashboard', section: 'main', order: 10, icon: '<rect/>' },
        { route: 'customers', i18n: 'customers', label: 'Customers', section: 'masters', order: 20, icon: '<circle/>' }
    ]
};

test('core and module pages are merged into ordered sections', () => {
    const sections = shell.buildNav({ ...core, manifests: [purchasing], t, lang: 'en' });
    assert.deepEqual(
        sections.map(s => [s.id, s.items.map(i => i.route)]),
        [
            ['main', ['dashboard']],
            ['masters', ['customers']],
            ['purchase', ['purchase-orders', 'purchase-bills']]
        ]
    );
    assert.equal(sections[2].items[1].moduleId, 'purchasing');
    assert.equal(sections[0].title, '', 'the first section has no title');
});

test('module labels are translated when the module provides the language', () => {
    const sections = shell.buildNav({ ...core, manifests: [purchasing], t, lang: 'te' });
    assert.equal(sections[2].title, 'కొనుగోలు');
    assert.deepEqual(
        sections[2].items.map(i => i.label),
        ['Purchase Orders', 'కొనుగోలు బిల్లులు']
    );
});

test('without the module its pages and empty sections disappear', () => {
    const sections = shell.buildNav({ ...core, manifests: [], t, lang: 'en' });
    assert.deepEqual(
        sections.map(s => s.id),
        ['main', 'masters']
    );
});

test('a page in a section nobody defines is a clear error', () => {
    assert.throws(
        () =>
            shell.buildNav({
                ...core,
                manifests: [{ id: 'lost', navItems: [{ id: 'x', label: 'X', route: 'x', section: 'nowhere', order: 1 }] }],
                t,
                lang: 'en'
            }),
        /Page "x" of module "lost" uses section "nowhere", which does not exist/
    );
});

test('rendered sidebar escapes labels and marks the active page', () => {
    const sections = shell.buildNav({
        ...core,
        manifests: [{ ...purchasing, navItems: [{ ...purchasing.navItems[0], label: '<b>Bills</b>' }] }],
        t,
        lang: 'en'
    });
    const html = shell.renderNavHtml(sections, 'customers');
    assert.match(html, /<div class="nav-item active" data-page="customers">/);
    assert.match(html, /&lt;b&gt;Bills&lt;\/b&gt;/);
    assert.match(html, /<div class="nav-section-title" data-section="purchase">Purchase<\/div>/);
    assert.match(html, /<path d="M1 1"\/>/, 'icons are trusted markup from code');
});

test('the real core navigation is consistent', () => {
    const sections = shell.buildNav({ coreSections: nav.SECTIONS, coreItems: nav.ITEMS, manifests: [], t, lang: 'en' });
    const routes = sections.flatMap(s => s.items.map(i => i.route));
    assert.equal(new Set(routes).size, routes.length, 'no page twice');
    assert.equal(routes[0], 'dashboard');
    assert.ok(routes.includes('features'));
});
