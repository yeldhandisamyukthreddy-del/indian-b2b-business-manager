# Adding a module

This guide adds a small module, **Loyalty points**, that gives customers one point per ₹100 invoiced. Along the way it
uses each part a module can have: a manifest, a store, a migration, an event handler, an extension point, a page and
tests. Read [architecture.md](architecture.md) first for the rules.

## 1. Folder and manifest

Create `app/js/modules/loyalty/index.js`. The folder name is the module id: lowercase, digits and `_`.

```js
// Loyalty module: one point per ₹100 invoiced, shown on the customer list and in a points page.
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const money = node ? require('../../core/shared/money.js') : root.Vyapar.money;
  const api = factory(money);
  if (node) module.exports = api;
  else root.Vyapar.app.register(api);
})(typeof self !== 'undefined' ? self : this, function (money) {
  'use strict';
  const POINTS = 'loyaltyPoints';
  // One point per full ₹100 of the invoice total
  const pointsFor = doc => Math.floor(money.toPaise(doc.grandTotal) / 10000);

  // Points come from events, so an entry's id is the event's id: a second delivery adds nothing
  async function earn(event, ctx) {
    const repo = ctx.repo(POINTS);
    const id = `pts:${event.id}`;
    if (await repo.get(id)) return;
    const doc = event.payload.doc;
    const sign = event.type === 'invoice.voided' ? -1 : 1;
    await repo.add({ id, customerId: doc.customerId, points: sign * pointsFor(doc), ref: doc.number, date: doc.date });
  }

  return {
    id: 'loyalty',
    version: '1.0.0',
    displayName: 'Loyalty Points',
    description: 'Customers earn a point for every ₹100 invoiced.',
    dependsOn: [],
    adds: ['Points per customer from their invoices', 'Points page'],
    stores: [POINTS],
    navItems: [
      {
        id: 'loyalty',
        label: 'Loyalty Points',
        route: 'loyalty',
        section: 'sales',
        order: 60,
        requires: ['loyalty.view'],
        icon: '<circle cx="12" cy="12" r="9" />'
      }
    ],
    permissions: ['loyalty.view'],
    migrations: [
      {
        // Invoices saved before the module was turned on earn their points once
        id: '001-existing-invoices',
        up: async ctx => {
          for (const doc of await ctx.repo('invoices').list()) await earn({ id: `backfill:${doc.id}`, type: 'invoice.finalized', payload: { doc } }, ctx);
        },
        down: async ctx => {
          const repo = ctx.repo(POINTS);
          for (const row of await repo.list()) await repo.remove(row.id);
        }
      }
    ],
    eventSubscriptions: { 'invoice.finalized': earn, 'invoice.voided': earn },
    extensionPoints: {
      // A row on the dashboard; money is in paise, counts are plain numbers
      'dashboard.stats': async ({ list }) => [{ label: 'Loyalty points given', value: (await list(POINTS)).reduce((s, r) => s + r.points, 0), format: 'count' }]
    }
  };
});
```

Points to check:

- The manifest is plain data plus functions. `index.js` loads in Node, so it must not touch `window` or `document` when
  it loads. Functions that use the DOM run only in the browser.
- Handlers and migrations get a `ctx` whose repositories are scoped to one company.
- Give every row a module writes from an event an id derived from the event (`pts:<event id>`). Delivery is at least
  once.
- `down` undoes what `up` did, so the module can be rolled back from its own data.

## 2. Pages

Create `app/js/modules/loyalty/ui.js` for the browser. It may use the app's helpers from `app/index.html` (`dbOps`,
`esc`, `t`, `showModal`, and so on). List them in a `/* global */` comment so lint can check them:

