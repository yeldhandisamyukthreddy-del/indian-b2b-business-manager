<div align="center">

<img src="app/icons/icon.svg" width="72" alt="VyaparEasy logo">

# VyaparEasy

**The open-source, offline-first alternative to Tally and Zoho Books for GST billing. The whole app is a 56 KB HTML file that keeps your data on your own device.**

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

The tax engine is plain JavaScript, so you can try it in the browser console (F12) with the app open:

```js
computeGst([{ qty: 10, rate: 100, gstRate: 18 }], isInterstate('36', '29')); // Telangana → Karnataka
// → { taxable: 1000, cgst: 0, sgst: 0, igst: 180, tax: 180, total: 1180 }
computeGst([{ qty: 10, rate: 100, gstRate: 18 }], isInterstate('36', '36')); // same state
// → { taxable: 1000, cgst: 90, sgst: 90, igst: 0, tax: 180, total: 1180 }
```

Prefer a normal desktop app? Get the Windows, macOS or Linux installer from [Releases](https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager/releases/latest) ([first-run warnings explained](#desktop-installers)).

## Why VyaparEasy

- **Tiny and dependency-free:** 271 KB for the entire web app over the network (gzip), 56 KB for `index.html`. **Zero runtime dependencies**, no framework, no build step.
- **Fast on real-sized books:** about 130 ms cold start to the dashboard, and about 120 ms to build the GST report over **5,000 invoices** ([measured](#benchmarks)).
- **Offline and private:** data lives in your browser's IndexedDB or the desktop app's local storage. No account, no server and no telemetry; nothing leaves the device.
- **GST done properly:**
  - CGST/SGST vs IGST decided by your state vs the place of supply, with all 36 states/UTs and their codes
  - Printed invoices carry the Rule 46 details (GSTINs, state codes, HSN, tax columns, amount in words)
  - GSTIN format and state-code checks
- **Returns prep:** GSTR-1 view (B2B / B2CL / B2CS, credit notes, HSN summary) with CSV export in the offline-tool layout, and a GSTR-3B summary by tax head
- **The whole trading cycle:**
  - Sales: quotation → sales order → delivery challan → invoice, plus credit notes
  - Purchases: purchase order → purchase bill, plus debit notes
  - Receipts and payments matched to invoices and bills, so each shows Paid / Partial / Overdue
- **Stock and money:** stock that follows every document, low-stock alerts, bank balances, customer and vendor ledgers, multiple companies (one invoice series per GSTIN)
- **Everyday tools:** reports (day book, outstanding, item-wise, party-wise, P&L), WhatsApp sharing, Ctrl+K search, English and Telugu menus
- **Tested end to end:** 14 Playwright tests drive the real UI in Chromium and Electron, covering GST maths, IST date edge cases, backup/restore, offline mode and data from older versions

## How it compares

|                        | **VyaparEasy**                            | Vyapar                        | TallyPrime                      | Zoho Books                                 |
| ---------------------- | ----------------------------------------- | ----------------------------- | ------------------------------- | ------------------------------------------ |
| Source code            | **Open source (MIT)**                     | Proprietary                   | Proprietary                     | Proprietary                                |
| Cost                   | **Free**                                  | Desktop plans ≈ ₹3,400/yr     | Silver ≈ ₹22,500 + GST one-time | Free under ₹25 L turnover; paid ≈ ₹750+/mo |
| Runs as                | Web app (any OS) + desktop app            | Mobile + desktop apps         | Desktop app                     | Cloud web + mobile                         |
| Works without internet | **Yes**                                   | Yes                           | Yes                             | No                                         |
| Where your data lives  | **Only on your device**                   | Device, optional cloud backup | Your PC / server                | Vendor cloud                               |
| Footprint              | **271 KB web**, ~100 MB desktop installer | App install                   | App install                     | Browser                                    |
| Runtime dependencies   | **None** (any modern browser)             | Vendor app                    | Vendor app                      | Internet + vendor account                  |
| Account required       | **No**                                    | Yes                           | Licence                         | Yes                                        |
| E-invoice / e-way bill | ✗ ([roadmap](#roadmap))                   | ✓                             | ✓                               | ✓ (paid plans)                             |
| Double-entry accounts  | ✗                                         | —                             | ✓                               | ✓                                          |

<sub>— not verified. Competitor prices are approximate list prices as of October 2026 from public pricing pages and reseller listings, excluding GST. Check the vendors' sites before deciding. VyaparEasy is the right choice if you want free, private, offline billing; choose Tally or Zoho Books if you need full double-entry accounting or e-invoicing today.</sub>

## How it works

```
             ┌──────────────── app/index.html (HTML + CSS + vanilla JS) ────────────────┐
             │                                                                          │
  UI pages ──┤  invoices · purchases · receipts · stock · reports · GST · settings      │
             │        │                     │                       │                   │
             │  lineEditor + computeGst()   │ allocateToDocs()      │ gstData()         │
             │  (CGST/SGST vs IGST,         │ (receipts → invoices, │ (GSTR-1 / 3B,     │
             │   round-off, totals)         │  payments → bills)    │  HSN summary)     │
             │        └──────────────┬──────┴───────────────────────┘                   │
             │                  dbOps (IndexedDB, 23 object stores, per company)        │
             └──────────────────────────────┬───────────────────────────────────────────┘
                                            │ same file, three ways to run it
          ┌─────────────────────────────────┼─────────────────────────────────┐
   Browser / GitHub Pages          Installed PWA (sw.js)            Electron (electron/main.js)
   served as static files          network-first, offline cache     app://vyapareasy/ fixed origin
```

- **One file, no build:** the whole UI is template strings rendered into the page. Contributors edit `app/index.html` and reload.
- **Storage:** IndexedDB holds plain objects per company. Balances and stock are updated by the same functions that save documents, and every delete reverses its save.
- **Same code everywhere:** the browser, the installable PWA and the Electron desktop app all run the identical file. Electron serves it from a fixed `app://` origin so data survives updates.
- **Backups** are a single JSON file. Restores are atomic (one IndexedDB transaction).

## Benchmarks

`npm run benchmark` (headless Chromium with software rendering, 4-core Xeon 2.1 GHz):

| Metric                                                     | Result |
| ---------------------------------------------------------- | -----: |
| Whole web app over the network (gzip)                      | 271 KB |
| `index.html` (gzip)                                        |  56 KB |
| Runtime dependencies                                       |      0 |
| Cold start to rendered dashboard (median of 5)             | 133 ms |
| GST report over 5,000 invoices (median of 3)               | 119 ms |
| Save an invoice and redraw the list, 5,000 invoices stored | 401 ms |

Desktop installers: about 100 MB `.deb`, 125 MB AppImage (the size is the bundled Chromium runtime).

## Your data and backups

- Data is stored **only on your device**. The web app and the desktop app keep **separate** data; move between them with backup and restore.
- **Settings → Backup All Data** downloads a JSON file. Keep copies somewhere safe. The app reminds you after 7 days without a backup.
- Clearing browser site data, uninstalling the web app or losing the device **deletes your data** unless you have a backup.

### Desktop installers

The installers are not code-signed yet, so the first launch shows a warning:

- **Windows:** "Windows protected your PC" → **More info** → **Run anyway**
- **macOS:** right-click the app → **Open**. If it says the app is damaged, run `xattr -cr /Applications/VyaparEasy.app`.
- **Linux:** `chmod +x VyaparEasy-*.AppImage` and run it, or install the `.deb`.

## Limitations

- Not double-entry accounting: no chart of accounts, journals, trial balance or balance sheet. Profit & loss is simplified.
- No direct GST portal integration yet: no e-invoice/IRN, no e-way bill, and no upload-ready GSTR JSON. The summaries and CSVs help you prepare returns.
- Not supported: reverse charge, composition scheme, cess, exports under LUT, TDS/TCS (placeholder page), stock per warehouse. Payslips use a fixed simplified structure.
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
