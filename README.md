# Parking Price Report Builder

A static GitHub Pages website that reads Scan2Pay-style CSV parking reports in the browser and produces a formatted `.xlsx` workbook that can be opened in Google Sheets.

## What it creates

- A **Summary** tab arranged by location and month.
- One visible revenue column for every year in the selected reports.
- Hidden ticket-count and average-ticket columns for every year; unhide them when needed.
- A separate yearly revenue comparison line chart for every selected location.
- One tab per parking location.
- Monthly weekday/weekend price blocks.
- The most common purchased price for each duration.
- Ticket counts at each displayed mode price.
- Ticket-count columns hidden by default on location tabs.
- Extension/overstay, failed-payment, overlapping-report, and optional low-volume price-result filtering.

## Privacy

The reports are processed inside the user's browser. The website has no server and does not upload CSV contents anywhere.

The page loads Papa Parse, ExcelJS, and Chart.js from jsDelivr. The browser therefore needs internet access when the page first loads.

## Publish on GitHub Pages

1. Create a new GitHub repository, for example `parking-price-report-builder`.
2. Put all files from this folder in the repository root.
3. Commit and push them to the `main` branch.
4. Open the repository on GitHub.
5. Go to **Settings → Pages**.
6. Under **Build and deployment**, choose **Deploy from a branch**.
7. Select `main` and `/ (root)`, then save.
8. GitHub will show the public site address after deployment finishes.

## Use the site

1. Open the GitHub Pages URL.
2. Choose one or more CSV reports, or choose a folder.
3. Select all locations or only the locations needed.
4. Keep or change the filtering options.
5. Click **Build workbook**.
6. Download the `.xlsx` file.
7. Upload it to Google Drive and open it with Google Sheets.

## Summary tab layout

The visible columns are:

```text
Location | Month | 2025 Revenue | 2026 Revenue | ...
```

For each year, two extra columns are stored beside revenue and hidden by default:

```text
Year Tickets | Year Avg Ticket
```

Unhide those columns in Google Sheets whenever ticket totals or average ticket values are needed. Every selected location receives a 12-month block and a line chart comparing all years found in the uploaded reports.

## Files

- `index.html` — website markup
- `styles.css` — layout and visual design
- `analysis.js` — CSV reading, filtering, deduplication, grouping, modes, and revenue
- `workbook.js` — formatted Excel/Google Sheets-ready workbook generation
- `app.js` — user interaction, location filtering, progress, preview, and downloads
- `.nojekyll` — tells GitHub Pages to serve the files directly

## Important definitions

- **Revenue** is the sum of the report's `Amount` column. Tax and fee columns are not added.
- **Tickets at price** is the number of transactions at the displayed most-common price, not necessarily the total number of tickets for that duration.
- A missing duration means there was no valid purchase of that duration in the selected reports. It does not prove that the option was unavailable on the posted price schedule.
- The site removes ticket numbers ending in `-EXT`, `-EEX`, `-EOS`, or `-OS` when extension filtering is enabled. It also checks `Extended By` and `Transaction Description`.

## Local testing

Opening `index.html` directly usually works, but a local web server is more reliable:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Location selection

After CSV reports are chosen, the site scans their `Location` column and displays a searchable checklist. All detected locations are selected by default. Clear **Select all locations** and check only the locations that should appear in the workbook. The Summary tab, location tabs, preview, ticket counts, revenue values, and charts are generated only for the selected locations.


## Large-report fix

The analyzer appends parsed rows one at a time instead of spreading the entire row array into one `push()` call. This avoids the browser argument limit when processing large combined reports such as `ALL-Safety-Report.csv`.

## Combined-report duration handling

Some combined Safety reports store actual elapsed parking time in `Duration(hh:mm)` for certain rows. The site detects those rows by comparing duration with entry/transaction/exit times and excludes them from the price-mode tables. They remain included in valid monthly ticket and revenue totals. This prevents hundreds of false options such as `18 mins`, `27 mins`, and `1h 7 mins` from appearing as purchased products.


## Low-volume price-result filter

The **Exclude price results supported by fewer than 3 tickets** option is enabled by default. A row in the weekday/weekend price table is shown only when at least three tickets support its displayed most-common price within the same location, month, day group, and duration.

For example, if only one valid ticket appears for `147 mins` at `$5`, that duration/price result is omitted instead of being presented as a meaningful monthly mode. If three tickets support the displayed mode price, the row remains. Tied modes use the same count for every tied price.

This filter changes only the price-mode tables. The valid transactions still count toward monthly ticket totals, revenue, and average ticket values. Clear the checkbox when you need to inspect every result, including one- and two-ticket observations.


## Result-display compatibility fix

The completion screen now treats missing statistic fields as zero instead of calling `toLocaleString()` on `undefined`. This protects the page when Chrome has cached an older `analysis.js` while loading a newer `app.js`. The script version in `index.html` was also changed to force a fresh load. The generated workbook remains downloadable even when an optional preview statistic is unavailable.


## Low-volume filter exceptions

The optional fewer-than-3-ticket filter applies only to ordinary duration results. It never hides explicit long-stay products labeled **Overnight**, **All Day**, **Until**, or **Till**. It also keeps numeric durations of 20 hours or more, including `23:59` / `23h 59 mins`, because those commonly represent all-day parking products. Monthly ticket and revenue totals are unchanged by this display filter.