```js
// Loyalty pages. Uses the app's helpers from app/index.html.
/* global dbOps, currentCompanyId, t, esc */
(function () {
  'use strict';
  async function renderLoyalty() {
    if (!currentCompanyId) return `<div class="empty-state"><h3>${t('selectCompanyFirst')}</h3></div>`;
    const customers = await dbOps.getByCompany('customers');
    const points = await dbOps.getByCompany('loyaltyPoints');
    const total = id => points.filter(p => p.customerId === id).reduce((s, p) => s + p.points, 0);
    return `<div class="page-header"><h1 class="page-title">Loyalty Points</h1></div>
            <div class="card"><table><thead><tr><th>Customer</th><th>Points</th></tr></thead>
            <tbody>${customers.map(c => `<tr><td>${esc(c.name)}</td><td>${total(c.id)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  window.Vyapar.app.definePages('loyalty', { loyalty: renderLoyalty });
})();
```

- `definePages` accepts only pages the manifest declared (`navItems` or `routes`).
- While the module is off, the page shows "Page not found" and the sidebar hides it. You write nothing for that.
- Functions called from `onclick="..."` must be global: `Object.assign(window, { saveLoyalty, ... })`. Give them names
  no other file uses, because the architecture test treats a function a module defines as off limits to core.

## 3. Load it

Add the files to `app/index.html`, after the comment `<!-- Optional modules ... -->`, after any module this one
depends on and before any module that depends on it:

```html
<script src="js/modules/loyalty/index.js" defer></script>
<script src="js/modules/loyalty/ui.js" defer></script>
```

Then run `npm run sync-offline-files`, so the installed web app can load the new files offline. A unit test fails if a
script is not loaded or not cached.

The new store is created automatically the next time the app opens: the database moves up one version.

## 4. Editions

A new module is in the **full** edition automatically, because `full` is every installed module. To include it in
another edition, add its id to that edition in `app/js/platform/editions.js`; a test checks that every id listed
there exists. People can also turn it on by hand under **Settings → Features & Editions**.

## 5. Using what core offers

- **Change how core behaves** through an extension point, never by changing core objects. See the table in
  [architecture.md](architecture.md#extension-points). Common ones:
  - `invoice.validate` to block or warn before an invoice is saved
  - `line.fields` and `invoice.fields` for extra inputs, kept in `extensions.<your id>`
  - `reports.entries` for a new report
  - `document.blocks` for something printed on the invoice
- **React to what happened** with `eventSubscriptions`. Core's events carry `{ doc }`: a snapshot of the document at
  that revision.
- **Offer data to other modules** by defining an extension point of your own, named after your module (for example
  `loyalty.balance`). Other modules contribute to it or read it without depending on you.
- **Use another module's code** only if it is in your `dependsOn`, for example
  `window.Vyapar.modules.inventory.stock`.
- **Need a new extension point in core?** Add it in core with a generic name and a short comment saying what shape
  contributions have, document it in `architecture.md`, and use it from your module.

## 6. Tests

- **Manifest and boundaries:** nothing to write. `tests/unit/architecture.test.js` loads every `app/js/modules/*/index.js`,
  validates it, checks the dependency graph, and checks that core never names your module, its stores or its
  functions.
- **Rules and handlers:** test them on the real runtime with the in-memory database, as `tests/unit/modules.test.js`
  does. Check at least these four things:
  - publishing an event changes your store
  - publishing it again, or redelivering it after its receipts are lost, changes nothing
  - turning the module off and on again catches up the events it missed
  - `down` undoes `up`
- **Screens:** add a Playwright test like `tests/modules.spec.js`. It should open the page with the module on, and see
  "Page not found" with the module off.

Run everything before opening a pull request:

```bash
npm run lint && npm run format:check && npm run test:unit
xvfb-run -a npm test   # or just: npm test
```

## Checklist

- [ ] `app/js/modules/<id>/index.js` exports a valid manifest, with `id` matching the folder.
- [ ] Every store is listed in `stores`. Nothing is deleted when the module turns off.
- [ ] Event handlers and migrations are idempotent; migrations have a working `down`.
- [ ] Values on core documents live in `extensions.<id>`.
- [ ] Money in your rules and reports is integer paise (`Vyapar.money`).
- [ ] Pages are declared in `navItems` / `routes` and registered with `definePages`.
- [ ] Script tags are in dependency order; `npm run sync-offline-files` has been run.
- [ ] Unit tests on the runtime, and an end-to-end test for the page.
