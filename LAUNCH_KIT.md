# Launch kit

Ready-to-post copy and assets for launching VyaparEasy. Text in **[brackets]** is personal detail only the author can fill in. Don't publish it with brackets left in.

## 0. Pre-launch checklist (do these first, in order)

A launch that sends people to a broken link wastes the one traffic spike you get.

- [ ] **Merge the work to `main`** (CI must be green).
- [ ] **Enable GitHub Pages:** _Settings → Pages → Source: GitHub Actions_. Then open https://yeldhandisamyukthreddy-del.github.io/indian-b2b-business-manager/ in a private window and click Install. **The README's main call to action depends on this link.**
- [ ] **Cut v1.0.0:** `git tag v1.0.0 && git push origin v1.0.0`. Wait for the _Release desktop app_ workflow, then download and launch each installer once (Windows, macOS, Linux).
- [ ] **Enable Discussions** (_Settings → General → Features_). The issue chooser sends questions there.
- [ ] **Create labels:** `needs-triage`, `good first issue`, `help wanted` (the templates apply `needs-triage`; GitHub ignores labels that don't exist).
- [ ] **Repository "About" box:** description _Open-source, offline GST billing & inventory for Indian businesses, in a single HTML file_; website = the Pages URL; topics: `gst`, `invoicing`, `billing`, `india`, `offline-first`, `pwa`, `electron`, `indexeddb`, `vanilla-js`, `small-business`.
- [ ] **Social preview:** _Settings → General → Social preview_ → upload `docs/social-preview.png`.
- [ ] **Open three issues from the README roadmap** (GSTR-1 JSON, e-invoice JSON, translations) and label them `help wanted` / `good first issue`. HN and Reddit readers who want to help need a place to land.
- [ ] **Name check:** "VyaparEasy" is very close to _Vyapar_, an established commercial product in the same market. A public launch is exactly when a trademark complaint becomes likely, and renaming after people have starred and linked the repo is much more painful than before. Decide deliberately.
- [ ] **Be available for 4–6 hours after posting** to answer comments. Response speed matters more than the post text.

## 1. Show HN

**Title** (75 characters; HN allows 80):

```
Show HN: VyaparEasy – Offline GST billing for India in a single HTML file
```

"for India" matters: Canada, Australia, New Zealand and Singapore also have a "GST".

**URL:** `https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager`. Linking the repo rather than the web app works better for Show HN, because people want to see the code and the README has the demo GIF and the try-it link.

**First comment** (post it right after submitting):

> Hi HN, I built VyaparEasy, a free GST billing and inventory app for Indian small businesses. It runs entirely in the browser or as a desktop app, and your data never leaves the machine.
>
> **Why:** [one or two sentences of your real story, e.g. who you saw struggling with billing, or why you started]. Small traders in India mostly choose between a paid desktop licence (Tally), a cloud subscription that needs a steady connection (Zoho Books and friends), or spreadsheets. I wanted something free, private and usable on an old laptop with flaky internet.
>
> **What it does:** quotations → orders → delivery challans → GST tax invoices, purchase bills, receipts and payments matched to invoices, stock, credit/debit notes, multiple companies, and GSTR-1/3B summaries with CSV export. Printed invoices include the fields GST rules require (GSTINs, state codes, place of supply, HSN, CGST/SGST or IGST, amount in words).
>
> **Architectural choices and trade-offs:**
>
> - **One 4,600-line `index.html`, vanilla JS, no build step, zero runtime dependencies.** Anyone can open it and change it. The cost is that it's a big file of template strings, and I have to be disciplined about escaping (`esc()` everywhere user text meets `innerHTML`).
> - **IndexedDB, not SQLite.** It works in every browser without WASM, and the same file runs as a PWA and inside Electron. The cost: no SQL, so reports are plain JS over arrays (fine so far: about 120 ms for a GST report over 5,000 invoices on a modest CPU).
> - **Same file, three runtimes:** static hosting, an installable PWA with a network-first service worker, and Electron serving it from a fixed `app://` origin. That last part matters: AppImages mount at a random path, and with `file://` the storage origin would be fragile.
> - **No server at all.** That makes it free to run forever and private by default, but there's no sync between devices; backup is a JSON file you keep yourself.
>
> **Bugs that taught me something:** dates were stored with `toISOString()`, so anything entered between midnight and 05:30 IST landed on the previous day (UTC). The CGST/SGST vs IGST check read a field that was never saved, so every inter-state sale was reported as intra-state, and nothing crashed. Both are now covered by Playwright tests that run the real UI, including one with a fake clock at 01:30 IST.
>
> **Known limitations / unsolved:**
>
> - No e-invoice (IRN) or e-way bill yet. Those need a GST Suvidha Provider API with credentials, which conflicts with "no server, no account". Generating schema-valid JSON for manual upload is my next step.
> - Not double-entry accounting (no trial balance or balance sheet).
> - Browser storage can be cleared by the user. I request persistent storage and nag about backups, but that's mitigation, not a fix.
> - Installers aren't code-signed yet, so Windows and macOS show warnings.
>
> **Questions for HN:**
>
> 1. For local-first apps like this, what's your preferred way to add optional sync without running a server? (CRDT over a user's own Google Drive? WebDAV? something else?)
> 2. Would you move this to SQLite-WASM on OPFS for the reporting benefits, or is IndexedDB fine at this scale?
> 3. At what size would you split a single-file app, given that "no build step" is the main reason contributors can jump in?
>
> It's MIT licensed. Feedback from anyone who has dealt with GST compliance is especially welcome. Corrections to the tax logic are the most valuable contributions.

