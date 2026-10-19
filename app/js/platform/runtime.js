// The per-company module runtime: which modules are on (edition + per-module choices), turning them on and off,
// running their migrations, delivering events to the ones that are on, and the route guard.
// Turning a module off never deletes its data; turning it on again delivers the events it missed.
// Per-company state lives in the 'orgModules' store: { companyId, moduleId, override, active, migrations, baselineSeq }.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const deps = node
        ? {
              editions: require('./editions.js'),
              hooks: require('./hooks.js'),
              events: require('./events.js'),
              repository: require('../core/shared/repository.js'),
              result: require('../core/shared/result.js')
          }
        : { ...root.Vyapar.platform, repository: root.Vyapar.core.repository, result: root.Vyapar.core.result };
    const api = factory(deps);
    if (node) module.exports = api;
    else ((root.Vyapar = root.Vyapar || {}).platform = root.Vyapar.platform || {}).runtime = api;
})(typeof self !== 'undefined' ? self : this, function (deps) {
    'use strict';
    const { editions, hooks, events, repository, result } = deps;
    const { AppError } = result;
    const ORG_MODULES = 'orgModules';

    function createRuntime({ adapter, registry, now = () => new Date().toISOString(), can = () => true, log = console }) {
        const queues = new Map();
        // One state change at a time per company
        function serialize(orgId, fn) {
            const run = (queues.get(orgId) || Promise.resolve()).then(fn, fn);
            queues.set(
                orgId,
                run.catch(() => {})
            );
            return run;
        }

        const name = id => registry.displayName(id);
        const knownModule = id => {
            if (!registry.get(id)) throw new AppError('module.unknown', `Unknown module "${String(id).slice(0, 40)}"`);
        };

        async function companyOf(orgId) {
            const company = await adapter.get('companies', orgId);
            if (!company) throw new AppError('company.not_found', `Company ${orgId} not found`);
            return company;
        }
        const rowsOf = async orgId => Object.fromEntries((await adapter.getAll(ORG_MODULES)).filter(r => r.companyId === orgId).map(r => [r.moduleId, r]));
        async function saveRow(orgId, moduleId, patch) {
            const row = (await rowsOf(orgId))[moduleId];
            if (row) await adapter.put(ORG_MODULES, { ...row, ...patch });
            else await adapter.add(ORG_MODULES, { companyId: orgId, moduleId, ...patch });
        }

        async function enabledModules(orgId) {
            const company = await companyOf(orgId);
            const edition = editions.isEdition(company.edition) ? company.edition : editions.DEFAULT_EDITION;
            const on = new Set(editions.modulesForEdition(edition, registry));
            Object.values(await rowsOf(orgId)).forEach(r => {
                if (r.override === true && registry.get(r.moduleId)) on.add(r.moduleId);
                if (r.override === false) on.delete(r.moduleId);
            });
            // A module whose dependency is off cannot be on
            let changed = true;
            while (changed) {
                changed = false;
                for (const id of [...on])
                    if (!registry.get(id).dependsOn.every(d => on.has(d))) {
                        on.delete(id);
                        changed = true;
                    }
            }
            return registry.order([...on]);
        }
        const isModuleEnabled = async (orgId, id) => !!registry.get(id) && (await enabledModules(orgId)).includes(id);
        const enabledManifests = async orgId => (await enabledModules(orgId)).map(id => registry.get(id));

        function ctxFor(orgId, moduleId) {
            return {
                orgId,
                moduleId,
                now,
                log,
                repo: store => repository.createRepository(adapter, store, orgId),
                emit: (type, payload, opts) => publish(orgId, type, payload, opts),
                contributions: point => contributions(orgId, point),
                isModuleEnabled: id => isModuleEnabled(orgId, id)
            };
        }

        async function subscribers(orgId, type, onlyModule) {
            const list = (await enabledManifests(orgId))
                .filter(m => (!onlyModule || m.id === onlyModule) && m.eventSubscriptions && m.eventSubscriptions[type])
                .map(m => {
                    const sub = m.eventSubscriptions[type];
                    return {
                        moduleId: m.id,
                        priority: sub.priority ?? hooks.DEFAULT_PRIORITY,
                        key: `${m.id}:${type}`,
                        handler: sub.handler || sub,
                        ctx: ctxFor(orgId, m.id)
                    };
                });
            return list.sort((a, b) => a.priority - b.priority || (a.moduleId < b.moduleId ? -1 : 1));
        }
        const bus = events.createEventBus({ store: adapter, now, subscribers });

        async function activate(orgId, id) {
            const m = registry.get(id);
            const row = (await rowsOf(orgId))[id] || {};
            const ctx = ctxFor(orgId, id);
            const applied = [...(row.migrations || [])];
            for (const mig of m.migrations || []) {
                if (applied.includes(mig.id)) continue;
                await mig.up(ctx);
                applied.push(mig.id);
                await saveRow(orgId, id, { migrations: [...applied] });
            }
            if (m.onEnable) await m.onEnable(ctx);
            const firstTime = typeof row.baselineSeq !== 'number';
            if (!firstTime) await bus.catchUp(orgId, id, row.baselineSeq);
            await saveRow(orgId, id, { active: true, enabledAt: now(), baselineSeq: firstTime ? await bus.lastSeq(orgId) : row.baselineSeq });
        }
        async function deactivate(orgId, id) {
            const m = registry.get(id);
            if (m.onDisable) await m.onDisable(ctxFor(orgId, id));
            await saveRow(orgId, id, { active: false, disabledAt: now() });
        }

        // Bring the company's modules in line with its edition and choices: run onEnable / onDisable where needed
        function syncState(orgId) {
            return serialize(orgId, async () => {
                const enabled = await enabledModules(orgId);
                const rows = await rowsOf(orgId);
                for (const id of [...registry.order()].reverse()) if (rows[id] && rows[id].active && !enabled.includes(id)) await deactivate(orgId, id);
                for (const id of enabled) if (!rows[id] || !rows[id].active) await activate(orgId, id);
                return enabled;
            });
        }

        async function setEdition(orgId, edition) {
            if (!editions.isEdition(edition))
                throw new AppError(
                    'edition.unknown',
                    `Unknown edition "${String(edition).slice(0, 30)}". Choose one of: ${editions.editionNames().join(', ')}`
                );
            const company = await companyOf(orgId);
            const before = await enabledModules(orgId);
            await adapter.put('companies', { ...company, edition });
            // A new edition starts from its own module list
            for (const r of Object.values(await rowsOf(orgId))) if (r.override !== undefined) await adapter.put(ORG_MODULES, { ...r, override: undefined });
            const after = await syncState(orgId);
            return { enabled: after.filter(id => !before.includes(id)), disabled: before.filter(id => !after.includes(id)) };
        }

        async function enableModule(orgId, id) {
            knownModule(id);
            const enabled = await enabledModules(orgId);
            const toEnable = registry.withDependencies([id]).filter(x => !enabled.includes(x));
            for (const x of toEnable) await saveRow(orgId, x, { override: true });
            await syncState(orgId);
            return { enabled: toEnable };
        }

        async function disableModule(orgId, id) {
            knownModule(id);
            const enabled = await enabledModules(orgId);
            if (!enabled.includes(id)) return { disabled: [] };
            const dependents = registry.dependentsOf(id, enabled);
            if (dependents.length) {
                const names = dependents.map(name).join(', ');
                throw new AppError('module.in_use', `Turn off ${names} first: ${dependents.length > 1 ? 'they need' : 'it needs'} ${name(id)}.`, {
                    moduleId: id,
                    dependents
                });
            }
            await saveRow(orgId, id, { override: false });
            await syncState(orgId);
            return { disabled: [id] };
        }

        // Undo a module's migrations (its own derived data). Only while it is off; it starts fresh when turned on again.
        async function rollbackModule(orgId, id) {
            knownModule(id);
            if (await isModuleEnabled(orgId, id)) throw new AppError('module.enabled', `Turn off ${name(id)} before rolling back its data changes.`);
            const row = (await rowsOf(orgId))[id] || {};
            const ctx = ctxFor(orgId, id);
            const migrations = registry.get(id).migrations || [];
            for (const migId of [...(row.migrations || [])].reverse()) {
                const mig = migrations.find(x => x.id === migId);
                if (mig) await mig.down(ctx);
            }
            await saveRow(orgId, id, { migrations: [], baselineSeq: undefined });
        }

        const publish = (orgId, type, payload, opts) => bus.publish(orgId, type, payload, opts);
        const contributions = async (orgId, point) => hooks.collect(await enabledManifests(orgId), point);
        const validate = async (orgId, point, input, ...args) => hooks.runValidators(await contributions(orgId, point), input, ...args);
        const pipe = async (orgId, point, value, ...args) => hooks.pipe(await contributions(orgId, point), value, ...args);

        // 404 for pages of a module that is off, 403 when a required permission is missing
        async function guard(orgId, route) {
            const moduleId = registry.pageOwner(route);
            if (!moduleId) return { status: 200, moduleId: null };
            if (!(await isModuleEnabled(orgId, moduleId))) return { status: 404, moduleId };
            const item = (registry.get(moduleId).navItems || []).find(n => n.route === route);
            const allowed = ((item && item.requires) || []).every(p => can(p));
            return { status: allowed ? 200 : 403, moduleId };
        }

        return {
            registry,
            enabledModules,
            isModuleEnabled,
            syncState,
            setEdition,
            enableModule,
            disableModule,
            rollbackModule,
            publish,
            redeliver: orgId => bus.redeliverPending(orgId),
            contributions,
            validate,
            pipe,
            guard,
            ctxFor,
            moduleStates: rowsOf
        };
    }

    return { createRuntime, ORG_MODULES };
});
