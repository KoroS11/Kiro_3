# The Data Weaver - Quick Start

This quick start assumes a React app scaffold (Vite or similar) and focuses on validating the data pipeline first.


## 1) What You Get

- Upload orders and weather CSVs
- Validation and normalization before any charts
- Deterministic merge with weather imputation
- KPIs and chart-ready datasets


## 2) Minimum CSV Requirements

Orders CSV
- Must contain: date, and one of [order_count, total_orders]
- Minimum: 7 rows

Weather CSV
- Must contain: date, and one of [temperature, temp], and one of [rainfall, precipitation]
- Minimum: 7 rows

Delimiters
- Comma, semicolon, and tab are supported

## 2.1) If your orders data is a zip

If you have a zip file from Kaggle (or elsewhere), you can extract and convert it to the canonical orders CSV shape.

1) Put the zip anywhere in this workspace.
2) Run the importer (from the workspace root):

`python tools/import_orders_from_zip.py --zip path/to/your.zip --out data-weaver/public/sample-data/orders.csv`

If auto-detection picks the wrong CSV, specify which file to use after extraction:

`python tools/import_orders_from_zip.py --zip path/to/your.zip --out data-weaver/public/sample-data/orders.csv --pick relative/path/inside/zip.csv`


## 3) Recommended Project Files

- PROJECT-BLUEPRINT.md
- IMPLEMENTATION-GUIDE.md


## 4) Suggested Development Workflow

Step A: Implement utils only
- Implement csvParser.js
- Implement dateNormalizer.js
- Implement dataMerger.js
- Implement metricsCalculator.js

Step B: Create a minimal harness
- A temporary script or a DataLoader component that runs the pipeline
- Print results to console:
  - parsed rows counts
  - normalized date range
  - merge result sample
  - warnings

Step C: Only then add UI
- KPI cards
- Charts
- View mode toggle

## 4.1) Weather data via WeatherAPI (offline)

Do not call WeatherAPI from the browser. Generate a CSV offline, then upload it.

From data-weaver:

- Set key in PowerShell:
  `$env:WEATHERAPI_KEY="YOUR_KEY_HERE"`

- Generate CSV from the orders dates:
  `npm run fetch-weather -- --orders public/sample-data/orders.csv --out public/sample-data/weather.csv --q Jaipur`


## 5) Manual Test Checklist

Date normalization
- Validate ISO dates (YYYY-MM-DD)
- Validate DD/MM/YYYY where day > 12
- Validate MM/DD/YYYY where month > 12
- Validate month-name dates like "September 10 2024" and "11:38 PM, September 10 2024"
- Reject ambiguous 01/02/2024
- Reject mixed formats in one file

Missing data
- Missing weather on a day with orders => impute from nearest day
- Missing orders on a day with weather => must not appear in merged output
- Missing weather beyond max gap => warn and drop those days


## 6) Troubleshooting

If the dashboard shows no data
- Confirm both files have at least 7 rows
- Confirm orders file has a recognized orders column
- Confirm dates are valid and not ambiguous
- Confirm the merge does not drop everything due to failed weather imputation

If percent increase is not available
- This happens when non-rainy average is zero or missing
- Display the KPI as not available rather than 0