**HN etiquette:** don't ask anyone to upvote, and don't post from multiple accounts (HN penalises both). Weekday mornings US Eastern (roughly 8–10 am ET, 5:30–7:30 pm IST) are commonly suggested. If it doesn't catch on, the mods allow a repost after a while. Don't delete and immediately resubmit.

## 2. Reddit

Read each subreddit's rules on self-promotion before posting; some only allow project posts on specific days or in pinned threads. Lead with the lessons. Put the link at the end, once.

### r/webdev (or r/javascript): technical lessons

**Title:** `I shipped a 4,600-line single-file vanilla JS app as a website, an installable PWA and an Electron app. Here's what broke.`

> I've been building an offline billing app for Indian small businesses. It's one `index.html` with no framework, no bundler and no runtime dependencies, and the same file runs three ways: from static hosting, as an installed PWA, and inside Electron. Some things I learned that might save you time:
>
> **1. `toISOString()` is not "today".** I stored dates as `new Date().toISOString().split('T')[0]`. In India (UTC+5:30), anything entered before 05:30 got yesterday's date. Fix: build `YYYY-MM-DD` from `getFullYear()`/`getMonth()`/`getDate()`, and parse date-only strings as local dates. I now have a Playwright test that installs a fake clock at 01:30 IST.
>
> **2. A modal that fades out is still clickable.** My end-to-end tests kept typing into the _previous_ modal while it animated away (`visibility` transitions keep it visible). `.modal-overlay:not(.active) { pointer-events: none; }` fixed it for users. For tests, wait on the specific modal's title, not just "a modal is visible".
>
> **3. Rendering 5,000 table rows with `innerHTML` stalls the page for seconds**, and it hit every time a user saved an invoice and returned to the list. Capping lists at 200 rows with a "Show all" button, and making the search box filter the data (not the DOM), took save-and-redraw from about 3.3 s to about 0.4 s with 5,000 invoices (same benchmark before and after, headless Chromium).
>
> **4. Electron + IndexedDB + AppImage:** `file://` origins are a bad home for user data when your app's path can change. Registering a privileged `app://` scheme and serving files through `protocol.handle` gives a stable origin.
>
> **5. Lint the JS inside your HTML.** `eslint-plugin-html` found 25 `const`s declared in unbraced `switch` cases on its first run. It would also have caught a variable I'd been assigning without ever declaring, which I'd found the hard way.
>
> **6. Popups and `window.prompt()` don't survive Electron.** Printing through a hidden iframe works in browsers, PWAs and Electron without fighting popup blockers.
>
> Code (MIT) if you want to look or tell me what I got wrong: https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager
>
> Curious how others handle the single-file vs build-step trade-off once a project gets this big.

### r/developersIndia: domain lessons

