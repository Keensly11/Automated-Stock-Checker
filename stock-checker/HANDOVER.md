# Stock Checker: Handover

_Last updated: 2026-10-17_

## What it is

A static web page for looking up a product. Type a model name and it shows availability, stock and price from an Excel/CSV master file. It has no server, no build step and no install. Open `index.html` in a browser.

Status: a personal side project. It isn't used by the company, because distributor prices change daily and the file is loaded by hand. The next step below fixes that.

## Current features

- **One master file** (`.xlsx`, `.xls`, `.csv`), loaded with the button or by drag and drop. Loading a new file replaces the old data.
- **Every sheet is read.** Sheets that aren't stock lists (notes, terms), hidden sheets and empty sheets are skipped, and the page lists what it skipped.
- **The heading row is found automatically** in the top 20 rows, so title rows like "Price List – October" above the headings are fine.
- **Skipped rows:** category rows ("LAPTOPS", with no price and no stock) and heading rows repeated further down a sheet.
- **Columns are detected by heading name** (see `CONFIG.columns`). If a sheet can't be matched, a panel asks for the heading row and the columns. The answer is remembered for that heading layout.
- **Stock can be numbers or words.** "Available", "Out of stock" and "Limited" map to badges through `CONFIG.availabilityWords`. Unknown words are shown as written.
- **Currency comes from the file.** The page checks, in order: the price cell as Excel displays it, then the most common currency on that sheet, then the price heading ("Unit Price (AED)"). There is no currency setting.
- **Search** ignores case, spaces and dashes, ranks exact, then starts-with, then contains, and suggests near spellings when nothing matches.
- **Badges:** In stock, Low stock (at or below the threshold, default 5, set in Settings) and Out of stock.
- **Layout:** before a file is loaded, only a "Load your master file" box shows; a file can be dropped anywhere on the page. After loading, a slim top bar shows the file name with "Replace file" and a Settings pop-over, and the sticky search box takes over.
- **Cards:** model name and badge on top, sheet name when the file has several, then a large price and the stock count. A colored stripe on the left repeats the availability.
- **Filters and sorting:** the chips (All / In stock / Low stock / Out of stock) show counts for the whole file and filter the results. With no search text, a chip browses the whole file. Sort options: best match, price low to high or high to low, most stock first. Prices that aren't set go last.
- **Keyboard:** `/` focuses the search box and `Esc` clears it.
- **Fosutog branding,** matching fosutog.com: teal `#447F98` palette (the `--brand-*` variables at the top of `styles.css`), the Poppins font from Google Fonts, the logo mark as an inline `<symbol id="fosutog-mark">` in `index.html`, the "FOSUTOG / Stock Checker" wordmark, a favicon and touch icon in `img/`, and a faint logo watermark on the empty state.
- **Light/dark:** follows the device setting until the sun/moon button is used. The choice is saved under the same key as fosutog.com (`fosutog-theme`).
- **Data and settings persist** in the browser's `localStorage`. They live only in that browser.

## Files

```
stock-checker/
├── index.html        page structure; loads SheetJS from cdnjs, then the scripts in order
├── css/styles.css    all styling; colors are CSS variables at the top (light + dark)
├── js/
│   ├── config.js     column names, availability words, currency codes, defaults
│   ├── storage.js    localStorage read/write (data + settings), migrates older saved formats
│   ├── loader.js     reads workbook → analyses sheets → detects headings/columns/currency → products
│   ├── search.js     text normalising, matching, "did you mean" suggestions
│   ├── ui.js         renders cards, badges, summary, messages, column-picker dropdowns
│   └── app.js        wiring: file loading flow (sheet by sheet), search box, settings
├── sample-stock.csv  example data
└── HANDOVER.md       this file
```

The scripts are plain `<script>` files, not ES modules, so `file://` works. Each one defines a single global: `CONFIG`, `DataStore`, `Loader`, `Search`, `UI`. `app.js` uses all of them.

### How a file is loaded (`app.js`)
`handleFile(file)` → `Loader.readWorkbook` → `Loader.analyzeWorkbook` gives each sheet a status (`ready` / `ask` / `other` / `hidden`) → `continueJob()` reads the `ready` sheets, pauses on `ask` for the column panel, and skips the rest → `finishJob()` saves `{ fileName, loadedAt, sheetNames, products }` and redraws.

Product shape: `{ model, stock, stockText, price, currency, sheet }`. `stock` is `null` when the sheet uses words; the words are then in `stockText`.

## Running it

- **To use it:** double-click `index.html`. It needs internet the first time, to load SheetJS.
- **For development:** any static server works, e.g. `npx serve stock-checker`.

## Repository

