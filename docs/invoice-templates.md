# Invoice templates

Tax invoices are printed from **one view model plus a template**. Layouts can be added or changed without touching
business logic, the same HTML drives the on-screen preview, printing and the PDF, and each company chooses what an
invoice shows in **Settings → Invoice templates** instead of in code.

## Architecture

```
 IndexedDB records          adapter.js                view-model.js (pure)             renderer.js            output
 ─────────────────          ──────────                ────────────────────             ───────────            ──────
 invoice, company,   ──►  toDomain()  ──►  buildInvoiceViewModel(invoice, org,  ──►  template +     ──►  preview (iframe)
 customer, banks           (old and new       settings, locale, mode)               partials +            print (hidden iframe)
                            record shapes)      │  totals.js   (money in paise)     view model            PDF: desktop app (Electron)
 settings store  ──► settings.js               │  regions.js  (+ module blocks)     (mustache.js)              Node (Playwright)
 (per company,       (defaults + stored,       │  labels.js / format.js
  per template)       validated on write)      └► immutable, formatted object ──► schema.validateViewModel()
```

| Layer              | File(s)                                                                 | Responsibility                                                                                                         |
| ------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Invoice domain     | `app/index.html` (`recordInvoice()`)                                    | Saving invoices and balances; tax from the active strategy on save                                                     |
| Money              | `app/js/core/shared/money.js`                                           | Integer paise, the one rounding rule, half splits, formatting, amount in words                                         |
| Totals             | `app/js/core/documents/totals.js`                                       | Line/document discounts, inclusive tax, shipping, tax rows, round off                                                  |
| Adapter            | `app/js/core/documents/adapter.js`                                      | Stored records → builder input (handles records from older versions)                                                   |
| View-model builder | `app/js/core/documents/view-model.js`, `view-model-table.js`            | Pure function → frozen, fully formatted object                                                                         |
| Region blocks      | `app/js/core/documents/regions.js` + modules' `document-blocks.js`      | Generic tax columns and extra tax ids in core; India GST and EU VAT blocks come from their modules ('document.blocks') |
| Template registry  | `app/js/core/documents/registry.js`                                     | `templateType` → `{ templatePath, partials, pageSizes, supportsPdf }`                                                  |
| Renderer           | `app/js/core/documents/mustache.js`, `renderer.js`                      | Mustache subset; validation, cache, readable errors                                                                    |
| Settings           | `app/js/core/documents/settings.js`, `labels.js`                        | Defaults, merge, validation, repository                                                                                |
| PDF                | `electron/pdf.js` (desktop), `scripts/invoice-pdf.js` (Node)            | HTML → PDF with Chromium, JavaScript off, network blocked                                                              |
| UI                 | `app/js/core/documents/ui.js`, `settings-page.js`                       | Preview window, print, PDF, template settings page                                                                     |
| Templates          | `app/templates/invoices/*.mustache`, `app/templates/partial/*.mustache` | Layouts and shared partials                                                                                            |

Every module in `app/js/` works in the page (`window.Vyapar.<name>`) and in Node (`require`), so the unit tests run the
exact code the app runs. There is still no build step and no runtime dependency.

## Using it

- **Print:** the 🖨️ button on an invoice opens a preview with a template picker, **Print** and **Save as PDF**.
  `printInvoice(id)` prints with the company's default template.
- **PDF:** the desktop app saves a real PDF (Save dialog). In the browser there is no PDF engine, so **Save as PDF**
  opens the print window; choose "Save as PDF" as the printer.
- **Customise:** Settings → **Customize invoice templates**: template, "use for printing", paper size, language, colour,
  logo, sections, item columns (show, hide, order), labels per language and extra registration numbers (PAN, CIN,
  Udyam…). The preview on the right uses your latest invoice, or a sample.
- **Invoice form:** "More details" holds the optional reference / PO number, e-way bill number and ship-to address.

### API inside the app

```js
await InvoiceTemplates.render(invoiceId, 'standard', { mode: 'preview' }); // → { html, viewModel }
await InvoiceTemplates.render(invoiceId, 'thermal', { mode: 'pdf' }); // → { html, viewModel, bytes } (desktop app only)
await InvoiceTemplates.repo.upsert(companyId, 'compact', { fieldFlags: { isDueDateRequired: false } });
```

