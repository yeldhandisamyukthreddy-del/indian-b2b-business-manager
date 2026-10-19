// Tenant-scoped access to one store: every row belongs to a company (companyId), and a repository made for
// company A can neither read nor write company B's rows. Core and modules use this instead of raw stores.
// adapter: { getAll(store), get(store, id), add(store, row), put(store, row), delete(store, id) }
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).core = root.Vyapar.core || {}).repository = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class TenantError extends Error {
        constructor(store, id) {
            super(`Record ${id ?? ''} in ${store} belongs to another company`);
            this.name = 'TenantError';
            this.code = 'tenant';
        }
    }

    const mine = (row, orgId) => !!row && row.companyId === orgId;

    function createRepository(adapter, store, orgId) {
        if (!Number.isInteger(orgId) || orgId <= 0) throw new Error(`A repository needs a company id (got ${orgId})`);

        async function owned(id) {
            const row = await adapter.get(store, id);
            if (row && !mine(row, orgId)) throw new TenantError(store, id);
            return row || null;
        }

        return {
            store,
            orgId,
            list: async () => (await adapter.getAll(store)).filter(r => mine(r, orgId)),
            find: async predicate => (await adapter.getAll(store)).filter(r => mine(r, orgId) && predicate(r)),
            get: async id => {
                const row = await adapter.get(store, id);
                return mine(row, orgId) ? row : null;
            },
            add: async row => {
                if (row.companyId !== undefined && row.companyId !== orgId) throw new TenantError(store, row.id);
                return adapter.add(store, { ...row, companyId: orgId });
            },
            put: async row => {
                if (row.companyId !== orgId) throw new TenantError(store, row.id);
                await owned(row.id);
                return adapter.put(store, row);
            },
            remove: async id => {
                if (await owned(id)) await adapter.delete(store, id);
            }
        };
    }

    return { createRepository, TenantError };
});
