# Architecture: a finance core with optional modules

VyaparEasy is split into three layers.

- The **core** holds what every business needs to invoice and get paid.
- The **platform** knows how to load, switch and connect modules, but knows nothing about any particular one.
- **Modules** each add one area of the business, such as GST, purchasing, stock or books.

A company's **edition** decides which modules are on, and each module can also be turned on or off by hand.

```
┌──────────────────────────────────── app/index.html + app/js/core ─────────────────────────────────────┐
│ CORE  contacts · catalog + price lists · quotations · invoices · recurring invoices · receipts ·       │
│       credit notes · expenses · banking · documents (printed invoices) · reports · settings            │
│       recordInvoice() ─ the one way an invoice is saved: hooks → number → balance → events            │
└───────────────▲─────────────────────────────── extension points ────────────────────────▲────────────┘
                │ contributions (data and functions in manifests)        domain events      │
┌───────────────┴──────────────────────── app/js/platform ───────────────────────────────┴────────────┐
│ PLATFORM  registry (manifests, order, cycles) · editions (data) · runtime (per-company state,          │
│           migrations, enable/disable, route guard) · events (stored, at-least-once) · hooks · sidebar  │
└───────────────▲───────────────────────────────────────────────────────────────────────────────────────┘
                │ registers a manifest
┌───────────────┴──────────────────────────────── app/js/modules ───────────────────────────────────────┐
│ region_india_gst · purchasing · inventory · accounting · fulfilment (→ inventory) · hr · fleet ·       │
│ region_eu_vat (preview) · export_accounting (preview, → accounting)                                    │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

There is still no build step and no runtime dependency. Every file is a plain script, loaded by `app/index.html` in
order and cached by the service worker. Most files also load in Node, so they can be unit-tested.

## Folders

| Path                              | What                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/index.html`                  | Core screens (companies, contacts, products, invoices, quotations, receipts, credit notes, banking, reports, settings, dashboard) and the composition root              |
| `app/js/core/shared/`             | `money.js` (integer paise), `result.js` (errors), `validate.js` (schemas), `repository.js` (tenant-scoped stores)                                                       |
| `app/js/core/<area>/`             | Pure domain rules: `tax`, `currency`, `catalog`, `contacts`, `sales` (payments, revisions, event ids, recurring), `expenses`, `reports`, `documents` (printed invoices) |
| `app/js/core/ui/`                 | Core pages kept outside `index.html`: expenses, recurring invoices, price lists                                                                                         |
| `app/js/core/navigation.js`       | Core sidebar sections and pages                                                                                                                                         |
| `app/js/platform/`                | `registry`, `editions`, `hooks`, `events`, `runtime`, `ui-shell` (sidebar), `bootstrap` (browser registry), `features-page` (Settings → Features & Editions)            |
| `app/js/modules/<id>/index.js`    | The module's manifest (Node and browser)                                                                                                                                |
| `app/js/modules/<id>/*.js`        | Pure rules of the module (e.g. `gst.js`, `stock.js`, `books.js`), unit-tested                                                                                           |
| `app/js/modules/<id>/ui.js`       | The module's pages (browser only)                                                                                                                                       |
| `tests/unit/architecture.test.js` | The dependency rules, checked on the real source                                                                                                                        |

## Dependency rules

The rules are enforced by `tests/unit/architecture.test.js`, which runs in CI:

1. **Core never refers to a module.** Core code contains no module paths, no module ids, no names of stores a module owns
   and no calls to functions a module defines. Core reaches modules only through extension points and events.
2. **A module refers only to the modules it lists in `dependsOn`.** For example, `fulfilment` may use
   `Vyapar.modules.inventory`; `purchasing` may not use `accounting`.
3. **Platform code names no module.** The one exception is `editions.js`, because editions are data.
4. **Every manifest is valid and the dependency graph has no cycles.**

At startup the app also fails fast. If a module depends on one that is not installed, or modules depend on each other in
a cycle, it stops and names them (for example `Modules depend on each other in a cycle: a → c → b → a`). It never runs
half-configured.

## Module manifest

Each `index.js` exports one manifest. The registry validates it with `MANIFEST` in `platform/registry.js`.

