// The app shell's sidebar, built from core pages plus the pages of the company's enabled modules.
// buildNav() is pure; renderNavHtml() returns the same markup the sidebar always had (.nav-item[data-page]).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).platform = root.Vyapar.platform || {}).uiShell = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENTITIES[c]);
    const byOrder = (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const translated = (item, lang) => (item.labels && item.labels[lang]) || item.label;

    /**
     * @param {{ coreSections: object[], coreItems: object[], manifests: object[], t: (key: string) => string, lang: string }} input
     */
    function buildNav({ coreSections, coreItems, manifests, t, lang }) {
        const fromCore = x => (x.i18n && t(x.i18n) !== x.i18n ? t(x.i18n) : x.label);
        const sections = new Map([['main', { id: 'main', title: '', order: 0, items: [] }]]);
        coreSections.forEach(s => sections.set(s.id, { id: s.id, title: fromCore(s), order: s.order, items: [] }));
        manifests.forEach(m =>
            (m.sections || [])
                .filter(s => !sections.has(s.id))
                .forEach(s => sections.set(s.id, { id: s.id, title: translated(s, lang), order: s.order, items: [] }))
        );
        const add = (item, moduleId) => {
            const section = sections.get(item.section);
            if (!section) throw new Error(`Page "${item.route}" of module "${moduleId}" uses section "${item.section}", which does not exist`);
            section.items.push(item);
        };
        coreItems.forEach(i =>
            add({ id: i.route, route: i.route, section: i.section, label: fromCore(i), icon: i.icon || '', order: i.order, moduleId: null }, 'core')
        );
        manifests.forEach(m =>
            (m.navItems || []).forEach(i =>
                add({ id: i.route, route: i.route, section: i.section, label: translated(i, lang), icon: i.icon || '', order: i.order, moduleId: m.id }, m.id)
            )
        );
        return [...sections.values()]
            .filter(s => s.items.length)
            .sort(byOrder)
            .map(s => ({ ...s, items: s.items.sort(byOrder) }));
    }

    const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';

    function renderNavHtml(sections, activeRoute) {
        return sections
            .map(
                s =>
                    `<div class="nav-section">${s.title ? `<div class="nav-section-title" data-section="${esc(s.id)}">${esc(s.title)}</div>` : ''}${s.items
                        .map(
                            i =>
                                `<div class="nav-item${i.route === activeRoute ? ' active' : ''}" data-page="${esc(i.route)}">${ICON}${i.icon}</svg><span>${esc(i.label)}</span></div>`
                        )
                        .join('')}</div>`
            )
            .join('');
    }

    return { buildNav, renderNavHtml };
});
