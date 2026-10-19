<div align="center">

<img src="app/icons/icon.svg" width="72" alt="VyaparEasy logo">

# VyaparEasy

**The open-source, offline-first alternative to Tally and Zoho Books for GST billing. The whole app is 400 KB of plain HTML and JavaScript that keeps your data on your own device.**

[![CI](https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/yeldhandisamyukthreddy-del/indian-b2b-business-manager?display_name=tag&sort=semver)](https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Vanilla JS](https://img.shields.io/badge/vanilla%20JS-0%20runtime%20deps-f7df1e?logo=javascript&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-offline-5a0fc8?logo=pwa)
![Electron](https://img.shields.io/badge/desktop-Electron-47848f?logo=electron&logoColor=white)

<img src="docs/demo.gif" width="880" alt="Creating a GST invoice: a Telangana seller bills a Karnataka buyer, IGST is applied automatically and a printable tax invoice is produced">

<sub>A Telangana business bills a Karnataka customer: IGST is picked automatically, totals are rounded, and a print-ready tax invoice comes out.</sub>

</div>

## Quickstart

**Use it now (nothing to install):** open **[the web app](https://yeldhandisamyukthreddy-del.github.io/indian-b2b-business-manager/)** in Chrome or Edge and click **Install** in the address bar. It keeps working offline.

**Run it locally (needs only Node.js, with no `npm install` and no build):**

```bash
git clone --depth 1 https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager.git
cd indian-b2b-business-manager
node scripts/serve.js
# → VyaparEasy running at http://localhost:8080
```

**Your first invoice in 30 seconds:** _Create your company_ (pick your state) → _Customers → Add New_ (another state) → _Products → Add New_ (18% GST) → _Tax Invoices → Add New_ → add 10 × ₹100. You'll see **Taxable ₹1,000 · IGST ₹180 · Grand Total ₹1,180**, and the 🖨️ button prints it as a GST tax invoice.

The GST engine (part of the India GST module) is plain JavaScript, so you can try it in the browser console (F12) with the app open:

```js
const gst = Vyapar.modules.region_india_gst.gst;
gst.computeGst([{ qty: 10, rate: 100, gstRate: 18 }], gst.isInterstate('36', '29')); // Telangana → Karnataka
// → { taxable: 1000, cgst: 0, sgst: 0, igst: 180, tax: 180, total: 1180 }
gst.computeGst([{ qty: 10, rate: 100, gstRate: 18 }], gst.isInterstate('36', '36')); // same state
// → { taxable: 1000, cgst: 90, sgst: 90, igst: 0, tax: 180, total: 1180 }
```

Prefer a normal desktop app? Get the Windows, macOS or Linux installer from [Releases](https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager/releases/latest) ([first-run warnings explained](#desktop-installers)).

## Why VyaparEasy

- **Tiny and dependency-free:** 400 KB for the entire web app over the network (gzip), 48 KB for `index.html`. **Zero runtime dependencies**, no framework, no build step.
- **Fast on real-sized books:** about a third of a second to start, and about a quarter of a second to build the GST report over **5,000 invoices** ([measured](#benchmarks)).
- **Only what you need:** a small core for invoicing and getting paid, plus modules you turn on: India GST, purchasing, inventory, accounting, orders & delivery, HR and fleet. Pick an edition (Invoicing, Business, Full) or switch single modules under Settings → Features & Editions; turning one off hides it and keeps its data ([architecture](docs/architecture.md)).
- **Offline and private:** data lives in your browser's IndexedDB or the desktop app's local storage. No account, no server and no telemetry; nothing leaves the device.
- **GST done properly:**
  - CGST/SGST vs IGST decided by your state vs the place of supply, with all 36 states/UTs and their codes
  - Printed invoices carry the Rule 46 details (GSTINs, state codes, place of supply, HSN, tax columns, amount in words)
  - GSTIN format, state-code and check-character checks
- **Returns prep:** GSTR-1 view (B2B / B2CL / B2CS, credit notes, HSN summary) with CSV export in the offline-tool layout, and a GSTR-3B summary by tax head
- **The whole trading cycle:**
  - Sales: quotation → sales order → delivery challan → invoice, plus credit notes
  - Purchases: purchase order → purchase bill, plus debit notes
  - Receipts and payments matched to invoices and bills, so each shows Paid / Partial / Overdue
- **Stock and money:** stock that follows every document (with a movement history, adjustments, batch and expiry), low-stock alerts, bank balances, customer and vendor ledgers, expenses, recurring invoices, customer price lists, multiple companies (one invoice series per GSTIN)
- **Books:** double-entry journal posted automatically from every invoice, receipt, note, expense and bill, plus manual journals, a trial balance and a profit and loss from the books
- **Invoice templates:** A4, compact, thermal receipt (58/80 mm), POS counter and spreadsheet layouts. Choose sections, item columns, labels (English or Telugu), logo and colour in Settings with a live preview; the desktop app saves real PDFs ([how it works](docs/invoice-templates.md))
- **Everyday tools:** reports (day book, outstanding, item-wise, party-wise, P&L), WhatsApp sharing, Ctrl+K search, English and Telugu menus
- **Tested end to end:** 31 Playwright tests drive the real UI in Chromium and Electron, covering GST maths, IST date edge cases, backup/restore, offline mode, invoice printing and PDFs, editions, double-clicked payments, other companies' data and data from older versions; 200+ unit, snapshot and property tests cover the money, invoice templates, modules, events and the architecture rules

## How it compares

|                        | **VyaparEasy**                            | Vyapar                        | TallyPrime                      | Zoho Books                                 |
| ---------------------- | ----------------------------------------- | ----------------------------- | ------------------------------- | ------------------------------------------ |
| Source code            | **Open source (MIT)**                     | Proprietary                   | Proprietary                     | Proprietary                                |
| Cost                   | **Free**                                  | Desktop plans ≈ ₹3,400/yr     | Silver ≈ ₹22,500 + GST one-time | Free under ₹25 L turnover; paid ≈ ₹750+/mo |
| Runs as                | Web app (any OS) + desktop app            | Mobile + desktop apps         | Desktop app                     | Cloud web + mobile                         |
| Works without internet | **Yes**                                   | Yes                           | Yes                             | No                                         |
| Where your data lives  | **Only on your device**                   | Device, optional cloud backup | Your PC / server                | Vendor cloud                               |
| Footprint              | **400 KB web**, ~100 MB desktop installer | App install                   | App install                     | Browser                                    |
| Runtime dependencies   | **None** (any modern browser)             | Vendor app                    | Vendor app                      | Internet + vendor account                  |
| Account required       | **No**                                    | Yes                           | Licence                         | Yes                                        |
| E-invoice / e-way bill | ✗ ([roadmap](#roadmap))                   | ✓                             | ✓                               | ✓ (paid plans)                             |
| Double-entry accounts  | Basic (Accounting module)                 | —                             | ✓                               | ✓                                          |

<sub>— not verified. Competitor prices are approximate list prices as of October 2026 from public pricing pages and reseller listings, excluding GST. Check the vendors' sites before deciding. VyaparEasy is the right choice if you want free, private, offline billing; choose Tally or Zoho Books if you need full accounting (balance sheet, audit trail, stock valuation) or e-invoicing today.</sub>

## How it works

```
 ┌──────────── core: app/index.html + app/js/core (always on) ────────────┐
 │ contacts · products + price lists · quotations · invoices · recurring  │
 │ receipts · credit notes · expenses · banking · reports · settings      │
 │ recordInvoice(): validation hooks → number → balance → events          │
 └───────────▲───────────── extension points ────────────────▲───────────┘
             │ contributions                    domain events │
 ┌───────────┴─────── platform: app/js/platform ──────────────┴───────────┐
 │ module registry · editions · per-company runtime · event bus · hooks  │
 └───────────▲────────────────────────────────────────────────────────────┘
             │ manifests
 ┌───────────┴─────────────────── modules: app/js/modules ────────────────┐
 │ India GST · purchasing · inventory · accounting · orders & delivery ·  │
 │ HR · fleet · EU VAT (preview) · export for accountant (preview)        │
 └────────────────────────────────────────────────────────────────────────┘
        IndexedDB (per company) · the same files run in the browser, the installed PWA and Electron
```

- **No build:** plain scripts loaded in order by `app/index.html`, and Mustache templates for printed invoices ([invoice templates](docs/invoice-templates.md)). Contributors edit and reload.
- **Core and modules:** core never refers to a module. Modules plug in through extension points (tax strategy, validation hooks, extra fields, invoice blocks, reports, dashboard figures) and react to events (`invoice.finalized`, `payment.recorded`...), which are stored and delivered at least once. A test checks these rules on the real source. See [docs/architecture.md](docs/architecture.md) and [docs/adding-a-module.md](docs/adding-a-module.md).
- **Storage:** IndexedDB holds plain objects per company; a module's stores stay when it is turned off. Money is computed in integer paise.
- **Same code everywhere:** the browser, the installable PWA and the Electron desktop app all run the identical files. Electron serves them from a fixed `app://` origin so data survives updates.
- **Backups** are a single JSON file. Restores are atomic (one IndexedDB transaction).

## Benchmarks

`npm run benchmark` (headless Chromium with software rendering, 4-core Xeon 2.1 GHz):

| Metric                                                     | Result |
| ---------------------------------------------------------- | -----: |
| Whole web app over the network (gzip)                      | 400 KB |
| `index.html` (gzip)                                        |  48 KB |
| Runtime dependencies                                       |      0 |
| Cold start to rendered dashboard (median of 5)             | 332 ms |
| GST report over 5,000 invoices (median of 3)               | 259 ms |
| Save an invoice and redraw the list, 5,000 invoices stored | 754 ms |

This run was slower overall than the one published before. In the same run, the version before modules took 268 ms, 221 ms and 658 ms, so the module system costs about 40–100 ms: there are more small files to load and events to deliver.

Desktop installers: about 100 MB `.deb`, 125 MB AppImage (the size is the bundled Chromium runtime).

## Your data and backups

- Data is stored **only on your device**. The web app and the desktop app keep **separate** data; move between them with backup and restore.
- **Settings → Backup All Data** downloads a JSON file. Keep copies somewhere safe. The app reminds you after 7 days without a backup.
- Clearing browser site data, uninstalling the web app or losing the device **deletes your data** unless you have a backup.

### Desktop installers

The installers are not code-signed yet, so the first launch shows a warning:

- **Windows:** "Windows protected your PC" → **More info** → **Run anyway**
- **macOS:** right-click the app → **Open**. If it says the app is damaged, run `xattr -cr /Applications/VyaparEasy.app`.
- **Linux:** install the `.deb` (recommended on Ubuntu 24.04 and newer, whose AppArmor rules stop Electron AppImages from starting), or `chmod +x VyaparEasy-*.AppImage` and run it.

## Limitations

- Accounting is basic: a journal, trial balance and profit & loss, but no balance sheet, bank reconciliation, depreciation schedules or closing-stock valuation.
- No direct GST portal integration yet: no e-invoice/IRN, no e-way bill generation (the number can be recorded on an invoice), and no upload-ready GSTR JSON. The summaries and CSVs help you prepare returns.
- No UPI QR code on invoices yet.
- Not supported: reverse charge, composition scheme, cess, exports under LUT, stock per warehouse. TDS/TCS is a register of certificates, not a calculation. Payslips use a fixed simplified structure.
- Invoices have no draft state: saving finalizes them (an edit cancels the old version and records the new one). Permissions are declared per module but there are no user accounts yet, so everyone can do everything.
- One user per device; no login or sync.

> **Disclaimer:** provided as is, without warranty ([MIT](LICENSE)). Not tax or legal advice. Verify invoices and returns with your accountant before filing.

## Roadmap

Contributions are very welcome. These three items would help the most, and each is self-contained:

1. **GSTR-1 JSON export** that the GST portal or offline tool accepts directly, building on `gstData()`, which already groups B2B/B2CL/B2CS and HSN data.
2. **E-invoice JSON (IRN schema)** for invoices, so businesses above the e-invoicing threshold can upload them to the IRP. A first step with no API keys needed.
3. **More languages:** Hindi, Tamil, Kannada and Marathi menus, plus translated printed invoices. The `i18n` object makes this a good first contribution.

Have another idea? Open a [feature request](https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager/issues/new/choose) that starts from the problem.

## Contributing

```bash
git clone https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager.git && cd indian-b2b-business-manager
npm install && npx playwright install chromium
npm run serve    # edit app/index.html, reload; then: npm run lint && npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for code conventions, Conventional Commits and the PR checklist. Report security issues privately ([SECURITY.md](SECURITY.md)).

If VyaparEasy saves you a licence fee, a ⭐ helps other small businesses find it.

## License

[MIT](LICENSE). Free to use, modify and share, including commercially. The bundled Plus Jakarta Sans font is under the [SIL Open Font License](app/fonts/OFL-PlusJakartaSans.txt).