| Field                             | Meaning                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `version`                   | `region_india_gst`, `1.0.0`                                                                                                                         |
| `displayName`                     | What people see: "India GST"                                                                                                                        |
| `description`, `adds`             | One line, and the list of things it adds (shown on the features screen)                                                                             |
| `dependsOn`                       | Modules that must be on first. Turning this one on turns them on; they cannot be turned off while this one is on                                    |
| `stores`                          | IndexedDB stores the module owns. They exist whether the module is on or off, so turning it off never deletes data                                  |
| `migrations`                      | `[{ id, up(ctx), down(ctx) }]`. `up` runs once per company when the module is first turned on; `down` runs on rollback                              |
| `navItems`, `routes`              | Pages: `{ id, label, labels: { te }, route, section, order, icon, requires: [permissions], newAction }`; `routes` are pages without a sidebar entry |
| `sections`                        | Sidebar sections the module adds (core's are `masters`, `sales`, `money`, `reports`, `settings`)                                                    |
| `settingsPanels`                  | `{ id, title, ... }` for module settings (number prefixes use `numbering.series` instead)                                                           |
| `permissions`                     | Permissions the module defines, e.g. `purchasing.view`                                                                                              |
| `eventSubscriptions`              | `{ 'invoice.finalized': handler }` or `{ handler, priority }`. A handler gets `(event, ctx)` and must be idempotent                                 |
| `extensionPoints`                 | Contributions to core's extension points: `{ 'tax.calculator': {...}, 'reports.entries': [...] }`                                                   |
| `onEnable(ctx)`, `onDisable(ctx)` | Run on every turn-on and turn-off, so they must be idempotent. Turning off never deletes data                                                       |

The module context `ctx` is `{ orgId, moduleId, now, log, repo(store), emit(type, payload, opts), contributions(point),
isModuleEnabled(id) }`. `repo(store)` is scoped to the company, so a module cannot read or write another company's rows.

## Editions

Editions are data in `app/js/platform/editions.js`:

| Edition     | Modules                                                             |
| ----------- | ------------------------------------------------------------------- |
| `invoicing` | `region_india_gst`                                                  |
| `business`  | `region_india_gst`, `purchasing`, `inventory`, `accounting`         |
| `full`      | every installed module (the default for new and existing companies) |

- The company record keeps its `edition`. Per-module choices made on the features screen are kept in `orgModules` as
  `override: true | false`.
- Choosing an edition starts from that edition's list, so it clears earlier per-module choices.
- `isModuleEnabled(orgId, id)` combines the two and drops any module whose dependency is off.
- **Upgrade** turns modules on. Each one runs the migrations it has not run yet, and receives the events it missed
  while it was off (see below).
- **Downgrade** turns modules off. Their pages disappear and their stores and data stay as they are.
- **Rollback**, a separate action, runs a module's `down` migrations. It is allowed only while the module is off.

India GST is in every edition because every company using the app is Indian today. A company outside India can turn it
off on the features screen. Core then applies one tax per line at the line's rate.

## Events

Core publishes domain events, and modules subscribe in their manifests. The bus (`platform/events.js`) stores each event
in `eventLog` before delivering it. Each subscriber that finishes writes a receipt in `eventReceipts`. Delivery is
**at least once**:

- Event ids name the document and its revision, for example `invoice.finalized:12:3`. Publishing the same change twice
  is recognised as already done.
- If a handler fails, the others still run. The event is marked `failed` and is delivered again, only to the handlers
  that failed, when the app next starts (`redeliver`).
- When a module is turned on again, it gets every event stored after the point it was turned off (`catchUp`). The
  first time a module is turned on, its migrations cover the history instead.
- Handlers must still be idempotent, because a crash can happen after a handler wrote its data but before its receipt.
  Inventory movements and journal entries take their ids from the event id, so a second delivery writes nothing new.
  The tests check this by redelivering an event whose receipts were lost.

| Event                                              | Published by                         | Payload                | Used by                   |
| -------------------------------------------------- | ------------------------------------ | ---------------------- | ------------------------- |
| `invoice.finalized`                                | core `recordInvoice()`               | `{ doc, previous }`    | inventory, accounting     |
| `invoice.voided`                                   | core (invoice edited or deleted)     | `{ doc, reason }`      | inventory, accounting     |
| `payment.recorded`, `payment.voided`               | core receipts                        | `{ doc }`              | accounting                |
| `credit.applied`, `credit.voided`                  | core credit notes                    | `{ doc, source }`      | inventory, accounting     |
| `expense.created`, `expense.voided`                | core expenses                        | `{ doc }`              | accounting                |
| `contact.created`                                  | core customers and vendors           | `{ contact, kind }`    | (none yet)                |
| `product.saved`                                    | core products                        | `{ product, created }` | inventory (opening stock) |
| `bill.recorded`, `bill.voided`                     | purchasing                           | `{ doc }`              | inventory, accounting     |
| `debit.applied`, `debit.voided`                    | purchasing (through core's notes)    | `{ doc, source }`      | inventory, accounting     |
| `vendor_payment.recorded`, `vendor_payment.voided` | purchasing (through core's payments) | `{ doc }`              | accounting                |

Invoices have no draft state yet: saving an invoice finalizes it. An edit is published as `invoice.voided` for the old
revision followed by `invoice.finalized` for the new one. Deleting an invoice publishes `invoice.voided`.

The spec's `invoice.drafted` and `item.stock_requested` events are not published:

- `invoice.drafted` would need draft invoices, which were left out of this round (agreed when the work was planned).
- The stock check happens before an invoice is saved, through the `invoice.validate` hook. There is nothing to request
  after the event, so `item.stock_requested` would have no listener.

## Extension points

A module contributes to an extension point by listing it under `extensionPoints`. Contributions run in a fixed order:
`priority` ascending (default 100), then module id. Inputs are frozen copies, so a contribution cannot change a core
object in place. Transformers return a new value, and validators return `{ veto }` or `{ warning }`.

| Point                                                                                | Shape                                                                                                                | Consumer (core)                 | Contributed by                               |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------- |
| `tax.calculator`                                                                     | `{ id, label, taxIdLabel, computeLines(items, { fromState, toState, source }) → { lines, totals } }`; the first wins | line editor, notes, recurring   | India GST (priority 10)                      |
| `tax.rates`                                                                          | `[0, 5, 18, ...]`                                                                                                    | product form, settings          | India GST                                    |
| `invoice.validate`                                                                   | `(doc, { previous, list }) → { veto } \| { warning } \| [...]`                                                       | `recordInvoice()`               | India GST (veto), inventory (warning)        |
| `contact.validate`                                                                   | `(contact, { kind }) → { veto } \| { warning }`                                                                      | company, customer, vendor forms | India GST                                    |
| `contact.form`                                                                       | `(form, { kind, states })`: adds behaviour to the form                                                               | same                            | India GST (GSTIN fills the state)            |
| `line.fields`                                                                        | `{ name, label, type }`; values stored in `line.extensions[moduleId]`                                                | line editor                     | inventory (batch, expiry)                    |
| `invoice.fields`                                                                     | `{ name, label, maxlength }`; values stored in `invoice.extensions[moduleId]`                                        | invoice form                    | India GST (e-way bill)                       |
| `product.fields`, `product.columns`, `catalog.productHint`                           | form fields (`extensions[moduleId]`), list columns, a short hint in the product picker                               | products, line editor           | inventory                                    |
| `document.blocks`                                                                    | a region plug-in for printed invoices (see [invoice-templates.md](invoice-templates.md))                             | invoice printing and PDF        | India GST, EU VAT                            |
| `reports.entries`                                                                    | `{ id, label, icon, order, filters, run(ctx, filters) }`; money in paise                                             | Reports page                    | purchasing, inventory, accounting, India GST |
| `reports.daybook`, `reports.outstanding`, `reports.partywise`                        | rows or sections added to core reports                                                                               | core reports                    | purchasing                                   |
| `dashboard.stats`, `dashboard.lists`, `dashboard.cashFlow`, `dashboard.quickActions` | figures, tables, money in and out, buttons                                                                           | dashboard                       | purchasing, inventory                        |
| `money.kinds`                                                                        | a kind for core's receipt/payment form (stores, labels, events)                                                      | receipts form                   | purchasing (vendor payments)                 |
| `returns.kinds`                                                                      | a kind for core's credit/debit note form                                                                             | notes form                      | purchasing (debit notes)                     |
| `numbering.series`                                                                   | `{ type, store, prefix, setting: { key, label } }`                                                                   | `getNextNumber()`, Settings     | purchasing, fulfilment                       |
| `ledger.sources`                                                                     | `{ party, store, key, kind, debit }`                                                                                 | party ledger                    | purchasing (vendor ledger)                   |
| `contact.references`, `product.references`                                           | `async ({ list }, ...) → ['3 purchase bill(s)']`                                                                     | delete confirmations            | purchasing                                   |
| `quotation.actions`                                                                  | `{ title, icon, when(doc), onclick(doc) }`                                                                           | quotation list                  | fulfilment (to sales order)                  |
| `tax.inputDocuments`                                                                 | `async ({ list }) → { bills, debitNotes }`                                                                           | (modules) GST reports           | purchasing                                   |
| `documents.history`                                                                  | `async ({ list }) → [{ type, doc }]`: existing documents as the events they publish                                  | (modules) accounting backfill   | purchasing                                   |
| `fulfilment.vehicles`                                                                | `async ({ list }) → [{ id, number }]`                                                                                | (modules) challans              | fleet                                        |

The last three points are defined by modules for other modules. They are plain data, so the module offering the data
does not depend on the module using it. For example, purchasing offers bills to any tax module without knowing about
GST.

## Data

- **Tenancy.** Every row has a `companyId`. In the core screens, `dbOps` refuses to read, change or delete a row of a
  company other than the selected one. Modules get `ctx.repo(store)`, which is scoped to their company.
- **Module data stays put.** All stores are created up front: core's plus every installed module's. A store that a
  module update adds is created with a one-step version bump. Turning a module off never deletes anything. Backups
  and company deletion cover every store.
- **Namespaced fields.** Values that modules add to core documents are stored as `extensions[moduleId]`. Examples are
  the e-way bill (`extensions.region_india_gst.ewayBillNumber`), batch and expiry per line
  (`items[i].extensions.inventory`) and opening stock and the low-stock level on products.
- **Revisions.** Every invoice save increments `rev`, which gives events distinct, repeatable ids.
- **Idempotent payments.** The receipt and payment form carries an idempotency key. A second save with the same key,
  whether from a double click or a retry, records nothing new and reports the payment already saved.
- **Money.** All arithmetic runs in integer paise (`core/shared/money.js`). Reports, the books and the stock value
  produce paise. Stored documents keep rupee amounts rounded to paise, as before; see the conflicts below.

## Routes and permissions

There is no server, so "routes" are the app's pages. `runtime.guard(orgId, route)` returns:

- **404** for a page whose module is off. The app shows "Page not found" and names the module to turn on.
- **403** when the user lacks a permission the page `requires`.
- **200** otherwise.

There are no user accounts yet. Manifests declare their permissions, and pages list what they require, but every check
currently passes (agreed when the work was planned). `createRuntime({ can })` is the single place where a real
permission check would go, and the unit tests use it to show the 403 path.

## Where this project differs from the spec, and why

| Spec                                      | Here                                                                                                  | Why                                                                                                                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes, HTTP 404/403                      | Pages in a single-page app; the guard returns 404/403 and the page shows "not found" or "not allowed" | There is no server                                                                                                                                                                                                        |
| Organisation                              | The company (`companyId`), which already isolates data                                                | It is the existing tenant                                                                                                                                                                                                 |
| Migrations create schema                  | Stores are created up front for every installed module; migrations change data and have `down`        | IndexedDB can only change its stores in a version upgrade, and keeping them is what makes "turning off never deletes data" true                                                                                           |
| Money in integer minor units everywhere   | Integer paise for all arithmetic, reports and books; stored documents keep rupee amounts as before    | Converting every stored record and backup would break restoring older backups and the "previous version" test; computing in paise gives the same exactness                                                                |
| Draft → finalized → voided                | Save = finalize; edit = void + finalize; delete = void                                                | Agreed scope for this round                                                                                                                                                                                               |
| Permissions enforced                      | Declared and guarded; every check passes                                                              | The app has no users yet                                                                                                                                                                                                  |
| Store names and some fields               | Kept: `purchaseBills`, `products.stockQty`, `vendors.balance`, `invoices.salesOrderId`                | Renaming would break existing data and backups. `stockQty` is now a cache that inventory recomputes from its movement ledger. `vendors.balance` is moved by purchasing. Order links stay where older versions stored them |
| India GST optional                        | A module, but in every edition                                                                        | All current users are Indian businesses; it can be turned off                                                                                                                                                             |
| `item.stock_requested`, `invoice.drafted` | Not published                                                                                         | See [Events](#events)                                                                                                                                                                                                     |
| HR and fleet                              | Two extra modules, only in the full edition                                                           | They existed in the app and are not part of invoicing or getting paid                                                                                                                                                     |

## Known gaps

- Translations: module pages still use core's English and Telugu word list for their titles. Moving each module's
  strings into the module is a follow-up.
- Warehouses are a list; stock is not yet kept per warehouse.
- Recurring invoices are created when the app is opened. There is no background scheduler, because the app is offline
  and has no server.
- Startup does a little more work than before: about 40 more small script files, and module state is checked. See the
  benchmark in the README.
