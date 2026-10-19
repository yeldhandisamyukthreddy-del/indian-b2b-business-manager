// Module registry: every optional module registers one manifest. The registry validates it, orders modules
// after their dependencies and fails fast, naming the modules, on a missing dependency or a cycle.
// It knows nothing about any particular module.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node ? { validate: require('../core/shared/validate.js') } : { validate: root.Vyapar.core.validate };
    const api = factory(deps.validate);
    if (node) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).platform = root.Vyapar.platform || {}).registry = api;
})(typeof self !== 'undefined' ? self : this, function (v) {
    'use strict';

    class RegistryError extends Error {
        constructor(message) {
            super(message);
            this.name = 'RegistryError';
        }
    }

    const ID = /^[a-z][a-z0-9_]{1,39}$/;
    const labels = v.optional(v.record(v.string({ pattern: /^[a-z]{2,3}$/ }), v.string({ max: 60 })));
    const handler = () => (x, path) =>
        typeof x === 'function' || (x && typeof x.handler === 'function') ? [] : [`${path} must be a handler (a function, or { handler, priority })`];
    const navItem = v.object({
        id: v.string({ min: 1, max: 60 }),
        label: v.string({ min: 1, max: 60 }),
        labels,
        route: v.string({ pattern: /^[a-z][a-z0-9-]*$/ }),
        section: v.string({ pattern: /^[a-zA-Z][\w]*$/ }),
        order: v.number(),
        icon: v.optional(v.string({ max: 2000 })),
        requires: v.optional(v.array(v.string())),
        newAction: v.optional(v.string({ max: 80 }))
    });
    const MANIFEST = v.object({
        id: v.string({ pattern: ID }),
        version: v.string({ pattern: /^\d+\.\d+\.\d+$/ }),
        displayName: v.string({ min: 1, max: 60 }),
        description: v.string({ min: 1, max: 400 }),
        dependsOn: v.array(v.string({ pattern: ID })),
        adds: v.optional(v.array(v.string({ max: 160 }))),
        stores: v.optional(v.array(v.string({ pattern: /^[a-zA-Z][\w]*$/ }))),
        routes: v.optional(v.array(v.string({ pattern: /^[a-z][a-z0-9-]*$/ }))),
        migrations: v.optional(v.array(v.object({ id: v.string({ min: 1 }), up: v.func(), down: v.func() }))),
        navItems: v.optional(v.array(navItem)),
        sections: v.optional(
            v.array(v.object({ id: v.string({ pattern: /^[a-zA-Z][\w]*$/ }), label: v.string({ min: 1, max: 60 }), labels, order: v.number() }))
        ),
        settingsPanels: v.optional(v.array(v.object({ id: v.string({ min: 1 }), title: v.string({ min: 1 }) }, { allowUnknown: true }))),
        permissions: v.optional(v.array(v.string({ pattern: /^[a-z_]+\.[a-z_.]+$/ }))),
        eventSubscriptions: v.optional(v.record(v.string({ pattern: /^[a-z_]+\.[a-z_]+$/ }), handler())),
        extensionPoints: v.optional(v.record(v.string({ min: 1 }), v.any())),
        onEnable: v.optional(v.func()),
        onDisable: v.optional(v.func())
    });

    const routesOf = m => [...(m.navItems || []).map(n => n.route), ...(m.routes || [])];

    function createRegistry() {
        const manifests = new Map();

        function checkOwnership(m) {
            for (const other of manifests.values()) {
                (m.stores || [])
                    .filter(s => (other.stores || []).includes(s))
                    .forEach(s => {
                        throw new RegistryError(`Module "${m.id}": store "${s}" already belongs to "${other.id}"`);
                    });
                routesOf(m)
                    .filter(r => routesOf(other).includes(r))
                    .forEach(r => {
                        throw new RegistryError(`Module "${m.id}": page "${r}" already belongs to "${other.id}"`);
                    });
            }
        }

        function register(manifest) {
            const id = manifest && manifest.id;
            const errors = v.validate(MANIFEST, manifest);
            if (errors.length) throw new RegistryError(`Module "${id}" has an invalid manifest: ${errors.join('; ')}`);
            if (manifests.has(id)) throw new RegistryError(`Module "${id}" is registered twice`);
            if (manifest.dependsOn.includes(id)) throw new RegistryError(`Module "${id}" cannot depend on itself`);
            checkOwnership(manifest);
            manifests.set(id, Object.freeze({ ...manifest }));
        }

        const get = id => manifests.get(id) || null;
        const ids = () => [...manifests.keys()];
        const displayName = id => (get(id) || { displayName: id }).displayName;

        function findCycle() {
            const state = new Map();
            const stack = [];
            const visit = id => {
                if (state.get(id) === 'done' || !manifests.has(id)) return null;
                if (state.get(id) === 'open') return [...stack.slice(stack.indexOf(id)), id];
                state.set(id, 'open');
                stack.push(id);
                for (const dep of manifests.get(id).dependsOn) {
                    const cycle = visit(dep);
                    if (cycle) return cycle;
                }
                stack.pop();
                state.set(id, 'done');
                return null;
            };
            for (const id of ids().sort()) {
                const cycle = visit(id);
                if (cycle) return cycle;
            }
            return null;
        }

        // Kahn's algorithm with an alphabetical queue: dependencies first, ties broken by id
        function order(subset = ids()) {
            for (const id of subset) {
                if (!manifests.has(id)) throw new RegistryError(`Unknown module "${id}"`);
                manifests
                    .get(id)
                    .dependsOn.filter(d => !manifests.has(d))
                    .forEach(d => {
                        throw new RegistryError(`Module "${id}" depends on "${d}", which is not installed`);
                    });
            }
            const cycle = findCycle();
            if (cycle) throw new RegistryError(`Modules depend on each other in a cycle: ${cycle.join(' → ')}`);
            const pending = new Set(subset);
            const out = [];
            while (pending.size) {
                const ready = [...pending].filter(id => manifests.get(id).dependsOn.every(d => !pending.has(d))).sort();
                out.push(ready[0]);
                pending.delete(ready[0]);
            }
            return out;
        }

        function withDependencies(list) {
            const all = new Set();
            const add = id => {
                if (all.has(id)) return;
                if (!manifests.has(id)) throw new RegistryError(`Unknown module "${id}"`);
                all.add(id);
                manifests.get(id).dependsOn.forEach(add);
            };
            list.forEach(add);
            return order([...all]);
        }

        // Enabled modules that need `id`, directly or through another module
        function dependentsOf(id, enabled) {
            const out = new Set();
            let grew = true;
            while (grew) {
                grew = false;
                for (const other of enabled) {
                    const m = manifests.get(other);
                    if (m && !out.has(other) && m.dependsOn.some(d => d === id || out.has(d))) {
                        out.add(other);
                        grew = true;
                    }
                }
            }
            return order([...out]);
        }

        const pageOwner = route => ids().find(id => routesOf(manifests.get(id)).includes(route)) || null;
        const stores = () => ids().flatMap(id => (manifests.get(id).stores || []).map(store => ({ store, moduleId: id })));

        return {
            register,
            get,
            ids,
            list: () => [...manifests.values()],
            displayName,
            order,
            check: () => order(),
            withDependencies,
            dependentsOf,
            pageOwner,
            stores
        };
    }

    return { createRegistry, RegistryError, MANIFEST };
});
