// Extension points: how modules change core behaviour without core knowing them.
// A module lists contributions under manifest.extensionPoints[point]; they run in a fixed order
// (priority, lower first, default 100; then module id). Inputs are frozen copies, so a hook cannot
// change a core object in place: transformers return a new value, validators return vetoes or warnings.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).platform = root.Vyapar.platform || {}).hooks = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class HookError extends Error {
        constructor(moduleId, message) {
            super(`Module "${moduleId}" ${message}`);
            this.name = 'HookError';
            this.moduleId = moduleId;
        }
    }

    const DEFAULT_PRIORITY = 100;
    const priorityOf = value => (value && typeof value.priority === 'number' ? value.priority : DEFAULT_PRIORITY);
    const byOrder = (a, b) => a.priority - b.priority || (a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0);

    function collect(manifests, point) {
        return manifests
            .flatMap(m => {
                const raw = (m.extensionPoints || {})[point];
                if (raw === undefined) return [];
                return (Array.isArray(raw) ? raw : [raw]).map(value => ({ moduleId: m.id, priority: priorityOf(value), value }));
            })
            .sort(byOrder);
    }

    function deepFreeze(x) {
        if (x && typeof x === 'object' && !Object.isFrozen(x)) {
            Object.freeze(x);
            Object.values(x).forEach(deepFreeze);
        }
        return x;
    }
    const frozenCopy = x => deepFreeze(x === undefined ? x : structuredClone(x));
    const fnOf = value => (typeof value === 'function' ? value : value && value.run);

    // Each transformer gets the previous result (frozen) and must return a new value
    function pipe(contributions, value, ...args) {
        return contributions.reduce((acc, c) => {
            let next;
            try {
                next = fnOf(c.value)(frozenCopy(acc), ...args);
            } catch (err) {
                throw new HookError(c.moduleId, `failed in a hook: ${err.message}`);
            }
            if (next === undefined) throw new HookError(c.moduleId, 'must return a new value from a transform hook');
            return next;
        }, value);
    }

    // Validators return nothing, { veto } / { warning }, or a list of those
    async function runValidators(contributions, input, ...args) {
        const vetoes = [];
        const warnings = [];
        for (const c of contributions) {
            let result;
            try {
                result = await fnOf(c.value)(frozenCopy(input), ...args);
            } catch (err) {
                throw new HookError(c.moduleId, `failed in a validation hook: ${err.message}`);
            }
            (Array.isArray(result) ? result : [result]).filter(Boolean).forEach(r => {
                if (r.veto) vetoes.push({ moduleId: c.moduleId, message: String(r.veto) });
                if (r.warning) warnings.push({ moduleId: c.moduleId, message: String(r.warning) });
            });
        }
        return { vetoes, warnings };
    }

    return { collect, pipe, runValidators, frozenCopy, deepFreeze, HookError, DEFAULT_PRIORITY };
});