`templateType` is optional (the company's default is used). An unknown type is rejected by the registry.

### Samples from the command line

```bash
npm run render-invoice -- invoice-samples   # every template × 3 sample invoices → .html, .pdf, .png
```

## Money rules

- Every amount is an **integer number of paise**. Quantities and rates are read as the decimals a person typed
  (6 places; `2.675` is not `2.67499…`), multiplied with BigInt and rounded once.
- **One rounding rule:** half away from zero (half-up for positive amounts), **per line**. CGST is the rounded half of a
  line's tax and SGST the remainder, so CGST + SGST always equals the tax. This is the rule `computeGst()` has always
  used for saving; it now runs on paise, which fixes rare 1-paisa float errors (e.g. 0.5 × 99.99 is ₹50.00, not ₹49.99).
- **Saved invoices print exactly as issued.** The adapter passes each saved line's taxable value and tax; the totals are
  sums of those. If the items no longer add up to the saved grand total, the invoice is not printed and a readable error
  says so.
- Invariants checked by a property test over 1,500 random invoices: subtotal = Σ line amounts; tax total = Σ tax rows;
  exclusive: total = subtotal − discount + shipping + tax + round off; inclusive: total = subtotal − discount + shipping
  - round off, and taxable + tax = subtotal − discount + shipping.
- Document-level discounts and shipping are supported by the engine and templates, but the invoice form does not
  capture them yet (adding them changes GST reports, so it is a separate change).

## Templates

| Type            | Paper        | Use                                                                   |
| --------------- | ------------ | --------------------------------------------------------------------- |
| `standard`      | A4, Letter   | Full GST tax invoice with HSN summary, bank details, terms, signature |
| `compact`       | A4, Letter   | Smaller type, combined GST column, no HSN summary by default          |
| `thermal`       | 80 mm, 58 mm | Receipt-roll tax invoice                                              |
| `pos_thermal`   | 80 mm, 58 mm | Retail counter receipt: big amount to pay, item count, thank-you line |
| `excel_compact` | A4, Letter   | One flat table, no merged cells: pastes cleanly into Excel or Sheets  |

Partials (`app/templates/partial/`): `styles_base`, `styles_thermal`, `header`, `header_other_pages` (running header and
"Page n of m"), `subject_block` (parties and document details), `line_item_table`, `subtotal_block`, `tax_summary`,
`payment_details`, `payment_stub`, `notes_terms`, `footer`.

### Rules for templates

- Only `{{name}}`, `{{#flag}}…{{/flag}}`, `{{^flag}}…{{/flag}}`, `{{>partial}}` and `{{! comment }}`. No logic: decide
  in the view model, print in the template.
- Values are HTML-escaped. Raw output (`{{{…}}}`) is allowed only for `notes.html` and `terms.html` (from the allowlist
  sanitizer) and the pre-escaped CSS strings `meta.runningHeaderCss`, `meta.pageLabelCss`, `meta.ofLabelCss`. A test
  fails if any template prints anything else raw.
- Rendering is **strict**: an unknown field or a missing partial is an error with the template name and line, never an
  empty space on the invoice.
- One `<!--style_start-->…<!--style_end-->` pair around the `<style>` element (`renderer.splitStyle(html)` separates CSS
  and body).
- Print safe: a Content-Security-Policy that blocks every request and script, system fonts, images only as `data:` URLs.
- Multi-page: `@page` size and margins, `thead { display: table-header-group }`, `tr { break-inside: avoid }`.
- Right-to-left: `<html dir="{{meta.dir}}">` and logical CSS properties (`margin-inline-start`, `text-align: end`).
- The root element carries `data-invoice-root`; the renderer refuses output without it.

### Add a template

1. Create `app/templates/invoices/<type>.mustache` (copy `standard.mustache`; keep the `<head>` with the CSP and the
   style markers).
2. Register it in `app/js/core/documents/registry.js`: `label`, `templatePath`, the `partials` it uses, `pageSizes`,
   `taxColumns` (`split` | `combined` | `none`) and `defaults` (flag overrides, column order, hidden columns).
3. Add the file to `FILES` in `app/sw.js` and bump `CACHE` (a unit test checks the list is complete).
4. Run `UPDATE_SNAPSHOTS=1 npm run test:unit` to create its snapshots, review them, then `npm run test:unit` and
   `npm run render-invoice` to look at the PDF.

The template appears in the preview picker and the settings page automatically.

### Add a region module

Region blocks belong to region modules. Each is built with `regions.region({...})` from `app/js/core/documents/regions.js`, which fills in empty defaults, and is contributed through the module manifest as `'document.blocks'`. See `app/js/modules/region_india_gst/document-blocks.js`. The interface:

| Method                       | Returns                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `orgBlocks(ctx)`             | company blocks, e.g. GSTIN, VAT number                         |
| `partyBlocks(party, ctx)`    | blocks for the bill-to and ship-to parties                     |
| `documentBlocks(ctx)`        | document details, e.g. place of supply, reverse charge         |
| `customFieldBlocks(ctx)`     | invoice-level extras, e.g. e-way bill number                   |
| `notes(ctx)`                 | plain-text notes, e.g. a reverse-charge statement              |
| `taxColumns(style, ctx)`     | columns for the `tax` column, or `null` to use the generic one |
| `taxCells(line, style, ctx)` | cells matching those columns                                   |
| `taxSummary(ctx)`            | `{ columns, rows, totalRow }` or `null`                        |

A block is `{ sectionLabel, sectionValue }`. `ctx` has `invoice` (including `invoice.extensions`, where modules keep
their own invoice fields), `org`, `settings`, `labels`, `totals`, `interstate`, `locale`, `amount(paise)` and
`money(paise)`. The invoice screen passes the contributed blocks in `settings.regionModules`, in hook order, followed
by the company's extra tax ids when `regions.extraTaxId` is on. Put new labels in `labels.js` and test the blocks the
way `tests/unit/view-model.test.js` tests India and EU VAT.

## Settings and storage

There is no SQL database: rows live in the app's existing IndexedDB `settings` store (no schema change), so backups and
restores include them and deleting a company deletes them.

| Row kind               | Fields                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `invoiceTemplate`      | `companyId`, `templateType`, `fieldFlags`, `columnConfig`, `labels`, `accentColor`, `logoAssetId`, `pageSize`, `language`, `updatedAt` |
| `invoiceTemplatePrefs` | `companyId`, `defaultTemplateType`, `logoAssetId` (all templates), `regions`, `extraTaxIds`                                            |
| `asset`                | `companyId`, `mime`, `dataUri`, `width`, `height` (logos: PNG/JPEG/WebP, ≤ 300 KB, ≤ 2000 px)                                          |

`createRepository(store)` gives `findByOrg`, `find`, `upsert`, `getPrefs`, `setPrefs`, `saveAsset`, `getAsset`,
`getEffective` (merged settings + logo + regions), `pruneAssets` and `deleteForOrg`. Reads merge defaults (global →
template → stored) and ignore unknown keys from other versions. Writes are validated (`validateSettingsPatch`,
`validatePrefsPatch`, `validateAsset`) and rejected with a `ValidationError` listing every problem; nothing is written
then. A template's own `logoAssetId` overrides the company logo.

## View-model reference

All strings are ready to print. Optional rows are `null` when they do not apply.

**`flags`** (booleans). A `…Required` flag is the user's toggle **and** the data being present.

| Flag                                                                                                                       | Meaning                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `isForPdf`, `isRtl`, `isThermal`, `isInterState`, `isInclusiveTax`                                                         | rendering mode, direction, roll paper, IGST vs CGST/SGST, prices include GST |
| `isLogoExist`                                                                                                              | logo uploaded and "Logo" on                                                  |
| `isOrgNameRequired`, `isOrgAddressRequired`, `isTitleRequired`, `isStatusStampRequired`                                    | header parts                                                                 |
| `isEntityDateRequired`, `isTimeRequired`, `isDueDateRequired`, `isPaymentTermsRequired`, `isReferenceNumberRequired`       | document details                                                             |
| `isBillToRequired`, `isShipToRequired`                                                                                     | parties                                                                      |
| `isSubTotalRequired`, `isTotalRequired`, `isBalanceDueRequired`, `isAmountInWordsRequired`, `isTaxSummaryRequired`         | totals                                                                       |
| `isNotesExist`, `isTermsAndConditionsRequired`, `isPaymentDetailsRequired`, `isSignatureRequired`, `isPaymentStubRequired` | footer                                                                       |
| `showCurrencyAfterAmount`                                                                                                  | `1,180.00 ₹` instead of `₹1,180.00`                                          |

**`meta`**: `templateType`, `locale`, `lang`, `dir`, `mode`, `pageSize`, `pageWidth`, `pageHeight` (null for rolls),
`pageMargin`, `contentWidth`, `isThermal`, `accentColor`, `documentTitle`, and the CSS strings for page margin boxes.

**`header`**: `companyName`, `companyAddress` (lines), `contactLine`, `logo` (`dataUri`, `scaledWidth`, `scaledHeight`),
`title`, `entityNumber`, `date`, `time`, `statusStamp` (`text`, `tone`: paid | partial | overdue), `taxIdBlocks`.

**`blocks`**: `taxIdBlock`, `dueDateBlock`, `referenceBlock`, `paymentTermsBlock`, `balanceDueBlock`.
**`regionBlocks`**, **`customFieldBlocks`**, **`regionNotes`**: from the region modules.

**`parties`**: `billingAddress` and `shippingAddress` (`sectionLabel`, `name`, `lines`, `phone`, `taxIdBlocks`),
`customerTaxId`, `placeOfSupply`.

**`columns`** (`key`, `label`, `align`: start | end | center) and **`lineItems`**: `index`, `name`, `description`,
`hsnOrSac`, `qtyWithUnit`, `rate`, `discount`, `discountNote`, `taxName`, `taxPercent`, `taxAmount`, `amount`, `total`,
`image`, `batch`, `serial`, `expiry`, `meta` (extra lines under the name), `raw` (paise) and `cells` (one per column, in
column order: `key`, `value`, `align`, `sub`). The `discount` column appears only when a line has a discount.
`columnCount`, `fillerCells`, `padCells` help tables without `colspan`.

**`totals`**: `subTotal`, `discount`, `shipping`, `taxRows` (`CGST @ 9%`…), `roundOff`, `total`, `paid`, `credits`,
`balanceDue`, `amountInWords`, `taxIncludedNote`, `itemCount`, and `raw` with every amount in paise.

**`taxSummary`**: HSN/SAC summary `{ columns, rows, totalRow }` (India module). **`notes`**, **`terms`**: `{ sectionLabel,
html }` (sanitized). **`paymentDetails`**, **`paymentStub`**, **`signature`**, **`labels`** (all labels, resolved).

## Security

- Template paths come only from the registry; user input never becomes a path.
- The renderer reads only own properties of the view model (no prototype access) and does no I/O; files are loaded by
  the caller (fetch from the app itself, or `fs` in Node).
- Rendered invoices carry a CSP (`default-src 'none'; img-src data:; style-src 'unsafe-inline'`), and the preview iframe
  is sandboxed.
- Desktop PDFs: hidden window with JavaScript disabled, sandboxed, in a separate in-memory session that can load only
  the invoice file being printed. The page reaches it through a two-method preload bridge that checks the HTML, the page
  size and, before saving, that the bytes are a PDF.
- Notes and terms pass an allowlist sanitizer (b, strong, i, em, u, p, ul, ol, li, br; no attributes; tags balanced).
- Logos: PNG/JPEG/WebP only (no SVG), shrunk to 600 × 200 and re-encoded (drops metadata), ≤ 300 KB stored.
- Nothing here logs customer data.

## Tests

| Command                                | What                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run test:unit`                    | node:test unit, snapshot and property tests with an 80% coverage floor            |
| `UPDATE_SNAPSHOTS=1 npm run test:unit` | rewrite `tests/unit/__snapshots__/` after an intended template change             |
| `npm test`                             | Playwright: preview, print, settings round trip, logo, PDF, offline, Electron PDF |
| `npm run render-invoice -- out`        | HTML, PDF and PNG of every template for a visual check                            |

## Not done yet

- UPI / document QR code (needs a QR encoder), e-invoice IRN and e-way bill generation (out of scope).
- The invoice form does not capture discounts, shipping or tax-inclusive prices yet (the engine supports them).
- Quotations, orders, challans and purchase documents still use the older print layout.
- Per-template logos are supported by the repository but the settings page sets one logo for all templates.
- Telugu labels need review by a native speaker; the amount in words is English only.
