// Settings → Features & Editions: the company's edition, every module with its status, what it needs,
// what needs it and what it adds, and switches to turn modules on or off. Turning a module off keeps its data.
/* global dbOps, currentCompanyId, esc, t, showToast, refreshModules */
(function () {
    'use strict';
    const V = window.Vyapar;
    const runtime = () => V.app.runtime;
    const registry = () => V.app.registry;
    const { editions } = V.platform;
    const orgId = () => parseInt(currentCompanyId);
    const names = ids => ids.map(id => esc(registry().displayName(id))).join(', ');
    const run = promise => promise.catch(err => showToast(err.userMessage || err.message || String(err), 'error'));

    function editionCards(current) {
        return editions
            .editionNames()
            .map(name => {
                const e = editions.EDITIONS[name];
                const mods = editions.modulesForEdition(name, registry());
                const isCurrent = name === current;
                return `<div class="feature-edition${isCurrent ? ' current' : ''}" data-edition="${name}">
                <h4>${esc(e.label)}${isCurrent ? ' <span class="badge badge-success">Current</span>' : ''}</h4>
                <p>${esc(e.description)}</p>
                <p class="tpl-hint">${mods.length ? `Modules: ${names(mods)}` : 'Core only'}</p>
                ${isCurrent ? '' : `<button class="btn btn-outline" onclick="FeaturesPage.switchEdition('${name}')">Switch to ${esc(e.label)}</button>`}
            </div>`;
            })
            .join('');
    }

    function moduleRow(m, enabled, editionModules, states) {
        const on = enabled.includes(m.id);
        const neededBy = registry().dependentsOf(m.id, enabled);
        const override = states[m.id] && states[m.id].override;
        const source =
            override === undefined || override === null
                ? editionModules.includes(m.id)
                    ? 'In your edition'
                    : 'Not in your edition'
                : on
                  ? 'Turned on by you'
                  : 'Turned off by you';
        const blocked = on && neededBy.length;
        const button = on
            ? `<button class="btn" ${blocked ? `disabled title="Needed by ${names(neededBy)}"` : ''} onclick="FeaturesPage.toggle('${m.id}', false)">Turn off</button>`
            : `<button class="btn btn-primary" onclick="FeaturesPage.toggle('${m.id}', true)">Turn on</button>`;
        return `<tr data-module="${m.id}"><td><strong>${esc(m.displayName)}</strong><div class="tpl-hint">${esc(m.description)}</div>
            ${(m.adds || []).length ? `<ul class="feature-adds">${m.adds.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</td>
            <td><span class="badge ${on ? 'badge-success' : 'badge-warning'}">${on ? 'On' : 'Off'}</span><div class="tpl-hint">${source}</div></td>
            <td>${m.dependsOn.length ? names(m.dependsOn) : '-'}</td><td>${neededBy.length ? names(neededBy) : '-'}</td><td>${button}</td></tr>`;
    }

    async function render() {
        if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
        const company = await dbOps.get('companies', orgId());
        const current = editions.isEdition(company.edition) ? company.edition : editions.DEFAULT_EDITION;
        const enabled = await runtime().enabledModules(orgId());
        const states = await runtime().moduleStates(orgId());
        const editionModules = editions.modulesForEdition(current, registry());
        return `<div class="page-header"><h1 class="page-title">Features &amp; Editions</h1></div>
        <div class="card"><h3>Edition</h3><p class="tpl-hint">An edition is a set of modules. Switching never deletes data: a module that is turned off keeps everything, and it is all back when the module is on again.</p>
            <div class="feature-editions">${editionCards(current)}</div></div>
        <div class="card"><h3>Modules</h3><p class="tpl-hint">Invoicing, receipts, credit notes, expenses, customers, vendors and products are always on.</p>
            <table id="featuresTable"><thead><tr><th>Module</th><th>Status</th><th>Needs</th><th>Needed by</th><th></th></tr></thead>
            <tbody>${registry()
                .order()
                .map(id => moduleRow(registry().get(id), enabled, editionModules, states))
                .join('')}</tbody></table></div>`;
    }

    async function switchEdition(name) {
        const before = await runtime().enabledModules(orgId());
        const after = editions.modulesForEdition(name, registry());
        const hidden = before.filter(id => !after.includes(id));
        if (
            hidden.length &&
            !confirm(
                `${names(hidden).replace(/&amp;/g, '&')} will be turned off and their pages hidden. Their data is kept and comes back when you turn them on again. Continue?`
            )
        )
            return;
        const result = await runtime().setEdition(orgId(), name);
        showToast(
            `Edition: ${editions.EDITIONS[name].label}${result.enabled.length ? `. Turned on: ${result.enabled.map(id => registry().displayName(id)).join(', ')}` : ''}`
        );
        await refreshModules();
    }

    async function toggle(id, on) {
        const result = on ? await runtime().enableModule(orgId(), id) : await runtime().disableModule(orgId(), id);
        const changed = on ? result.enabled : result.disabled;
        if (changed.length) showToast(`${on ? 'Turned on' : 'Turned off'}: ${changed.map(x => registry().displayName(x)).join(', ')}`);
        await refreshModules();
    }

    window.FeaturesPage = { render, switchEdition: name => run(switchEdition(name)), toggle: (id, on) => run(toggle(id, on)) };
})();