**Title:** `Things I got wrong building GST invoicing (IGST vs CGST/SGST, IST dates, invoice numbering), and an open-source tool that came out of it`

> I've been building an open-source, offline billing app for small Indian businesses. GST logic turned out to be where most of the bugs hid, so here's what I learned in case you're building anything invoice-related:
>
> - **IGST vs CGST + SGST is decided by supplier state vs place of supply**, not by the customer's GSTIN alone. Store the place of supply _on the invoice_ at save time. My first version worked it out at report time from a field that was never saved, so every inter-state sale showed up as intra-state.
> - **The first two digits of a GSTIN are the state code.** Validate that they match the selected state; it catches a surprising number of data-entry mistakes.
> - **Invoice numbers need a series per GSTIN**, at most 16 characters, and they shouldn't restart after a restore. I derive the next number from the highest one already used instead of a counter stored elsewhere.
> - **B2B / B2CL / B2CS** in GSTR-1: anything with a GSTIN is B2B whatever the amount. B2CL is inter-state B2C above the threshold (₹1 lakh now).
> - **Dates:** `toISOString()` gives you UTC. Before 05:30 IST that's yesterday, which is great fun on the last night of a quarter.
> - **12% and 28% slabs** were folded into 5/18/40 in September 2025, but old invoices still need them, so the rate list keeps both.
>
> The app is MIT-licensed, works offline and stores data only on the device: https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager. If you know GST rules better than I do, corrections are very welcome. The [roadmap](https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager#roadmap) has GSTR-1 JSON and e-invoice JSON export as good contribution targets.

## 3. Demo assets

| Asset                      | How to (re)generate                                                      | Where it's used          |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------ |
| `docs/demo.gif` (UI, 17 s) | `npm run demo` (Playwright drives the real UI, ffmpeg makes the GIF)     | README hero              |
| `docs/demo-terminal.gif`   | `vhs docs/demo.tape` (needs [VHS](https://github.com/charmbracelet/vhs)) | Reddit/Twitter, optional |
| `docs/social-preview.png`  | already generated (1280×640)                                             | GitHub social preview    |

VyaparEasy is a GUI app with no CLI, so the "wow moment" is the UI GIF. The VHS tape shows the developer angle in about 15 seconds: clone → one file, zero dependencies → `node scripts/serve.js` with no install or build. [`docs/demo.tape`](docs/demo.tape):

```tape
Output docs/demo-terminal.gif
Require git
Require node
Set Shell "bash"
Set FontSize 20
Set Width 1200
Set Height 560
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms

Hide
Type "cd $(mktemp -d) && clear" Enter
Show
Type "git clone -q --depth 1 https://github.com/yeldhandisamyukthreddy-del/indian-b2b-business-manager.git vyapareasy"
Enter
Sleep 2.5s
Type "cd vyapareasy && du -h app/index.html && ls node_modules 2>/dev/null | wc -l   # one file, zero deps"
Enter
Sleep 2s
Type "node scripts/serve.js &   # no npm install, no build step"
Enter
Sleep 1.5s
Type "curl -s localhost:8080 | grep -m1 -o '<title>.*</title>'"
Enter
Sleep 2.5s
Type "# → open http://localhost:8080 and create your first GST invoice"
Sleep 2.5s
Hide
Type "kill %1" Enter
```

## 4. Answers to questions you'll get

- **"Is my data safe if I clear my browser?"** No. It lives in browser storage, which is why the app requests persistent storage, nags about backups after 7 days, and the desktop app exists. Be upfront about this.
- **"Why not a real database / backend?"** No server means free forever, private by default, and it works offline in a godown with no signal. Sync is the open problem (see the HN questions).
- **"Is this legally valid for GST?"** Printed invoices include the Rule 46 fields, but it's not tax advice. E-invoicing (for businesses above the turnover threshold) isn't supported yet.
- **"How is this different from Vyapar?"** Open source, free, no account, data stays on the device. Vyapar has e-invoicing, mobile apps and support. Be factual and generous about competitors.
- **"Why one giant HTML file?"** No build step means anyone can contribute by editing one file and reloading. Lint and 14 end-to-end tests keep it honest. Splitting it is a fair future discussion.
