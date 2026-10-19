// In-memory stand-in for the app's IndexedDB stores, with the same adapter shape the platform uses:
// { getAll(store), get(store, id), add(store, row) → id, put(store, row), delete(store, id) }
function fakeDb(seed = {}) {
    const stores = new Map();
    let next = 1;
    const table = name => {
        if (!stores.has(name)) stores.set(name, new Map());
        return stores.get(name);
    };
    Object.entries(seed).forEach(([name, rows]) =>
        rows.forEach(r => {
            const id = r.id ?? next++;
            table(name).set(id, structuredClone({ ...r, id }));
        })
    );
    return {
        stores,
        rows: name => [...table(name).values()],
        getAll: async name => [...table(name).values()].map(r => structuredClone(r)),
        get: async (name, id) => (table(name).has(id) ? structuredClone(table(name).get(id)) : undefined),
        add: async (name, row) => {
            while (row.id === undefined && table(name).has(next)) next++;
            const id = row.id ?? next++;
            if (table(name).has(id)) throw new Error(`Key ${id} already exists in ${name}`);
            table(name).set(id, structuredClone({ ...row, id }));
            return id;
        },
        put: async (name, row) => {
            table(name).set(row.id, structuredClone(row));
            return row.id;
        },
        delete: async (name, id) => {
            table(name).delete(id);
        }
    };
}

module.exports = { fakeDb };
