# Contributing to VyaparEasy

Thanks for helping! Bug reports, GST-rule corrections, translations and code are all welcome.

## Reporting a problem

Open an issue with:

- what you did, what you expected and what happened instead
- web app or desktop app (and your OS/browser)
- for wrong tax amounts: the GSTINs/states involved, rates, quantities and the amounts you expected

Please **don't attach your backup file** or screenshots containing real customer data.

## Project layout

| Path                                    | What it is                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `app/index.html`                        | The entire app: HTML, CSS and JavaScript in one file, with no framework and no build step |
| `app/sw.js`, `app/manifest.webmanifest` | Offline support and install metadata for the web app                                      |
| `app/fonts/`, `app/icons/`              | Bundled font and icons (`npm run icons` regenerates PNGs from `icon.svg`)                 |
| `electron/main.js`                      | Desktop wrapper; serves `app/` from the `app://vyapareasy/` origin                        |
| `tests/`                                | Playwright end-to-end tests (browser and Electron)                                        |
| `scripts/serve.js`                      | Static server used by `npm run serve` and the tests                                       |

## Working on the app

```bash
npm install
npx playwright install chromium   # once
npm run serve                     # http://localhost:8080 (reload the page after edits)
npm test                          # Linux without a display: xvfb-run -a npm test
```

Data is stored in IndexedDB (`VyaparEasyDB`). Each store holds plain objects with a `companyId`. Use `dbOps` to read and write.

### Conventions inside `app/index.html`

These rules prevent the bugs that were fixed before; please keep to them:

- **Escape user text** with `esc()` whenever it goes into HTML (`${esc(c.name)}`). Names like `Ravi's "Best" Traders` must not break forms.
- **Dates** are local `'YYYY-MM-DD'` strings. Use `todayStr()`, `localDateStr(date)`, `parseLocalDate()` and `periodRange()`. **Never** use `toISOString()` for a date: it switches to UTC, which is the previous day before 05:30 IST.
- **Money:** round with `round2()`. Compute GST only through `computeGst(items, interstate)`, and read the split of a saved document with `gstSplit()` (older records don't have CGST/SGST/IGST stored).
- **Balances and stock** change only through `adjustPartyBalance()`, `adjustBankBalance()` and `adjustStock()`, and every delete must reverse what the save did.
- **Document numbers** come from `getNextNumber(type)`.
- **Printing** goes through `printDocument(title, html)`.
- **Old data must keep working.** If you change how something is stored, handle records saved by older versions (see `migrateLegacyData()` and the "previous version" test).

### Before opening a pull request

- [ ] `npm test` passes, and you added or updated a test for the behaviour you changed
- [ ] You tried it in the browser, including a phone-sized window
- [ ] Tax logic changes cite the rule or notification you followed in the PR description

## Translations

Menu labels live in the `i18n` object near the top of the script (`en`, `te`). To add a language, copy the `en` block, translate the values and extend `toggleLanguage()`.

## Releasing (maintainers)

1. Bump `version` in `package.json` and commit.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`. GitHub Actions builds the installers and creates the release.
3. The web app deploys automatically on every push to `main`. If you changed the cached files list, bump `CACHE` in `app/sw.js`.
