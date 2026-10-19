# Contributing to VyaparEasy

Thanks for helping! Bug reports, GST-rule corrections, translations and code are all welcome. Good places to start are issues labelled [`good first issue`](https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager/labels/good%20first%20issue) and the [roadmap](README.md#roadmap).

## Set up in 3 commands

You need Node.js 20 or newer and Git.

```bash
git clone https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager.git && cd indian-b2b-business-manager
npm install && npx playwright install chromium
npm run serve        # → http://localhost:8080 ; edit app/index.html and reload the page
```

There is no build step. `npm start` opens the same app as a desktop (Electron) window.

## Checks to run before pushing

| Command                | What it does                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint, including the JavaScript inside `app/index.html`                                    |
| `npm run test:unit`    | Unit, snapshot and property tests (node:test) for `app/js/`, with an 80% coverage floor     |
| `npm run format:check` | Prettier check (`npm run format` fixes it)                                                  |
| `npm test`             | End-to-end tests in Chromium and Electron (Linux without a display: `xvfb-run -a npm test`) |
| `npm run benchmark`    | Optional: speed and size numbers quoted in the README                                       |

CI runs the first four on every pull request. After an intended change to an invoice template, refresh its snapshots with `UPDATE_SNAPSHOTS=1 npm run test:unit` and review the diff.

## Branches and commits

- Branch from `main` and name the branch `type/short-description`, for example `fix/igst-for-sez`, `feat/gstr1-json-export`, `docs/hindi-readme`.
- Commit messages and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/):

  ```
  <type>(optional scope): <what changed, in the imperative>

  feat(gst): export GSTR-1 as portal JSON
  fix(invoice): keep place of supply when editing
  docs: explain backup on Android
  ```

  Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `ci`, `chore`. Add `!` after the type (e.g. `feat!:`) and a `BREAKING CHANGE:` footer if existing users' data or backups are affected.

- Keep pull requests focused: one problem per PR. Discuss big changes in an issue first.

## Project layout

| Path                                     | What it is                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `app/index.html`                         | The core screens, CSS and the composition root, with no framework and no build step                                  |
| `app/js/core/`                           | Core rules (money in paise, tax, sales, reports, printed invoices) and a few core pages (`ui/`)                      |
| `app/js/platform/`                       | Module registry, editions, runtime, event bus, hooks, sidebar, the features screen                                   |
| `app/js/modules/<id>/`                   | Optional modules: `index.js` (manifest), pure rules, `ui.js` (pages); see [adding a module](docs/adding-a-module.md) |
| `app/templates/`                         | Invoice layouts and partials (Mustache); see [docs/invoice-templates.md](docs/invoice-templates.md)                  |
| `app/sw.js`, `app/manifest.webmanifest`  | Offline support and install metadata for the web app                                                                 |
| `app/fonts/`, `app/icons/`               | Bundled font and icons (`npm run icons` regenerates PNGs from `icon.svg`)                                            |
| `electron/main.js`                       | Desktop wrapper; serves `app/` from the `app://vyapareasy/` origin                                                   |
| `electron/pdf.js`, `electron/preload.js` | Invoice PDFs in the desktop app (hidden window, JavaScript off)                                                      |
| `tests/`                                 | Playwright end-to-end tests (browser and Electron); `tests/unit/` has the node:test tests                            |
| `scripts/`                               | Dev server, benchmark, icon generator, demo recorder                                                                 |

Data is stored in IndexedDB (`VyaparEasyDB`). Each store holds plain objects with a `companyId`. Read and write them through `dbOps` in screens and through `ctx.repo(store)` in module code. How core and modules fit together, and the rules a test enforces, are in [docs/architecture.md](docs/architecture.md).

## Code conventions inside `app/index.html`

These rules exist because breaking them caused real bugs:

- **Escape user text** with `esc()` whenever it goes into HTML (`${esc(c.name)}`). A name like `Ravi's "Best" Traders` must not break a form.
- **Dates** are local `'YYYY-MM-DD'` strings. Use `todayStr()`, `localDateStr()`, `parseLocalDate()` and `periodRange()`. **Never** use `toISOString()` for a date: it switches to UTC, which is the previous day before 05:30 IST.
- **Money:** round with `round2()`; new arithmetic goes through `Vyapar.money` (whole paise). Document tax comes from the active strategy (`taxCalculator()`, India GST's is in `app/js/modules/region_india_gst/gst.js`); read the split of an older saved document with `gstSplit()` there (older records don't have CGST/SGST/IGST stored).
- **Core never names a module.** If core needs something a module provides, add an extension point with a generic name (see the table in docs/architecture.md). Save invoices only through `recordInvoice()`, so hooks and events always run.
- **Printed invoices** come from `app/templates/` through the view model in `app/js/core/documents/`. Change a layout in its template, not in code; new files must also go into `FILES` in `app/sw.js` (a test checks).
- **Balances** change only through `adjustPartyBalance()` and `adjustBankBalance()`, and every delete reverses what the save did. **Stock** is the inventory module's: it follows the documents' events, never direct writes.
- **Numbers, printing, long lists:** use `getNextNumber(type)`, `printDocument(title, html)`, and `listRows()` / `listFooter()`.
- **Old data must keep working.** If you change how something is stored, handle records saved by older versions (see `migrateLegacyData()` and the "previous version" test).

## Reporting bugs

Use the [issue templates](https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager/issues/new/choose). Never attach a real backup file or screenshots with real customer data. Report security problems privately (see [SECURITY.md](SECURITY.md)).

## Translations

Menu labels live in the `i18n` object near the top of the script (`en`, `te`). To add a language, copy the `en` block, translate the values and extend `toggleLanguage()`.

## Releasing (maintainers)

1. Bump `version` in `package.json` **and** `APP.version` in `app/index.html` (a test checks they match). Commit as `chore(release): vX.Y.Z`.
2. Push a tag (`git tag vX.Y.Z && git push origin vX.Y.Z`), or run the _Release desktop app_ workflow from the Actions tab with the tag `vX.Y.Z`. GitHub Actions checks the tag matches `package.json`, builds the installers and creates the release.
3. The web app deploys on every push to `main`. If you changed the list of cached files, bump `CACHE` in `app/sw.js`.
