// Browser composition root: the one registry that module scripts register into, and the page renderers
// that their ui.js files provide. Loaded after the platform scripts and before any module.
(function (root) {
    'use strict';
    const P = root.Vyapar.platform;
    const registry = P.registry.createRegistry();
    const pages = {};

    // A module may only provide pages it declared (navItems or routes)
    function definePages(moduleId, map) {
        Object.entries(map).forEach(([route, render]) => {
            const owner = registry.pageOwner(route);
            if (owner !== moduleId) throw new Error(`Module "${moduleId}" cannot provide page "${route}"; it belongs to ${owner ? `"${owner}"` : 'no module'}`);
            pages[route] = render;
        });
    }

    root.Vyapar.app = { registry, pages, definePages, register: manifest => registry.register(manifest), runtime: null };
})(self);
