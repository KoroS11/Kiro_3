# Kiro_3 – Data Weaver

Data Weaver Dashboard — a React-based analytics dashboard that weaves together food delivery demand data and historical weather data to uncover correlations between environmental conditions and consumer ordering behavior.

This workspace contains **Data Weaver**, a Vite + React app that:
- Loads orders data (CSV), normalizes dates, aggregates daily orders
- Fetches historical weather from WeatherAPI **server-side** (no API key in the browser)
- Merges orders + weather and shows KPI + charts

## Run the app

From the workspace root (recommended):

- Install deps (first time):
  - `npm --prefix .\data-weaver install`
- Start dev server on a fixed port:
  - `npm --prefix .\data-weaver run dev -- --port 5176 --strictPort`
- Open:
  - http://localhost:5176/

If you see “Port 5176 is already in use”, stop the old dev server (or use the one-liner below):

- PowerShell:
  - `$procId = (Get-NetTCPConnection -LocalPort 5176 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess); if ($procId) { Stop-Process -Id $procId -Force }`

## WeatherAPI key setup

Create `data-weaver/.env` (it is gitignored):

- `WEATHERAPI_KEY=YOUR_KEY_HERE`

Then restart the dev server.

## What gets committed

- `data-weaver/` source code, scripts, and sample data
- Project docs in the repo root
- Local secrets and large datasets are ignored:
  - `data-weaver/.env` (WeatherAPI key)
  - `archive/` (raw Kaggle/export files)

## Data inputs

In the UI you can:
- Upload **Orders CSV** (required)
- Optionally upload **Weather CSV** (optional)
- Or enable **Auto-fetch weather** (recommended)

Sample files live in:
- `data-weaver/public/sample-data/`

## Offline helpers (optional)

These are utilities for converting/inspecting raw datasets:
- `tools/convert_order_history_kaggle_csv.py`
- `tools/analyze_order_history.py`
- `tools/import_orders_from_zip.py`

See the app-level docs in:
- `data-weaver/README.md`

## Project docs

If you want the full spec/architecture notes, see:
- `PROJECT-BLUEPRINT.md`
- `IMPLEMENTATION-GUIDE.md`
- `QUICK-START.md`