- GitHub: https://github.com/Keensly11/Automated-Stock-Checker
- `.gitignore` keeps real spreadsheets (`*.xlsx`, `*.xls`) out of the repo, so distributor price lists aren't committed. Only `sample-stock.csv` is tracked.

---

## Next step: read one cloud-stored file automatically

**Goal:** instead of loading a file by hand, the page fetches one file from a cloud link. When the distributor updates that file, the page shows the new data without anyone loading anything.

### Plan

1. **Settings: a "Cloud file link" field**, saved in settings as `remoteUrl`. A default can also be put in `config.js` (`CONFIG.remoteUrl`) for a fixed setup.
2. **Separate reading from the file picker.** `Loader.readWorkbook(file)` uses `FileReader`. Split it so that:
   - `Loader.parseWorkbook(arrayBuffer)` does the `XLSX.read`
   - the file picker path does `FileReader` → `parseWorkbook`
   - the cloud path does `fetch(url)` → `response.arrayBuffer()` → `parseWorkbook`
   Everything after that (`analyzeWorkbook` → `continueJob` → `finishJob`) stays the same. `handleFile` becomes `handleWorkbook(workbook, fileName)`.
3. **When to fetch:** on page load, plus a "Refresh now" button, plus an optional automatic refresh every N minutes (`CONFIG.refreshMinutes`, e.g. 15). Fetch with `cache: "no-store"` to avoid stale copies.
4. **Show freshness:** "Updated from cloud 10:42 AM". If a fetch fails, keep showing the last saved copy with a warning ("Couldn't reach the cloud file. Showing data from 09:15"). The existing `localStorage` save is already the offline fallback.
5. **Skip unchanged files (optional):** compare a hash or the `Last-Modified`/`ETag` header with the last fetch, and don't re-parse if nothing changed.
6. **Remembered column choices keep working,** because `savedMappings` is keyed by heading text. If the distributor's layout stays the same, nobody gets asked again after the first time.

### Main risk: getting the file from the cloud

A browser page can only `fetch` a file if the host allows cross-origin requests (CORS) and the link is a **direct download**, not a preview page. Which cloud the distributor uses decides how easy this is:

| Where the file lives | Likely approach | Notes (check each before building) |
|---|---|---|
| **Google Sheets / Drive** | File → Share → *Publish to web* → choose `.xlsx` or `.csv`. This gives a `…/pub?output=xlsx` link | Published links are generally fetchable from a browser. Publishing makes the file readable by anyone with the link. |
| **Dropbox** | Shared link with `dl=1`, or the `dl.dropboxusercontent.com` form | Usually works as a direct download. Confirm CORS from a browser. |
| **OneDrive / SharePoint** | Share link converted to a direct download link | Share pages don't serve the raw file. Direct download plus CORS is often blocked. May need the Microsoft Graph API with sign-in, or a small proxy. |
| **Distributor's own website / FTP** | Direct URL to the file | Works only if their server sends CORS headers. FTP won't work from a browser. |

**If the link can't be fetched directly**, add a tiny proxy that downloads the file server-side and serves it with CORS headers: a Cloudflare Worker, a Netlify/Vercel function, or Google Apps Script. That also hides the real file URL. This is the fallback, not the first choice.

### Things to decide before building

- [ ] **Which cloud does the distributor use, and can they give a direct link?** This decides everything above.
- [ ] **Is a public "anyone with the link" file acceptable?** Prices and stock would be readable by anyone who finds the link. If not, use a proxy or sign-in.
- [ ] **How often do they update it?** That sets the auto-refresh interval.
- [ ] **Should manual file loading stay as a backup?** Recommended: yes, keep the button.
- [ ] **Where will the page be hosted?** Still a local file, or GitHub Pages/Netlify so others can open it? Hosting matters for CORS and the proxy option.

### Done looks like

Open the page and it loads the distributor's file from the cloud link with no button press. The distributor changes a price, and after the next refresh (or "Refresh now") the page shows the new price. If the internet drops, the last good copy still shows, with a note saying how old it is.

---

## Known gaps / ideas

- `localStorage` holds roughly 5 MB. A very large master file may fail to save; the page warns when this happens. IndexedDB would remove the limit.
- SheetJS comes from cdnjs, so the very first open needs internet. To work fully offline, download `xlsx.full.min.js` into the project.
- Suggestions use edit distance across all models, which is fine for thousands of rows. Revisit if files reach tens of thousands of rows.
- Test data used during development: `sample-stock.csv`, plus generated workbooks with title rows, category rows, notes and hidden sheets, and mixed currencies (AED number formats, ₹ / $ / Dhs typed, USD in headings, € formats).
