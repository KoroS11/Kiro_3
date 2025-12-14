# Data Weaver

## Run

From this folder:

- Install: `npm install`
- Dev server (fixed port): `npm run dev -- --port 5176 --strictPort`
- Build: `npm run build`
- Preview: `npm run preview`

## Data

Sample CSVs are in `public/sample-data/`.

Upload your own CSVs using the Data Loader in the app.

## Convert Kaggle order history CSV (offline)

If your orders data looks like the Kaggle export with an "Order Placed At" column (month-name dates like "11:38 PM, September 10 2024"), convert it to the canonical daily CSV:

From the workspace root:

`python tools/convert_order_history_kaggle_csv.py --in archive/order_history_kaggle_data.csv --out data-weaver/public/sample-data/orders.csv`

Or from this folder:

`python ../tools/convert_order_history_kaggle_csv.py --in ../archive/order_history_kaggle_data.csv --out public/sample-data/orders.csv`

## Generate weather.csv from WeatherAPI (offline)

This project is designed for offline ingestion: fetch historical weather data first, save it as CSV, then feed it into the pipeline.

1) Set your API key as an environment variable (recommended):

- PowerShell:
	`$env:WEATHERAPI_KEY="YOUR_KEY_HERE"`

Alternative (often easier): create a local `.env` file

- Copy `.env.example` to `.env`
- Set `WEATHERAPI_KEY=YOUR_KEY_HERE`

`.env` is gitignored (do not commit it).

This is used by the dev server for the server-side WeatherAPI proxy as well.

2) Fetch weather for every date present in your orders CSV:

`npm run fetch-weather -- --orders public/sample-data/orders.csv --out public/sample-data/weather.csv --q Jaipur`

The script uses the WeatherAPI History endpoint:
- GET https://api.weatherapi.com/v1/history.json

It extracts daily:
- avgtemp_c
- totalprecip_mm
- avghumidity

Output columns:
- date,temperature,rainfall,humidity
